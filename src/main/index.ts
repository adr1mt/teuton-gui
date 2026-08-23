import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc, stopActiveRuns } from './ipc'

// Evita cuelgues de compositor/GPU habituales en Linux (causa típica de
// "la ventana no responde"). La app es ligera y no necesita aceleración HW.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-compositing')

/**
 * La CSP se aplica como cabecera HTTP (no como <meta> en el HTML) para poder
 * distinguir desarrollo de producción. En desarrollo, @vitejs/plugin-react
 * inyecta su preámbulo de React Refresh como <script type="module"> inline en
 * el HTML servido por Vite; sin 'unsafe-inline' en script-src la CSP lo
 * bloquea y el renderer se queda en blanco. En producción (app empaquetada)
 * se mantiene la política estricta original, sin relajar nada.
 */
function registerCsp(): void {
  const scriptSrc = app.isPackaged ? "script-src 'self' blob:" : "script-src 'self' blob: 'unsafe-inline'"
  const connectSrc = app.isPackaged ? "connect-src 'self'" : "connect-src 'self' ws: wss:"
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    connectSrc
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

// Icono de la ventana y de la barra de tareas. Empaquetado, electron-builder lo
// copia junto a los recursos (extraResources); en desarrollo se lee del repo.
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png')

function createWindow(): void {
  const win = new BrowserWindow({
    icon: iconPath,
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    title: 'Teutón GUI',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Abre enlaces externos en el navegador del sistema, solo esquemas seguros.
  const isSafeExternal = (url: string): boolean => /^(https?|mailto):/i.test(url)

  win.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternal(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Impide que la app navegue fuera de su propio contenido (defensa en profundidad).
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (isSafeExternal(url)) shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerCsp()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopActiveRuns()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopActiveRuns)
