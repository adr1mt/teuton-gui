import { useEffect } from 'react'
import { useApp } from '../stores/app'
import { type StudentRow } from './analytics'
import { parseConfig } from './config'
import { computeExpectedTotal, INITIAL_SCAN_STATE, parseTargetsFromCheckOutput } from './progress'
import { buildMoodleCsv } from './moodleCsv'
import { gradeRecordsFromResults, validateResultIdentity } from './integrity'
import type { LoadedResults, RunEvent, RunOptions } from '../../../shared/types'

// Elimina códigos de color ANSI de la salida de teuton. La segunda pasada
// cubre secuencias cuyo ESC llegó en el chunk anterior de stdout; la tercera
// limpia el ESC huérfano que deja ese mismo corte.
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '').replace(/\x1b/g, '')
}

/**
 * Guarda en disco los borradores pendientes del editor. Imprescindible antes de
 * ejecutar: `teuton run` lee los ficheros del disco, no el estado de la app.
 * Sin esto, importar una clase y ejecutar sin guardar evaluaría a los alumnos
 * antiguos (los del fichero) mientras la UI muestra los nuevos.
 */
async function saveDraftsIfDirty(): Promise<void> {
  const st = useApp.getState()
  if (!st.project || !st.dirty) return
  await window.teuton.saveProject({
    dir: st.project.dir,
    scriptFile: st.project.scriptFile,
    configFile: st.project.configFile,
    script: st.scriptDraft,
    config: st.configDraft
  })
  st.markSaved()
}

/**
 * Lanza una ejecución. El estado vive en el store global, de modo que la
 * ejecución NO se detiene ni pierde la consola al cambiar de pestaña; el
 * proceso corre en el proceso main y los eventos se recogen en App.
 */
export async function startRun(dir: string, options: RunOptions): Promise<void> {
  // Nunca dos `teuton run` a la vez sobre el mismo var/<test>/: ambos abren los
  // case-NN.json en modo truncado y el que escribe menos bytes deja la cola del
  // otro detrás, produciendo un JSON corrupto (JSON válido + basura).
  //
  // Ceder el turno NO puede romper la cadena del modo examen: el ciclo que
  // llamó aquí ya consumió su temporizador, así que sin reprogramar el monitor
  // se quedaría «activo» sin ninguna ejecución pendiente y la clase dejaría de
  // corregirse sin avisar. Pasa de verdad al reevaluar a un alumno justo cuando
  // vence el intervalo.
  if (useApp.getState().run.status === 'running') {
    if (useApp.getState().monitor.active) scheduleNextCycle(dir)
    return
  }
  try {
    await saveDraftsIfDirty()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    useApp.getState().setRun({ status: 'failed' })
    useApp.getState().appendRunLine(
      `\n[ERROR] No se pudieron guardar los cambios antes de ejecutar: ${message}`
    )
    useApp.getState().setOperationalError(`No se pudieron guardar los cambios antes de ejecutar: ${message}`)
    // El modo examen no debe morir por un fallo puntual: reintenta al siguiente ciclo.
    if (useApp.getState().monitor.active) scheduleNextCycle(dir)
    return
  }
  const st = useApp.getState()
  const runId = crypto.randomUUID()
  useApp.setState({
    run: {
      status: 'running', log: '', runId, testName: null,
      projectDir: dir, classId: st.activeClassId, className: st.activeClass,
      expectedTotal: null,
      // Cada ejecución (incluido cada ciclo de modo examen) arranca el contador
      // de progreso desde cero, con el escáner incremental reiniciado.
      done: 0, scan: INITIAL_SCAN_STATE
    }
  })
  if (st.view === 'home' || st.view === 'settings' || st.view === 'classes') st.setView('run')

  // Calcula el total esperado de comprobaciones para la barra de progreso
  // (en paralelo, sin bloquear el arranque de la ejecución real).
  void estimateExpectedTotal(dir, options.cname ?? st.project?.cname, st.configDraft, options.cases).then((total) => {
    if (useApp.getState().run.runId === runId) useApp.getState().setRun({ expectedTotal: total })
  })

  try {
    const handle = await window.teuton.run(dir, options, runId)
    if (handle.runId !== runId) throw new Error('El proceso devolvió un identificador de ejecución inesperado.')
  } catch (e) {
    if (useApp.getState().run.runId !== runId) return
    const message = e instanceof Error ? e.message : String(e)
    useApp.getState().setRun({ status: 'failed', runId: null })
    useApp.getState().appendRunLine(`\n[ERROR] ${message}`)
    useApp.getState().setOperationalError(`No se pudo iniciar la evaluación: ${message}`)
    if (useApp.getState().monitor.active) scheduleNextCycle(dir)
  }
}

