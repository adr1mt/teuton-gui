import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp, openProject, reopenProject, runningBadge, setFakeMode, type Session } from './harness'

const GRUPO_A = { activeClass: 'Grupo A', activeClassId: 'aaaaaaaa-0000-4000-8000-000000000001' }
const GRUPO_B = { activeClass: 'Grupo B', activeClassId: 'bbbbbbbb-0000-4000-8000-000000000002' }

async function runOnce(session: Session, className: string): Promise<void> {
  await goTo(session, 'Ejecutar')
  await session.page.waitForSelector('button:has-text("Ejecutar test")')
  // La clase activa se carga del meta de forma asíncrona: sin esperarla, la
  // pasada se atribuiría a «sin clase».
  await expect(session.page.locator('main').getByText(className, { exact: true })).toBeVisible()
  await session.page.click('button:has-text("Ejecutar test")')
  await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })
}

/**
 * Teutón nunca borra var/. Una pasada que muere, que no llega a escribir o que
 * deja casos nuevos con el resumen viejo deja en disco los informes de la
 * pasada ANTERIOR, que pueden ser de otro grupo. Esos informes no pueden
 * entrar en el historial ni en el CSV del grupo que se está corrigiendo ahora.
 */
for (const mode of ['crash', 'noreports', 'syntaxerror', 'staleresume']) {
  test(`una pasada ${mode} tras otro grupo no toca el historial ni el CSV del nuevo`, async () => {
    const session = await launchApp({ meta: GRUPO_A })
    const recordsFile = join(session.projectDir, '.teuton-gui-records.json')
    const informes = join(session.projectDir, 'informes')
    try {
      await openProject(session)
      await runOnce(session, GRUPO_A.activeClass)
      await expect.poll(() => fs.readFile(recordsFile, 'utf-8').catch(() => ''), { timeout: 15_000 })
        .toContain(GRUPO_A.activeClassId)
      await expect.poll(() => fs.readdir(informes).catch(() => []), { timeout: 15_000 })
        .toEqual([expect.stringContaining('aaaaaaaa')])

      // El profesor pasa al grupo B (mismos nombres) y la pasada no produce nada nuevo.
      await fs.writeFile(join(session.projectDir, '.teuton-gui-meta.json'), JSON.stringify(GRUPO_B))
      await setFakeMode(session, mode)
      await reopenProject(session)
      await runOnce(session, GRUPO_B.activeClass)

      await expect(session.page.getByText('no ha producido informes nuevos').first()).toBeVisible({ timeout: 15_000 })
      const records = JSON.parse(await fs.readFile(recordsFile, 'utf-8'))
      expect(Object.keys(records.classes ?? {}).join()).not.toContain(GRUPO_B.activeClassId)
      expect((await fs.readdir(informes)).join()).not.toContain('bbbbbbbb')
      const meta = JSON.parse(await fs.readFile(join(session.projectDir, '.teuton-gui-meta.json'), 'utf-8'))
      expect(meta.lastRunClassId).not.toBe(GRUPO_B.activeClassId)
    } finally {
      await session.close()
    }
  })
}

/**
 * Vaciar la tabla y ejecutar deja un resume.json nuevo con `cases: []` y los
 * case-NN.json del grupo anterior (Teutón 2.10.6). «Recargar resultados» los
 * volcaba como alumnos del grupo actual en su historial.
 */
test('un resumen sin alumnos no resucita a los del grupo anterior (S-03)', async () => {
  const session = await launchApp({ meta: GRUPO_A })
  const recordsFile = join(session.projectDir, '.teuton-gui-records.json')
  try {
    await openProject(session)
    await runOnce(session, GRUPO_A.activeClass)
    await expect.poll(() => fs.readFile(recordsFile, 'utf-8').catch(() => ''), { timeout: 15_000 })
      .toContain(GRUPO_A.activeClassId)

    await fs.writeFile(join(session.projectDir, '.teuton-gui-meta.json'), JSON.stringify(GRUPO_B))
    await setFakeMode(session, 'emptyresume')
    await reopenProject(session)
    await runOnce(session, GRUPO_B.activeClass)
    await goTo(session, 'Resultados')
    // Vista vacía (la pasada no tiene alumnos) o con resultados: los dos botones recargan.
    await session.page.locator('main button:has-text("Cargar últimos resultados"), main button[aria-label="Recargar resultados"]').first().click()
    await session.page.waitForTimeout(1500)

    const records = JSON.parse(await fs.readFile(recordsFile, 'utf-8'))
    expect(Object.keys(records.classes?.[`class:${GRUPO_B.activeClassId}`] ?? {})).toEqual([])
    await expect(session.page.locator('main').getByText('Ana Ferrer')).toHaveCount(0)
  } finally {
    await session.close()
  }
})
