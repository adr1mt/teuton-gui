import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { hasActiveRuns, registerIpc, stopActiveRuns } from './ipc'

// Evita cuelgues de compositor/GPU habituales en Linux (causa típica de
// "la ventana no responde"). La app es ligera y no necesita aceleración HW.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-compositing')

/**
 * CSP de DESARROLLO, como cabecera HTTP. @vitejs/plugin-react inyecta su
 * preámbulo de React Refresh como <script> inline en el HTML servido por Vite;
 * sin 'unsafe-inline' en script-src la CSP lo bloquea y el renderer se queda en
 * blanco, y eso solo se puede decidir aquí.
 *
 * En la app EMPAQUETADA esta cabecera no sirve de nada: el renderer se carga con
 * `loadFile` (`file://`) y `webRequest` no interviene en ese esquema. Allí la
 * política estricta viaja incrustada como <meta> desde el build (`inlineCsp` en
 * electron.vite.config.ts). Las dos listas deben mantenerse a la par.
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
    connectSrc,
    // No heredan de default-src, hay que declararlas.
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'"
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

  // Cerrar la ventana a mitad de examen mata la corrección de toda la clase, así
  // que se pregunta. Se decide en main y no en el renderer para que el aviso
  // aparezca incluso si la interfaz se ha quedado atascada.
  let closeConfirmed = false
  win.on('close', (event) => {
    if (closeConfirmed || !hasActiveRuns()) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Seguir corrigiendo', 'Cerrar y detener'],
      defaultId: 0,
      cancelId: 0,
      title: 'Hay una corrección en marcha',
      message: 'Hay una evaluación en curso.',
      detail: 'Si cierras ahora se detendrá la corrección de la clase. Las notas ya guardadas se conservan.'
    })
    if (choice === 1) {
      closeConfirmed = true
      win.close()
    }
  })

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

// Cerrar la sesión del escritorio o un `kill` no disparan 'before-quit', así que
// sin esto los `teuton`/`ssh` lanzados quedan vivos tras apagar el ordenador.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    stopActiveRuns()
    app.quit()
  })
}

/**
 * Red de seguridad: un error asíncrono sin capturar mataba el proceso main a
 * mitad de examen, y con él la corrección de toda la clase. Se registra y se
 * sigue: perder una operación es mucho menos grave que perder la sesión.
 */
process.on('uncaughtException', (error) => {
  console.error('[teuton-gui] excepción no capturada:', error)
})
process.on('unhandledRejection', (reason) => {
  console.error('[teuton-gui] promesa rechazada sin capturar:', reason)
})
