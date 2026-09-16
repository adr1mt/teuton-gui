import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  ClassRoster,
  CredentialsStatus,
  DefaultGlobals,
  GradeRecords,
  GradingSettings,
  PersistenceResult,
  ProjectMeta,
  RecordBackup
} from '../shared/types'
import { sanitizeFileName } from '../shared/sanitize'
import { validatedGrading, validatedRecords } from './validation'

// Persistencia sencilla en JSON dentro de userData.

function userFile(name: string): string {
  return join(app.getPath('userData'), name)
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/**
 * Lee un JSON de userData. Solo «el fichero no existe» vale como ausencia: un
 * fichero ilegible (permisos, disco con errores) o corrupto tiene que dar error,
 * no el valor por defecto. Tragarlo era pérdida total de datos — un
 * `classes.json` que no se podía abrir parecía «no hay clases» y el siguiente
 * guardado lo reescribía vacío, llevándose todos los grupos del centro.
 */
async function readJson<T>(name: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await fs.readFile(userFile(name), 'utf-8')
  } catch (error) {
    if (isMissing(error)) return fallback
    throw new Error(
      `No se pudo leer ${name}: ${error instanceof Error ? error.message : String(error)}. ` +
        'No se ha modificado nada para no perder los datos guardados.'
    )
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`El fichero ${name} está dañado y no se puede interpretar. No se ha modificado nada.`)
  }
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await writeAtomic(userFile(name), JSON.stringify(data, null, 2))
}

/**
 * Serializa las escrituras sobre un mismo fichero. Todo lo que hay aquí es
 * leer→fusionar→escribir y el renderer las dispara en paralelo (cada ciclo del
 * modo examen actualiza récords y metadatos): sin cola, dos operaciones leen el
 * mismo estado y la última borra la mejor nota que acababa de guardar la otra.
 */
const writeQueues = new Map<string, Promise<unknown>>()

