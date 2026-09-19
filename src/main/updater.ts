import { app, BrowserWindow } from 'electron'
// `electron-updater` es CommonJS: el import con nombre compila, pero el bundle
// ESM del main lanza «Named export not found» al arrancar y la app no abre
// ninguna ventana. Tiene que entrar por el export por defecto.
import electronUpdater from 'electron-updater'
import { IPC } from '../shared/ipc'
import { isExamModeActive } from './ipc'

/**
 * Actualización automática desde GitHub Releases (solo AppImage).
 *
 * El profesor no compila nada: abre la app desde el menú y esta se actualiza
 * sola. Reglas que vienen de cómo se usa en clase:
 *
 * - **Nunca durante un examen.** Si el modo examen está activo no se comprueba
 *   siquiera: una descarga compitiendo por la red con veinte `ssh` a las
 *   máquinas de los alumnos es justo lo que no puede pasar a mitad de prueba.
 * - **Instalar al cerrar, nunca al abrir.** `autoInstallOnAppQuit` reemplaza el
 *   AppImage cuando la app ya no se está usando; sustituirlo al arrancar
 *   interrumpe a quien esté corrigiendo.
 * - **Un fallo no se muestra.** Sin red, sin permiso de escritura en el
 *   AppImage o con GitHub caído, la app funciona igual; un diálogo de error de
 *   actualización delante de la clase no aporta nada.
 *
 * Solo se activa en el AppImage empaquetado: `process.env.APPIMAGE` es la ruta
 * del fichero que hay que reemplazar, y sin ella (dev, `.deb`, instalación por
 * el gestor de paquetes) electron-updater no puede actualizar nada.
 */
const { autoUpdater } = electronUpdater

export function initUpdater(): void {
  if (!app.isPackaged || !process.env['APPIMAGE']) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('update-downloaded', (info) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC.updateReady, info.version)
        }
      } catch {
        // Ventana cerrándose: no hay a quién avisar.
      }
    }
  })

  autoUpdater.on('error', (error) => {
    console.error('[teuton-gui] actualización:', error.message)
  })

  // A los 30 s: el arranque de la app es lo que el profesor está mirando, y la
  // comprobación no tiene ninguna prisa.
  setTimeout(() => {
    if (isExamModeActive()) return
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }, 30_000).unref()
}
