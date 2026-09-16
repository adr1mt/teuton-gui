import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { join } from 'node:path'
import { hasActiveRuns, isExamModeActive, registerIpc, releaseKeepAwake, stopActiveRuns } from './ipc'

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
    if (quitRequested) return
    // El modo examen cuenta aunque no haya proceso: entre dos ciclos no lo hay
    // durante casi todo el intervalo (S-17).
    const running = hasActiveRuns()
    if (closeConfirmed || (!running && !isExamModeActive())) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Seguir corrigiendo', 'Cerrar y detener'],
      defaultId: 0,
      cancelId: 0,
      title: 'Hay una corrección en marcha',
      message: running ? 'Hay una evaluación en curso.' : 'El modo examen está activo.',
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

// Salida pedida a la aplicación, no a la ventana: cierre de sesión, `kill` o
// Ctrl+Q. Electron atiende SIGTERM por su cuenta con 'before-quit' y cierra las
// ventanas; un diálogo ahí dejaba el apagado colgado con el modo examen activo.
let quitRequested = false

// Una sola instancia (S-21): las colas de escritura (`serialized`) y la reserva
// de proyectos en marcha viven en la memoria de cada proceso, así que dos
// ventanas abiertas desde el menú se pisaban informes e historial. La segunda
// sale sin abrir nada y devuelve la primera al frente. El bloqueo va por
// `userData`, así que la UAT, con uno propio por escenario, no se ve afectada.
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.exit(0)

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  if (!primaryInstance) return
  registerCsp()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopActiveRuns()
  releaseKeepAwake()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitRequested = true
  stopActiveRuns()
  releaseKeepAwake()
})

// Cerrar la sesión del escritorio o un `kill` no disparan 'before-quit', así que
// sin esto los `teuton`/`ssh` lanzados quedan vivos tras apagar el ordenador.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    quitRequested = true
    stopActiveRuns()
    releaseKeepAwake()
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
