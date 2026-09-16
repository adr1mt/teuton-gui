import { expect, test } from '@playwright/test'
import { goTo, launchApp, livePids, openProject, runningBadge, stillAlive } from './harness'

test('reevaluar a un alumno a mitad de ciclo no mata el modo examen', async () => {
  const session = await launchApp({ mode: 'slow' })
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Iniciar modo examen")')
    await session.page.click('button:has-text("Iniciar modo examen")')

    // Primer ciclo en marcha; el panel lo anuncia.
    await expect(session.page.locator('text=Modo examen activo').first()).toBeVisible({ timeout: 20_000 })

    // Mientras corre, se pide reevaluar: `startRun` cede el turno. Antes se
    // quedaba «activo» sin ningún ciclo programado y la clase dejaba de
    // corregirse en silencio.
    await expect(session.page.locator('text=Ana Ferrer').first()).toBeVisible({ timeout: 40_000 })
    await session.page.click('button[aria-label^="Reevaluar Ana Ferrer"]')

    // El modo examen sigue vivo y con próxima evaluación anunciada.
    await expect(session.page.locator('text=Modo examen activo').first()).toBeVisible()
    await expect(session.page.locator('text=Próxima evaluación en').first()).toBeVisible({ timeout: 40_000 })
  } finally {
    await session.close()
  }
})

test('el modo examen impide que el ordenador se suspenda', async () => {
  const session = await launchApp({ mode: 'slow' })
  /** ¿Hay algún bloqueo de suspensión activo? Electron no lo pregunta en
   *  general, así que se tantean los primeros identificadores. */
  const bloqueando = () =>
    session.app.evaluate(({ powerSaveBlocker }) =>
      [0, 1, 2, 3, 4].some((id) => powerSaveBlocker.isStarted(id))
    )
  try {
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.waitForSelector('button:has-text("Iniciar modo examen")')

    expect(await bloqueando()).toBe(false)
    await session.page.click('button:has-text("Iniciar modo examen")')

    // Durante el examen nadie toca el teclado: sin esto, el escritorio da el
    // equipo por inactivo y lo suspende a mitad de corrección (en GNOME, con
    // corriente, a las 2 h por defecto — lo que dura un examen).
    await expect.poll(bloqueando, { timeout: 15_000 }).toBe(true)

    await session.page.click('button:has-text("Detener")')
    // Y se suelta al parar: no dejamos el equipo sin suspender para siempre.
    await expect.poll(bloqueando, { timeout: 15_000 }).toBe(false)
  } finally {
    await session.close()
  }
})

test('abrir otro proyecto con el examen en marcha pide confirmación', async () => {
  // 'hang': el proceso no termina nunca, así que la corrección sigue en marcha
  // con seguridad cuando se intenta cambiar de proyecto.
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

    await goTo(session, 'Inicio')
    await session.page.click(`main button:has-text("${session.projectName}")`)

    // Cambiar de proyecto abandonaba el proceso: seguía evaluando a la clase
    // anterior, sus notas se perdían y bloqueaba la siguiente ejecución.
    await expect(session.page.locator('text=Hay una corrección en marcha')).toBeVisible({ timeout: 10_000 })
    await session.page.click('button:has-text("Abrir de todas formas")')
    await expect(session.page.locator('text=Test (start.rb)')).toBeVisible({ timeout: 15_000 })
    // Y el proceso de la clase anterior se detiene de verdad, no queda evaluando.
    await expect.poll(() => stillAlive(launched), { timeout: 20_000 }).toHaveLength(0)
  } finally {
    await session.close()
  }
})

/**
 * S-07 (G7). Un `teuton` que nunca termina dejaba el modo examen «evaluando»
 * para siempre. El reloj de la ventana se simula para no esperar 10 minutos.
 */
test('una pasada colgada del modo examen se cancela y llega el ciclo siguiente', async () => {
  const session = await launchApp({ mode: 'hang' })
  try {
    await session.page.clock.install()
    await session.page.reload()
    await session.page.waitForSelector('main >> text=Proyectos recientes', { timeout: 20_000 })
    await openProject(session)
    await goTo(session, 'Ejecutar')
    await session.page.click('button:has-text("Iniciar modo examen")')
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)
    const first = await livePids(session)

    // Con el intervalo por defecto (5 min) el límite es de 15 min.
    // `fastForward` dispara cada temporizador con la hora a la que vencía: el
    // segundo salto hace que el vigilante (cada 30 s) ya vea los 16 min.
    await session.page.clock.fastForward('16:00')
    await session.page.clock.fastForward('00:31')
    await expect(session.page.getByText('sin terminar').first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => stillAlive(first), { timeout: 15_000 }).toHaveLength(0)

    // El intervalo por defecto es de 5 min: al vencer arranca otra pasada.
    await session.page.clock.fastForward('06:00')
    await expect.poll(() => livePids(session), { timeout: 15_000 }).toHaveLength(1)
    expect(await livePids(session)).not.toEqual(first)
    await expect(session.page.locator('text=Modo examen activo').first()).toBeVisible()
  } finally {
    await session.close()
  }
})
