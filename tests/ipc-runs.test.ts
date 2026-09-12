import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simula el ciclo de vida de los procesos de evaluación en el proceso main sin
// arrancar Electron ni teuton: lo que se prueba es quién queda registrado, quién
// libera el directorio y qué sobrevive a salir de la aplicación.

const runtime = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  spawned: [] as FakeChild[],
  spawnError: null as Error | null
}))

class FakeChild extends EventEmitter {
  // Por encima de cualquier pid_max posible: `sendSignal` intenta primero
  // `process.kill(-pid)` para alcanzar al grupo, y con un pid real del sistema
  // este test podría mandar señales a procesos ajenos. Así siempre da ESRCH y
  // cae al `child.kill()` simulado.
  pid = 2 ** 30
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed: NodeJS.Signals[] = []

  kill(signal: NodeJS.Signals): boolean {
    this.killed.push(signal)
    return true
  }

  /** Termina como lo haría el proceso real: primero 'exit', luego 'close'. */
  finish(code: number | null = 0): void {
    this.exitCode = code
    this.emit('exit', code, null)
    this.emit('close', code, null)
  }
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
      runtime.handlers.set(channel, listener)
    }
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  app: { isPackaged: false, getPath: () => '/tmp/teuton-ipc-tests' },
  safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock('../src/main/teuton', () => ({
  detectTeuton: vi.fn(),
  resetTeutonCache: vi.fn(),
  runTeutonSync: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
  spawnRun: vi.fn(async () => {
    if (runtime.spawnError) throw runtime.spawnError
    const child = new FakeChild()
    runtime.spawned.push(child)
    return { child, testName: 'proyecto' }
  })
}))

import { IPC } from '../src/shared/ipc'
import { hasActiveRuns, registerIpc, stopActiveRuns } from '../src/main/ipc'

// Rama de desarrollo de isTrustedSender: origen igual al del servidor de Vite.
process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
const event = { senderFrame: { url: 'http://localhost:5173/index.html' }, sender: { getURL: () => '' } }

registerIpc()

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = runtime.handlers.get(channel)
  if (!handler) throw new Error(`canal no registrado: ${channel}`)
  return handler(event, ...args)
}

const DIR = '/tmp/proyecto-uat'
const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'

describe('ciclo de vida de las evaluaciones en main', () => {
  beforeEach(() => {
    stopActiveRuns()
    runtime.spawned.length = 0
    runtime.spawnError = null
  })

  it('no arranca dos evaluaciones a la vez sobre el mismo proyecto', async () => {
    // Las dos peticiones salen antes de que ninguna termine: es el doble clic en
    // «Ejecutar». Dos `teuton run` sobre el mismo var/<test>/ dejan los
    // case-NN.json corruptos (JSON válido + cola del otro proceso).
    const [first, second] = await Promise.allSettled([
      call(IPC.runStart, DIR, {}, idA),
      call(IPC.runStart, DIR, {}, idB)
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('rejected')
    expect(runtime.spawned).toHaveLength(1)
  })

  it('libera el proyecto cuando el proceso termina', async () => {
    await call(IPC.runStart, DIR, {}, idA)
    runtime.spawned[0].finish(0)
    await call(IPC.runStart, DIR, {}, idB)
    expect(runtime.spawned).toHaveLength(2)
  })

  it('rechaza reutilizar un identificador de ejecución vivo', async () => {
    await call(IPC.runStart, DIR, {}, idA)
    // Con el mismo id, `activeRuns.set` sobreescribía la entrada y el primer
    // proceso quedaba fuera del registro: incancelable e inmortal.
    await expect(call(IPC.runStart, '/tmp/otro-proyecto', {}, idA)).rejects.toThrow(/identificador/)
  })

  it('libera el proyecto si el proceso no llega a arrancar', async () => {
    runtime.spawnError = new Error('teuton no está instalado')
    await expect(call(IPC.runStart, DIR, {}, idA)).rejects.toThrow(/teuton/)
    runtime.spawnError = null
    await expect(call(IPC.runStart, DIR, {}, idB)).resolves.toEqual({ runId: idB })
  })

  it('cancelar espera a que el proceso muera de verdad', async () => {
    await call(IPC.runStart, DIR, {}, idA)
    const child = runtime.spawned[0]
    const pending = call(IPC.runCancel, idA)
    let resolved = false
    void pending.then(() => {
      resolved = true
    })
    await Promise.resolve()
    // Mientras el hijo siga vivo el renderer no debe poder relanzar: si la
    // cancelación resolviera al enviar SIGTERM, «Cancelar» + «Ejecutar» pondría
    // dos procesos escribiendo en el mismo var/<test>/.
    expect(resolved).toBe(false)
    expect(child.killed).toContain('SIGTERM')
    child.finish(null)
    await pending
    await expect(call(IPC.runStart, DIR, {}, idB)).resolves.toEqual({ runId: idB })
  })

  it('al salir de la aplicación mata todo lo que quede vivo', async () => {
    await call(IPC.runStart, DIR, {}, idA)
    const child = runtime.spawned[0]
    expect(hasActiveRuns()).toBe(true)
    stopActiveRuns()
    // SIGTERM y SIGKILL sin esperar: en 'before-quit' la app puede morir antes
    // de que venza la escalada de 3 s y dejaría el grupo huérfano.
    expect(child.killed).toEqual(['SIGTERM', 'SIGKILL'])
    expect(hasActiveRuns()).toBe(false)
  })
})
