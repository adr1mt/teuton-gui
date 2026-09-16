import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { goTo, launchApp, openProject, runningBadge, setFakeMode, type Session } from './harness'

const GRUPO_A = { activeClass: 'Grupo A', activeClassId: 'aaaaaaaa-0000-4000-8000-000000000001' }

async function runOnce(session: Session): Promise<void> {
  await goTo(session, 'Ejecutar')
  // Tras la primera pasada el botón se llama «Volver a ejecutar».
  const run = session.page.locator('main button:has-text("Ejecutar test"), main button:has-text("Volver a ejecutar")').first()
  await expect(run).toBeVisible()
  await expect(session.page.locator('main').getByText(GRUPO_A.activeClass, { exact: true })).toBeVisible()
  await run.click()
  await expect(runningBadge(session)).toHaveCount(0, { timeout: 30_000 })
}

async function classCsv(dir: string): Promise<string> {
  const informes = join(dir, 'informes')
  const file = (await fs.readdir(informes).catch(() => [])).find((f) => f.endsWith('.csv'))
  return file ? fs.readFile(join(informes, file), 'utf-8') : ''
}

/** S-06 (G9): un meta que no se puede leer ni escribir desactivaba el historial. */
test('con los metadatos del proyecto bloqueados las notas se guardan igual', async () => {
  const session = await launchApp({ meta: GRUPO_A })
  const meta = join(session.projectDir, '.teuton-gui-meta.json')
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await expect(session.page.locator('main').getByText(GRUPO_A.activeClass, { exact: true })).toBeVisible()
    await fs.chmod(meta, 0o000)
    await runOnce(session)
    await expect.poll(() => fs.readFile(join(session.projectDir, '.teuton-gui-records.json'), 'utf-8').catch(() => ''), { timeout: 15_000 })
      .toContain('Ana Ferrer')
  } finally {
    await fs.chmod(meta, 0o600).catch(() => undefined)
    await session.close()
  }
})

/** S-05 (G8): con el historial ilegible, el CSV bueno se sustituía por la última pasada. */
test('con el historial ilegible el CSV de la clase no baja notas', async () => {
  const session = await launchApp({ meta: GRUPO_A })
  const records = join(session.projectDir, '.teuton-gui-records.json')
  try {
    await openProject(session)
    await runOnce(session)
    await expect.poll(() => classCsv(session.projectDir), { timeout: 15_000 }).toContain('Ana Ferrer')
    const before = await classCsv(session.projectDir)
    expect(before).toContain('Ana Ferrer@ejemplo.net,10.00')

    await fs.chmod(records, 0o000)
    await setFakeMode(session, 'offline') // Ana pasa a 0 en esta pasada
    await runOnce(session)
    await expect(session.page.getByText('CSV').first()).toBeVisible({ timeout: 15_000 })
    await session.page.waitForTimeout(1000)
    expect(await classCsv(session.projectDir)).toBe(before)
  } finally {
    await fs.chmod(records, 0o600).catch(() => undefined)
    await session.close()
  }
})
