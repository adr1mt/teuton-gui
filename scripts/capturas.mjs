/**
 * Capturas para el README. No forma parte de la app.
 *
 *   npm run build && node scripts/capturas.mjs
 *
 * Arranca la app real con un userData temporal, el `teuton` falso de la UAT y
 * una clase inventada, ejecuta una pasada y guarda las pantallas en `docs/img/`.
 * Los alumnos son inventados a propósito: en el README no puede salir ni un
 * nombre ni una IP de nadie.
 */
import { _electron as electron } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = resolve(process.cwd())
const OUT = join(REPO, 'docs/img')
const FAKE = join(REPO, 'scripts/fake-teuton.mjs')

// El orden importa: las notas del teuton falso son [100, 75, 50, 100, 25, 0]
// por posición, así que esta lista deja una matriz con de todo.
const ALUMNAT = [
  'Ana Ferrer',
  'Marc Oliva',
  'Laia Puig',
  'Hugo Ramos',
  'Nil Casals',
  'Júlia Soler',
  'Pau Vidal',
  'Iris Bonet'
]

const configYaml = `---
global:
  host1_username: usuario
  host1_password: usuario
cases:
${ALUMNAT.map((n, i) => `- tt_members: ${JSON.stringify(n)}\n  tt_moodle_id: "${101 + i}"\n  host1_ip: 192.168.1.${10 + i}`).join('\n')}
`

const startRb = `group "Servidor web" do
  target "El servicio apache2 está activo"
  run "systemctl is-active apache2"
  expect "active"
end

play do
  show
  export
end
`

async function main() {
  const userData = join(tmpdir(), `teuton-capturas-${Date.now()}`)
  const projectDir = join(tmpdir(), 'examen-servidor-web')
  await fs.rm(projectDir, { recursive: true, force: true })
  await fs.mkdir(userData, { recursive: true })
  await fs.mkdir(projectDir, { recursive: true })
  await fs.mkdir(OUT, { recursive: true })

  await fs.writeFile(join(projectDir, 'config.yaml'), configYaml)
  await fs.writeFile(join(projectDir, 'start.rb'), startRb)
  await fs.writeFile(join(userData, 'teuton-path.json'), JSON.stringify({ path: FAKE }))
  await fs.writeFile(
    join(userData, 'recent-projects.json'),
    JSON.stringify([{ dir: projectDir, name: 'examen-servidor-web', lastOpened: Date.now() }])
  )

  const electronPath = createRequire(import.meta.url)('electron')
  const app = await electron.launch({
    executablePath: electronPath,
    args: [join(REPO, 'out/main/index.js'), '--no-sandbox', `--user-data-dir=${userData}`],
    env: { ...process.env, FAKE_TEUTON_MODE: 'ok', FAKE_TEUTON_PIDDIR: join(userData, 'pids') }
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForSelector('main >> text=Proyectos recientes', { timeout: 30_000 })

  // Se recorta a la altura del contenido: media pantalla vacía debajo de una
  // tabla de 8 alumnos se ve peor en el README que la tabla sola.
  const shot = async (name, height) => {
    await page.waitForTimeout(700)
    await page.screenshot({
      path: join(OUT, `${name}.png`),
      ...(height ? { clip: { x: 0, y: 0, width: 1280, height } } : {})
    })
    console.log('[capturas]', `${name}.png`)
  }

  await page.click('main button:has-text("examen-servidor-web")')
  await page.waitForSelector('text=Test (start.rb)', { timeout: 15_000 })

  await page.click('text=Configuración (config.yaml)')
  await page.waitForSelector('text=Tabla', { timeout: 10_000 })
  await shot('editor', 560)

  await page.click('nav button:has-text("Ejecutar")')
  await shot('ejecutar', 500)
  await page.click('button:has-text("Ejecutar test")')

  // Al terminar, la app salta sola a Resultados.
  await page.waitForSelector('text=Ana Ferrer', { timeout: 60_000 })
  await page.waitForTimeout(1500)
  await shot('resultados', 460)

  await page.click('button:has-text("Matriz")')
  await shot('matriz', 420)

  // Las analíticas no caben en 800 px: la ventana se agranda para que entren
  // las cuatro secciones enteras.
  await page.setViewportSize({ width: 1280, height: 1180 })
  await page.click('nav button:has-text("Analíticas")')
  await shot('analiticas')

  await app.evaluate(({ app: a }) => a.quit()).catch(() => undefined)
  await app.close().catch(() => undefined)
  await fs.rm(userData, { recursive: true, force: true })
  await fs.rm(projectDir, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
