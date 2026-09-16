import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

// Playwright carga estos ficheros como ESM: no hay __dirname. La raíz del repo
// es el cwd desde el que se lanza `npm run test:e2e`.
const REPO = resolve(process.cwd())
export const FAKE_TEUTON = join(REPO, 'scripts/fake-teuton.mjs')

export interface Session {
  app: ElectronApplication
  page: Page
  /** Proyecto de pruebas en un directorio temporal. */
  projectDir: string
  /** Nombre con el que aparece en la lista de recientes. */
  projectName: string
  /** userData propio: la UAT nunca toca las clases ni los ajustes reales. */
  userData: string
  /** Cierra la app dejando los directorios (para inspeccionar lo que quedó). */
  quit(): Promise<void>
  /** Mata la app sin hablar con ella y limpia. Para cuando el proceso main está
   *  bloqueado en un diálogo nativo y cualquier `evaluate` se quedaría colgado. */
  kill(): Promise<void>
  close(): Promise<void>
}

export interface LaunchOptions {
  /** Modo del teuton falso (ok, hang, crash, truncate, noresume, huge, slow…). */
  mode?: string
  /** Alumnos del config.yaml. */
  students?: { name: string; moodleId?: string }[]
  /** Sustituye el config.yaml entero (para YAML deliberadamente roto). */
  rawConfig?: string
  /** Contenido inicial de `.teuton-gui-meta.json` (clase activa). */
  meta?: Record<string, unknown>
}

function configYaml(students: { name: string; moodleId?: string }[]): string {
  const cases = students
    .map((s) => `- tt_members: ${JSON.stringify(s.name)}\n  tt_moodle_id: ${JSON.stringify(s.moodleId ?? `${s.name}@ejemplo.net`)}`)
    .join('\n')
  return `---\nglobal:\n  host1_username: usuario\ncases:\n${cases}\n`
}

const DEFAULT_STUDENTS = [
  { name: 'Ana Ferrer' },
  { name: 'Marc Oliva' },
  { name: 'Laia Puig' },
  { name: 'Hugo Ramos' }
]

/**
 * Arranca la app real (el build de `out/`) con su propio userData, un proyecto
 * temporal ya en la lista de recientes y el teuton falso como binario.
 *
 * Se pre-siembra `teuton-path.json` porque la ruta manual tiene prioridad
 * absoluta en `resolveTeuton()`, así que no hace falta pasar por Ajustes.
 */
