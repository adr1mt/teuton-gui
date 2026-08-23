import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRunEvent, startRun } from '../src/renderer/src/lib/run'
import { useApp } from '../src/renderer/src/stores/app'
import type { TeutonApi } from '../src/shared/types'

function api(overrides: Partial<TeutonApi> = {}): TeutonApi {
  return {
    detect: vi.fn(), getTeutonPath: vi.fn(), setTeutonPath: vi.fn(), pickDirectory: vi.fn(),
    createProject: vi.fn(), openProject: vi.fn(), saveProject: vi.fn(), check: vi.fn().mockResolvedValue({ ok: true, output: '', exitCode: 0 }),
    run: vi.fn(), cancelRun: vi.fn(), onRunEvent: vi.fn(), loadResults: vi.fn(), exportAs: vi.fn(), saveFileDialog: vi.fn(),
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
})
