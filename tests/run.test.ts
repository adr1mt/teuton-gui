import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelRun, checkMonitorHealth, handleRunEvent, isPartialResume, leaveProject, startMonitor, startRun, stopMonitor } from '../src/renderer/src/lib/run'
import { useApp } from '../src/renderer/src/stores/app'
import type { LoadedResults, TeutonApi } from '../src/shared/types'
import { caseReport, loadedResults, resumeCase } from './helpers'

function api(overrides: Partial<TeutonApi> = {}): TeutonApi {
  return {
    detect: vi.fn(), getTeutonPath: vi.fn(), setTeutonPath: vi.fn(), pickDirectory: vi.fn(),
    createProject: vi.fn(), openProject: vi.fn(), saveProject: vi.fn(), check: vi.fn().mockResolvedValue({ ok: true, output: '', exitCode: 0 }),
    run: vi.fn(), cancelRun: vi.fn(), keepAwake: vi.fn().mockResolvedValue(undefined), onRunEvent: vi.fn(), loadResults: vi.fn(), exportAs: vi.fn(), saveFileDialog: vi.fn(),
    recentProjects: vi.fn(), removeRecent: vi.fn(), openPath: vi.fn(), openExternal: vi.fn(), getGrading: vi.fn(), setGrading: vi.fn(),
    getDefaultGlobals: vi.fn(), setDefaultGlobals: vi.fn(), listClasses: vi.fn(), saveClass: vi.fn(), deleteClass: vi.fn(),
    getRecords: vi.fn(), updateRecords: vi.fn(), resetRecords: vi.fn(), getProjectMeta: vi.fn(), setProjectMeta: vi.fn(), writeClassCsv: vi.fn(),
    ...overrides
  } as TeutonApi
}

