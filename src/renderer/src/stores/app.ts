import { create } from 'zustand'
import {
  flushPendingSymbols,
  INITIAL_SCAN_STATE,
  scanProgressChunk,
  type ProgressScanState
} from '../lib/progress'
import type { StallMap } from '../lib/stall'
import type {
  DefaultGlobals,
  GradeRecords,
  GradingSettings,
  LoadedResults,
  ProjectFiles,
  TeutonStatus
} from '../../../shared/types'

export type View =
  | 'home'
  | 'editor'
  | 'run'
  | 'dashboard'
  | 'analytics'
  | 'classes'
  | 'settings'
  | 'help'
export type Theme = 'dark' | 'light'
export type RunStatus = 'idle' | 'running' | 'done' | 'failed'

export interface RunState {
  status: RunStatus
  /** Salida reciente de la ejecución; se acota para no degradar la interfaz. */
  log: string
  runId: string | null
  testName: string | null
  /** Contexto congelado al iniciar: evita atribuir el resultado a otra clase. */
  projectDir: string | null
  classId: string | null
  className: string | null
  /** Solo algunos alumnos (`--case`): no puede reescribir el CSV de la clase. */
  partial: boolean
  /** Hora (ms) a la que arrancó; el vigilante del modo examen la usa para detectar cuelgues. */
  startedAt: number | null
  /** Nº total de comprobaciones esperadas (para la barra de progreso), o null si no se pudo calcular. */
  expectedTotal: number | null
  /** Comprobaciones completadas, contadas de forma incremental por `appendRunLine` (ver `scanProgressChunk`). */
  done: number
  /** Estado interno del escáner de progreso; persiste entre chunks de stdout dentro de la misma ejecución. */
  scan: ProgressScanState
}

export interface MonitorState {
  active: boolean
  intervalMin: number
  nextRunAt: number | null
  cycles: number
}

interface AppState {
  theme: Theme
  view: View
  teutonStatus: TeutonStatus | null
  project: ProjectFiles | null
  scriptDraft: string
  configDraft: string
  dirty: boolean
  results: LoadedResults | null
  loadingResults: boolean
  grading: GradingSettings
  /** Valores que se vuelcan a global: al importar una clase (usuario/contraseña…). */
  defaultGlobals: DefaultGlobals
  records: GradeRecords
  /** Ciclos seguidos sin avanzar, por alumno. Ver lib/stall.ts. */
  stalls: StallMap
  run: RunState
  monitor: MonitorState
  /** Clase importada en el proyecto actual (para el CSV por clase). */
  activeClass: string | null
  /** ID estable de la clase activa; separa los récords de grupos distintos. */
  activeClassId: string | null
  /**
   * Filtro «solo los que requieren atención» del listado de Resultados. Vive en
   * el store, no en la vista, porque Analíticas lo activa antes de saltar allí:
   * la lista de atención prioritaria se recorta y el «ver todos» tiene que
   * aterrizar en Resultados ya filtrado, no en la clase entera.
   */
  attentionOnly: boolean
  /** Último fallo operativo que requiere atención del usuario. */
  operationalError: string | null
  /**
   * Modo proyector: todo un 25 % más grande y los datos de máquina tapados.
   * Vive en el store (no en una vista) porque afecta a la app entera.
   */
  projector: boolean

  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setView: (view: View) => void
  setTeutonStatus: (status: TeutonStatus) => void
  setProject: (project: ProjectFiles) => void
  closeProject: () => void
  setScriptDraft: (v: string) => void
  setConfigDraft: (v: string) => void
  markSaved: () => void
  setResults: (r: LoadedResults | null) => void
  setLoadingResults: (v: boolean) => void
  setGrading: (g: GradingSettings) => void
  setDefaultGlobals: (g: DefaultGlobals) => void
  setRecords: (r: GradeRecords) => void
  setStalls: (s: StallMap) => void
  // Ejecución (estado global, persiste al cambiar de pestaña)
  setRun: (patch: Partial<RunState>) => void
  appendRunLine: (line: string) => void
  flushRunProgress: () => void
  resetRun: () => void
  setMonitor: (patch: Partial<MonitorState>) => void
  setActiveClass: (name: string | null, id?: string | null) => void
  setAttentionOnly: (v: boolean) => void
  setOperationalError: (message: string | null) => void
  toggleProjector: () => void
}

const savedTheme: Theme = localStorage.getItem('teuton-theme') === 'light' ? 'light' : 'dark'
const savedProjector = localStorage.getItem('teuton-proyector') === '1'

/**
 * La clase `dark` se escribe aquí, junto al cambio de estado, y no en un efecto
 * de `App`. `useChartColors` lee las variables CSS **durante el render**: si la
 * clase llegara un efecto más tarde, Recharts pintaría un ciclo entero con los
 * colores del tema anterior y las etiquetas de las Analíticas salían en tinta
 * oscura sobre fondo oscuro hasta el siguiente re-render.
 *
 * El guard de `document` es para los tests, que importan este módulo en Node.
 */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }
}
applyTheme(savedTheme)

/**
 * El tamaño del modo proyector es un cambio del tipo base del documento, no una
 * clase por componente: toda la interfaz está medida en `rem`, así que subir la
 * raíz agranda por igual texto, iconos, márgenes y altura de fila. Hacerlo
 * componente a componente habría dejado la mitad de la pantalla sin crecer.
 */
