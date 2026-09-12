import { expect, test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * La app tal y como se instala (`dist/linux-unpacked`, lo que va dentro del
 * AppImage), no el build de desarrollo. Es el único sitio donde `app.isPackaged`
 * es cierto, y por tanto donde se puede comprobar lo que solo existe ahí: que la
 * ventana no arranca en blanco (preload CommonJS) y que la CSP se aplica de
 * verdad, porque el renderer se carga con `file://` y la cabecera del proceso
 * main no interviene en ese esquema.
 *
 * Se salta si no se ha empaquetado todavía: `npm run dist:linux`.
 */
const BINARY = resolve(process.cwd(), 'dist/linux-unpacked/teuton-gui')

test.skip(!existsSync(BINARY), 'no hay build empaquetado (npm run dist:linux)')

test('la app instalada arranca con ventana y con la CSP puesta', async () => {
  const userData = join(tmpdir(), `teuton-uat-pack-${randomUUID().slice(0, 8)}`)
  await fs.mkdir(userData, { recursive: true })
  const app = await electron.launch({
    executablePath: BINARY,
    args: ['--no-sandbox', `--user-data-dir=${userData}`]
  })
  try {
    const page = await app.firstWindow()
    // Ventana con contenido: un preload que no carga deja la pantalla vacía y
    // sin `window.teuton`, que es exactamente el fallo que se coló en la 1.0.0.
    await expect(page.locator('main')).toContainText('Proyectos recientes', { timeout: 30_000 })
    expect(await page.evaluate(() => typeof (window as unknown as { teuton?: unknown }).teuton)).toBe('object')

    const meta = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content')
    expect(meta).toContain("default-src 'self'")
    const ejecutado = await page.evaluate(() => {
      const marca = { valor: 'no ejecutado' }
      ;(window as unknown as { __uat: typeof marca }).__uat = marca
      const script = document.createElement('script')
      script.textContent = 'window.__uat.valor = "ejecutado"'
      document.head.appendChild(script)
      return marca.valor
    })
    expect(ejecutado).toBe('no ejecutado')
  } finally {
    await app.close().catch(() => undefined)
    await fs.rm(userData, { recursive: true, force: true })
  }
})