describe('orquestador de ejecución', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useApp.getState().closeProject()
    useApp.getState().setProject({
      dir: '/tmp/proyecto', cname: 'start', script: '', config: '---\ncases: []\n', scriptFile: 'start.rb', configFile: 'config.yaml'
    })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { teuton: api() } })
  })

  it('adopta el runId antes de que llegue el primer evento', async () => {
    const run = vi.fn(async (_dir: string, _options: unknown, runId: string) => {
      handleRunEvent({ runId, type: 'stdout', data: 'salida inmediata' })
      return { runId }
    })
    window.teuton = api({ run })

    await startRun('/tmp/proyecto', { cname: 'start' })

    expect(useApp.getState().run.log).toContain('salida inmediata')
    expect(useApp.getState().run.runId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('un error de proceso deja el monitor con el siguiente ciclo programado', () => {
    vi.useFakeTimers()
    useApp.getState().setMonitor({ active: true, intervalMin: 3, cycles: 1 })
    useApp.getState().setRun({ status: 'running', runId: 'run-activo', projectDir: '/tmp/proyecto' })

    handleRunEvent({ runId: 'run-activo', type: 'error', message: 'spawn EACCES' })

    expect(useApp.getState().run.status).toBe('failed')
    expect(useApp.getState().run.runId).toBeNull()
    expect(useApp.getState().monitor.nextRunAt).not.toBeNull()
    expect(useApp.getState().operationalError).toContain('spawn EACCES')
  })

  it('ceder el turno a una ejecución en vuelo no mata el modo examen', async () => {
    vi.useFakeTimers()
    useApp.getState().setMonitor({ active: true, intervalMin: 5, cycles: 2, nextRunAt: null })
    useApp.getState().setRun({ status: 'running', runId: 'otra-ejecucion', projectDir: '/tmp/proyecto' })

    // Es el caso real: el ciclo vence mientras se reevalúa a un alumno. El
    // temporizador ya se consumió, así que sin reprogramar aquí el monitor
    // quedaría «activo» para siempre sin ningún ciclo pendiente.
    await startRun('/tmp/proyecto', { cname: 'start' })

    expect(useApp.getState().run.runId).toBe('otra-ejecucion')
    expect(useApp.getState().monitor.active).toBe(true)
    expect(useApp.getState().monitor.nextRunAt).not.toBeNull()
  })

  it('arrancar el modo examen con una ejecución en vuelo deja ciclo programado', () => {
    vi.useFakeTimers()
    useApp.getState().setRun({ status: 'running', runId: 'otra-ejecucion', projectDir: '/tmp/proyecto' })

    startMonitor('/tmp/proyecto', 4, 'start')

    expect(useApp.getState().monitor.active).toBe(true)
    expect(useApp.getState().monitor.nextRunAt).not.toBeNull()
  })

  it('el vigilante reanuda un modo examen que se quedó sin ciclo', async () => {
    const run = vi.fn(async (_dir: string, _options: unknown, runId: string) => ({ runId }))
    window.teuton = api({ run })
    // Estado imposible de alcanzar ya por código, pero sí por un `ssh` colgado
    // que nunca emite `exit`: activo, sin proceso y con la cita pasada de largo.
    useApp.getState().setMonitor({ active: true, intervalMin: 1, cycles: 3, nextRunAt: Date.now() - 300_000 })
    useApp.getState().setRun({ status: 'done', runId: null })

    expect(checkMonitorHealth()).toBe(true)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(useApp.getState().monitor.cycles).toBe(4)
    expect(useApp.getState().operationalError).toContain('parado')
  })

  it('el vigilante no interrumpe un ciclo que está corriendo', () => {
    useApp.getState().setMonitor({ active: true, intervalMin: 1, cycles: 1, nextRunAt: Date.now() - 300_000 })
    useApp.getState().setRun({ status: 'running', runId: 'en-marcha', startedAt: Date.now() - 60_000 })

    expect(checkMonitorHealth()).toBe(false)
  })

  // S-07 (G7): Teutón no pone tiempo máximo a los comandos. Un `ssh` colgado
  // dejaba la pasada en «running» para siempre y el vigilante no hacía nada.
  it('el vigilante cancela una pasada colgada del modo examen y programa la siguiente', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    window.teuton = api({ cancelRun })
    const now = Date.now()
    useApp.getState().setMonitor({ active: true, intervalMin: 3, cycles: 2, nextRunAt: null })
    useApp.getState().setRun({ status: 'running', runId: 'colgada', projectDir: '/tmp/proyecto', startedAt: now - 11 * 60_000 })

    expect(checkMonitorHealth(now)).toBe(true)
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledWith('colgada'))
    await vi.waitFor(() => expect(useApp.getState().monitor.nextRunAt).not.toBeNull())
    expect(useApp.getState().monitor.active).toBe(true)
    expect(useApp.getState().run.status).toBe('idle')
    expect(useApp.getState().operationalError).toContain('sin terminar')
  })

  // main emite el `exit` del proceso matado ANTES de que se resuelva la
  // cancelación: sin anular el runId primero, la pasada cancelada se procesaba.
  it('cancelar descarta el exit del proceso cancelado', async () => {
    const loadResults = vi.fn()
    const cancel = vi.fn(async (runId: string) => {
      handleRunEvent({ runId, type: 'exit', code: null, testName: 'proyecto', outDir: null, startedAt: 0 })
    })
    window.teuton = api({ cancelRun: cancel, loadResults })
    useApp.getState().setRun({ status: 'running', runId: 'a-cancelar', projectDir: '/tmp/proyecto', startedAt: Date.now() })

    await cancelRun()

    expect(cancel).toHaveBeenCalledWith('a-cancelar')
    expect(loadResults).not.toHaveBeenCalled()
    expect(useApp.getState().run.status).toBe('idle')
  })

  it('startRun anota la hora de arranque de la pasada', async () => {
    window.teuton = api({ run: vi.fn(async (_d: string, _o: unknown, runId: string) => ({ runId })) })
    const before = Date.now()
    await startRun('/tmp/proyecto', { cname: 'start' })
    expect(useApp.getState().run.startedAt).toBeGreaterThanOrEqual(before)
  })

  it('el vigilante para el monitor si ya no hay proyecto abierto', () => {
    useApp.getState().setMonitor({ active: true, intervalMin: 1, cycles: 1, nextRunAt: null })
    useApp.getState().closeProject()
    useApp.getState().setMonitor({ active: true, intervalMin: 1, cycles: 1, nextRunAt: null })

    expect(checkMonitorHealth()).toBe(true)
    expect(useApp.getState().monitor.active).toBe(false)
    expect(useApp.getState().operationalError).toContain('proyecto')
  })

  it('el modo examen impide que el ordenador se suspenda, y lo suelta al parar', () => {
    const keepAwake = vi.fn().mockResolvedValue(undefined)
    window.teuton = api({ keepAwake, run: vi.fn(async (_d, _o, runId: string) => ({ runId })) })

    startMonitor('/tmp/proyecto', 5, 'start')
    // Durante el examen nadie toca el teclado: el escritorio da el equipo por
    // inactivo y lo suspende (en GNOME, con corriente, a las 2 h por defecto),
    // justo lo que dura un examen.
    expect(keepAwake).toHaveBeenCalledWith(true)

    stopMonitor()
    expect(keepAwake).toHaveBeenLastCalledWith(false)
  })

  it('al dejar el proyecto cancela el proceso vivo y para el monitor', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined)
    window.teuton = api({ cancelRun })
    useApp.getState().setMonitor({ active: true, intervalMin: 2, cycles: 1 })
    useApp.getState().setRun({ status: 'running', runId: 'run-vivo', projectDir: '/tmp/proyecto' })

    await leaveProject()

    // Sin esto el `teuton run` seguía vivo en main: sus eventos se descartaban
    // por runId y bloqueaba la siguiente ejecución sobre ese directorio.
    expect(cancelRun).toHaveBeenCalledWith('run-vivo')
    expect(useApp.getState().monitor.active).toBe(false)
    expect(useApp.getState().run.runId).toBeNull()
  })
})