function applyProjector(on: boolean): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('proyector', on)
  }
}
applyProjector(savedProjector)

const IDLE_RUN: RunState = {
  status: 'idle', log: '', runId: null, testName: null,
  projectDir: null, classId: null, className: null, partial: false, startedAt: null, expectedTotal: null,
  done: 0, scan: INITIAL_SCAN_STATE
}

export const useApp = create<AppState>((set, get) => ({
  theme: savedTheme,
  view: 'home',
  teutonStatus: null,
  project: null,
  scriptDraft: '',
  configDraft: '',
  dirty: false,
  results: null,
  loadingResults: false,
  grading: { passScore: 70, maxGrade: 10 },
  defaultGlobals: { host1_username: 'usuario', host1_password: 'usuario' },
  records: {},
  stalls: {},
  run: { ...IDLE_RUN },
  monitor: { active: false, intervalMin: 5, nextRunAt: null, cycles: 0 },
  activeClass: null,
  activeClassId: null,
  attentionOnly: false,
  operationalError: null,
  projector: savedProjector,

  setTheme: (theme) => {
    localStorage.setItem('teuton-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('teuton-theme', next)
    applyTheme(next)
    set({ theme: next })
  },
  setView: (view) => set({ view }),
  setTeutonStatus: (teutonStatus) => set({ teutonStatus }),
  setProject: (project) =>
    set({
      project,
      scriptDraft: project.script,
      configDraft: project.config,
      dirty: false,
      results: null,
      records: {},
      stalls: {},
      run: { ...IDLE_RUN },
      monitor: { active: false, intervalMin: get().monitor.intervalMin, nextRunAt: null, cycles: 0 },
      activeClass: null,
      activeClassId: null,
      attentionOnly: false,
      operationalError: null
    }),
  closeProject: () =>
    set({
      project: null,
      scriptDraft: '',
      configDraft: '',
      dirty: false,
      results: null,
      records: {},
      stalls: {},
      run: { ...IDLE_RUN },
      monitor: { active: false, intervalMin: get().monitor.intervalMin, nextRunAt: null, cycles: 0 },
      activeClass: null,
      activeClassId: null,
      attentionOnly: false,
      operationalError: null,
      view: 'home'
    }),
  setScriptDraft: (v) => set({ scriptDraft: v, dirty: true }),
  setConfigDraft: (v) => set({ configDraft: v, dirty: true }),
  markSaved: () => {
    const { project, scriptDraft, configDraft } = get()
    if (project) {
      set({
        project: { ...project, script: scriptDraft, config: configDraft },
        dirty: false
      })
    }
  },
  setResults: (results) => set({ results }),
  setLoadingResults: (loadingResults) => set({ loadingResults }),
  setGrading: (grading) => set({ grading }),
  setDefaultGlobals: (defaultGlobals) => set({ defaultGlobals }),
  setRecords: (records) => set({ records }),
  setStalls: (stalls) => set({ stalls }),
  setRun: (patch) => set((s) => ({ run: { ...s.run, ...patch } })),
  appendRunLine: (line) => set((s) => {
    const maxLogChars = 500_000
    const joined = s.run.log + line
    // Conservamos el final, que contiene el diagnóstico y el resultado más útil.
    const log = joined.length > maxLogChars
      ? `[Salida anterior truncada; se conservan los últimos ${maxLogChars.toLocaleString('es-ES')} caracteres]\n${joined.slice(-maxLogChars)}`
      : joined
    // El progreso se cuenta de forma incremental sobre el chunk NUEVO (`line`),
    // nunca sobre `log` (que se trunca): así el truncado del texto de consola
    // no afecta a la barra de progreso, y no hace falta reescanear con regex
    // el buffer entero en cada chunk. El estado del escáner (fase + línea
    // pendiente) viaja en `s.run.scan` para sobrevivir entre chunks.
    const { state: scan, delta } = scanProgressChunk(s.run.scan, line)
    return { run: { ...s.run, log, done: s.run.done + delta, scan } }
  }),
  // Al terminar de forma anómala (cancelado, caído) puede quedar un símbolo
  // retenido en `run.scan.pending` por ambigüedad con un marcador que ya
  // nunca va a llegar a completarse; ver `flushPendingSymbols`.
  flushRunProgress: () => set((s) => {
    const extra = flushPendingSymbols(s.run.scan)
    if (extra === 0) return {}
    return { run: { ...s.run, done: s.run.done + extra, scan: { ...s.run.scan, pending: '' } } }
  }),
  resetRun: () => set({ run: { ...IDLE_RUN } }),
  setMonitor: (patch) => set((s) => ({ monitor: { ...s.monitor, ...patch } })),
  // Cambiar de grupo reinicia el contador de «sin avanzar»: son otros alumnos,
  // y un nombre repetido entre clases arrastraría los ciclos del grupo anterior.
  setActiveClass: (activeClass, activeClassId = null) =>
    set((s) => (s.activeClassId === activeClassId ? { activeClass } : { activeClass, activeClassId, stalls: {} })),
  setAttentionOnly: (attentionOnly) => set({ attentionOnly }),
  setOperationalError: (operationalError) => set({ operationalError }),
  toggleProjector: () => {
    const next = !get().projector
    localStorage.setItem('teuton-proyector', next ? '1' : '0')
    applyProjector(next)
    set({ projector: next })
  }
}))
