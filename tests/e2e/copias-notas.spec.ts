import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp, openProject, runningBadge } from './harness'

/**
 * El historial de mejores notas vive dentro del proyecto, así que borrar la
 * carpeta del examen —o pulsar «Reiniciar historial» a destiempo— se llevaba las
 * notas sin vuelta atrás. Este escenario recorre el camino real del profesor:
 * corregir, perder las notas y recuperarlas desde la copia.
 */
test('reiniciar el historial por error no pierde las notas', async () => {
  const session = await launchApp()
  const recordsFile = join(session.projectDir, '.teuton-gui-records.json')
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })

    await goTo(session, 'Resultados')
    await expect(session.page.locator('text=Ana Ferrer').first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => fs.readFile(recordsFile, 'utf-8').catch(() => ''), { timeout: 15_000 })
      .toContain('Ana Ferrer')
    // La copia se guarda fuera del proyecto, que es lo que la salva.
    const copias = join(session.userData, 'copias-notas')
    await expect.poll(() => fs.readdir(copias).catch(() => []), { timeout: 15_000 }).not.toEqual([])

    // El profesor reinicia el historial creyendo que borra solo la pasada de prueba.
    await session.page.click('button[aria-label="Más acciones"]')
    await session.page.click('[role="menuitem"]:has-text("Reiniciar historial")')
    await session.page.click('button:has-text("Borrar historial")')
    await expect.poll(() => fs.readFile(recordsFile, 'utf-8'), { timeout: 15_000 })
      .not.toContain('Ana Ferrer')

    // Y las recupera desde la copia de la última hora.
    await session.page.click('button[aria-label="Más acciones"]')
    await session.page.click('[role="menuitem"]:has-text("Restaurar notas de una copia")')
    await session.page.click('button:has-text("Restaurar notas")')
    await expect(session.page.locator('text=Notas restauradas').first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => fs.readFile(recordsFile, 'utf-8'), { timeout: 15_000 })
      .toContain('Ana Ferrer')
  } finally {
    await session.close()
  }
})