/**
 * Procesa el `exit` de una pasada del grupo B con los informes que devuelva
 * `loadResults` y espera a que termine `loadAfterExit`.
 */
async function finishRun(
  code: number | null, loaded: LoadedResults, startedAt: number, partial = false, overrides: Partial<TeutonApi> = {}
): Promise<TeutonApi> {
  const teuton = api({
    loadResults: vi.fn().mockResolvedValue(loaded),
    setProjectMeta: vi.fn().mockResolvedValue(undefined),
    getRecords: vi.fn().mockResolvedValue({}),
    updateRecords: vi.fn(async (_d: string, grades: Record<string, number>) => ({ data: grades, persisted: true })),
    writeClassCsv: vi.fn().mockResolvedValue('/tmp/proyecto/informes/x.csv'),
    ...overrides
  })
  window.teuton = teuton
  useApp.getState().setActiveClass('Grupo B', 'clase-b')
  useApp.getState().setRun({ status: 'running', runId: 'r1', projectDir: '/tmp/proyecto', classId: 'clase-b', className: 'Grupo B', partial })
  handleRunEvent({ runId: 'r1', type: 'exit', code, testName: 'proyecto', outDir: null, startedAt })
  await vi.waitFor(() => expect(useApp.getState().loadingResults).toBe(false))
  await new Promise((resolve) => setTimeout(resolve, 0))
  return teuton
}

function grupoA(generatedAt: number, caseTime = generatedAt): LoadedResults {
  const res = loadedResults({
    resumeCases: [resumeCase('01', 'Ana', 100, { moodleId: 'a1' }), resumeCase('02', 'Luis', 100, { moodleId: 'a2' })],
    cases: [caseReport('01', 'Ana', 100, [{ id: '01', check: true }]), caseReport('02', 'Luis', 100, [{ id: '01', check: true }])]
  })
  res.generatedAt = generatedAt
  for (const c of res.cases) c.generatedAt = caseTime
  return res
}

