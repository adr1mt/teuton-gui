import { ipcMain, dialog, shell, BrowserWindow, app, powerSaveBlocker } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, basename, resolve, sep } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { IPC } from '../shared/ipc'
import type { ExportFormat, RunEvent, RunOptions } from '../shared/types'
import { detectTeuton, looksLikeTeuton, resetTeutonCache, runTeutonSync, spawnRun } from './teuton'
import {
  createProject,
  getRecents,
  openProject,
  removeRecent,
  saveProject
} from './projects'
import { loadResults, readOutputLocation } from './results'
import {
  getGrading,
  setGrading,
  getDefaultGlobals,
  setDefaultGlobals,
  listClasses,
  saveClass,
  deleteClass,
  getRecords,
  updateRecords,
  resetRecords,
  listRecordBackups,
  restoreRecordBackup,
  getCredentialsStatus,
  getProjectMeta,
  setProjectMeta,
  writeClassCsv,
  getTeutonPath,
  setTeutonPath
} from './store'
import {
  validatedGlobals,
  validatedGrading,
  validatedMeta,
  validatedOptionalId,
  validatedPath,
  validatedRecords,
  validatedRoster,
  validatedText
} from './validation'

interface ActiveRun {
  child: ChildProcess
  dir: string
  cancelling: boolean
}

const activeRuns = new Map<string, ActiveRun>()

/**
 * Directorios con una evaluación reservada. Se reserva ANTES de lanzar el
 * proceso (no después): comprobar el registro y luego `await spawnRun` deja un
 * hueco en el que dos peticiones arrancan dos `teuton run` sobre el mismo
 * `var/<test>/`, que es exactamente la escritura entrelazada que corrompe los
 * `case-NN.json` y por la que existe el rescate de `results.ts`.
 */
const busyDirs = new Set<string>()

function reserveDir(dir: string): void {
  if (busyDirs.has(dir)) throw new Error('Ya hay una evaluación activa para este proyecto.')
  busyDirs.add(dir)
}
const EXPORT_FORMATS = new Set<ExportFormat>(['txt', 'html', 'yaml', 'json', 'xml', 'markdown', 'colored_text'])

/**
 * Directorios de proyecto que el profesor ha elegido de verdad: lo que devuelve
 * el selector del sistema y lo que ya está en la lista de recientes.
 *
 * `validatedPath` normaliza la ruta pero no la confina (`resolve` colapsa los
 * `..`, no los prohíbe), así que sin esto cualquier handler aceptaba cualquier
 * ruta absoluta del disco: `saveProject` era una escritura arbitraria de 10 MB
 * con nombre elegido por quien llamara, y `openPath` un `xdg-open` de lo que
 * fuera. Hoy no hay forma de explotarlo (no hay `innerHTML` ni `eval` en el
 * renderer, que solo carga contenido propio), pero el coste de cerrarlo es este
 * conjunto y la app maneja datos reales de alumnos.
 */
const allowedRoots = new Set<string>()

function allowRoot(dir: string): string {
  const root = resolve(dir)
  allowedRoots.add(root)
  return root
}

function isInsideAllowedRoot(path: string): boolean {
  for (const root of allowedRoots) {
    if (path === root || path.startsWith(root + sep)) return true
  }
  return false
}

function projectDir(value: unknown): string {
  const path = validatedPath(value, 'La ruta del proyecto')
  if (!isInsideAllowedRoot(path)) {
    throw new Error('Esa carpeta no es un proyecto abierto en la aplicación.')
  }
  return path
}

function fileName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.length > 128 || basename(value) !== value || value.includes('\0')) {
    throw new Error(`${label} no es válido.`)
  }
  // `basename('..') === '..'`, así que hasta aquí llegaban: como nombre de test
  // hacía que `loadResults` leyera un nivel por encima del directorio de salida,
  // y como nombre de fichero permitía escribir ficheros ocultos del proyecto.
  if (value.startsWith('.')) throw new Error(`${label} no es válido.`)
  return value
}

