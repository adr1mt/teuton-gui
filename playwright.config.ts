import { defineConfig } from '@playwright/test'

/**
 * UAT hostil sobre la app real. No hay navegadores: solo Electron, así que
 * `npm i` no descarga Chromium (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
 *
 * Un solo worker: cada escenario arranca una instancia de Electron y varias a
 * la vez se pelean por el display y por los procesos del teuton falso.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'off' }
})