describe('procedencia de los informes (S-02)', () => {
  const START = Date.UTC(2026, 8, 16, 10, 0, 0, 500)

  beforeEach(() => {
    vi.useRealTimers()
    useApp.getState().closeProject()
    useApp.getState().setProject({
      dir: '/tmp/proyecto', cname: 'start', script: '', config: '---\ncases: []\n', scriptFile: 'start.rb', configFile: 'config.yaml'
    })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { teuton: api() } })
  })

  it('G2: una pasada que sale con error no guarda los informes que había en disco', async () => {
    const teuton = await finishRun(1, grupoA(START - 3_600_000), START)
    expect(teuton.updateRecords).not.toHaveBeenCalled()
    expect(teuton.writeClassCsv).not.toHaveBeenCalled()
    expect(teuton.setProjectMeta).not.toHaveBeenCalled()
    expect(useApp.getState().operationalError).toContain('no ha producido informes nuevos')
  })

  it('G3: una pasada con código 0 que no escribió nada tampoco', async () => {
    const teuton = await finishRun(0, grupoA(START - 3_600_000), START)
    expect(teuton.updateRecords).not.toHaveBeenCalled()
    expect(teuton.writeClassCsv).not.toHaveBeenCalled()
    expect(teuton.setProjectMeta).not.toHaveBeenCalled()
    expect(useApp.getState().results).toBeNull()
    expect(useApp.getState().operationalError).toContain('no ha producido informes nuevos')
  })

  it('G3: sin resume.json no hay pasada que procesar', async () => {
    const res = grupoA(START + 1000)
    res.resume = null
    res.generatedAt = null
    const teuton = await finishRun(0, res, START)
    expect(teuton.updateRecords).not.toHaveBeenCalled()
    expect(useApp.getState().operationalError).toContain('no ha producido informes nuevos')
  })

  it('G5: un caso de otra pasada junto a un resumen nuevo no se procesa', async () => {
    const res = grupoA(START + 2000)
    res.cases[1].generatedAt = START - 3_600_000
    const teuton = await finishRun(0, res, START)
    expect(teuton.updateRecords).not.toHaveBeenCalled()
    expect(teuton.writeClassCsv).not.toHaveBeenCalled()
  })

  it('una pasada buena y nueva se guarda', async () => {
    const teuton = await finishRun(0, grupoA(START + 2000), START)
    expect(teuton.setProjectMeta).toHaveBeenCalled()
    expect(teuton.updateRecords).toHaveBeenCalledWith('/tmp/proyecto', { Ana: 100, Luis: 100 }, 'clase-b')
    expect(teuton.writeClassCsv).toHaveBeenCalled()
  })

  it('un informe escrito unos milisegundos antes del arranque no es de esta pasada', async () => {
    // Dos pasadas en el mismo segundo: redondear al segundo aceptaba la anterior.
    const teuton = await finishRun(0, grupoA(START - 300.25), START)
    expect(teuton.updateRecords).not.toHaveBeenCalled()
  })

  it('un sistema de ficheros con marcas de segundo no rechaza una pasada nueva', async () => {
    // START lleva 500 ms; ext3/FAT truncan el mtime al segundo.
    const teuton = await finishRun(0, grupoA(START - 500), START)
    expect(teuton.updateRecords).toHaveBeenCalled()
  })
})

