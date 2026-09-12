import { expect, test } from '@playwright/test'
import { goTo, launchApp } from './harness'

/**
 * El panel se proyecta en la pared del aula. Dos cosas tienen que pasar al
 * encender el modo proyector: todo se lee desde el fondo de la clase, y ni la
 * IP ni la contraseña de la máquina de un alumno quedan a la vista de sus
 * compañeros. La orden que Teutón ejecuta por ssh las lleva las dos.
 */
test('el modo proyector agranda la pantalla y tapa IPs y contraseñas', async () => {
  const session = await launchApp({
    rawConfig:
      '---\nglobal:\n  host1_username: usuario\n  host1_password: secreto-de-clase\ncases:\n- tt_members: "Ana Ferrer"\n  host1_ip: 192.168.1.10\n'
  })
  try {
    await session.page.click(`main button:has-text("${session.projectName}")`)
    await session.page.waitForSelector('text=Test (start.rb)', { timeout: 10_000 })

    const rootSize = () =>
      session.page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
    expect(await rootSize()).toBe('16px')

    await session.page.click('button:has-text("Modo proyector")')
    expect(await rootSize()).toBe('20px')

    // La tabla de configuración deja de enseñar la IP y quita el botón que
    // revela las contraseñas.
    await goTo(session, 'Editor')
    await session.page.click('button:has-text("Configuración (config.yaml)")')
    const ip = session.page.locator('input[aria-label="host1_ip, alumno 1"]')
    await expect(ip).toHaveAttribute('type', 'password', { timeout: 10_000 })
    await expect(session.page.locator('button:has-text("Mostrar claves")')).toHaveCount(0)

    // La orden ejecutada, en el detalle del alumno: ni IP ni contraseña.
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(session.page.getByText('Ana Ferrer').first()).toBeVisible({ timeout: 40_000 })
    await session.page.click('button[aria-label*="Ana Ferrer"]')
    await session.page.click('button:has-text("Comprobación 1")')
    const detalle = session.page.locator('body')
    await expect(detalle).toContainText('•••.•••.•••.•••', { timeout: 10_000 })
    await expect(detalle).not.toContainText('192.168.1.')
    await expect(detalle).not.toContainText('secreto-de-clase')
  } finally {
    await session.close()
  }
})
