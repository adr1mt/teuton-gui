// Tipos compartidos entre el proceso main y el renderer.
// Describen el contrato IPC y las estructuras de datos que produce el CLI de Teutón.

/** Origen de la ruta activa de `teuton`: configurada a mano o autodetectada. */
export type TeutonPathSource = 'manual' | 'auto'

export interface TeutonStatus {
  installed: boolean
  version: string | null
  path: string | null
  error?: string
  /** De dónde viene `path` (o `null` si no se encontró de ninguna forma). */
  source?: TeutonPathSource | null
  /** Motivo por el que la ruta configurada a mano no es válida (si aplica). */
  manualPathError?: string
}

export interface ProjectFiles {
  /** Ruta absoluta del directorio del proyecto */
  dir: string
  /** Nombre del test (nombre del fichero .rb sin extensión, p.ej. "start") */
  cname: string
  /** Contenido de start.rb (o <cname>.rb) */
  script: string
  /** Contenido de config.yaml (o <cname>.yaml) */
  config: string
  /** Nombre del fichero de script encontrado, p.ej. "start.rb" */
  scriptFile: string
  /** Nombre del fichero de config encontrado, p.ej. "config.yaml" */
  configFile: string
}

export interface RecentProject {
  dir: string
  name: string
  lastOpened: number
}

export interface CheckResult {
  ok: boolean
  /** Salida cruda de `teuton check` */
  output: string
  exitCode: number | null
}

export interface RunOptions {
  /** Subconjunto de casos a ejecutar (índices 1..N). Vacío = todos. */
  cases?: number[]
  cname?: string
}

/** Eventos emitidos durante una ejecución (`teuton run`) hacia el renderer. */
export type RunEvent =
  | { runId: string; type: 'stdout'; data: string }
  | { runId: string; type: 'stderr'; data: string }
  | { runId: string; type: 'exit'; code: number | null; testName: string | null }
  | { runId: string; type: 'error'; message: string }

export interface RunHandle {
  runId: string
}

// ---- Estructuras de resultados (parseadas del JSON de Teutón) ----

export interface TeutonTarget {
  target_id: string
  check: boolean
  score: number
  weight: number
  description: string
  conn_type?: string
  duration?: string | number
  command?: string
  output?: string
  alterations?: string
  expected?: string
  result?: string
}

export interface TeutonGroup {
  title: string
  targets: TeutonTarget[]
}

/** Informe detallado de un caso (case-NN.json). */
export interface CaseReport {
  caseId: string
  config: Record<string, unknown>
  groups: TeutonGroup[]
  results: Record<string, unknown>
  grade: number
  members: string
  raw: unknown
}

/** Fila del resumen (resume.json → cases[]). */
export interface ResumeCase {
  id: string
  members: string
  grade: number
  state: string
  moodleId?: string
  skip?: boolean
  connErrors: Record<string, string>
}

export interface ResumeReport {
  config: Record<string, unknown>
  cases: ResumeCase[]
  results: Record<string, unknown>
}

/** Resultado completo cargado para un proyecto. */
export interface LoadedResults {
  testName: string
  outputDir: string
  /** Clase que produjo estos resultados; viaja con el dato, no con la vista activa. */
  classId?: string | null
  className?: string | null
  resume: ResumeReport | null
  cases: CaseReport[]
  moodleCsv: string | null
  generatedAt: number | null
  /**
   * Incidencias al leer los informes (p.ej. un case-NN.json corrupto). Se
   * muestran en el dashboard: perder un caso en silencio hacía desaparecer al
   * alumno de la matriz y de las analíticas sin ninguna pista de por qué.
   */
  warnings: string[]
}

export type ExportFormat =
  | 'txt'
  | 'html'
  | 'yaml'
  | 'json'
  | 'xml'
  | 'markdown'
  | 'colored_text'

// ---- Nota configurable ----

/**
 * Conversión de la nota de Teutón (0-100) a la escala del profesor.
 * Recta a trozos por (0,0), (passScore, maxGrade/2), (100, maxGrade).
 * Ej.: passScore=70, maxGrade=10 → 70 pts = 5, 100 pts = 10.
 */
export interface GradingSettings {
  passScore: number
  maxGrade: number
}

// ---- Valores globales por defecto ----

/**
 * Valores que se vuelcan a la sección `global:` de un proyecto al importar una
 * clase. Pensado para constantes que se repiten en todas las clases del centro
 * (p.ej. usuario/contraseña de las máquinas de los alumnos), para no tener que
 * teclearlos por alumno ni por proyecto. Mapa campo→valor de Teutón, p.ej.
 * `{ host1_username: 'usuario', host1_password: 'usuario' }`.
 */
export type DefaultGlobals = Record<string, string>

// ---- Clases / alumnos persistentes ----

