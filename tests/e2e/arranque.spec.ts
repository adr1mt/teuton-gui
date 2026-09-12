import { expect, test } from '@playwright/test'
import { launchApp, openConfigTable, openProject } from './harness'

test('arranca, detecta el binario y abre un proyecto reciente', async () => {
  const session = await launchApp()
  try {
    // El binario configurado a mano tiene prioridad y se anuncia en la barra.
    await expect(session.page.locator('text=Teutón detectado · 2.10.6')).toBeVisible({ timeout: 15_000 })
    await openProject(session)
    await openConfigTable(session)
    await expect(session.page.locator('input[value="Ana Ferrer"]')).toBeVisible()
  } finally {
    await session.close()
  }
})
