import { expect, test } from '@playwright/test'
import { launchApp, openProject } from './harness'

/**
 * Llama a un método del puente `window.teuton` desde el renderer y devuelve el
 * mensaje de error, o `null` si no lanzó. Sin código dinámico: la CSP no permite
 * 'unsafe-eval' y no queremos que la prueba dependa de eso.
 */
async function ipcError(
  page: import('@playwright/test').Page,
  method: string,
  args: unknown[]
): Promise<string | null> {
  return page.evaluate(async ([name, callArgs]) => {
    const api = (window as unknown as {
      teuton: Record<string, (...a: unknown[]) => Promise<unknown>>
    }).teuton
    try {
      await api[name as string](...(callArgs as unknown[]))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [method, args] as [string, unknown[]])
}

test('la CSP está activa en el HTML que se empaqueta', async () => {
  const session = await launchApp()
  try {
    // La cabecera que envía el proceso main no llega cuando el renderer se carga
    // con file://, que es como arranca la app instalada: la política tiene que
    // venir en el propio HTML.
    const meta = await session.page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content')
    expect(meta).toContain("default-src 'self'")
    expect(meta).toContain("base-uri 'none'")
    expect(meta).not.toContain('unsafe-eval')

    // Y se aplica de verdad: un <script> inline añadido al documento no corre.
    const result = await session.page.evaluate(() => {
      const marca = { valor: 'no ejecutado' }
      ;(window as unknown as { __uat: typeof marca }).__uat = marca
      const script = document.createElement('script')
      script.textContent = 'window.__uat.valor = "ejecutado"'
      document.head.appendChild(script)
      return marca.valor
    })
    expect(result).toBe('no ejecutado')
  } finally {
    await session.close()
  }
})

test('el puente IPC rechaza rutas fuera de los proyectos abiertos', async () => {
  const session = await launchApp()
  try {
    await openProject(session)

    // Lectura de un directorio cualquiera del disco.
    expect(await ipcError(session.page, 'loadResults', ['/etc'])).toMatch(/proyecto abierto/)
    // Escritura arbitraria: era el camino a dejar un fichero ejecutable en el HOME.
    expect(
      await ipcError(session.page, 'saveProject', [
        { dir: '/tmp', scriptFile: 'uat.sh', configFile: 'uat.yaml', script: 'x', config: 'y' }
      ])
    ).toMatch(/proyecto abierto/)
    // `xdg-open` de lo que sea (en Linux ejecuta un .desktop).
    expect(await ipcError(session.page, 'openPath', ['/usr/share/applications'])).toMatch(
      /carpetas del proyecto/
    )
    // Nombre de test con `..`: leía un nivel por encima del directorio de salida.
    expect(await ipcError(session.page, 'loadResults', [session.projectDir, '..'])).toBeTruthy()

    // Y el proyecto legítimo sigue funcionando.
    expect(await ipcError(session.page, 'loadResults', [session.projectDir])).toBeNull()
  } finally {
    await session.close()
  }
})

test('no se puede fijar como Teutón un programa que no lo es', async () => {
  const session = await launchApp()
  try {
    const message = await ipcError(session.page, 'setTeutonPath', ['/bin/ls'])
    expect(message).toMatch(/no responde como Teutón/)
  } finally {
    await session.close()
  }
})
