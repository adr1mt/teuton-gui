import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp, openConfigTable, openProject, runningBadge } from './harness'

test('un YAML roto no permite vaciar la clase desde la tabla', async () => {
  const session = await launchApp({
    // Indentación imposible: js-yaml lanza y `parseConfig` devuelve vacío.
    rawConfig: '---\ncases:\n  - tt_members: ana\n   tt_moodle_id: mal indentado\n'
  })
  try {
    await openProject(session)
    await openConfigTable(session)

    await expect(session.page.locator('text=La tabla está bloqueada')).toBeVisible()
    // Con la tabla operativa, este clic escribía `cases: []` en disco y se
    // llevaba a los 30 alumnos por delante.
    const addStudent = session.page.locator('button:has-text("Añadir alumno")')
    if (await addStudent.count()) await addStudent.click({ force: true }).catch(() => undefined)

    const onDisk = await fs.readFile(join(session.projectDir, 'config.yaml'), 'utf-8')
    expect(onDisk).toContain('tt_members: ana')
    expect(onDisk).not.toContain('cases: []')
  } finally {
    await session.close()
  }
})

test('notas imposibles en resume.json no dejan Analíticas en blanco', async () => {
  const session = await launchApp({ mode: 'badgrades' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })

    // Notas negativas, infinitas y por encima de 100: antes, el tramo de la
    // distribución se salía del array y lanzaba durante el render.
    await goTo(session, 'Analíticas')
    await expect(session.page.locator('text=Esta vista no se pudo mostrar')).toHaveCount(0)
    await expect(session.page.locator('text=La aplicación no se pudo mostrar')).toHaveCount(0)
    await expect(session.page.locator('main')).toContainText('Distribución', { timeout: 15_000 })
  } finally {
    await session.close()
  }
})

test('un informe corrupto no hace desaparecer a ningún alumno', async () => {
  const session = await launchApp({ mode: 'truncate' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })

    // El case-01.json lleva JSON válido + la cola de otro proceso (lo que queda
    // cuando dos ejecuciones se solapan). Los cuatro alumnos siguen en la lista.
    await goTo(session, 'Resultados')
    for (const name of ['Ana Ferrer', 'Marc Oliva', 'Laia Puig', 'Hugo Ramos']) {
      await expect(session.page.locator(`text=${name}`).first()).toBeVisible({ timeout: 15_000 })
    }
    await expect(session.page.locator('main')).toContainText('informe')
  } finally {
    await session.close()
  }
})

test('nombres hostiles no rompen el CSV de Moodle', async () => {
  const session = await launchApp({
    students: [
      { name: '=1+1', moodleId: 'formula@ejemplo.net' },
      { name: 'Sanz, Ana "La Jefa"', moodleId: 'comillas@ejemplo.net' },
      { name: '  Ana Ferrer  ', moodleId: 'espacios@ejemplo.net' },
      { name: 'Müller Ñandú', moodleId: 'acentos@ejemplo.net' }
    ]
  })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })

    // El CSV automático se escribe al terminar el ciclo.
    const informes = join(session.projectDir, 'informes')
    await expect
      .poll(async () => (await fs.readdir(informes).catch(() => [])).length, { timeout: 20_000 })
      .toBeGreaterThan(0)
    const file = (await fs.readdir(informes)).find((f) => f.endsWith('.csv'))!
    const csv = await fs.readFile(join(informes, file), 'utf-8')

    // Una fila por alumno más la cabecera, y ninguna celda ejecutable.
    expect(csv.trim().split('\n')).toHaveLength(5)
    expect(csv).toContain('acentos@ejemplo.net')
    expect(csv).not.toMatch(/^=/m)
  } finally {
    await session.close()
  }
})