/** `tt_outdir` resuelto dentro del proyecto; fuera de él no se lee nada. */
function insideProject(dir: string, value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('El directorio de salida no es válido.')
  const path = resolve(dir, value)
  if (path === dir || !path.startsWith(dir + sep)) {
    throw new Error(`El directorio de salida «${value}» (tt_outdir) está fuera del proyecto; la aplicación no puede leer los informes.`)
  }
  return path
}

function cname(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const name = fileName(value, 'El nombre de configuración')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('El nombre de configuración no es válido.')
  return name
}

function runOptions(value: unknown): RunOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Las opciones de ejecución no son válidas.')
  const options = value as RunOptions
  const cases = options.cases
  if (cases !== undefined && (!Array.isArray(cases) || cases.some((n) => !Number.isInteger(n) || n < 1 || n > 100_000))) {
    throw new Error('Los casos seleccionados no son válidos.')
  }
  return { cname: cname(options.cname), cases }
}

function runIdentifier(value: unknown): string {
  const id = validatedText(value, 'El identificador de ejecución', 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('El identificador de ejecución no es válido.')
  }
  return id
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  // Comparación con la ruta real del renderer, no con el final de la URL:
  // cualquier documento file:// acabado en /renderer/index.html pasaba el filtro.
  if (app.isPackaged) return senderUrl === pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!devUrl) return senderUrl.startsWith('file:')
  try {
    return new URL(senderUrl).origin === new URL(devUrl).origin
  } catch {
    return false
  }
}

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Origen IPC no autorizado.')
    return listener(event, ...args)
  })
}

/** Escritura atómica con permisos restrictivos, para ficheros con notas. */
async function writeExport(path: string, content: string): Promise<void> {
  const temp = `${path}.tmp`
  try {
    await fs.writeFile(temp, content, { encoding: 'utf-8', mode: 0o600 })
    await fs.rename(temp, path)
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined)
    throw error
  }
}

const KILL_ESCALATION_MS = 3000

function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function sendSignal(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Puede haber terminado entre la consulta y la señal; probamos el padre.
    }
  }
  child.kill(signal)
}

/**
 * Cancela un proceso en ejecución. Por defecto manda SIGTERM y programa una
 * escalada a SIGKILL a los 3 s si sigue vivo (p.ej. un `ssh` colgado que
 * ignora SIGTERM hasta su propio timeout). El temporizador se cancela solo si
 * el hijo termina antes, y usa unref() para no retener el bucle de eventos.
 *
 * Con `immediate: true` (usado en el camino de 'before-quit', donde la app
 * puede morir antes de que venzan los 3 s) manda SIGTERM y SIGKILL de forma
 * síncrona, sin esperar, para no dejar el grupo de procesos huérfano.
 */
function cancelProcess(child: ChildProcess, options: { immediate?: boolean } = {}): void {
  sendSignal(child, 'SIGTERM')

  if (options.immediate) {
    if (isAlive(child)) sendSignal(child, 'SIGKILL')
    return
  }

  const timer = setTimeout(() => {
    if (isAlive(child)) sendSignal(child, 'SIGKILL')
  }, KILL_ESCALATION_MS)
  timer.unref()

  const cancelTimer = (): void => clearTimeout(timer)
  child.once('exit', cancelTimer)
  child.once('close', cancelTimer)
}

/**
 * Hijos de `runTeutonSync` (check / export). Se registran aquí porque el timeout
 * de `execFile` solo mata al proceso directo, no al grupo: sin esto, salir de la
 * app durante un export deja vivos el `ruby` y los `ssh` a las máquinas de los
 * alumnos, y `stopActiveRuns()` no puede alcanzarlos.
 */
const syncChildren = new Set<ChildProcess>()

function trackChild(child: ChildProcess): void {
  syncChildren.add(child)
  const forget = (): void => {
    syncChildren.delete(child)
  }
  child.once('close', forget)
  child.once('error', forget)
  child.stdout?.on('error', () => undefined)
  child.stderr?.on('error', () => undefined)
}

/**
 * Mantiene el ordenador despierto mientras dura el modo examen.
 *
 * Durante el examen el profesor no toca el teclado —la app corrige sola y el
 * panel se proyecta—, así que para el escritorio el equipo está inactivo y lo
 * suspende por su cuenta: en GNOME, con corriente, a las 2 h por defecto, que es
 * justo lo que dura un examen. Al suspenderse deja de corregirse a la clase.
 *
 * Se usa `prevent-display-sleep` (no `prevent-app-suspension`) porque además hay
 * que impedir que la pantalla se apague: está proyectada.
 */
