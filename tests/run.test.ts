import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkMonitorHealth, handleRunEvent, leaveProject, startMonitor, startRun, stopMonitor } from '../src/renderer/src/lib/run'
import { useApp } from '../src/renderer/src/stores/app'
import type { TeutonApi } from '../src/shared/types'

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
    useApp.getState().setRun({ status: 'running', runId: 'en-marcha' })

    expect(checkMonitorHealth()).toBe(false)
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
