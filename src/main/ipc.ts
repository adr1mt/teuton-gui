import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
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

const activeRuns = new Map<string, { child: ChildProcess; dir: string }>()
const EXPORT_FORMATS = new Set<ExportFormat>(['txt', 'html', 'yaml', 'json', 'xml', 'markdown', 'colored_text'])

function projectDir(value: unknown): string {
  return validatedPath(value, 'La ruta del proyecto')
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

function runIdentifier(value: unknown): string {
  const id = validatedText(value, 'El identificador de ejecución', 64)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('El identificador de ejecución no es válido.')
  }
  return id
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  if (app.isPackaged) return senderUrl.startsWith('file:') && senderUrl.endsWith('/renderer/index.html')
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
  for (const { child } of activeRuns.values()) cancelProcess(child, { immediate: true })
  activeRuns.clear()
}

function broadcast(event: RunEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.runEvent, event)
  }
}

export function registerIpc(): void {
  handle(IPC.detect, () => detectTeuton())

  handle(IPC.pickDirectory, async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
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
    const res = await runTeutonSync(args, safeDir, 30000)
    return {
      ok: res.code === 0,
      output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
      exitCode: res.code
    }
  })

  handle(IPC.runStart, async (_e, dir, options, requestedRunId) => {
    const safeDir = projectDir(dir)
    const runId = runIdentifier(requestedRunId)
    if ([...activeRuns.values()].some((run) => run.dir === safeDir && isAlive(run.child))) {
      throw new Error('Ya hay una evaluación activa para este proyecto.')
    }
    const { child, testName } = await spawnRun(safeDir, runOptions(options))
    activeRuns.set(runId, { child, dir: safeDir })

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

  handle(IPC.runCancel, (_e, value) => {
    const runId = runIdentifier(value)
    const active = activeRuns.get(runId)
    if (active) {
      cancelProcess(active.child)
      activeRuns.delete(runId)
    }
  })

  handle(IPC.loadResults, (_e, dir, testName) =>
    loadResults(projectDir(dir), testName === undefined ? undefined : fileName(testName, 'El nombre del test'))
  )

  handle(IPC.exportAs, async (_e, dir, format) => {
    if (!EXPORT_FORMATS.has(format as ExportFormat)) throw new Error('El formato de exportación no es válido.')
    const res = await runTeutonSync(['run', `--export=${format}`, '.'], projectDir(dir), 120000)
    return {
      ok: res.code === 0,
      output: [res.stdout, res.stderr].filter(Boolean).join('\n'),
      exitCode: res.code
    }
  })

  handle(IPC.saveFileDialog, async (_e, defaultName, content) => {
    const safeName = fileName(defaultName, 'El nombre del fichero')
    const safeContent = validatedText(content, 'El contenido del fichero', 20_000_000, true)
    const res = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), safeName)
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, safeContent, 'utf-8')
    return res.filePath
  })

  handle(IPC.recentProjects, () => getRecents())
  handle(IPC.removeRecent, (_e, dir) => removeRecent(projectDir(dir)))
  handle(IPC.openPath, (_e, target) => shell.openPath(validatedPath(target, 'La ruta')))
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
    await setTeutonPath(safePath)
    resetTeutonCache()
    return detectTeuton()
  })

  handle(IPC.getDefaultGlobals, () => getDefaultGlobals())
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
