import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { launchApp } from './harness'

/**
 * S-21. Abrir la app dos veces desde el menú arrancaba dos procesos que
 * corregían el mismo proyecto: sus colas de escritura no se ven entre sí, así
 * que se pisaban los informes y el historial. La segunda tiene que salir sola
 * y devolver el foco a la primera.
 */
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string
const PACKAGED = resolve(process.cwd(), 'dist/linux-unpacked/teuton-gui')

function secondInstance(command: string, args: string[]): Promise<number | null> {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    // Si en 15 s no ha salido, es que se ha quedado como segunda app.
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(-1)
    }, 15_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      done(code)
    })
  })
}

async function checkSingleInstance(packaged: boolean): Promise<void> {
  const session = await launchApp({ executablePath: packaged ? PACKAGED : undefined })
  try {
    await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
    await expect
      .poll(() => session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()))
      .toBe(true)

    const args = [`--user-data-dir=${session.userData}`, '--no-sandbox']
    const code = packaged
      ? await secondInstance(PACKAGED, args)
      : await secondInstance(ELECTRON, [join(process.cwd(), 'out/main/index.js'), ...args])
    expect(code).toBe(0)

    // La primera sigue viva, con una sola ventana, y ha vuelto a primer plano.
    expect(session.app.process().exitCode).toBeNull()
    await expect
      .poll(() => session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized()), {
        timeout: 10_000
      })
      .toBe(false)
    expect(await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await session.close()
  }
}

test('una segunda instancia sale y devuelve el foco a la primera', async () => {
  await checkSingleInstance(false)
})

test('la app instalada tampoco abre una segunda instancia', async () => {
  test.skip(!existsSync(PACKAGED), 'no hay build empaquetado (npm run dist:linux)')
  await checkSingleInstance(true)
})