describe('reevaluación parcial (S-01)', () => {
  const START = Date.UTC(2026, 8, 16, 11, 0, 0, 0)

  beforeEach(() => {
    vi.useRealTimers()
    useApp.getState().closeProject()
    useApp.getState().setProject({
      dir: '/tmp/proyecto', cname: 'start', script: '', config: '---\ncases: []\n', scriptFile: 'start.rb', configFile: 'config.yaml'
    })
  })

  function reevaluacion(): LoadedResults {
    const res = loadedResults({
      resumeCases: [
        resumeCase('-', '-', 0, { skip: true, moodleId: undefined }),
        resumeCase('02', 'Luis', 100, { moodleId: 'a2' }),
        resumeCase('-', '-', 0, { skip: true, moodleId: undefined })
      ],
      cases: [caseReport('02', 'Luis', 100, [{ id: '01', check: true }])]
    })
    res.generatedAt = START + 2000
    res.cases[0].generatedAt = START + 1000
    return res
  }

  it('guarda la nota del reevaluado pero no reescribe el CSV de la clase', async () => {
    const teuton = await finishRun(0, reevaluacion(), START, true)
    expect(teuton.updateRecords).toHaveBeenCalledWith('/tmp/proyecto', { Luis: 100 }, 'clase-b')
    expect(teuton.writeClassCsv).not.toHaveBeenCalled()
    expect(useApp.getState().results?.partial).toBe(true)
    expect(useApp.getState().operationalError).toContain('parcial')
  })

  it('startRun congela si la pasada es parcial', async () => {
    const run = vi.fn(async (_d: string, _o: unknown, runId: string) => ({ runId }))
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { teuton: api({ run }) } })
    await startRun('/tmp/proyecto', { cname: 'start', cases: [2] })
    expect(useApp.getState().run.partial).toBe(true)
  })
})

describe('isPartialResume (recargar de disco)', () => {
  const skip = resumeCase('-', '-', 0, { skip: true })
  const res = loadedResults({ resumeCases: [skip, resumeCase('02', 'Luis', 100)] })

  it('una fila skip sin tt_skip en el config es de --case', () => {
    expect(isPartialResume(res, '---\ncases:\n- tt_members: Ana\n- tt_members: Luis\n')).toBe(true)
  })

  it('una fila skip de un alumno con tt_skip: true no hace parcial la pasada', () => {
    expect(isPartialResume(res, '---\ncases:\n- tt_members: Ana\n  tt_skip: true\n- tt_members: Luis\n')).toBe(false)
  })
})

describe('orden de guardado al terminar (S-05, S-06)', () => {
  const START = Date.UTC(2026, 8, 16, 12, 0, 0, 0)
  const fresh = () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', 'Ana', 0, { moodleId: 'a1' })],
      cases: [caseReport('01', 'Ana', 0, [{ id: '01' }])]
    })
    res.generatedAt = START + 2000
    res.cases[0].generatedAt = START + 1000
    return res
  }

  beforeEach(() => {
    vi.useRealTimers()
    useApp.getState().closeProject()
    useApp.getState().setProject({
      dir: '/tmp/proyecto', cname: 'start', script: '', config: '---\ncases: []\n', scriptFile: 'start.rb', configFile: 'config.yaml'
    })
  })

  it('G9: si no se pueden escribir los metadatos, las notas se guardan igual', async () => {
    const teuton = await finishRun(0, fresh(), START, false, {
      setProjectMeta: vi.fn().mockRejectedValue(new Error('EACCES: permission denied'))
    })
    expect(teuton.updateRecords).toHaveBeenCalledWith('/tmp/proyecto', { Ana: 0 }, 'clase-b')
    expect(teuton.writeClassCsv).toHaveBeenCalled()
    expect(useApp.getState().operationalError).toContain('EACCES')
  })

  it('G8: con el historial ilegible no se reescribe el CSV con las notas de esta pasada', async () => {
    useApp.getState().setRecords({ Ana: 100 })
    const teuton = await finishRun(0, fresh(), START, false, {
      updateRecords: vi.fn().mockResolvedValue({ data: { Ana: 0 }, persisted: false, warning: 'EACCES: historial' })
    })
    expect(teuton.writeClassCsv).not.toHaveBeenCalled()
    expect(useApp.getState().records).toEqual({ Ana: 100 })
    expect(useApp.getState().operationalError).toContain('notas')
    expect(useApp.getState().operationalError).toContain('CSV')
  })
})
