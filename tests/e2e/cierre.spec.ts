import { expect, test } from '@playwright/test'
import { goTo, launchApp, livePids, openProject, runningBadge, stillAlive } from './harness'

test('sin corrección en marcha, cerrar la ventana cierra la app', async () => {
  const session = await launchApp()
  const proceso = session.app.process()
  try {
    await openProject(session)
    void session.app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
      .catch(() => undefined)

    // Referencia para la prueba siguiente: aquí no hay nada que perder, así que
    // la ventana se cierra sin preguntar y el proceso termina.
    await expect.poll(() => proceso.exitCode, { timeout: 20_000 }).not.toBeNull()
  } finally {
    await session.kill()
  }
})

test('cerrar la ventana con una corrección en marcha no cierra sin preguntar', async () => {
  const session = await launchApp({ mode: 'hang' })
  const proceso = session.app.process()
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)

    // El aviso es un diálogo nativo y BLOQUEA el proceso main, así que ni esta
    // llamada vuelve ni se puede hablar con la página mientras está abierto: se
    // observa desde fuera, por el proceso.
    void session.app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
      .catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Sigue vivo: la ventana no se cerró sola. Cerrarla sin preguntar se
    // llevaría por delante la corrección de toda la clase.
    expect(proceso.exitCode).toBeNull()
  } finally {
    // Con el diálogo abierto no se puede hablar con la app: salida a lo bruto.
    await session.kill()
  }
})

test('cerrar la sesión del escritorio no deja procesos vivos', async () => {
  const session = await launchApp({ mode: 'hang' })
  let launched: number[] = []
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)
    launched = await livePids(session)

    // Cerrar sesión manda SIGTERM a la aplicación; eso NO dispara 'before-quit',
    // así que sin el manejador de señales los `teuton`/`ssh` seguían vivos tras
    // apagar el ordenador.
    session.app.process().kill('SIGTERM')
  } finally {
    await session.close()
  }
  await expect.poll(() => stillAlive(launched), { timeout: 15_000 }).toHaveLength(0)
})
