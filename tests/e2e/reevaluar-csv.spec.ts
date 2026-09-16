import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp, openProject, runningBadge } from './harness'

async function classCsv(dir: string): Promise<string[]> {
  const informes = join(dir, 'informes')
  const file = (await fs.readdir(informes).catch(() => [])).find((f) => f.endsWith('.csv'))
  return file ? (await fs.readFile(join(informes, file), 'utf-8')).trim().split('\n') : []
}

/**
 * S-01 (G1). Con el formato real de `--case`, reevaluar a un alumno reescribía
 * el CSV de Moodle de la clase con UNA fila, y el panel contaba las filas
 * «-» como alumnos con un 0.
 */
test('reevaluar a un alumno mantiene el CSV completo y no pinta filas «-»', async () => {
  const session = await launchApp({
    meta: { activeClass: 'Grupo A', activeClassId: 'aaaaaaaa-0000-4000-8000-000000000001' }
  })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await expect(session.page.locator('main').getByText('Grupo A', { exact: true })).toBeVisible()
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })
    await expect.poll(async () => (await classCsv(session.projectDir)).length, { timeout: 15_000 }).toBe(5)
    const before = await classCsv(session.projectDir)

    await goTo(session, 'Resultados')
    await session.page.click('button[aria-label^="Reevaluar Marc Oliva"]')
    await expect(session.page.getByText('reevaluación parcial').first()).toBeVisible({ timeout: 20_000 })

    expect(await classCsv(session.projectDir)).toEqual(before)
    await goTo(session, 'Resultados')
    await expect(session.page.locator('main')).toContainText('1 alumno')
    await expect(session.page.locator('main')).not.toContainText('4 alumnos')
    await expect(session.page.locator('main button:has-text("Exportar")').first()).toHaveAttribute('aria-disabled', 'true')
  } finally {
    await session.close()
  }
})