function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  writeQueues.set(key, next)
  // Evita que la cola crezca indefinidamente guardando cadenas ya terminadas.
  void next.catch(() => undefined).finally(() => {
    if (writeQueues.get(key) === next) writeQueues.delete(key)
  })
  return next
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
    // Volcado a disco ANTES del rename: sin fsync el rename puede ser durable y
    // los datos no, así que un corte de corriente devuelve el fichero de notas
    // truncado o a cero con el bueno ya sustituido.
    const handle = await fs.open(temp, 'w', 0o600)
    try {
      await handle.writeFile(content, 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (mode !== 0o600) await fs.chmod(temp, mode)
    await fs.rename(temp, path)
    // Y el directorio, para que el propio rename sobreviva al corte.
    const dirHandle = await fs.open(dirname(path), 'r').catch(() => null)
    if (dirHandle) {
      await dirHandle.sync().catch(() => undefined)
      await dirHandle.close()
    }
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

/**
 * Último motivo por el que no se pudieron descifrar las credenciales guardadas.
 * Se refresca en cada `getDefaultGlobals()` y lo lee Ajustes: si esto solo vive
 * en el log, el profesor ve usuario/usuario en la tabla sin saber que sus
 * credenciales reales siguen guardadas y no se han podido leer.
 */
let lastDecryptError: string | null = null

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
      lastDecryptError = null
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
      lastDecryptError = err instanceof Error ? err.message : String(err)
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
  lastDecryptError = null
  return sanitizeGlobals(await readJson<DefaultGlobals>('default-globals.json', DEFAULT_GLOBALS))
}

/**
 * Estado del almacén de credenciales, para poder decirlo en Ajustes en vez de
 * dejarlo solo en el log. Lanza `getDefaultGlobals()` primero porque el fallo de
 * descifrado solo se conoce al intentarlo.
 */
export async function getCredentialsStatus(): Promise<CredentialsStatus> {
  await getDefaultGlobals()
  return {
    stored: await encFileExists(),
    readable: lastDecryptError === null,
    encryptionAvailable: hasRealEncryption(),
    error: lastDecryptError ?? undefined
  }
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
  return serialized('classes.json', async () => {
    const list = await listClasses()
    const idx = list.findIndex((c) => c.id === roster.id)
    const now = Date.now()
    const updated: ClassRoster = { ...roster, updatedAt: now, createdAt: roster.createdAt || now }
    if (idx >= 0) list[idx] = updated
    else list.push(updated)
    await writeJson('classes.json', list)
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  })
}

export async function deleteClass(id: string): Promise<ClassRoster[]> {
  return serialized('classes.json', async () => {
    const list = (await listClasses()).filter((c) => c.id !== id)
    await writeJson('classes.json', list)
    return list
  })
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

/**
 * Fusiona claves que solo difieran en espacios sobrantes quedándose con el
 * máximo. `tt_members` se leía crudo del YAML, así que «Ana García » y «Ana
 * García» eran dos historiales distintos y el CSV podía llevarse el más bajo.
 */
function mergeTrimmedKeys(grades: GradeRecords): GradeRecords {
  const merged: GradeRecords = {}
  for (const [name, grade] of Object.entries(grades)) {
    const key = name.trim()
    merged[key] = key in merged ? Math.max(merged[key], grade) : grade
  }
  return merged
}

async function readRecords(dir: string): Promise<ScopedRecords | null> {
  let raw: string
  try {
    raw = await fs.readFile(recordsPath(dir), 'utf-8')
  } catch (error) {
    // Solo «no existe» es ausencia de historial. Un fichero ilegible no puede
    // pasar por «no hay notas»: partiríamos de cero y la siguiente escritura
    // borraría el historial de toda la clase.
    if (isMissing(error)) return null
    throw new Error(
      `No se pudo leer el historial de notas: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!raw.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed && typeof parsed === 'object' &&
      (parsed as Partial<ScopedRecords>).version === 2 &&
      (parsed as Partial<ScopedRecords>).classes &&
      typeof (parsed as Partial<ScopedRecords>).classes === 'object'
    ) {
      const scoped = parsed as ScopedRecords
      for (const [scope, grades] of Object.entries(scoped.classes)) {
        scoped.classes[scope] = mergeTrimmedKeys(grades)
      }
      if (scoped.legacy) scoped.legacy = mergeTrimmedKeys(scoped.legacy)
      return scoped
    }
    // Formato 1: un único mapa por proyecto. No sabemos de qué clase era cada
    // nota, así que lo preservamos aparte y jamás lo aplicamos a una clase.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const legacy: GradeRecords = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) legacy[key] = value
      }
      return { version: 2, classes: {}, legacy: mergeTrimmedKeys(legacy) }
    }
  } catch (error) {
    throw new Error(
      `El historial de notas está dañado y no se puede interpretar: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return null
}

/**
 * Notas visibles para una clase. Solo los casos manuales pueden consultar el
 * historial anterior a la separación por clases; una clase importada debe
 * empezar aislada para impedir cruces entre grupos.
 */
function scopedView(stored: ScopedRecords | null, classId?: string): GradeRecords {
  const scoped = stored?.classes[classScope(classId)] ?? {}
  return classId ? { ...scoped } : { ...(stored?.legacy ?? {}), ...scoped }
}

export async function getRecords(dir: string, classId?: string): Promise<GradeRecords> {
  return scopedView(await readRecords(dir), classId)
}

/** Fusiona las notas nuevas quedándose con el máximo por alumno y por clase. */
export async function updateRecords(
  dir: string,
  grades: GradeRecords,
  classId?: string
): Promise<PersistenceResult<GradeRecords>> {
  const safeGrades = mergeTrimmedKeys(validatedRecords(grades))
  return serialized(recordsPath(dir), async () => {
    let stored: ScopedRecords
    try {
      stored = (await readRecords(dir)) ?? { version: 2, classes: {} }
    } catch (err) {
      // No se pudo leer el historial: escribir ahora lo sustituiría por solo
      // las notas de esta pasada, que es justo lo que el récord existe para
      // evitar. Mejor avisar y no tocar el fichero.
      return {
        data: safeGrades,
        persisted: false,
        warning: err instanceof Error ? err.message : String(err)
      }
    }
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
      // La copia de seguridad es un extra fuera del proyecto: si falla, el
      // historial ya está guardado donde toca y la escritura no es un fracaso.
      await writeBackup(dir, stored).catch((err) =>
        console.error('No se pudo guardar la copia de seguridad del historial de notas:', err)
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return {
        data: current,
        persisted: false,
        warning: `No se pudo guardar el historial de mejores notas: ${detail}`
      }
    }
    return { data: current, persisted: true }
  })
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
  return serialized(recordsPath(dir), async () => {
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
  })
}

// ---- Copias de seguridad del historial de notas ----

/**
 * El historial de mejores notas vive dentro del proyecto para viajar con él,
 * pero eso significa que borrar o mover la carpeta del examen se lleva las notas
 * por delante, y un «Reiniciar historial» a destiempo también. Tras cada
 * escritura correcta se deja una copia en `userData` (unos pocos KB de JSON, así
 * que no es de lo que no puede vivir en `/`), fuera del proyecto.
 *
 * Una copia por hora y proyecto: el modo examen escribe decenas de veces en un
 * examen de dos horas y no queremos decenas de ficheros, pero tampoco una única
 * copia diaria, que un reinicio por error acabaría sobrescribiendo con el
 * historial ya vacío.
 */
const BACKUPS_KEPT = 48

export const BACKUP_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/

interface BackupFile {
  savedAt: number
  projectDir: string
  records: ScopedRecords
}

function backupsDir(dir: string): string {
  // El hash de la ruta distingue dos proyectos llamados igual en carpetas
  // distintas; el nombre legible delante es para que el profesor reconozca la
  // carpeta si alguna vez la abre.
  const hash = createHash('sha1').update(dir).digest('hex').slice(0, 8)
  return join(app.getPath('userData'), 'copias-notas', `${sanitizeFileName(basename(dir), 'proyecto')}-${hash}`)
}

function currentBackupId(when = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-${pad(when.getHours())}`
}

/** Alumnos distintos con nota guardada en la copia (todas las clases). */
function countStudents(records: ScopedRecords): number {
  const names = new Set<string>(Object.keys(records.legacy ?? {}))
  for (const grades of Object.values(records.classes ?? {})) {
    for (const name of Object.keys(grades)) names.add(name)
  }
  return names.size
}

/**
 * Comprueba que la copia tiene forma de historial v2 y valida cada nota.
 * Devuelve `null` si no lo es y lanza si alguna nota es imposible: una copia
 * dañada no puede entrar en el fichero bueno.
 */
function sanitizeScoped(value: unknown): ScopedRecords | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<ScopedRecords>
  if (!raw.classes || typeof raw.classes !== 'object' || Array.isArray(raw.classes)) return null
  const clean: ScopedRecords = { version: 2, classes: {} }
  for (const [scope, grades] of Object.entries(raw.classes as Record<string, unknown>)) {
    clean.classes[scope] = mergeTrimmedKeys(validatedRecords(grades))
  }
  if (raw.legacy) clean.legacy = mergeTrimmedKeys(validatedRecords(raw.legacy))
  return clean
}

/** Fusiona dos historiales quedándose con la nota más alta de cada alumno. */
function mergeScoped(base: ScopedRecords, extra: ScopedRecords): ScopedRecords {
  const merged: ScopedRecords = { version: 2, classes: { ...base.classes } }
  if (base.legacy) merged.legacy = { ...base.legacy }
  const mergeInto = (current: GradeRecords, grades: GradeRecords): GradeRecords => {
    const out = { ...current }
    for (const [name, grade] of Object.entries(grades)) {
      if (!(name in out) || grade > out[name]) out[name] = grade
    }
    return out
  }
  for (const [scope, grades] of Object.entries(extra.classes)) {
    merged.classes[scope] = mergeInto(merged.classes[scope] ?? {}, grades)
  }
  if (extra.legacy) merged.legacy = mergeInto(merged.legacy ?? {}, extra.legacy)
  return merged
}

/** Lee una copia concreta. `null` si no existe o no tiene forma de historial. */
async function readBackup(dir: string, id: string): Promise<ScopedRecords | null> {
  try {
    const file = JSON.parse(await fs.readFile(join(backupsDir(dir), `${id}.json`), 'utf-8')) as BackupFile
    return sanitizeScoped(file?.records)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

async function writeBackup(dir: string, stored: ScopedRecords): Promise<void> {
  const folder = backupsDir(dir)
  await fs.mkdir(folder, { recursive: true })
  const id = currentBackupId()
  // Se fusiona con la copia que ya hubiera de esta hora: si el profesor reinicia
  // el historial por error y vuelve a corregir en la misma hora, la escritura no
  // puede dejar la copia con el historial ya vacío, que es lo único que quedaba
  // para recuperar las notas.
  const previous = await readBackup(dir, id).catch(() => null)
  const records = previous ? mergeScoped(previous, stored) : stored
  const payload: BackupFile = { savedAt: Date.now(), projectDir: dir, records }
  await writeAtomic(join(folder, `${id}.json`), JSON.stringify(payload, null, 2))
  // Los nombres van en orden cronológico porque llevan ceros delante.
  const files = (await fs.readdir(folder)).filter((f) => f.endsWith('.json')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - BACKUPS_KEPT))) {
    await fs.unlink(join(folder, old)).catch(() => undefined)
  }
}

export async function listRecordBackups(dir: string): Promise<RecordBackup[]> {
  const folder = backupsDir(dir)
  let names: string[]
  try {
    names = await fs.readdir(folder)
  } catch (error) {
    if (isMissing(error)) return []
    throw new Error(
      `No se pudieron leer las copias de seguridad: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const list: RecordBackup[] = []
  for (const name of names.filter((n) => n.endsWith('.json')).sort().reverse()) {
    try {
      const file = JSON.parse(await fs.readFile(join(folder, name), 'utf-8')) as BackupFile
      const records = sanitizeScoped(file?.records)
      if (!records) continue
      list.push({
        id: name.slice(0, -'.json'.length),
        savedAt: Number.isFinite(file?.savedAt) ? file.savedAt : 0,
        students: countStudents(records)
      })
    } catch {
      // Una copia ilegible no puede esconder las demás: es justo cuando hacen falta.
    }
  }
  return list
}

/**
 * Restaura una copia fusionando por máximo, igual que `updateRecords`: recuperar
 * notas antiguas nunca puede rebajar una nota que ya estuviera guardada.
 *
 * Solo toca la clase que se restaura (y el historial legado si es la manual):
 * la copia de la hora también guarda a las otras clases, incluidas notas de
 * práctica que el profesor ya había reiniciado.
 */
export async function restoreRecordBackup(
  dir: string,
  id: string,
  classId?: string
): Promise<PersistenceResult<GradeRecords>> {
  if (!BACKUP_ID_RE.test(id)) throw new Error('Esa copia de seguridad no existe.')
  let backup: ScopedRecords | null
  try {
    backup = await readBackup(dir, id)
  } catch (error) {
    throw new Error(
      `No se pudo leer la copia de seguridad: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!backup) throw new Error('Esa copia de seguridad no existe o está dañada.')

  return serialized(recordsPath(dir), async () => {
    let current: ScopedRecords
    try {
      current = (await readRecords(dir)) ?? { version: 2, classes: {} }
    } catch {
      // El historial del proyecto no se puede interpretar; es precisamente el
      // caso que esta función existe para arreglar, así que se restaura la copia
      // tal cual en vez de negarse a recuperar nada.
      current = { version: 2, classes: {} }
    }
    const scope = classScope(classId)
    const only: ScopedRecords = { version: 2, classes: {} }
    if (backup.classes[scope]) only.classes[scope] = backup.classes[scope]
    if (scope === 'manual' && backup.legacy) only.legacy = backup.legacy
    const restored = mergeScoped(current, only)
    try {
      await writeAtomic(recordsPath(dir), JSON.stringify(restored, null, 2))
    } catch (err) {
      return {
        data: scopedView(restored, classId),
        persisted: false,
        warning: `No se pudo guardar el historial restaurado: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    return { data: scopedView(restored, classId), persisted: true }
  })
}

// ---- Metadatos del proyecto (clase activa, etc.) ----

function metaPath(dir: string): string {
  return join(dir, '.teuton-gui-meta.json')
}

export async function getProjectMeta(dir: string): Promise<ProjectMeta> {
  let raw: string
  try {
    raw = await fs.readFile(metaPath(dir), 'utf-8')
  } catch (error) {
    if (isMissing(error)) return {}
    throw new Error(
      `No se pudieron leer los datos del proyecto: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  try {
    const meta: unknown = JSON.parse(raw)
    // Un array también pasa el `typeof === 'object'`, y al fusionarlo produciría
    // un fichero con claves numéricas haciéndose pasar por ProjectMeta.
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as ProjectMeta) : {}
  } catch {
    return {}
  }
}

export async function setProjectMeta(dir: string, meta: ProjectMeta): Promise<void> {
  await serialized(metaPath(dir), async () => {
    const current = await getProjectMeta(dir)
    await writeAtomic(metaPath(dir), JSON.stringify({ ...current, ...meta }, null, 2))
  })
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
  return serialized(outDir, () => writeCsvFile(outDir, className, classId, content))
}

async function writeCsvFile(
  outDir: string,
  className: string,
  classId: string | undefined,
  content: string
): Promise<string> {
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