async function estimateExpectedTotal(
  dir: string,
  cname: string | undefined,
  configDraft: string,
  selectedCases: number[] | undefined
): Promise<number | null> {
  try {
    const check = await window.teuton.check(dir, cname)
    const perCase = parseTargetsFromCheckOutput(check.output)
    if (perCase == null) return null
    const { config } = parseConfig(configDraft)
    return computeExpectedTotal(config.cases, selectedCases, perCase)
  } catch {
    return null
  }
}

/**
 * Índice de caso (1-based, como espera `teuton run --case`) que corresponde a
 * una fila de resultados, según la configuración ACTUAL del editor. El id del
 * caso de Teutón es su posición en el config («01», «02», …), pero si los
 * resultados son de otra clase (obsoletos), esa posición puede apuntar a otro
 * alumno: se valida por tt_members y, si no cuadra, se busca por nombre.
 * Devuelve null si el alumno ya no está en el config — mejor no ofrecer el
 * botón que reevaluar al alumno equivocado.
 */
export function caseIndexFor(row: StudentRow, configDraft: string): number | null {
  const cases = parseConfig(configDraft).config.cases
  const byId = parseInt(row.id, 10)
  if (byId >= 1 && byId <= cases.length && String(cases[byId - 1].tt_members ?? '') === row.members) {
    return byId
  }
  const byName = cases.findIndex((c) => String(c.tt_members ?? '') === row.members)
  return byName >= 0 ? byName + 1 : null
}

/**
 * Reevalúa a UN solo alumno (p.ej. corrigió algo durante el examen y pide que
 * se le vuelva a mirar). Tras la ejecución, resume.json contiene solo su caso,
 * así que el dashboard muestra temporalmente solo a ese alumno — igual que la
 * selección manual de casos en Ejecutar. Los récords conservan a todos y el
 * siguiente ciclo completo (o modo examen) restaura la vista de la clase.
 */
export async function reevaluateStudent(row: StudentRow): Promise<void> {
  const st = useApp.getState()
  if (!st.project || st.run.status === 'running') return
  const idx = caseIndexFor(row, st.configDraft)
  if (idx == null) return
  st.setView('run') // consola en vivo; al acabar bien, loadAfterExit vuelve a Resultados
  await startRun(st.project.dir, { cases: [idx], cname: st.project.cname })
}