export async function launchApp(options: LaunchOptions = {}): Promise<Session> {
  const stamp = randomUUID().slice(0, 8)
  const userData = join(tmpdir(), `teuton-uat-user-${stamp}`)
  const projectDir = join(tmpdir(), `teuton-uat-proyecto-${stamp}`)
  await fs.mkdir(userData, { recursive: true })
  await fs.mkdir(projectDir, { recursive: true })

  await fs.writeFile(
    join(projectDir, 'config.yaml'),
    options.rawConfig ?? configYaml(options.students ?? DEFAULT_STUDENTS)
  )
  await fs.writeFile(
    join(projectDir, 'start.rb'),
    'group "Comprobaciones simuladas" do\n  target "Comprobación 1"\n  run "echo ok"\n  expect "ok"\nend\n\nplay do\n  show\n  export\nend\n'
  )

  if (options.meta) {
    await fs.writeFile(join(projectDir, '.teuton-gui-meta.json'), JSON.stringify(options.meta))
  }

  await fs.writeFile(join(userData, 'teuton-path.json'), JSON.stringify({ path: FAKE_TEUTON }))
  await fs.writeFile(
    join(userData, 'recent-projects.json'),
    // El nombre tiene que ser el del directorio: al abrirlo, `pushRecent` lo
    // reescribe con `basename(dir)` y un nombre inventado desaparecería de la lista.
    JSON.stringify([{ dir: projectDir, name: basename(projectDir), lastOpened: Date.now() }])
  )

  const app = await electron.launch({
    args: [join(REPO, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${userData}`],
    env: {
      ...process.env,
      FAKE_TEUTON_MODE: options.mode ?? 'ok',
      FAKE_TEUTON_PIDDIR: join(userData, 'pids'),
      FAKE_TEUTON_MODEFILE: join(userData, 'fake-mode')
    } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForSelector('main >> text=Proyectos recientes', { timeout: 20_000 })

  const session: Session = {
    app,
    page,
    projectDir,
    projectName: basename(projectDir),
    userData,
    async quit() {
      // Salida limpia por el camino real ('before-quit' → stopActiveRuns), no un
      // `exit()` que se saltaría justo lo que hay que comprobar.
      await app.evaluate(({ app: electronApp }) => {
        electronApp.quit()
      }).catch(() => undefined)
      await app.close().catch(() => undefined)
    },
    async kill() {
      // Puede haber terminado ya por su cuenta: matarlo entonces lanza ESRCH.
      try {
        app.process().kill('SIGKILL')
      } catch {
        /* ya no existe */
      }
      // SIGKILL al proceso principal NO se lleva a sus hijos (gpu, red,
      // renderer): quedan huérfanos, y como heredaron la tubería por la que
      // habla Playwright, esta nunca se cierra y el worker se queda los 90 s de
      // su límite al acabar la suite. Cada pasada dejaba además tres Electron
      // vivos consumiendo ~300 MB. Se reconocen por el `--user-data-dir` de
      // esta sesión, que es único; `pgrep -f` no vale (ver `livePids`).
      await killByUserData(userData)
      // Y el `teuton` que estuviera corriendo: es hijo del main, así que un
      // SIGKILL al padre lo deja vivo con la tubería de Playwright en la mano.
      // Sus pids están en los ficheros que el teuton falso deja en el userData.
      for (const pid of await livePids(session)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          /* ya no existe */
        }
      }
      // Hay que iniciar el cierre para que Playwright suelte la conexión (si no,
      // el worker tarda 90 s en terminar al final de la suite), pero sin
      // esperarlo: si el proceso main estaba bloqueado en un diálogo nativo,
      // `close()` no vuelve nunca.
      await Promise.race([
        app.close().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ])
      await fs.rm(userData, { recursive: true, force: true })
      await fs.rm(projectDir, { recursive: true, force: true })
    },
    async close() {
      await session.quit()
      await fs.rm(userData, { recursive: true, force: true })
      await fs.rm(projectDir, { recursive: true, force: true })
    }
  }
  return session
}

/**
 * Mata cuanto quede vivo de una sesión, hijos incluidos. Los identifica por el
 * `--user-data-dir` temporal que solo usa esa sesión, leyendo `/proc`.
 */
async function killByUserData(userData: string): Promise<void> {
  const entries = await fs.readdir('/proc').catch(() => [] as string[])
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    const cmdline = await fs.readFile(join('/proc', entry, 'cmdline'), 'utf8').catch(() => '')
    if (!cmdline.includes(userData)) continue
    try {
      process.kill(Number(entry), 'SIGKILL')
    } catch {
      /* ya no existe */
    }
  }
}

/** Abre el proyecto de pruebas desde la lista de recientes. */
export async function openProject(session: Session): Promise<void> {
  // Acotado a `main` y a un botón: el nombre del proyecto también aparece en la
  // barra lateral cuando ya hay uno abierto, y allí no es pulsable.
  await session.page.click(`main button:has-text("${session.projectName}")`)
  await session.page.waitForSelector('text=Test (start.rb)', { timeout: 10_000 })
}

/** Cambia el modo del teuton falso para las pasadas siguientes. */
export async function setFakeMode(session: Session, mode: string): Promise<void> {
  await fs.writeFile(join(session.userData, 'fake-mode'), mode)
}

/** Vuelve a Inicio y reabre el proyecto: recarga sus metadatos (clase activa). */
export async function reopenProject(session: Session): Promise<void> {
  await goTo(session, 'Inicio')
  await openProject(session)
}

/** Abre la pestaña de configuración en modo tabla (la lista de alumnos). */
export async function openConfigTable(session: Session): Promise<void> {
  await session.page.click('text=Configuración (config.yaml)')
  await session.page.waitForSelector('text=Tabla', { timeout: 10_000 })
}

/** El indicador «Ejecutando…» de la cabecera (aparece también en la consola). */
export function runningBadge(session: Session) {
  return session.page.locator('header').getByText('Ejecutando…')
}

/** Va a una vista de la barra lateral por su nombre. */
export async function goTo(session: Session, label: string): Promise<void> {
  await session.page.click(`nav button:has-text("${label}")`)
}

/**
 * Procesos del teuton falso que siguen vivos. Se leen de los ficheros de PID que
 * él mismo deja en el userData de la sesión y se comprueba cada uno con la señal
 * 0: `pgrep -f` no sirve porque el patrón también coincide con quien busca.
 */
export async function livePids(session: Session): Promise<number[]> {
  const dir = join(session.userData, 'pids')
  const names = await fs.readdir(dir).catch(() => [])
  const pids = names
    .map((name) => Number.parseInt(name.replace(/\D/g, ''), 10))
    .filter((pid) => Number.isInteger(pid))
  return stillAlive(pids)
}

/** De una lista de pids, los que siguen existiendo. */
export function stillAlive(pids: number[]): number[] {
  return pids.filter((pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  })
}
