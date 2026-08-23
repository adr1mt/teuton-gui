import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ClassRoster,
  DefaultGlobals,
  GradeRecords,
  GradingSettings,
  PersistenceResult,
  ProjectMeta
} from '../shared/types'
import { sanitizeFileName } from '../shared/sanitize'
import { validatedGrading, validatedRecords } from './validation'

// Persistencia sencilla en JSON dentro de userData.

function userFile(name: string): string {
  return join(app.getPath('userData'), name)
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(userFile(name), 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await writeAtomic(userFile(name), JSON.stringify(data, null, 2))
}

/**
 * Escribe y renombra en el mismo directorio para evitar JSON corrupto ante un cierre.
 *
 * Todo lo que gestiona este fichero (ajustes de la app, récords de notas, metadatos
 * de proyecto) vive bajo el criterio "0600 siempre": aunque récords/metadatos se
 * guarden dentro del proyecto del profesor, son ficheros internos de la GUI (no se
 * versionan ni se comparten) y contienen datos de alumnos, así que no hay razón
 * para relajar el permiso.
 *
 * La única excepción es el CSV de Moodle (`writeClassCsv`): también contiene notas,
 * así que por defecto también es 0600, pero si el profesor ya lo había reescrito
 * con otro modo (p.ej. para dejarlo en una carpeta compartida de red) no queremos
 * pisarlo en cada ejecución — `rename()` sustituye el inodo, así que sin esto cada
 * examen resetearía silenciosamente ese permiso. `preserveExistingMode` cubre ese caso.
 */
async function writeAtomic(
  path: string,
  content: string,
  options: { preserveExistingMode?: boolean } = {}
): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    let mode = 0o600
    if (options.preserveExistingMode) {
      try {
        const stat = await fs.stat(path)
        mode = stat.mode & 0o777
      } catch (err) {
        // ENOENT === primer CSV de esta clase, no es un error: no hay modo previo
        // que preservar, se queda en el 0600 por defecto (contiene notas de alumnos).
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
    await fs.writeFile(temp, content, { encoding: 'utf-8', mode: 0o600 })
    if (mode !== 0o600) await fs.chmod(temp, mode)
    await fs.rename(temp, path)
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined)
    throw error
  }
}

// ---- Ruta manual al ejecutable de Teutón ----
// Ajuste de nivel de aplicación (no por proyecto): quien instale Ruby con
// rbenv/rvm/asdf/snap puede tener `teuton` en una ruta que la autodetección de
// main/teuton.ts no cubre. Cadena vacía se normaliza a null ("autodetección").

interface TeutonPathFile {
  path: string | null
}

const DEFAULT_TEUTON_PATH: TeutonPathFile = { path: null }

export async function getTeutonPath(): Promise<string | null> {
  const stored = await readJson<TeutonPathFile>('teuton-path.json', DEFAULT_TEUTON_PATH)
  return typeof stored.path === 'string' && stored.path.trim() ? stored.path.trim() : null
}

export async function setTeutonPath(path: string | null): Promise<void> {
  const normalized = typeof path === 'string' && path.trim() ? path.trim() : null
  await writeJson('teuton-path.json', { path: normalized })
}

// ---- Ajustes de nota ----

const DEFAULT_GRADING: GradingSettings = { passScore: 70, maxGrade: 10 }

export async function getGrading(): Promise<GradingSettings> {
  const g = await readJson<Partial<GradingSettings>>('grading.json', DEFAULT_GRADING)
  try {
    return validatedGrading(g)
  } catch {
    return { ...DEFAULT_GRADING }
  }
}

export async function setGrading(grading: GradingSettings): Promise<void> {
  await writeJson('grading.json', validatedGrading(grading))
}

// ---- Valores globales por defecto ----