let keepAwakeId: number | null = null

function setKeepAwake(active: boolean): void {
  if (active) {
    if (keepAwakeId === null || !powerSaveBlocker.isStarted(keepAwakeId)) {
      keepAwakeId = powerSaveBlocker.start('prevent-display-sleep')
    }
    return
  }
  if (keepAwakeId !== null && powerSaveBlocker.isStarted(keepAwakeId)) {
    powerSaveBlocker.stop(keepAwakeId)
  }
  keepAwakeId = null
}

/** Devuelve el control de la suspensión al salir de la aplicación. */
export function releaseKeepAwake(): void {
  setKeepAwake(false)
}

const CANCEL_WAIT_MS = 10_000

/**
 * Cancela y espera a que el proceso muera de verdad antes de resolver. El
 * renderer espera este await para volver a habilitar «Ejecutar»: si se
 * resolviera al enviar SIGTERM, cancelar y relanzar acto seguido pondría dos
 * procesos a escribir en el mismo `var/<test>/` durante los 3 s de escalada.
 */
function cancelAndWait(entry: ActiveRun): Promise<void> {
  entry.cancelling = true
  const { child } = entry
  if (!isAlive(child)) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('La evaluación no se ha detenido todavía; espera unos segundos antes de volver a ejecutar.'))
    }, CANCEL_WAIT_MS)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    cancelProcess(child)
  })
}

/** Detiene los procesos de evaluación al salir de la aplicación. */
export function stopActiveRuns(): void {
  for (const { child } of activeRuns.values()) cancelProcess(child, { immediate: true })
  for (const child of syncChildren) cancelProcess(child, { immediate: true })
  activeRuns.clear()
  syncChildren.clear()
  busyDirs.clear()
}

/** ¿Hay alguna evaluación viva? Lo consulta el aviso al cerrar la ventana. */
export function hasActiveRuns(): boolean {
  return (
    [...activeRuns.values()].some(({ child }) => isAlive(child)) ||
    [...syncChildren].some(isAlive)
  )
}

function broadcast(event: RunEvent): void {
  // Se llama desde callbacks asíncronos del hijo: una ventana cerrada entre la
  // enumeración y el envío lanzaría «Object has been destroyed» fuera de todo
  // try/catch y tiraría el proceso main a mitad de examen.
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC.runEvent, event)
      }
    } catch {
      // Ventana cerrándose: no hay a quién avisar y no es un error.
    }
  }
}

