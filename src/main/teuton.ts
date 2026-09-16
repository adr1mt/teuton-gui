import { spawn, execFile } from 'node:child_process'
import type { ExecFileOptionsWithStringEncoding } from 'node:child_process'
import { promisify } from 'node:util'
import { join, delimiter, isAbsolute } from 'node:path'
import { readdirSync, existsSync, constants } from 'node:fs'
import { access } from 'node:fs/promises'
import type { TeutonPathSource, TeutonStatus } from '../shared/types'
import { getTeutonPath } from './store'
import { readOutputLocation } from './results'

const execFileAsync = promisify(execFile)

/**
 * Descubre los directorios de binarios de gemas de Ruby instaladas por usuario
 * (p.ej. ~/.local/share/gem/ruby/3.2.0/bin), que rara vez están en el PATH de
 * una app de escritorio. Esto hace que la detección de `teuton` sea robusta.
 */
function gemBinDirs(): string[] {
  const home = process.env.HOME || ''
  if (!home) return []
  const roots = [join(home, '.local/share/gem/ruby'), join(home, '.gem/ruby')]
  const dirs: string[] = []
  for (const root of roots) {
    try {
      if (!existsSync(root)) continue
      for (const version of readdirSync(root)) {
        const bin = join(root, version, 'bin')
        if (existsSync(bin)) dirs.push(bin)
      }
    } catch {
      // ignora rutas inaccesibles
    }
  }
  return dirs
}

/**
 * Las apps de escritorio suelen arrancar con un PATH mínimo que no incluye los
 * directorios de binarios de gemas de Ruby. Añadimos los directorios conocidos
 * sin arrancar un shell interactivo (que ejecutaría la configuración del usuario).
 */
let cachedEnv: NodeJS.ProcessEnv | null = null
let cachedTeutonPath: string | null | undefined

/**
 * Diagnóstico de la última resolución: de dónde salió (o intentó salir)
 * `cachedTeutonPath`. Se expone en `TeutonStatus` para que Ajustes pueda
 * explicar, por ejemplo, que una ruta manual configurada no es válida (en vez
 * de mostrar simplemente "no encontrado", que el profesor achacaría a la
 * autodetección y no a lo que acaba de escribir).
 */
interface ResolveDiagnostics {
  source: TeutonPathSource | null
  manualPathError?: string
}

let lastDiagnostics: ResolveDiagnostics = { source: null }