// Las máquinas de los alumnos suelen tener las mismas credenciales en todo el
// centro; este es el valor sembrado la primera vez, editable en Ajustes.
const DEFAULT_GLOBALS: DefaultGlobals = {
  host1_username: 'usuario',
  host1_password: 'usuario'
}

/** Solo conservamos entradas string→string (defensivo ante ficheros manipulados). */
function sanitizeGlobals(g: unknown): DefaultGlobals {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { ...DEFAULT_GLOBALS }
  const clean: DefaultGlobals = {}
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    if (typeof v === 'string') clean[k] = v
  }
  return clean
}

/**
 * En Linux, si no hay llavero de sistema arrancado (gnome-keyring, kwallet...),
 * Electron cae al backend `basic_text`: "cifra" con una clave fija embebida en el
 * binario, así que en la práctica NO protege nada. `getSelectedStorageBackend()`
 * solo existe en Linux (en otras plataformas no está, de ahí el try/catch) — lo
 * tratamos como "cifrado no disponible" a efectos de decidir CÓMO guardar, aunque
 * `encryptString`/`decryptString` sigan funcionando mecánicamente con ese backend.
 */
function hasRealEncryption(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  try {
    const backend = (
      safeStorage as unknown as { getSelectedStorageBackend?: () => string }
    ).getSelectedStorageBackend?.()
    if (backend === 'basic_text') return false
  } catch {
    // Plataforma sin este método (Windows/macOS): confiamos en isEncryptionAvailable().
  }
  return true
}

async function encFileExists(): Promise<boolean> {
  try {
    await fs.access(userFile('default-globals.enc'))
    return true
  } catch {
    return false
  }
}

export async function getDefaultGlobals(): Promise<DefaultGlobals> {
  if (await encFileExists()) {
    try {
      // isEncryptionAvailable() (no hasRealEncryption()): si el fichero se cifró en
      // su día con backend basic_text, ese mismo backend lo sigue descifrando bien;
      // lo único que nos importa aquí es si `decryptString` puede funcionar o no.
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage.isEncryptionAvailable() = false')
      }
      const encrypted = await fs.readFile(userFile('default-globals.enc'), 'utf-8')
      const g = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')))
      return sanitizeGlobals(g)
    } catch (err) {
      // Hay credenciales cifradas guardadas pero AHORA MISMO no se pueden leer
      // (llavero no arrancado, cambio de sesión/escritorio, decryptString falla...).
      // A propósito NO migramos ni tocamos default-globals.json aquí: eso ya lo
      // habíamos borrado al cifrar por primera vez, así que "caer" a él solo nos
      // devolvería usuario/usuario. Se registra el fallo con detalle para poder
      // diagnosticarlo — mejora pendiente: reflejar este estado en Ajustes en vez
      // de solo el log. setDefaultGlobals más abajo impide además que un guardado
      // posterior sobrescriba en claro el cifrado que no hemos podido leer.
      console.error(
        'getDefaultGlobals: existe default-globals.enc pero no se pudo descifrar ' +
          '(¿llavero del sistema no disponible?). Se devuelven valores por defecto ' +
          'sin modificar el fichero cifrado existente.',
        err
      )
      return { ...DEFAULT_GLOBALS }
    }
  }
  // No hay .enc: o es la primera vez, o venimos de una instalación antigua en claro.
  return sanitizeGlobals(await readJson<DefaultGlobals>('default-globals.json', DEFAULT_GLOBALS))
}