export function registerIpc(): void {
  handle(IPC.detect, () => detectTeuton())

  handle(IPC.pickDirectory, async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    // Elegida por el profesor en el diálogo del sistema: a partir de aquí es un
    // destino legítimo para el resto de operaciones.
    return allowRoot(res.filePaths[0])
  })

  handle(IPC.createProject, (_e, dir) => createProject(projectDir(dir)))

  handle(IPC.openProject, (_e, dir, configName) =>
    openProject(projectDir(dir), cname(configName))
  )

  handle(IPC.saveProject, (_e, files) => {
    if (!files || typeof files !== 'object') throw new Error('Los ficheros del proyecto no son válidos.')
    const input = files as Record<string, unknown>
    if (
      typeof input.script !== 'string' ||
      typeof input.config !== 'string' ||
      input.script.length > 10_000_000 ||
      input.config.length > 10_000_000
    ) throw new Error('El contenido del proyecto no es válido o es demasiado grande.')
    return saveProject({
      dir: projectDir(input.dir),
      scriptFile: fileName(input.scriptFile, 'El fichero de script'),
      configFile: fileName(input.configFile, 'El fichero de configuración'),
      script: input.script,
      config: input.config
    })
  })

  handle(IPC.check, async (_e, dir, configName) => {
    const safeDir = projectDir(dir)
    const safeCname = cname(configName)
    const args = ['check']
    if (safeCname) args.push(`--cname=${safeCname}`)
    args.push('.')
    const res = await runTeutonSync(args, safeDir, 30000, trackChild)
    return {
      ok: res.code === 0,
      output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
      exitCode: res.code
    }
  })

  handle(IPC.runStart, async (_e, dir, options, requestedRunId) => {
    const safeDir = projectDir(dir)
    const runId = runIdentifier(requestedRunId)
    const safeOptions = runOptions(options)
    if (activeRuns.has(runId)) throw new Error('Ese identificador de ejecución ya está en uso.')
    reserveDir(safeDir)
    let child: ChildProcess
    let testName: string
    let outDir: string | null
    const startedAt = Date.now()
    try {
      ;({ child, testName, outDir } = await spawnRun(safeDir, safeOptions))
    } catch (error) {
      busyDirs.delete(safeDir)
      throw error
    }
    activeRuns.set(runId, { child, dir: safeDir, cancelling: false })

    // Libera solo si la entrada sigue siendo ESTE hijo: borrar a ciegas dejaría
    // fuera del registro a otra ejecución viva, que ya no se podría cancelar ni
    // matar al salir de la app.
    const release = (): void => {
      if (activeRuns.get(runId)?.child === child) activeRuns.delete(runId)
      busyDirs.delete(safeDir)
    }

    child.stdout?.on('data', (d: Buffer) =>
      broadcast({ runId, type: 'stdout', data: d.toString() })
    )
    child.stderr?.on('data', (d: Buffer) =>
      broadcast({ runId, type: 'stderr', data: d.toString() })
    )
    // Un EIO/EPIPE en la tubería sin oyente de 'error' lanza desde el
    // EventEmitter y mata el proceso main.
    child.stdout?.on('error', () => undefined)
    child.stderr?.on('error', () => undefined)
    child.on('error', (err) => {
      release()
      broadcast({ runId, type: 'error', message: err.message })
    })
    child.on('close', (code) => {
      release()
      broadcast({ runId, type: 'exit', code, testName, outDir, startedAt })
    })

    return { runId }
  })

  handle(IPC.keepAwake, (_e, active) => {
    if (typeof active !== 'boolean') throw new Error('El valor de mantener despierto no es válido.')
    setKeepAwake(active)
  })

  handle(IPC.runCancel, async (_e, value) => {
    const runId = runIdentifier(value)
    const active = activeRuns.get(runId)
    if (active) await cancelAndWait(active)
  })

  handle(IPC.loadResults, async (_e, dir, testName, outDir) => {
    const safeDir = projectDir(dir)
    // «Cargar últimos resultados» no sabe dónde escribió la última pasada: con
    // `tt_outdir` el resumen no está en var/ y se cargaría uno viejo de allí.
    if (testName === undefined && outDir === undefined) {
      const location = await readOutputLocation(safeDir)
      if (location.outDir) {
        return loadResults(safeDir, fileName(location.testName, 'El nombre del test'), insideProject(safeDir, location.outDir))
      }
      return loadResults(safeDir)
    }
    return loadResults(
      safeDir,
      testName === undefined ? undefined : fileName(testName, 'El nombre del test'),
      outDir === undefined ? undefined : insideProject(safeDir, outDir)
    )
  })

  handle(IPC.exportAs, async (_e, dir, format) => {
    if (!EXPORT_FORMATS.has(format as ExportFormat)) throw new Error('El formato de exportación no es válido.')
    const safeDir = projectDir(dir)
    // `teuton run --export` es una ejecución completa: reescribe var/<test>/ y
    // por tanto compite con una evaluación en curso. Misma reserva que runStart.
    reserveDir(safeDir)
    try {
      const res = await runTeutonSync(['run', `--export=${format}`, '.'], safeDir, 120000, trackChild)
      return {
        ok: res.code === 0,
        output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
        exitCode: res.code
      }
    } finally {
      busyDirs.delete(safeDir)
    }
  })

  handle(IPC.saveFileDialog, async (_e, defaultName, content) => {
    const safeName = fileName(defaultName, 'El nombre del fichero')
    const safeContent = validatedText(content, 'El contenido del fichero', 20_000_000, true)
    const res = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), safeName)
    })
    if (res.canceled || !res.filePath) return null
    // Contiene notas de alumnos: 0600, y escritura atómica para no destruir una
    // exportación anterior si falla a medias (writeFile trunca antes de escribir).
    await writeExport(res.filePath, safeContent)
    return res.filePath
  })

  handle(IPC.recentProjects, async () => {
    const recents = await getRecents()
    // Abrir un reciente es legítimo: el profesor ya trabajó ahí. Esta llamada es
    // lo primero que hace la pantalla de Inicio, así que la lista queda
    // autorizada antes de que pueda pulsar nada.
    for (const entry of recents) allowRoot(entry.dir)
    return recents
  })
  handle(IPC.removeRecent, (_e, dir) => removeRecent(projectDir(dir)))
  handle(IPC.openPath, (_e, target) => {
    // `shell.openPath` en Linux es `xdg-open`, que EJECUTA un `.desktop`. Su
    // único uso real es abrir la carpeta de informes del proyecto.
    const path = validatedPath(target, 'La ruta')
    if (!isInsideAllowedRoot(path)) throw new Error('Solo se pueden abrir carpetas del proyecto.')
    return shell.openPath(path)
  })
  handle(IPC.openExternal, (_e, url) => {
    // Lista blanca de esquemas: nunca abrir file: u otros esquemas peligrosos.
    if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) {
      return shell.openExternal(url)
    }
    return undefined
  })

  handle(IPC.getGrading, () => getGrading())
  handle(IPC.setGrading, (_e, grading) => setGrading(validatedGrading(grading)))

  handle(IPC.getTeutonPath, () => getTeutonPath())
  handle(IPC.setTeutonPath, async (_e, path) => {
    if (path !== null && path !== '' && typeof path !== 'string') throw new Error('La ruta de teuton no es válida.')
    const safePath = path === null || path === '' ? null : validatedPath(path, 'La ruta de teuton')
    if (safePath && !(await looksLikeTeuton(safePath))) {
      throw new Error(
        'Ese programa no responde como Teutón (`teuton version` no devuelve una versión). ' +
          'Revisa la ruta antes de guardarla.'
      )
    }
    await setTeutonPath(safePath)
    resetTeutonCache()
    return detectTeuton()
  })

  handle(IPC.getDefaultGlobals, () => getDefaultGlobals())
  handle(IPC.getCredentialsStatus, () => getCredentialsStatus())
  handle(IPC.setDefaultGlobals, (_e, globals) => setDefaultGlobals(validatedGlobals(globals)))

  handle(IPC.listClasses, () => listClasses())
  handle(IPC.saveClass, (_e, roster) => saveClass(validatedRoster(roster)))
  handle(IPC.deleteClass, (_e, id) => deleteClass(validatedText(id, 'El identificador de la clase', 128)))

  handle(IPC.getRecords, (_e, dir, classId) =>
    getRecords(projectDir(dir), validatedOptionalId(classId, 'El identificador de la clase'))
  )
  handle(IPC.updateRecords, (_e, dir, grades, classId) =>
    updateRecords(
      projectDir(dir),
      validatedRecords(grades),
      validatedOptionalId(classId, 'El identificador de la clase')
    )
  )
  handle(IPC.resetRecords, (_e, dir, classId) =>
    resetRecords(projectDir(dir), validatedOptionalId(classId, 'El identificador de la clase'))
  )
  handle(IPC.listRecordBackups, (_e, dir) => listRecordBackups(projectDir(dir)))
  handle(IPC.restoreRecordBackup, (_e, dir, id, classId) =>
    restoreRecordBackup(
      projectDir(dir),
      validatedText(id, 'El identificador de la copia', 32),
      validatedOptionalId(classId, 'El identificador de la clase')
    )
  )

  handle(IPC.getProjectMeta, (_e, dir) => getProjectMeta(projectDir(dir)))
  handle(IPC.setProjectMeta, (_e, dir, meta) =>
    setProjectMeta(projectDir(dir), validatedMeta(meta))
  )
  handle(IPC.writeClassCsv, (_e, dir, className, classId, content) =>
    writeClassCsv(
      projectDir(dir),
      validatedText(className, 'El nombre de la clase', 128),
      validatedOptionalId(classId, 'El identificador de la clase'),
      validatedText(content, 'El contenido del CSV', 20_000_000, true)
    )
  )
}