export async function teutonEnv(): Promise<NodeJS.ProcessEnv> {
  if (cachedEnv) return cachedEnv
  const extra = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/bin`,
    ...gemBinDirs()
  ]
  const merged = [process.env.PATH || '', ...extra].filter(Boolean).join(delimiter)
  cachedEnv = { ...process.env, PATH: merged }
  return cachedEnv
}

async function findExecutable(name: string, pathValue: string): Promise<string | null> {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Continúa buscando en el resto del PATH.
    }
  }
  return null
}

/** Comprueba que `path` es una ruta absoluta a un fichero ejecutable. */
async function isExecutableFile(path: string): Promise<boolean> {
  if (!isAbsolute(path)) return false
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Devuelve la ruta absoluta al ejecutable `teuton`, o null si no se encuentra.
 *
 * Orden de resolución:
 * 1. Ruta configurada a mano en Ajustes (prioridad absoluta: si está puesta y
 *    NO es válida, no se cae en silencio a los pasos siguientes — eso
 *    confundiría al profesor que acaba de escribirla, haciéndole pensar que
 *    el problema es la autodetección).
 * 2. Búsqueda directa en el PATH construido a mano (rápida, sin shell).
 * 3. Último recurso: shell de login no interactivo (ver comentario más abajo).
 */
export async function resolveTeuton(): Promise<string | null> {
  if (cachedTeutonPath !== undefined) return cachedTeutonPath ?? null

  const manualPath = await getTeutonPath()
  if (manualPath) {
    if (await isExecutableFile(manualPath)) {
      lastDiagnostics = { source: 'manual' }
      cachedTeutonPath = manualPath
      return cachedTeutonPath
    }
    lastDiagnostics = {
      source: 'manual',
      manualPathError: `La ruta configurada («${manualPath}») no existe o no es ejecutable.`
    }
    cachedTeutonPath = null
    return null
  }

  const env = await teutonEnv()
  const direct = await findExecutable('teuton', env.PATH || '')
  if (direct) {
    lastDiagnostics = { source: 'auto' }
    cachedTeutonPath = direct
    return cachedTeutonPath
  }

  const fallback = await resolveViaLoginShell()
  if (fallback) {
    lastDiagnostics = { source: 'auto' }
    cachedTeutonPath = fallback
    return cachedTeutonPath
  }

  lastDiagnostics = { source: null }
  cachedTeutonPath = null
  return null
}

/**
 * Último recurso cuando la búsqueda directa en el PATH construido a mano falla.
 * Quien instala Ruby con rbenv, rvm, asdf o snap suele acabar con `teuton` en
 * una ruta que solo se activa al cargar el perfil de login (shims, `PATH`
 * reescrito por el gestor de versiones, etc.), no en ninguno de los
 * directorios fijos que ya probamos.
 *
 * Usamos `bash -lc` (login, NO interactivo) y a propósito NO `-lic` (login E
 * interactivo): un shell de LOGIN carga el perfil (`.bash_profile`, `.profile`,
 * y desde ahí rbenv/rvm/asdf inicializan sus shims), que es justo lo que
 * necesitamos; añadir `-i` cargaría además la configuración INTERACTIVA del
 * usuario (`.bashrc` con alias, prompts, plugins de oh-my-zsh, etc.), que
 * puede colgarse esperando un TTY o ensuciar stdout con motd/banners — y es
 * innecesaria para simplemente resolver un PATH.
 *
 * El resultado de un shell ajeno nunca se acepta a ciegas: se exige que sea
 * una ruta absoluta y que apunte a un fichero ejecutable antes de usarla.
 */
async function resolveViaLoginShell(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/bin/bash', ['-lc', 'command -v teuton'], {
      timeout: 5000
    })
    const candidate = stdout.trim().split('\n')[0]?.trim()
    if (candidate && (await isExecutableFile(candidate))) {
      return candidate
    }
  } catch {
    // Sin bash disponible, timeout, o `teuton` tampoco está en el PATH de
    // login: no hay nada más que probar.
  }
  return null
}

/** Reinicia las cachés (útil si el usuario instala teuton, o cambia la ruta manual, mientras la app corre). */
export function resetTeutonCache(): void {
  cachedEnv = null
  cachedTeutonPath = undefined
  lastDiagnostics = { source: null }
}

/**
 * ¿La ruta que el profesor ha escrito en Ajustes se comporta como Teutón?
 *
 * La ruta manual tiene prioridad absoluta y se usa luego para TODO (`check`,
 * `run`, `export`) con el directorio del proyecto como cwd, así que conviene
 * comprobarla antes de dejarla fijada en lugar de descubrir en medio de un
 * examen que apunta a otro programa.
 */
export async function looksLikeTeuton(path: string): Promise<boolean> {
  try {
    const env = await teutonEnv()
    const { stdout } = await execFileAsync(path, ['version'], { env, timeout: 8000 })
    return /version\s+[\d.]+/i.test(stdout)
  } catch {
    return false
  }
}

export async function detectTeuton(): Promise<TeutonStatus> {
  resetTeutonCache()
  const path = await resolveTeuton()
  const { source, manualPathError } = lastDiagnostics
  if (!path) {
    return { installed: false, version: null, path: null, source, manualPathError }
  }
  try {
    const env = await teutonEnv()
    const { stdout } = await execFileAsync(path, ['version'], { env, timeout: 8000 })
    const match = stdout.match(/version\s+([\d.]+)/i)
    return { installed: true, version: match ? match[1] : stdout.trim(), path, source }
  } catch (err) {
    return {
      installed: false,
      version: null,
      path,
      source,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export interface CliResult {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Ejecuta un subcomando de teuton y espera a que termine (para comandos cortos).
 *
 * `onChild` permite a quien llama registrar el hijo para poder matarlo al salir
 * de la app: el `timeout` de `execFile` solo alcanza al proceso lanzador, así que
 * sin grupo propio y sin registro los `ruby`/`ssh` nietos quedan huérfanos.
 */
export async function runTeutonSync(
  args: string[],
  cwd: string,
  timeout = 60000,
  onChild?: (child: ReturnType<typeof execFile>) => void
): Promise<CliResult> {
  const path = await resolveTeuton()
  if (!path) {
    throw new Error('teuton no está instalado o no se encuentra en el PATH.')
  }
  const env = await teutonEnv()
  return new Promise((resolve) => {
    // `detached` no está en los tipos de execFile pero sí se pasa a spawn: hace
    // falta para que el grupo de procesos sea propio y cancelar alcance a los
    // `ruby`/`ssh` nietos, no solo al lanzador.
    const options = {
      cwd,
      env,
      timeout,
      maxBuffer: 1024 * 1024 * 32,
      encoding: 'utf8',
      detached: process.platform !== 'win32'
    } as ExecFileOptionsWithStringEncoding
    const child = execFile(
      path,
      args,
      options,
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : err ? 1 : 0
        // `err.code` no numérico ('ETIMEDOUT', 'ENOENT', maxBuffer excedido) se
        // colapsaba a 1 sin más: al menos deja el motivo en stderr.
        const reason = err && typeof (err as { code?: unknown }).code === 'string' ? `[${(err as { code: string }).code}] ${err.message}` : ''
        resolve({
          stdout: stdout ?? '',
          stderr: [stderr ?? '', reason].filter(Boolean).join('\n'),
          code
        })
      }
    )
    onChild?.(child)
  })
}

export interface SpawnedRun {
  child: ReturnType<typeof spawn>
  testName: string
  /** `tt_outdir` del config, relativo al proyecto, o null. */
  outDir: string | null
}

/**
 * Lanza `teuton run` con streaming. Se ejecuta con cwd = directorio del proyecto
 * y ruta "." (modo directorio). La salida va a var/<basename(dir)>/ salvo que
 * el config fije `tt_testname` o `tt_outdir`: se leen ANTES de lanzar, que es
 * el config con el que Teutón va a ejecutar.
 */
export async function spawnRun(
  dir: string,
  options: { cases?: number[]; cname?: string }
): Promise<SpawnedRun> {
  const path = await resolveTeuton()
  if (!path) {
    throw new Error('teuton no está instalado o no se encuentra en el PATH.')
  }
  const env = await teutonEnv()
  const { testName, outDir } = await readOutputLocation(dir, options.cname)
  const args = ['run', '--export=json']
  if (options.cname) args.push(`--cname=${options.cname}`)
  if (options.cases && options.cases.length > 0) {
    args.push(`--case=${options.cases.join(',')}`)
  }
  args.push('.')
  // Un grupo separado permite cancelar también los procesos hijos de Teutón
  // (p. ej. Ruby/SSH), no únicamente el proceso lanzador.
  const child = spawn(path, args, { cwd: dir, env, detached: process.platform !== 'win32' })
  return { child, testName, outDir }
}
