import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProjectFiles, RecentProject } from '../shared/types'
import { runTeutonSync } from './teuton'

const RECENTS_FILE = () => join(app.getPath('userData'), 'recent-projects.json')
const MAX_RECENTS = 12

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Escribe y renombra en el mismo directorio para no dejar ficheros a medias.
 *
 * `rename()` sustituye el inodo del destino, así que el modo del fichero temporal
 * es el que queda para siempre — si aquí se forzara siempre 0600, cualquier
 * fichero reescrito (aunque fuera público o de grupo) perdería sus permisos
 * originales en cada guardado.
 *
 * - `sensitive: true` (recientes de proyectos, internos de la app en userData):
 *   no forman parte del proyecto del profesor, así que se fuerzan a 0600 sin
 *   mirar nada más — es lo correcto para un fichero que nadie más debe leer.
 * - `sensitive` ausente/false (start.rb, config.yaml del proyecto): estos
 *   ficheros se versionan en git y se comparten con alumnos, así que deben
 *   conservar el modo que ya tuvieran en disco. Si el fichero es nuevo (no
 *   existía todavía) no hay modo que preservar y se le da 0644, el modo normal
 *   de un fichero de texto de proyecto y el que deja el propio `teuton new`.
 */
async function writeAtomic(
  path: string,
  content: string,
  options: { sensitive?: boolean } = {}
): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    // El temporal nace en 0600 y solo después se abre al modo que toque: así no
    // existe ni un instante en que su contenido sea legible por otros usuarios.
    await fs.writeFile(temp, content, { encoding: 'utf-8', mode: 0o600 })
    if (!options.sensitive) {
      try {
        const stat = await fs.stat(path)
        await fs.chmod(temp, stat.mode & 0o777)
      } catch (err) {
        // ENOENT === fichero nuevo, no es un error: no hay modo previo que
        // preservar, así que se le da el modo habitual de un fichero de texto
        // de proyecto (el mismo que deja `teuton new`), no el 0600 del temporal.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
        await fs.chmod(temp, 0o644)
      }
    }
    await fs.rename(temp, path)
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined)
    throw error
  }
}

/** Localiza el fichero de config del proyecto (config.yaml o <cname>.yaml/.json). */
async function findConfigFile(dir: string, cname?: string): Promise<string> {
  const base = cname || 'config'
  for (const ext of ['yaml', 'yml', 'json']) {
    const candidate = `${base}.${ext}`
    if (await fileExists(join(dir, candidate))) return candidate
  }
  return `${base}.yaml`
}

export async function openProject(dir: string, cname?: string): Promise<ProjectFiles> {
  const scriptFile = 'start.rb'
  const scriptPath = join(dir, scriptFile)
  if (!(await fileExists(scriptPath))) {
    throw new Error(`No se encontró start.rb en «${dir}». ¿Es un proyecto de Teutón?`)
  }
  const configFile = await findConfigFile(dir, cname)
  const configPath = join(dir, configFile)

  const script = await fs.readFile(scriptPath, 'utf-8')
  const config = (await fileExists(configPath)) ? await fs.readFile(configPath, 'utf-8') : ''

  await pushRecent(dir)

  return {
    dir,
    cname: cname || 'config',
    script,
    config,
    scriptFile,
    configFile
  }
}

export async function saveProject(
  files: Pick<ProjectFiles, 'dir' | 'scriptFile' | 'configFile' | 'script' | 'config'>
): Promise<void> {
  await writeAtomic(join(files.dir, files.scriptFile), files.script)
  await writeAtomic(join(files.dir, files.configFile), files.config)
}

export async function createProject(dir: string): Promise<ProjectFiles> {
  await fs.mkdir(dir, { recursive: true })
  // `teuton new` crea el esqueleto (start.rb + config.yaml). Se ejecuta desde el
  // directorio padre pasándole el basename para respetar el nombre del proyecto.
  const parent = join(dir, '..')
  const name = basename(dir)
  await runTeutonSync(['new', name], parent, 20000).catch(() => null)
  if (!(await fileExists(join(dir, 'start.rb')))) {
    // Fallback: si teuton no está disponible o falló, crea un esqueleto mínimo.
    await writeAtomic(join(dir, 'start.rb'), SKELETON_SCRIPT)
    await writeAtomic(join(dir, 'config.yaml'), SKELETON_CONFIG)
  }
  return openProject(dir)
}

const SKELETON_SCRIPT = `group "Nuevo grupo" do
  target "Descripción del objetivo"
  run "comando a ejecutar", on: :host1
  expect "texto esperado"
end

play do
  show
  export
end
`

const SKELETON_CONFIG = `---
global:
  host1_username: root
cases:
- tt_members: alumno_1
  host1_ip: 127.0.0.1
  host1_password: secret
`

// ---- Proyectos recientes ----

export async function getRecents(): Promise<RecentProject[]> {
  try {
    const data = await fs.readFile(RECENTS_FILE(), 'utf-8')
    const parsed = JSON.parse(data) as RecentProject[]
    // Filtra los que ya no existen en disco.
    const alive: RecentProject[] = []
    for (const r of parsed) {
      if (await fileExists(join(r.dir, 'start.rb'))) alive.push(r)
    }
    return alive.sort((a, b) => b.lastOpened - a.lastOpened)
  } catch {
    return []
  }
}

async function writeRecents(list: RecentProject[]): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  // Fichero interno de la app (no del proyecto del profesor): siempre 0600.
  await writeAtomic(RECENTS_FILE(), JSON.stringify(list, null, 2), { sensitive: true })
}

export async function pushRecent(dir: string): Promise<RecentProject[]> {
  const list = await getRecents()
  const filtered = list.filter((r) => r.dir !== dir)
  filtered.unshift({ dir, name: basename(dir), lastOpened: Date.now() })
  const trimmed = filtered.slice(0, MAX_RECENTS)
  await writeRecents(trimmed)
  return trimmed
}

export async function removeRecent(dir: string): Promise<RecentProject[]> {
  const list = await getRecents()
  const filtered = list.filter((r) => r.dir !== dir)
  await writeRecents(filtered)
  return filtered
}