export async function setDefaultGlobals(globals: DefaultGlobals): Promise<void> {
  if (hasRealEncryption()) {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    const encrypted = safeStorage.encryptString(JSON.stringify(globals)).toString('base64')
    await writeAtomic(userFile('default-globals.enc'), encrypted)
    // Elimina la copia anterior en claro solo después de escribir correctamente la cifrada.
    await fs.unlink(userFile('default-globals.json')).catch(() => undefined)
    return
  }

  if (await encFileExists()) {
    // Ya había credenciales cifradas guardadas y ahora mismo no disponemos de
    // cifrado "real" (llavero caído, o degradado al backend basic_text de clave
    // fija). Escribir aquí en claro pisaría ese fichero cifrado con un .json plano
    // — justo lo que este arreglo quiere evitar. Se lanza el error tal cual: el
    // canal IPC ya lo propaga al renderer, que puede mostrarlo al profesor.
    throw new Error(
      'No se pueden guardar las credenciales: el cifrado del sistema no está disponible ' +
        '(el llavero del escritorio no responde) y ya existen credenciales cifradas guardadas. ' +
        'Para no dejarlas sin cifrar, no se sobrescriben. Reinicia el llavero de tu escritorio ' +
        '(gnome-keyring, kwallet...) y vuelve a intentarlo.'
    )
  }

  // Sin cifrado real disponible (sin llavero, o backend basic_text) y sin .enc
  // previo que proteger: mantenemos compatibilidad guardando en fichero 0600.
  await writeJson('default-globals.json', globals)
}

// ---- Clases ----

export async function listClasses(): Promise<ClassRoster[]> {
  const list = await readJson<ClassRoster[]>('classes.json', [])
  return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : []
}

export async function saveClass(roster: ClassRoster): Promise<ClassRoster[]> {
  const list = await listClasses()
  const idx = list.findIndex((c) => c.id === roster.id)
  const now = Date.now()
  const updated: ClassRoster = { ...roster, updatedAt: now, createdAt: roster.createdAt || now }
  if (idx >= 0) list[idx] = updated
  else list.push(updated)
  await writeJson('classes.json', list)
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteClass(id: string): Promise<ClassRoster[]> {
  const list = (await listClasses()).filter((c) => c.id !== id)
  await writeJson('classes.json', list)
  return list
}

// ---- Récord histórico de notas (por proyecto) ----
// Se guarda dentro del propio proyecto para que viaje con él.

function recordsPath(dir: string): string {
  return join(dir, '.teuton-gui-records.json')
}

interface ScopedRecords {
  version: 2
  classes: Record<string, GradeRecords>
  /** Historial anterior a la separación por clases; se conserva sin mezclarlo. */
  legacy?: GradeRecords
}

function classScope(classId?: string): string {
  // Los casos añadidos manualmente siguen teniendo su propio espacio; nunca se
  // comparten con una clase importada.
  return classId ? `class:${classId}` : 'manual'
}

async function readRecords(dir: string): Promise<ScopedRecords | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(recordsPath(dir), 'utf-8'))
    if (
      parsed && typeof parsed === 'object' &&
      (parsed as Partial<ScopedRecords>).version === 2 &&
      (parsed as Partial<ScopedRecords>).classes &&
      typeof (parsed as Partial<ScopedRecords>).classes === 'object'
    ) return parsed as ScopedRecords
    // Formato 1: un único mapa por proyecto. No sabemos de qué clase era cada
    // nota, así que lo preservamos aparte y jamás lo aplicamos a una clase.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const legacy: GradeRecords = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) legacy[key] = value
      }
      return { version: 2, classes: {}, legacy }
    }
  } catch {
    // Sin historial todavía.
  }
  return null
}

export async function getRecords(dir: string, classId?: string): Promise<GradeRecords> {
  const stored = await readRecords(dir)
  const scoped = stored?.classes[classScope(classId)] ?? {}
  // Solo los casos manuales pueden consultar el historial anterior; una clase
  // importada debe empezar aislada para impedir cruces entre grupos.
  return classId ? { ...scoped } : { ...(stored?.legacy ?? {}), ...scoped }
}

