import { expect, test } from '@playwright/test'
import { goTo, launchApp, openProject } from './harness'

/**
 * «¿Todo listo?» existe para que los problemas salgan ANTES del examen. Si se
 * equivoca en el sentido —decir que todo va bien con el YAML roto, o bloquear
 * un examen que sí se puede lanzar— es peor que no tenerlo: el profesor deja de
 * mirarlo.
 */

async function comprobar(session: Awaited<ReturnType<typeof launchApp>>): Promise<void> {
  await openProject(session)
  await goTo(session, 'Ejecutar')
  await session.page.click('button:has-text("¿Todo listo?")')
}

test('con el examen en orden dice que se puede empezar y cuenta a los alumnos', async () => {
  const session = await launchApp()
  try {
    await comprobar(session)

    // Los alumnos del harness no llevan IP, así que hay aviso pero no bloqueo:
    // un aviso no puede impedir lanzar un examen que sí funcionaría.
    await expect(session.page.getByText('Se puede empezar, pero mira los avisos')).toBeVisible({
      timeout: 20_000
    })
    await expect(session.page.getByText('4 alumnos en el examen')).toBeVisible()
    await expect(session.page.getByText('4 comprobaciones por alumno')).toBeVisible()
  } finally {
    await session.close()
  }
})

test('un config.yaml roto bloquea el examen y lo dice', async () => {
  const session = await launchApp({ rawConfig: '---\ncases:\n  - [sin cerrar\n' })
  try {
    await comprobar(session)

    await expect(session.page.getByText('Todavía no se puede empezar')).toBeVisible({
      timeout: 20_000
    })
    await expect(
      session.page.getByText('El fichero de configuración tiene un error')
    ).toBeVisible()
  } finally {
    await session.close()
  }
})

test('un alumno sin nombre bloquea: su nota no se podría guardar', async () => {
  const session = await launchApp({
    rawConfig: '---\nglobal:\n  host1_username: usuario\ncases:\n- tt_members: "Ana Ferrer"\n  host1_ip: 10.0.0.2\n- host1_ip: 10.0.0.3\n'
  })
  try {
    await comprobar(session)

    await expect(session.page.getByText('Todavía no se puede empezar')).toBeVisible({
      timeout: 20_000
    })
    await expect(session.page.getByText('1 sin nombre', { exact: false })).toBeVisible()
  } finally {
    await session.close()
  }
})
