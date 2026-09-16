import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp } from './harness'

/**
 * Un equipo apagado falla todos los objetivos, igual que el alumno que no ha
 * hecho nada: en la matriz las dos columnas eran idénticas, todas en rojo. A
 * uno hay que ir a su sitio y al otro no, así que la pantalla tiene que
 * distinguirlos sola, sin abrir el detalle de nadie.
 */
test('la máquina apagada no se pinta como un examen mal hecho', async () => {
  const session = await launchApp({ mode: 'offline' })
  try {
    await session.page.click(`main button:has-text("${session.projectName}")`)
    await session.page.waitForSelector('text=Test (start.rb)', { timeout: 10_000 })
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')

    // Al terminar, la app salta sola a Resultados.
    await expect(session.page.getByText('Ana Ferrer').first()).toBeVisible({ timeout: 40_000 })

    await session.page.click('button:has-text("Matriz")')
    await expect(session.page.getByText('máquina no responde').first()).toBeVisible({
      timeout: 10_000
    })

    // Ana tiene la máquina caída (4 celdas) y Hugo, un 0 legítimo: los suyos
    // siguen siendo fallos rojos. Si las dos columnas se pintaran igual, no
    // habría ninguna celda de «fallado» en toda la tabla.
    const caidas = session.page.locator('td > span:has-text("máquina no responde")')
    await expect(caidas).toHaveCount(4)
    await expect(session.page.locator('td > span:has-text("fallado")').first()).toBeVisible()
  } finally {
    await session.close()
  }
})

/**
 * S-11. El 0 de una máquina que no responde no es una nota: no puede llegar
 * al CSV de Moodle como 0.00 ni pintarse en la lista como un suspenso.
 */
test('la máquina apagada no llega al CSV como un 0', async () => {
  const session = await launchApp({
    mode: 'offline',
    meta: { activeClass: 'Grupo A', activeClassId: 'aaaaaaaa-0000-4000-8000-000000000001' }
  })
  try {
    await session.page.click(`main button:has-text("${session.projectName}")`)
    await session.page.waitForSelector('text=Test (start.rb)', { timeout: 10_000 })
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')

    const informes = join(session.projectDir, 'informes')
    const csv = async () => {
      const file = (await fs.readdir(informes).catch(() => [])).find((f) => f.endsWith('.csv'))
      return file ? (await fs.readFile(join(informes, file), 'utf-8')).trim().split('\n') : []
    }
    // Cabecera + 3 alumnos evaluados; Ana (máquina apagada) queda fuera.
    await expect.poll(async () => (await csv()).length, { timeout: 40_000 }).toBe(4)
    expect((await csv()).some((line) => line.includes('Ana Ferrer'))).toBe(false)
    expect((await csv()).some((line) => line.includes('Hugo'))).toBe(true)

    await goTo(session, 'Resultados')
    await expect(session.page.locator('main')).toContainText('sin evaluar')
    await expect(session.page.locator('main')).toContainText('No saldrán en el CSV')
  } finally {
    await session.close()
  }
})