export interface Student {
  name: string
  moodleId?: string
  /** Campos extra opcionales que se quieran conservar (raro; IPs suelen ir por examen). */
  fields?: Record<string, string>
}

export interface ClassRoster {
  id: string
  name: string
  students: Student[]
  createdAt: number
  updatedAt: number
}

/** Récord histórico de mejor nota (0-100) por alumno, por proyecto. */
export type GradeRecords = Record<string, number>

/** Resultado de una escritura que puede degradarse sin perder el dato en memoria. */
export interface PersistenceResult<T> {
  data: T
  persisted: boolean
  warning?: string
}

/** Metadatos del proyecto que la GUI recuerda entre sesiones. */
export interface ProjectMeta {
  /** ID estable de la clase importada por última vez en este proyecto. */
  activeClassId?: string
  /** Nombre legible de la clase activa (compatibilidad y presentación). */
  activeClass?: string
  /**
   * Clase con la que se hizo la última ejecución (null = sin clase, manual).
   * Permite atribuir «cargar últimos resultados» a la clase correcta aunque el
   * profesor haya cambiado de grupo después de ejecutar. Ausente en proyectos
   * anteriores a esta versión.
   */
  lastRunClassId?: string | null
  /** Nombre congelado junto al ID para rotular/exportar resultados antiguos correctamente. */
  lastRunClassName?: string | null
}

/** API expuesta por el preload en window.teuton. */
export interface TeutonApi {
  detect: () => Promise<TeutonStatus>
  /** Ruta configurada a mano al ejecutable de `teuton` (`null` = autodetección). */
  getTeutonPath: () => Promise<string | null>
  /**
   * Guarda la ruta manual (cadena vacía o `null` = volver a autodetección),
   * invalida las cachés de resolución y devuelve el estado ya recalculado.
   */
  setTeutonPath: (path: string | null) => Promise<TeutonStatus>
  pickDirectory: () => Promise<string | null>
  createProject: (dir: string) => Promise<ProjectFiles>
  openProject: (dir: string, cname?: string) => Promise<ProjectFiles>
  saveProject: (files: Pick<ProjectFiles, 'dir' | 'scriptFile' | 'configFile' | 'script' | 'config'>) => Promise<void>
  check: (dir: string, cname?: string) => Promise<CheckResult>
  run: (dir: string, options: RunOptions, runId: string) => Promise<RunHandle>
  cancelRun: (runId: string) => Promise<void>
  onRunEvent: (cb: (event: RunEvent) => void) => () => void
  loadResults: (dir: string, testName?: string) => Promise<LoadedResults>
  exportAs: (dir: string, format: ExportFormat) => Promise<CheckResult>
  saveFileDialog: (defaultName: string, content: string) => Promise<string | null>
  recentProjects: () => Promise<RecentProject[]>
  removeRecent: (dir: string) => Promise<RecentProject[]>
  /** Cadena vacía si se abrió correctamente; mensaje del sistema si falló. */
  openPath: (target: string) => Promise<string>
  openExternal: (url: string) => Promise<void>

  // Ajustes de nota (globales)
  getGrading: () => Promise<GradingSettings>
  setGrading: (grading: GradingSettings) => Promise<void>

  // Valores globales por defecto (usuario/contraseña de las máquinas, etc.)
  getDefaultGlobals: () => Promise<DefaultGlobals>
  setDefaultGlobals: (globals: DefaultGlobals) => Promise<void>

  // Clases / alumnos persistentes
  listClasses: () => Promise<ClassRoster[]>
  saveClass: (roster: ClassRoster) => Promise<ClassRoster[]>
  deleteClass: (id: string) => Promise<ClassRoster[]>

  // Récord histórico de notas por proyecto
  /** Los récords se aíslan por clase para que dos grupos del mismo examen no se mezclen. */
  getRecords: (dir: string, classId?: string) => Promise<GradeRecords>
  updateRecords: (dir: string, grades: GradeRecords, classId?: string) => Promise<PersistenceResult<GradeRecords>>
  /** Borra el historial de mejores notas de la clase indicada (o del espacio manual). */
  resetRecords: (dir: string, classId?: string) => Promise<PersistenceResult<GradeRecords>>

  // Metadatos del proyecto (clase activa, etc.)
  getProjectMeta: (dir: string) => Promise<ProjectMeta>
  setProjectMeta: (dir: string, meta: ProjectMeta) => Promise<void>

  /**
   * Escribe el CSV de Moodle de una clase en <proyecto>/informes/moodle-<clase>.csv.
   * Devuelve la ruta escrita. Un fichero por clase: no se pisan entre grupos.
   */
  writeClassCsv: (dir: string, className: string, classId: string | undefined, content: string) => Promise<string>
}