export async function cancelRun(): Promise<void> {
  const { runId, projectDir } = useApp.getState().run
  try {
    if (runId) await window.teuton.cancelRun(runId)
  } catch (error) {
    useApp.getState().setOperationalError(`No se pudo cancelar la evaluación: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    useApp.getState().setRun({ status: 'idle', runId: null })
  }
  // Al anular el runId, el evento `close` del proceso cancelado se descarta y
  // loadAfterExit no llega a ejecutarse: si el modo examen está activo hay que
  // encadenar aquí el siguiente ciclo o el monitor quedaría «activo» sin
  // ninguna ejecución programada.
  if (useApp.getState().monitor.active && projectDir) scheduleNextCycle(projectDir)
}

/**
 * Deja el proyecto actual en un estado limpio antes de abrir otro o cerrarlo.
 *
 * El store resetea `run` y `monitor` al cambiar de proyecto, pero eso solo
 * olvida el proceso: el `teuton run` sigue vivo en main evaluando a la clase
 * anterior, sus eventos se descartan por `runId` (así que ni resultados ni
 * récords se guardan) y main rechaza la siguiente ejecución sobre ese
 * directorio con «Ya hay una evaluación activa». Hay que cancelarlo de verdad
 * y parar el temporizador del modo examen, que vive en este módulo.
 */
export async function leaveProject(): Promise<void> {
  stopMonitor()
  const runId = useApp.getState().run.runId
  if (!runId) return
  try {
    await window.teuton.cancelRun(runId)
  } catch (error) {
    useApp.getState().setOperationalError(
      `No se pudo detener la evaluación anterior: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  useApp.getState().setRun({ status: 'idle', runId: null })
}

/** ¿Hay una evaluación o un modo examen en marcha ahora mismo? */
export function isExamInProgress(): boolean {
  const st = useApp.getState()
  return st.run.status === 'running' || st.monitor.active
}

/**
 * Recarga de disco los últimos resultados y actualiza el récord de la clase
 * que PRODUJO esa ejecución (guardada en los metadatos del proyecto), no la
 * activa ahora: ejecutar con el grupo A, cambiar al B y recargar no debe
 * volcar las notas de A en el historial de B. Devuelve los resultados
 * cargados, o null si no hay proyecto abierto.
 */
export async function reloadLatestResults(): Promise<LoadedResults | null> {
  const project = useApp.getState().project
  if (!project) return null
  useApp.getState().setLoadingResults(true)
  try {
    const meta = await window.teuton.getProjectMeta(project.dir)
    // Campo ausente (proyecto de una versión anterior): asumimos la clase
    // activa, el único comportamiento posible hasta ahora.
    const runClassId =
      meta.lastRunClassId === undefined ? useApp.getState().activeClassId : meta.lastRunClassId
    const runClassName =
      meta.lastRunClassName === undefined ? useApp.getState().activeClass : meta.lastRunClassName
    const loaded = await window.teuton.loadResults(project.dir)
    const res = { ...loaded, classId: runClassId, className: runClassName }
    useApp.getState().setResults(res)
    const { grades, issues } = gradeRecordsFromResults(res)
    if (issues.length > 0) {
      useApp.getState().setOperationalError(issues.map((issue) => issue.message).join(' '))
      useApp.getState().setRecords(await window.teuton.getRecords(project.dir, runClassId ?? undefined))
      return res
    }
    const outcome = await window.teuton.updateRecords(project.dir, grades, runClassId ?? undefined)
    useApp.getState().setRecords(outcome.data)
    if (!outcome.persisted) useApp.getState().setOperationalError(outcome.warning || 'No se pudieron guardar los récords.')
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useApp.getState().setOperationalError(`No se pudieron cargar los últimos resultados: ${message}`)
    return null
  } finally {
    useApp.getState().setLoadingResults(false)
  }
}

// ---- Modo examen (monitor en bucle) ----

let monitorTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Inicia el modo examen: re-ejecuta todos los casos cada intervalMin minutos.
 *
 * Reentrar con el monitor ya activo no reinicia nada: cancelaría el temporizador
 * pendiente, pondría el contador de ciclos a 0 y arrastraría la vista al
 * dashboard a mitad de examen. Quien quiera parar tiene el botón de parada.
 */
export function startMonitor(dir: string, intervalMin: number, cname?: string): void {
  if (useApp.getState().monitor.active) return
  clearMonitorTimer()
  useApp.getState().setMonitor({ active: true, intervalMin, nextRunAt: null, cycles: 1 })
  useApp.getState().setView('dashboard')
  void startRun(dir, { cname }) // primer ciclo inmediato (todos los alumnos)
}

export function stopMonitor(): void {
  clearMonitorTimer()
  useApp.getState().setMonitor({ active: false, nextRunAt: null })
}

function clearMonitorTimer(): void {
  if (monitorTimer) {
    clearTimeout(monitorTimer)
    monitorTimer = null
  }
}

/** Minutos de intervalo saneados: entero y con techo, para que `setTimeout` no
 * desborde el int32 y dispare de inmediato en bucle (a partir de ~35 791 min). */
function intervalMs(intervalMin: number): number {
  const minutes = Number.isFinite(intervalMin) ? Math.floor(intervalMin) : 1
  return Math.min(Math.max(1, minutes), 24 * 60) * 60_000
}

/** Programa el siguiente ciclo tras terminar el actual (encadenado, sin solapes). */
function scheduleNextCycle(dir: string): void {
  const { monitor } = useApp.getState()
  if (!monitor.active) return
  const delay = intervalMs(monitor.intervalMin)
  useApp.getState().setMonitor({ nextRunAt: Date.now() + delay })
  clearMonitorTimer()
  monitorTimer = setTimeout(() => runCycle(dir), delay)
}

/**
 * Arranca un ciclo del modo examen. Si el proyecto ya no es el que se estaba
 * evaluando, para el monitor y lo dice: dejarlo «activo» sin temporizador es
 * peor que pararlo, porque el panel seguiría prometiendo ciclos que no llegan.
 */
function runCycle(dir: string): void {
  const st = useApp.getState()
  if (!st.monitor.active) return
  if (st.project?.dir !== dir) {
    stopMonitor()
    st.setOperationalError('El modo examen se ha detenido: el proyecto que se estaba evaluando ya no está abierto.')
    return
  }
  st.setMonitor({ nextRunAt: null, cycles: st.monitor.cycles + 1 })
  void startRun(dir, { cname: st.project.cname })
}

/**
 * Vigilante del modo examen. La invariante es «monitor activo ⇒ hay un ciclo
 * programado», y hay formas de perderla que no dependen del código: un `ssh`
 * colgado que nunca emite `exit` (el ciclo no termina y nadie reprograma), o
 * suspender el portátil, donde el temporizador no corre y el contador se queda
 * clavado en 0:00. Sin esto la clase deja de corregirse y la pantalla sigue
 * diciendo «activo».
 */
const WATCHDOG_INTERVAL_MS = 30_000
const WATCHDOG_GRACE_MS = 60_000
let processingExit = false

export function checkMonitorHealth(now = Date.now()): boolean {
  const st = useApp.getState()
  if (!st.monitor.active) return false
  // Un ciclo en curso (proceso vivo o resultados cargándose) no es un parón.
  if (st.run.status === 'running' || processingExit) return false
  const dir = st.project?.dir
  if (!dir) {
    stopMonitor()
    st.setOperationalError('El modo examen se ha detenido: no hay ningún proyecto abierto.')
    return true
  }
  const overdue = st.monitor.nextRunAt !== null && st.monitor.nextRunAt < now - WATCHDOG_GRACE_MS
  if (monitorTimer !== null && !overdue) return false
  st.setOperationalError('El modo examen se había quedado parado; se reanuda ahora.')
  clearMonitorTimer()
  runCycle(dir)
  return true
}

/**
 * Hook montado una sola vez en App: recibe TODOS los eventos de ejecución y
 * actualiza el store, cargue resultados y récords al terminar.
 */
export function useRunManager(): void {
  useEffect(() => {
    const unsub = window.teuton.onRunEvent(handleRunEvent)
    const watchdog = setInterval(() => checkMonitorHealth(), WATCHDOG_INTERVAL_MS)
    return () => {
      unsub()
      clearInterval(watchdog)
    }
  }, [])
}

/** Procesa un evento del proceso activo; exportado para probar carreras y errores. */
export function handleRunEvent(ev: RunEvent): void {
  const st = useApp.getState()
  const activeId = st.run.runId
  // Ignora procesos ya cancelados o de una ejecución anterior.
  if (!activeId || ev.runId !== activeId) return

  if (ev.type === 'stdout' || ev.type === 'stderr') {
    st.appendRunLine(stripAnsi(ev.data))
  } else if (ev.type === 'error') {
    const projectDir = st.run.projectDir
    st.appendRunLine(`\n[ERROR] ${ev.message}`)
    st.flushRunProgress()
    st.setRun({ status: 'failed', runId: null })
    st.setOperationalError(`La evaluación falló: ${ev.message}`)
    if (st.monitor.active && projectDir) scheduleNextCycle(projectDir)
  } else if (ev.type === 'exit') {
    st.flushRunProgress()
    const context = {
      projectDir: st.run.projectDir,
      classId: st.run.classId,
      className: st.run.className
    }
    st.setRun({
      status: ev.code === 0 ? 'done' : 'failed',
      runId: null,
      testName: ev.testName
    })
    void loadAfterExit(ev.code, ev.testName, context)
  }
}

async function loadAfterExit(
  code: number | null,
  testName: string | null,
  context: { projectDir: string | null; classId: string | null; className: string | null }
): Promise<void> {
  if (!context.projectDir) return
  processingExit = true
  const isCurrentContext = () => {
    const current = useApp.getState()
    return current.project?.dir === context.projectDir && current.activeClassId === context.classId
  }
  if (isCurrentContext()) useApp.getState().setLoadingResults(true)
  try {
    const loaded = await window.teuton.loadResults(context.projectDir, testName ?? undefined)
    const res = { ...loaded, classId: context.classId, className: context.className }
    if (isCurrentContext()) useApp.getState().setResults(res)
    // Recuerda qué clase produjo estos resultados: «cargar últimos resultados»
    // los atribuirá a ella aunque el profesor cambie de grupo entre medias.
    await window.teuton.setProjectMeta(context.projectDir, {
      lastRunClassId: context.classId,
      lastRunClassName: context.className
    })
    // Actualiza el récord histórico de mejor nota por alumno.
    const { grades, issues } = gradeRecordsFromResults(res)
    if (issues.length > 0) {
      useApp.getState().setOperationalError(issues.map((issue) => issue.message).join(' '))
      if (isCurrentContext()) {
        useApp.getState().setRecords(
          await window.teuton.getRecords(context.projectDir, context.classId ?? undefined)
        )
      }
      return
    }
    const grading = useApp.getState().grading
    const outcome = await window.teuton.updateRecords(context.projectDir, grades, context.classId ?? undefined)
    const rec = outcome.data
    if (isCurrentContext()) useApp.getState().setRecords(rec)
    if (!outcome.persisted) useApp.getState().setOperationalError(outcome.warning || 'No se pudieron guardar los récords.')
    // Genera/actualiza el CSV de Moodle de la clase activa con las MEJORES notas
    // (informes/moodle-<clase>.csv). Un fichero por clase: al pasar el mismo
    // examen a otro grupo se crea otro CSV y ambos coexisten como historial.
    const exportIssues = validateResultIdentity(res)
    if ((res.resume?.cases.length ?? 0) > 0 && exportIssues.length === 0) {
      const csvName = context.className || res.testName || 'clase'
      try {
        await window.teuton.writeClassCsv(
          context.projectDir,
          csvName,
          context.classId ?? undefined,
          buildMoodleCsv(res, rec, grading)
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        useApp.getState().setOperationalError(`Las notas se calcularon, pero no se pudo guardar el CSV: ${message}`)
      }
    } else if (exportIssues.length > 0) {
      useApp.getState().setOperationalError(
        `No se generó el CSV automático: ${exportIssues.map((issue) => issue.message).join(' ')}`
      )
    }
    // Navega a resultados solo si veníamos de la pestaña de ejecución manual.
    if (code === 0 && isCurrentContext() && useApp.getState().view === 'run' && !useApp.getState().monitor.active) {
      useApp.getState().setView('dashboard')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useApp.getState().setOperationalError(`No se pudo completar el procesamiento de resultados: ${message}`)
  } finally {
    processingExit = false
    if (isCurrentContext()) useApp.getState().setLoadingResults(false)
    // Si el modo examen sigue activo, encadena el siguiente ciclo.
    if (useApp.getState().monitor.active) scheduleNextCycle(context.projectDir)
  }
}
