import { expect, test } from '@playwright/test'
import { goTo, launchApp, livePids, openProject, runningBadge, stillAlive } from './harness'

test('dos arranques en el mismo instante no lanzan dos evaluaciones', async () => {
  const session = await launchApp({ mode: 'slow' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')

    // El botón se deshabilita en cuanto la ejecución arranca, así que un doble
    // clic humano no pasa por ahí; la carrera de verdad son dos arranques en el
    // MISMO tick (un ciclo del modo examen justo cuando se pulsa, o reevaluar a
    // un alumno). Los dos pasaban el guardián porque guardar los borradores cede
    // el control antes de marcar el estado, y el segundo dejaba huérfano el
    // proceso del primero: su salida se descartaba y sus notas no se guardaban.
    await session.page.waitForSelector('button:has-text("Ejecutar test")')
    await session.page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Ejecutar test')
      ) as HTMLButtonElement
      button.click()
      button.click()
    })

    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })
    // El hijo escribe su fichero de PID al arrancar, después de que la interfaz
    // ya diga «Ejecutando…»: hay que esperarlo.
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)
    // Ni error por el arranque perdido, ni ejecución fantasma.
    await expect(session.page.locator('text=No se pudo iniciar la evaluación')).toHaveCount(0)
    await expect(session.page.locator('text=Ya hay una evaluación activa')).toHaveCount(0)

    // Y la ejecución que sí arrancó llega hasta el final con sus notas.
    await expect(session.page.locator('text=Ana Ferrer').first()).toBeVisible({ timeout: 40_000 })
    await expect.poll(() => livePids(session), { timeout: 10_000 }).toHaveLength(0)
  } finally {
    await session.close()
  }
})

test('cancelar y relanzar al instante no solapa procesos', async () => {
  const session = await launchApp({ mode: 'slow' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })

    await session.page.click('button:has-text("Cancelar")')
    // La cancelación espera a que el hijo muera de verdad, así que al volver el
    // control ya se puede relanzar sin superponer escrituras.
    await expect(runningBadge(session)).toHaveCount(0, { timeout: 20_000 })
    expect(await livePids(session)).toHaveLength(0)

    await session.page.click('button:has-text("Ejecutar test"), button:has-text("Volver a ejecutar")')
    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })
    expect((await livePids(session)).length).toBeLessThanOrEqual(1)
  } finally {
    await session.close()
  }
})

test('cerrar la app con un teuton colgado no deja procesos huérfanos', async () => {
  const session = await launchApp({ mode: 'hang' })
  let launched: number[] = []
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')
    await expect(runningBadge(session)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)
    launched = await livePids(session)
    await session.quit()
  } finally {
    await session.close()
  }
  // El proceso colgado nunca termina solo: si sobrevive al cierre, bloquea la
  // siguiente ejecución sobre ese proyecto y sigue hablando con las máquinas.
  await expect.poll(() => stillAlive(launched), { timeout: 15_000 }).toHaveLength(0)
})

test('una ejecución que falla a mitad no deja la app colgada', async () => {
  const session = await launchApp({ mode: 'crash' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Ejecutar test")')
    // Termina con código 1 y sin resume.json: debe reflejarse como error, no
    // quedarse en «Ejecutando…» para siempre.
    await expect(session.page.locator('text=Error en la ejecución')).toBeVisible({ timeout: 25_000 })
    expect(await livePids(session)).toHaveLength(0)
  } finally {
    await session.close()
  }
})
