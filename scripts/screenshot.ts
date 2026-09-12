// Smoke test visual: arranca el proceso real (IPC + preload + renderer ya
// construidos), renderiza la ventana y guarda un PNG. No forma parte de la app.
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { registerIpc } from '../src/main/ipc'

const OUT = process.env.SHOT_OUT || '/tmp/teuton-shot.png'
const root = process.cwd()

app.whenReady().then(async () => {
  registerIpc()
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    backgroundColor: '#0b0f19',
    webPreferences: {
      // El build emite CommonJS (lo exige el preload con sandbox); apuntar al
      // .mjs cargaba un fichero inexistente y el renderer se quedaba sin
      // window.teuton, así que la captura salía vacía.
      preload: join(root, 'out/preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadFile(join(root, 'out/renderer/index.html'))
  // Modo proyector: el store lo lee de localStorage al arrancar, así que hay
  // que sembrarlo con la página ya cargada (mismo origen) y recargar.
  if (process.env.SHOT_PROJECTOR) {
    await win.webContents.executeJavaScript("localStorage.setItem('teuton-proyector','1')")
    await win.loadFile(join(root, 'out/renderer/index.html'))
  }
  await new Promise((r) => setTimeout(r, 3500))
  const img = await win.webContents.capturePage()
  writeFileSync(OUT, img.toPNG())
  console.log('[shot] guardado en', OUT)

  // Segunda captura: tema claro, para comprobar ambos modos.
  if (process.env.SHOT_OUT2) {
    await win.webContents.executeJavaScript(
      "document.documentElement.classList.remove('dark'); localStorage.setItem('teuton-theme','light');"
    )
    await new Promise((r) => setTimeout(r, 500))
    const img2 = await win.webContents.capturePage()
    writeFileSync(process.env.SHOT_OUT2, img2.toPNG())
    console.log('[shot] guardado en', process.env.SHOT_OUT2)
  }

  app.quit()
})
