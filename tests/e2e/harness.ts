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
  close(): Promise<void>
}

export interface LaunchOptions {
  /** Modo del teuton falso (ok, hang, crash, truncate, noresume, huge, slow…). */
  mode?: string
  /** Alumnos del config.yaml. */
  students?: { name: string; moodleId?: string }[]
  /** Sustituye el config.yaml entero (para YAML deliberadamente roto). */
  rawConfig?: string
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
      FAKE_TEUTON_PIDDIR: join(userData, 'pids')
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
    async close() {
      await session.quit()
      await fs.rm(userData, { recursive: true, force: true })
      await fs.rm(projectDir, { recursive: true, force: true })
    }
  }
  return session
}

/** Abre el proyecto de pruebas desde la lista de recientes. */
export async function openProject(session: Session): Promise<void> {
  // Acotado a `main` y a un botón: el nombre del proyecto también aparece en la
  // barra lateral cuando ya hay uno abierto, y allí no es pulsable.
  await session.page.click(`main button:has-text("${session.projectName}")`)
  await session.page.waitForSelector('text=Test (start.rb)', { timeout: 10_000 })
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
