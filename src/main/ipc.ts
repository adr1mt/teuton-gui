import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join, isAbsolute, resolve, basename } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { IPC } from '../shared/ipc'
import type { ExportFormat, RunEvent, RunOptions } from '../shared/types'
import { detectTeuton, resetTeutonCache, runTeutonSync, spawnRun } from './teuton'
import {
  createProject,
  getRecents,
  openProject,
  removeRecent,
  saveProject
} from './projects'
import { loadResults } from './results'
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
  getProjectMeta,
  setProjectMeta,
  writeClassCsv,
  getTeutonPath,
  setTeutonPath
} from './store'

const activeRuns = new Map<string, ChildProcess>()
const EXPORT_FORMATS = new Set<ExportFormat>(['txt', 'html', 'yaml', 'json', 'xml', 'markdown', 'colored_text'])

function projectDir(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error('La ruta del proyecto no es válida.')
  }
  return resolve(value)
}

function fileName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.length > 128 || basename(value) !== value || value.includes('\0')) {
    throw new Error(`${label} no es válido.`)
  }
  return value
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

/** Detiene los procesos de evaluación al salir de la aplicación. */
export function stopActiveRuns(): void {
  for (const child of activeRuns.values()) cancelProcess(child, { immediate: true })
  activeRuns.clear()
}

function broadcast(event: RunEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.runEvent, event)
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.detect, () => detectTeuton())

  ipcMain.handle(IPC.pickDirectory, async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.createProject, (_e, dir: unknown) => createProject(projectDir(dir)))

  ipcMain.handle(IPC.openProject, (_e, dir: unknown, configName?: unknown) =>
    openProject(projectDir(dir), cname(configName))
  )

  ipcMain.handle(IPC.saveProject, (_e, files: unknown) => {
    if (!files || typeof files !== 'object') throw new Error('Los ficheros del proyecto no son válidos.')
    const input = files as Record<string, unknown>
    if (typeof input.script !== 'string' || typeof input.config !== 'string') throw new Error('El contenido del proyecto no es válido.')
    return saveProject({
      dir: projectDir(input.dir),
      scriptFile: fileName(input.scriptFile, 'El fichero de script'),
      configFile: fileName(input.configFile, 'El fichero de configuración'),
      script: input.script,
      config: input.config
    })
  })

  ipcMain.handle(IPC.check, async (_e, dir: unknown, configName?: unknown) => {
    const safeDir = projectDir(dir)
    const safeCname = cname(configName)
    const args = ['check']
    if (safeCname) args.push(`--cname=${safeCname}`)
    args.push('.')
    const res = await runTeutonSync(args, safeDir, 30000)
    return {
      ok: res.code === 0,
      output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
      exitCode: res.code
    }
  })

  ipcMain.handle(IPC.runStart, async (_e, dir: unknown, options: unknown) => {
    const runId = randomUUID()
    const { child, testName } = await spawnRun(projectDir(dir), runOptions(options))
    activeRuns.set(runId, child)

    child.stdout?.on('data', (d: Buffer) =>
      broadcast({ runId, type: 'stdout', data: d.toString() })
    )
    child.stderr?.on('data', (d: Buffer) =>
      broadcast({ runId, type: 'stderr', data: d.toString() })
    )
    child.on('error', (err) => {
      activeRuns.delete(runId)
      broadcast({ runId, type: 'error', message: err.message })
    })
    child.on('close', (code) => {
      activeRuns.delete(runId)
      broadcast({ runId, type: 'exit', code, testName })
    })

    return { runId }
  })

  ipcMain.handle(IPC.runCancel, (_e, runId: string) => {
    const child = activeRuns.get(runId)
    if (child) {
      cancelProcess(child)
      activeRuns.delete(runId)
    }
  })

  ipcMain.handle(IPC.loadResults, (_e, dir: unknown, testName?: unknown) =>
    loadResults(projectDir(dir), testName === undefined ? undefined : fileName(testName, 'El nombre del test'))
  )

  ipcMain.handle(IPC.exportAs, async (_e, dir: unknown, format: unknown) => {
    if (!EXPORT_FORMATS.has(format as ExportFormat)) throw new Error('El formato de exportación no es válido.')
    const res = await runTeutonSync(['run', `--export=${format}`, '.'], projectDir(dir), 120000)
    return {
      ok: res.code === 0,
      output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
      exitCode: res.code
    }
  })

  ipcMain.handle(IPC.saveFileDialog, async (_e, defaultName: string, content: string) => {
    const res = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), defaultName)
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, content, 'utf-8')
    return res.filePath
  })

  ipcMain.handle(IPC.recentProjects, () => getRecents())
  ipcMain.handle(IPC.removeRecent, (_e, dir: string) => removeRecent(dir))
  ipcMain.handle(IPC.openPath, (_e, target: string) => shell.openPath(target))
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    // Lista blanca de esquemas: nunca abrir file: u otros esquemas peligrosos.
    if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) {
      return shell.openExternal(url)
    }
    return undefined
  })

  ipcMain.handle(IPC.getGrading, () => getGrading())
  ipcMain.handle(IPC.setGrading, (_e, grading) => setGrading(grading))

  ipcMain.handle(IPC.getTeutonPath, () => getTeutonPath())
  ipcMain.handle(IPC.setTeutonPath, async (_e, path: unknown) => {
    if (path !== null && typeof path !== 'string') {
      throw new Error('La ruta de teuton no es válida.')
    }
    await setTeutonPath(path)
    resetTeutonCache()
    return detectTeuton()
  })

  ipcMain.handle(IPC.getDefaultGlobals, () => getDefaultGlobals())
  ipcMain.handle(IPC.setDefaultGlobals, (_e, globals) => setDefaultGlobals(globals))

  ipcMain.handle(IPC.listClasses, () => listClasses())
  ipcMain.handle(IPC.saveClass, (_e, roster) => saveClass(roster))
  ipcMain.handle(IPC.deleteClass, (_e, id: string) => deleteClass(id))

  ipcMain.handle(IPC.getRecords, (_e, dir: string, classId?: string) => getRecords(dir, classId))
  ipcMain.handle(IPC.updateRecords, (_e, dir: string, grades, classId?: string) =>
    updateRecords(dir, grades, classId)
  )
  ipcMain.handle(IPC.resetRecords, (_e, dir: string, classId?: string) =>
    resetRecords(dir, classId)
  )

  ipcMain.handle(IPC.getProjectMeta, (_e, dir: string) => getProjectMeta(dir))
  ipcMain.handle(IPC.setProjectMeta, (_e, dir: string, meta) => setProjectMeta(dir, meta))
  ipcMain.handle(IPC.writeClassCsv, (_e, dir: string, className: string, classId: string | undefined, content: string) =>
    writeClassCsv(dir, className, classId, content)
  )
}