/** Fusiona las notas nuevas quedándose con el máximo por alumno y por clase. */
export async function updateRecords(
  dir: string,
  grades: GradeRecords,
  classId?: string
): Promise<PersistenceResult<GradeRecords>> {
  const safeGrades = validatedRecords(grades)
  const stored = (await readRecords(dir)) ?? { version: 2, classes: {} }
  const scope = classScope(classId)
  const current = {
    ...(scope === 'manual' ? stored.legacy ?? {} : {}),
    ...(stored.classes[scope] ?? {})
  }
  for (const [name, grade] of Object.entries(safeGrades)) {
    if (!(name in current) || grade > current[name]) current[name] = grade
  }
  try {
    stored.classes[scope] = current
    await writeAtomic(recordsPath(dir), JSON.stringify(stored, null, 2))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      data: current,
      persisted: false,
      warning: `No se pudo guardar el historial de mejores notas: ${detail}`
    }
  }
  return { data: current, persisted: true }
}

/**
 * Borra el historial de mejores notas de una clase (o del espacio manual).
 * Útil tras una pasada de prueba: sin esto, el récord de la prueba quedaría
 * para siempre como nota mínima en el CSV de Moodle.
 */
export async function resetRecords(
  dir: string,
  classId?: string
): Promise<PersistenceResult<GradeRecords>> {
  const stored = await readRecords(dir)
  if (!stored) return { data: {}, persisted: true }
  const scope = classScope(classId)
  const previous = { ...(stored.classes[scope] ?? {}) }
  delete stored.classes[scope]
  // El historial legado (formato 1) solo alimenta el espacio manual; si el
  // profesor lo reinicia, debe desaparecer también o reaparecería al leer.
  if (scope === 'manual') delete stored.legacy
  try {
    await writeAtomic(recordsPath(dir), JSON.stringify(stored, null, 2))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      data: previous,
      persisted: false,
      warning: `No se pudo borrar el historial de mejores notas: ${detail}`
    }
  }
  return { data: {}, persisted: true }
}

// ---- Metadatos del proyecto (clase activa, etc.) ----

function metaPath(dir: string): string {
  return join(dir, '.teuton-gui-meta.json')
}

export async function getProjectMeta(dir: string): Promise<ProjectMeta> {
  try {
    const meta = JSON.parse(await fs.readFile(metaPath(dir), 'utf-8')) as ProjectMeta
    return meta && typeof meta === 'object' ? meta : {}
  } catch {
    return {}
  }
}

export async function setProjectMeta(dir: string, meta: ProjectMeta): Promise<void> {
  const current = await getProjectMeta(dir)
  await writeAtomic(metaPath(dir), JSON.stringify({ ...current, ...meta }, null, 2))
}

// ---- CSV de Moodle por clase ----

/**
 * Escribe el CSV de la clase en <dir>/informes/moodle-<clase>.csv.
 * Un fichero por clase: ejecutar el mismo proyecto con otra clase genera otro
 * CSV distinto, de modo que las notas de ambos grupos coexisten como historial.
 */
export async function writeClassCsv(
  dir: string,
  className: string,
  classId: string | undefined,
  content: string
): Promise<string> {
  const outDir = join(dir, 'informes')
  await fs.mkdir(outDir, { recursive: true })
  // El identificador evita que dos clases llamadas igual se pisen entre sí.
  const suffix = classId ? `-${sanitizeFileName(classId, 'clase').slice(0, 8)}` : ''
  const filePath = join(outDir, `moodle-${sanitizeFileName(className, 'clase')}${suffix}.csv`)
  // Contiene notas de alumnos: 0600 por defecto, pero preservando el modo si el
  // profesor ya lo tenía ajustado de otra forma (ver comentario de writeAtomic).
  await writeAtomic(filePath, content, { preserveExistingMode: true })
  if (suffix) {
    // Versiones anteriores escribían este CSV sin sufijo. Si quedara ahí, el
    // profesor podría subir a Moodle un fichero con notas desactualizadas.
    await fs.unlink(join(outDir, `moodle-${sanitizeFileName(className, 'clase')}.csv`)).catch(() => {})
  }
  return filePath
}
