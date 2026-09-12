import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  Download,
  Search,
  FolderOpen,
  Users,
  ChevronRight,
  RefreshCw,
  Table2,
  LayoutGrid,
  Trophy,
  History,
  ArchiveRestore,
  ArrowUpDown,
  RotateCw,
  MoreVertical,
  Play,
  Check,
  X,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Filter,
  Hourglass
} from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import {
  Button,
  Card,
  Input,
  Spinner,
  ConfirmDialog,
  Menu,
  MenuItem,
  Meter,
  MetaChip,
  Segmented,
  SegmentedItem,
  ViewHeader
} from '../components/ui'
import { cn } from '../lib/utils'
import {
  studentRows,
  computeKpis,
  buildMatrix,
  studentsNeedingAttention,
  type StudentRow
} from '../lib/analytics'
import { bestScore, formatGrade, isPass, passColor } from '../lib/grading'
import { parseConfig } from '../lib/config'
import { shortNameMap } from '../lib/names'
import { stalledCycles, type StallMap } from '../lib/stall'
import { buildMoodleCsv } from '../lib/moodleCsv'
import { reloadLatestResults, caseIndexFor, reevaluateStudent } from '../lib/run'
import { sanitizeFileName } from '../../../shared/sanitize'
import StudentDetail from '../components/StudentDetail'
import { MonitorBanner } from '../components/Monitor'
import { validateResultIdentity } from '../lib/integrity'
import type { RecordBackup } from '../../../shared/types'

type ViewMode = 'list' | 'matrix'
type Grading = { passScore: number; maxGrade: number }

/**
 * Órdenes ofrecidos, como frases enteras. Sustituyen a las cabeceras de tabla
 * tri-estado: la tabla de siete columnas a 14px no se leía desde el fondo del
 * aula, y su tercer clic (volver al orden natural) no lo descubría nadie.
 */
type SortKey = 'members' | 'passed' | 'connErrors' | 'grade'
type SortSpec = { key: SortKey; dir: 'asc' | 'desc' } | null
const SORTS: { id: string; label: string; spec: SortSpec }[] = [
  { id: 'natural', label: t.dashboard.sortNatural, spec: null },
  { id: 'name', label: t.dashboard.sortName, spec: { key: 'members', dir: 'asc' } },
  { id: 'worst', label: t.dashboard.sortWorst, spec: { key: 'grade', dir: 'asc' } },
  { id: 'best', label: t.dashboard.sortBest, spec: { key: 'grade', dir: 'desc' } },
  { id: 'behind', label: t.dashboard.sortBehind, spec: { key: 'passed', dir: 'asc' } },
  { id: 'conn', label: t.dashboard.sortConn, spec: { key: 'connErrors', dir: 'desc' } }
]

export default function Dashboard() {
  const {
    results,
    project,
    configDraft,
    loadingResults,
    grading,
    records,
    stalls,
    activeClass,
    activeClassId,
    setRecords,
    setView,
    attentionOnly,
    setAttentionOnly
  } = useApp()
  const monitorActive = useApp((s) => s.monitor.active)
  // Guardamos el id, no la fila: `rows` se regenera en cada ciclo del modo
  // examen y una copia congelada dejaría al profesor mirando datos viejos.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [mode, setMode] = useState<ViewMode>('list')
  const [sortId, setSortId] = useState('natural')
  const [confirmReset, setConfirmReset] = useState(false)
  const [backups, setBackups] = useState<RecordBackup[] | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [confirmExport, setConfirmExport] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const rows = useMemo(() => (results ? studentRows(results) : []), [results])
  const kpis = useMemo(() => computeKpis(rows, grading.passScore), [rows, grading.passScore])
  const attention = useMemo(
    () => studentsNeedingAttention(rows, grading.passScore, stalls),
    [rows, grading.passScore, stalls]
  )
  const identityIssues = useMemo(
    () => (results ? validateResultIdentity(results) : []),
    [results]
  )

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const base = attentionOnly ? attention : rows
    return needle ? base.filter((r) => r.members.toLowerCase().includes(needle)) : base
  }, [rows, attention, attentionOnly, filter])

  // Detecta resultados obsoletos: alumnos en los resultados que ya no están en la
  // configuración actual (p.ej. tras importar otra clase sin re-ejecutar aún).
  const staleResults = useMemo(() => {
    if (rows.length === 0) return false
    const current = new Set(
      parseConfig(configDraft).config.cases.map((c) => String(c.tt_members ?? ''))
    )
    return rows.some((r) => !current.has(r.members))
  }, [rows, configDraft])
  const resultClassId = results?.classId === undefined ? activeClassId : results.classId
  const resultClassName = results?.className === undefined ? activeClass : results.className
  const classMismatch = results?.classId !== undefined && results.classId !== activeClassId
  const exportBlocked = staleResults || classMismatch || identityIssues.length > 0

  const selectStudent = useCallback((r: StudentRow) => setSelectedId(r.id), [])

  async function reload() {
    if (!project) return
    await reloadLatestResults()
    setSelectedId(null)
  }

  async function doResetRecords() {
    setConfirmReset(false)
    if (!project) return
    try {
      const outcome = await window.teuton.resetRecords(project.dir, resultClassId ?? undefined)
      setRecords(outcome.data)
      if (!outcome.persisted) useApp.getState().setOperationalError(outcome.warning || 'No se pudo guardar el reinicio del historial.')
    } catch (cause) {
      useApp.getState().setOperationalError(`No se pudo reiniciar el historial: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  /**
   * Abre la lista de copias. Se pide al abrir, no al montar la vista: es una
   * acción excepcional y no debe tocar el disco en cada ciclo del modo examen.
   */
  async function openRestore() {
    if (!project) return
    try {
      const list = await window.teuton.listRecordBackups(project.dir)
      if (list.length === 0) {
        setNotice(t.dashboard.restoreEmpty)
        window.setTimeout(() => setNotice(null), 6000)
        return
      }
      setRestoreId(list[0].id)
      setBackups(list)
    } catch (cause) {
      useApp.getState().setOperationalError(`No se pudieron leer las copias de seguridad: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function doRestore() {
    const id = restoreId
    setBackups(null)
    if (!project || !id) return
    try {
      const outcome = await window.teuton.restoreRecordBackup(project.dir, id, resultClassId ?? undefined)
      setRecords(outcome.data)
      if (outcome.persisted) {
        setNotice(`${t.dashboard.restoreDone} · ${Object.keys(outcome.data).length} ${t.dashboard.restoreStudents}`)
        window.setTimeout(() => setNotice(null), 6000)
      } else {
        useApp.getState().setOperationalError(outcome.warning || 'No se pudo guardar el historial restaurado.')
      }
    } catch (cause) {
      useApp.getState().setOperationalError(`No se pudieron restaurar las notas: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function doExportMoodle() {
    setConfirmExport(false)
    if (!results) return
    if (exportBlocked) {
      useApp.getState().setOperationalError('La exportación está bloqueada hasta corregir la identidad de los alumnos o volver a ejecutar la clase activa.')
      return
    }
    // Usa SIEMPRE la mejor nota (récord): si un alumno acabó, sacó un 10 y apagó
    // la máquina, no debe quedarle un 0. El nombre del fichero lleva la clase
    // activa para que los CSV de distintos grupos coexistan.
    try {
      const csv = buildMoodleCsv(results, records, grading)
      const name = resultClassName || results.testName || 'teuton'
      const safe = sanitizeFileName(name, 'teuton')
      const saved = await window.teuton.saveFileDialog(`moodle-${safe}.csv`, csv)
      if (saved) {
        setNotice(`${t.dashboard.exported} · ${rows.length} ${t.dashboard.exportedDetail}`)
        window.setTimeout(() => setNotice(null), 6000)
      }
    } catch (cause) {
      useApp.getState().setOperationalError(`No se pudo exportar el CSV: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  function exportMoodle() {
    // Un CSV mal exportado acaba en el expediente del alumno: si sabemos que los
    // datos no cuadran, se avisa antes de escribirlo.
    if (exportBlocked) {
      useApp.getState().setOperationalError('No se puede exportar: los resultados no corresponden inequívocamente a la clase activa.')
    } else if (results && results.warnings.length > 0) setConfirmExport(true)
    else void doExportMoodle()
  }

  function openOutputFolder() {
    if (results?.outputDir) {
      void window.teuton.openPath(results.outputDir).then((message) => {
        if (message) useApp.getState().setOperationalError(`No se pudo abrir la carpeta: ${message}`)
      }).catch((cause) => {
        useApp.getState().setOperationalError(`No se pudo abrir la carpeta: ${cause instanceof Error ? cause.message : String(cause)}`)
      })
    }
  }

  // Solo mostramos el spinner a pantalla completa en la carga inicial, no en cada
  // refresco del modo examen (evita parpadeos molestos al proyectar).
  if (loadingResults && !results) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> {t.common.loading}
      </div>
    )
  }

  if (!results || rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
        <Users className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-center text-sm text-muted-foreground">{t.dashboard.noResults}</p>
        {results && results.warnings.length > 0 && (
          <WarningsBanner warnings={results.warnings} className="max-w-lg" />
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setView('run')}>
            <Play className="h-4 w-4" /> {t.dashboard.goToRun}
          </Button>
          {project && (
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="h-4 w-4" /> {t.run.loadResults}
            </Button>
          )}
          {/* También aquí: el caso peor —carpeta del examen borrada— deja la
              vista vacía, y es justo cuando hay que poder restaurar las notas. */}
          {project && (
            <Button variant="ghost" size="sm" onClick={() => void openRestore()}>
              <ArchiveRestore className="h-4 w-4" /> {t.dashboard.restoreRecords}
            </Button>
          )}
        </div>
        {notice && <p className="max-w-md text-center text-xs text-muted-foreground">{notice}</p>}
        <RestoreDialog
          backups={backups}
          selected={restoreId}
          onSelect={setRestoreId}
          onConfirm={() => void doRestore()}
          onCancel={() => setBackups(null)}
        />
      </div>
    )
  }

  const selectedRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null

  if (selectedRow) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* El banner del modo examen vive por encima del detalle: entrar a ver a
            un alumno no debe dejar al profesor sin cuenta atrás ni progreso. */}
        {monitorActive && <MonitorBanner />}
        <div className="min-h-0 flex-1">
          <StudentDetail row={selectedRow} onBack={() => setSelectedId(null)} />
        </div>
      </div>
    )
  }

  const sort = SORTS.find((s) => s.id === sortId)?.spec ?? null
  const connStudents = rows.filter((r) => r.connErrors > 0).length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader
        title={t.dashboard.title}
        meta={
          <>
            {resultClassName && (
              <MetaChip icon={<GraduationCap className="h-3.5 w-3.5" />}>{resultClassName}</MetaChip>
            )}
            <span className="tnum text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? t.dashboard.student : t.dashboard.students}
              {results.generatedAt && (
                <>
                  {' · '}
                  {t.dashboard.generatedAt}{' '}
                  {new Date(results.generatedAt).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </>
              )}
            </span>
          </>
        }
        actions={
          <>
            <div className="relative w-44">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t.dashboard.filter}
                placeholder={t.dashboard.filter}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            {mode === 'list' && (
              <Menu
                label={t.dashboard.sortLabel}
                icon={<ArrowUpDown className="h-4 w-4" />}
                title={`${t.dashboard.sortLabel}: ${SORTS.find((s) => s.id === sortId)?.label}`}
              >
                {(close) => (
                  <>
                    {SORTS.map((s) => (
                      <MenuItem
                        key={s.id}
                        icon={
                          <Check
                            className={cn('h-4 w-4', s.id !== sortId && 'opacity-0')}
                            aria-hidden
                          />
                        }
                        onClick={() => {
                          close()
                          setSortId(s.id)
                        }}
                      >
                        {s.label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
            )}
            <Segmented>
              <SegmentedItem active={mode === 'list'} onClick={() => setMode('list')}>
                <Table2 className="h-3.5 w-3.5" /> {t.dashboard.listView}
              </SegmentedItem>
              <SegmentedItem active={mode === 'matrix'} onClick={() => setMode('matrix')}>
                <LayoutGrid className="h-3.5 w-3.5" /> {t.dashboard.matrixView}
              </SegmentedItem>
            </Segmented>
            <Button
              variant="ghost"
              size="sm"
              onClick={reload}
              title={t.dashboard.reload}
              aria-label={t.dashboard.reloadResults}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={exportMoodle} aria-disabled={exportBlocked} title={exportBlocked ? 'Corrige los avisos antes de exportar' : undefined}>
              <Download className="h-4 w-4" /> {t.dashboard.exportMoodle}
            </Button>
            {/* Carpeta y, sobre todo, «Reiniciar historial» salen de la barra: un
                borrado irreversible no puede estar pegado a «Recargar». */}
            <Menu label={t.dashboard.more} icon={<MoreVertical className="h-4 w-4" />}>
              {(close) => (
                <>
                  <MenuItem
                    icon={<FolderOpen className="h-4 w-4" />}
                    onClick={() => {
                      close()
                      openOutputFolder()
                    }}
                  >
                    {t.dashboard.openFolder}
                  </MenuItem>
                  <MenuItem
                    icon={<ArchiveRestore className="h-4 w-4" />}
                    onClick={() => {
                      close()
                      void openRestore()
                    }}
                  >
                    {t.dashboard.restoreRecords}
                  </MenuItem>
                  {Object.keys(records).length > 0 && (
                    <MenuItem
                      destructive
                      icon={<History className="h-4 w-4" />}
                      onClick={() => {
                        close()
                        setConfirmReset(true)
                      }}
                    >
                      {t.dashboard.resetRecords}
                    </MenuItem>
                  )}
                </>
              )}
            </Menu>
          </>
        }
      />

      <MonitorBanner />

      {/* El marcador. Tres lecturas y nada más: es lo que se ve desde el fondo
          del aula, y por eso vive fuera del scroll — no se puede perder. */}
      <div className="grid shrink-0 grid-cols-3 border-b border-border">
        <Reading
          label={t.dashboard.passRate}
          value={`${kpis.passCount}/${kpis.count}`}
          hint={`${kpis.passRate}%`}
          tone={kpis.passRate >= 50 ? 'pass' : 'fail'}
        />
        <Reading
          label={t.dashboard.average}
          value={formatGrade(kpis.average, grading)}
          hint={`${kpis.average} ${t.analytics.teutonPoints}`}
          tone={isPass(kpis.average, grading) ? 'pass' : 'fail'}
          className="border-l border-border"
        />
        <Reading
          label={t.dashboard.attention}
          value={attention.length === 0 ? t.dashboard.allGood : attention.length}
          hint={
            connStudents > 0
              ? `${connStudents} ${t.dashboard.withConnIssues}`
              : attentionOnly
                ? t.dashboard.attentionHintActive
                : t.dashboard.attentionHint
          }
          tone={attention.length > 0 ? 'fail' : 'pass'}
          className="border-l border-border"
          onClick={() => setAttentionOnly(!attentionOnly)}
          active={attentionOnly}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
        {notice && (
          <Banner tone="success" icon={<CheckCircle2 className="h-4 w-4 shrink-0" />}>
            {notice}
          </Banner>
        )}
        {results.warnings.length > 0 && <WarningsBanner warnings={results.warnings} />}
        {identityIssues.length > 0 && (
          <Banner tone="warning" icon={<AlertTriangle className="h-4 w-4 shrink-0" />}>
            <strong>Exportación bloqueada.</strong>
            <ul className="mt-1 list-disc pl-4">
              {identityIssues.map((issue) => <li key={`${issue.kind}-${issue.message}`}>{issue.message}</li>)}
            </ul>
          </Banner>
        )}
        {classMismatch && (
          <Banner tone="warning" icon={<AlertTriangle className="h-4 w-4 shrink-0" />}>
            Estos resultados pertenecen a «{resultClassName || 'ejecución manual'}», no a la clase activa. Vuelve a ejecutar antes de exportar.
          </Banner>
        )}
        {staleResults && (
          <Banner tone="warning" icon={<AlertTriangle className="h-4 w-4 shrink-0" />}>
            {t.run.staleResults} {t.dashboard.staleHint}
          </Banner>
        )}

        {attentionOnly && (
          <button
            onClick={() => setAttentionOnly(false)}
            className="mb-4 flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.dashboard.attention} · {t.dashboard.clearFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {mode === 'list' ? (
          <Roster
            rows={visible}
            sort={sort}
            records={records}
            stalls={stalls}
            grading={grading}
            onSelect={selectStudent}
            emptyLabel={attentionOnly ? t.dashboard.noFailing : '—'}
          />
        ) : (
          <MatrixView
            rows={rows}
            visibleIds={new Set(visible.map((r) => r.id))}
            records={records}
            grading={grading}
            onSelect={selectStudent}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        destructive
        title={t.dashboard.resetTitle}
        confirmLabel={t.dashboard.resetConfirm}
        onConfirm={() => void doResetRecords()}
        onCancel={() => setConfirmReset(false)}
      >
        <p>
          {resultClassName
            ? `${t.dashboard.resetScopeClass} «${resultClassName}»`
            : t.dashboard.resetScopeManual}
          {': '}
          <strong className="text-foreground">
            {Object.keys(records).length} {t.dashboard.resetCount}
          </strong>
          .
        </p>
        <p>{t.dashboard.resetConsequence}</p>
      </ConfirmDialog>

      <RestoreDialog
        backups={backups}
        selected={restoreId}
        onSelect={setRestoreId}
        onConfirm={() => void doRestore()}
        onCancel={() => setBackups(null)}
      />

      <ConfirmDialog
        open={confirmExport}
        title={t.dashboard.exportWarnTitle}
        confirmLabel={t.dashboard.exportAnyway}
        onConfirm={() => void doExportMoodle()}
        onCancel={() => setConfirmExport(false)}
      >
        {results.warnings.length > 0 && <p>{t.dashboard.exportWarnReports}</p>}
      </ConfirmDialog>
    </div>
  )
}

/**
 * Lista de copias de seguridad del historial, para elegir una. Vive aquí porque
 * se usa en dos sitios: la vista con resultados y la vista vacía, que es donde
 * acaba el profesor si ha perdido la carpeta del examen.
 */
function RestoreDialog({
  backups,
  selected,
  onSelect,
  onConfirm,
  onCancel
}: {
  backups: RecordBackup[] | null
  selected: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      open={backups !== null}
      title={t.dashboard.restoreTitle}
      confirmLabel={t.dashboard.restoreConfirm}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t.dashboard.restoreHint}</p>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {(backups ?? []).map((b) => (
          <label
            key={b.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <input
              type="radio"
              name="copia-notas"
              checked={selected === b.id}
              onChange={() => onSelect(b.id)}
            />
            <span className="tnum text-foreground">{backupLabel(b)}</span>
            <span className="tnum ml-auto text-xs">
              {b.students} {t.dashboard.restoreStudents}
            </span>
          </label>
        ))}
      </div>
    </ConfirmDialog>
  )
}

/**
 * Fecha y hora de una copia, en lo que el profesor reconoce. Si la copia no
 * trae sello de tiempo se muestra su identificador, que ya es la hora.
 */
function backupLabel(b: RecordBackup): string {
  if (!b.savedAt) return b.id
  return new Date(b.savedAt).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Una lectura del marcador. Sin tarjeta: el filete vertical ya separa las tres,
 * y una caja alrededor de una cifra de 44px solo le roba contraste. Cuando la
 * lectura además filtra la lista es un `<button>` con `aria-pressed`.
 */
function Reading({
  label,
  value,
  hint,
  tone,
  className,
  onClick,
  active
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'pass' | 'fail'
  className?: string
  onClick?: () => void
  active?: boolean
}) {
  // La cifra a la izquierda y el rótulo a su lado, en vez de apilados: el marcador
  // pasa de ~170px de alto a ~80px sin encoger el número, que es el que se lee
  // desde el fondo del aula. Ese alto se lo queda la tabla, que es lo que se mira.
  const body = (
    <>
      <div
        className={cn(
          'tnum shrink-0 text-marker font-bold leading-none tracking-tight 2xl:text-marker-lg',
          tone === 'pass' && 'text-success-strong',
          tone === 'fail' && 'text-destructive-strong'
        )}
      >
        {value}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          <span className="truncate">{label}</span>
          {/* El embudo es la única señal de «esto filtra» que sobrevive al
              recorte del rótulo de ayuda: sin él, el recuadro se pulsa pero no
              lo parece. Se refuerza con cursor-pointer y el subrayado al pasar. */}
          {onClick && <Filter className="h-3 w-3 shrink-0 text-primary" aria-hidden />}
        </div>
        {hint && (
          <div
            className={cn(
              'tnum mt-1 truncate text-xs text-muted-foreground',
              onClick && 'group-hover:text-primary group-hover:underline'
            )}
          >
            {hint}
          </div>
        )}
      </div>
    </>
  )

  if (!onClick) {
    return <div className={cn('flex items-center gap-3 px-6 py-4', className)}>{body}</div>
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group flex cursor-pointer items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        active && 'bg-primary/10',
        className
      )}
    >
      {body}
    </button>
  )
}

/** Franja de aviso. Un solo markup para los tres tonos y los dos estados. */
function Banner({
  tone,
  icon,
  children,
  className
}: {
  tone: 'success' | 'warning'
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-left text-dense',
        tone === 'success'
          ? 'border-success/40 bg-success/10 text-success-strong'
          : 'border-warning/40 bg-warning/10 text-warning-strong',
        className
      )}
    >
      {icon}
      <div>{children}</div>
    </div>
  )
}

/** Aviso de informes ilegibles. Único markup para el estado vacío y la vista normal. */
function WarningsBanner({ warnings, className }: { warnings: string[]; className?: string }) {
  return (
    <Banner
      tone="warning"
      icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      className={className}
    >
      {t.dashboard.reportWarnings}
      <ul className="mt-1 list-disc pl-4">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Banner>
  )
}

/**
 * El listado de la clase, dimensionado para leerse a varios metros: nombre a
 * 17px, nota a 28px y un medidor de objetivos superados que se entiende antes
 * que cualquier cifra. Sustituye a la tabla de siete columnas — el caso y los
 * puntos crudos de Teutón, que solo importan al depurar, siguen estando en el
 * detalle del alumno. En pantalla ancha va a dos columnas para que una clase de
 * treinta entre sin scroll.
 */
function Roster({
  rows,
  sort,
  records,
  stalls,
  grading,
  onSelect,
  emptyLabel
}: {
  rows: StudentRow[]
  sort: SortSpec
  records: Record<string, number>
  stalls: StallMap
  grading: Grading
  onSelect: (r: StudentRow) => void
  emptyLabel: string
}) {
  const configDraft = useApp((s) => s.configDraft)
  const running = useApp((s) => s.run.status === 'running')

  // Índice de caso por fila para el botón «Reevaluar» (null = alumno que ya no
  // está en el config actual: no se ofrece el botón).
  const caseIdxById = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const r of rows) m.set(r.id, caseIndexFor(r, configDraft))
    return m
  }, [rows, configDraft])

  const displayed = useMemo(() => {
    if (!sort) return rows
    const val = (r: StudentRow): number | string =>
      sort.key === 'members' ? r.members.toLowerCase() : r[sort.key]
    return [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb), 'es') : va - (vb as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort])

  if (displayed.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="grid grid-cols-1 gap-x-8 xl:grid-cols-2">
      {displayed.map((r) => (
        <RosterRow
          key={r.id}
          row={r}
          record={records[r.members]}
          stalled={stalledCycles(stalls, r, grading.passScore)}
          grading={grading}
          canReevaluate={caseIdxById.get(r.id) != null}
          running={running}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

function RosterRow({
  row,
  record,
  stalled,
  grading,
  canReevaluate,
  running,
  onSelect
}: {
  row: StudentRow
  record?: number
  /** Ciclos seguidos sin avanzar; 0 = no hay nada que avisar. */
  stalled: number
  grading: Grading
  canReevaluate: boolean
  running: boolean
  onSelect: (r: StudentRow) => void
}) {
  const best = bestScore(row.grade, record)
  const recordWins = best > row.grade
  const pass = isPass(row.grade, grading)

  return (
    <li className="group relative border-b border-border/70">
      <button
        onClick={() => onSelect(row)}
        aria-label={`${t.dashboard.viewDetail}: ${row.members}`}
        className="grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-x-4 rounded-md py-3 pl-1 pr-9 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <StatusTile row={row} pass={pass} />

        <div className="min-w-0">
          <div className="truncate text-name font-semibold leading-tight">{row.members}</div>
          <div className="mt-2 flex items-center gap-2.5">
            <Meter
              value={row.passed}
              total={row.total}
              tone={pass ? 'pass' : 'fail'}
              className="max-w-[14rem]"
            />
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {row.passed}/{row.total}
            </span>
            {row.connErrors > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-destructive-strong">
                <WifiOff className="h-3.5 w-3.5" />
                {row.connErrors}
              </span>
            )}
            {/* Aviso pequeño y dentro de la fila, no un cartel: el profesor ya
                mira esta lista, y quien no avanza sube solo al principio del
                filtro «Requieren atención». Un banner por alumno taparía el
                panel justo cuando más gente hay en pantalla. */}
            {stalled > 0 && row.connErrors === 0 && (
              <span
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-warning-strong"
                title={t.dashboard.stalledCycles(stalled)}
              >
                <Hourglass className="h-3.5 w-3.5" />
                {t.dashboard.stalled} ({stalled})
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className={cn('tnum text-figure font-bold leading-none', passColor(row.grade, grading))}>
            {formatGrade(row.grade, grading)}
          </div>
          {/* La nota que irá a Moodle es max(pasada actual, récord). Cuando el
              récord gana, se dice, para que nadie tenga que calcularlo. */}
          {record !== undefined && (
            <div
              className={cn(
                'tnum mt-1.5 flex items-center justify-end gap-1 text-xs',
                recordWins ? 'font-semibold text-warning-strong' : 'text-muted-foreground'
              )}
              title={recordWins ? t.dashboard.bestSavedHint : undefined}
            >
              <Trophy className="h-3 w-3" />
              {t.dashboard.best} {formatGrade(best, grading)}
              {recordWins && ` · ${t.dashboard.bestSaved}`}
            </div>
          )}
        </div>
      </button>

      {/* Fuera del botón principal: un botón dentro de otro no es HTML válido y
          los lectores de pantalla lo colapsan. */}
      <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        {canReevaluate && (
          <button
            onClick={() => void reevaluateStudent(row)}
            disabled={running}
            title={t.dashboard.reevaluateHint}
            aria-label={`${t.dashboard.reevaluate} ${row.members}`}
            className="pointer-events-auto rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:cursor-not-allowed"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </li>
  )
}

/**
 * Estado del alumno en un glifo. Lleva icono además de color: se proyecta, y el
 * color solo no sobrevive ni a un proyector malo ni a quien no distingue rojo de
 * verde. Los hosts caídos ganan al suspenso — es la única de las tres que el
 * profesor tiene que ir a resolver en persona.
 */
function StatusTile({ row, pass }: { row: StudentRow; pass: boolean }) {
  const [cls, Icon, label] =
    row.connErrors > 0
      ? (['bg-destructive-strong text-card', WifiOff, t.dashboard.connErrors] as const)
      : pass
        ? (['bg-success text-success-foreground', Check, t.dashboard.legendOk] as const)
        : (['bg-destructive/15 text-destructive-strong', X, t.dashboard.legendFail] as const)
  return (
    <span
      className={cn('flex h-7 w-7 items-center justify-center rounded-md', cls)}
      title={label}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function MatrixView({
  rows,
  visibleIds,
  records,
  grading,
  onSelect
}: {
  rows: StudentRow[]
  visibleIds: Set<string>
  records: Record<string, number>
  grading: Grading
  onSelect: (r: StudentRow) => void
}) {
  const matrix = useMemo(() => buildMatrix(rows), [rows])
  // Sobre todos los alumnos, no solo los visibles: el rótulo de una columna no
  // puede cambiar según lo que haya escrito el profesor en el buscador.
  const shortNames = useMemo(() => shortNameMap(matrix.students), [matrix.students])
  if (matrix.targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.dashboard.noResults}</p>
  }

  // Los objetivos (filas) salen siempre de todos los alumnos; el buscador y el
  // filtro de atención solo esconden columnas.
  const students = matrix.students.filter((s) => visibleIds.has(s.id))

  if (students.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">—</p>
  }

  // Clic en un alumno (cabecera o nota final) → su detalle. Las columnas salen
  // de `rows`, así que el id siempre corresponde a una fila.
  function selectStudent(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row) onSelect(row)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Legend cls="bg-success text-success-foreground" glyph="OK" label={t.dashboard.legendOk} />
        {/* La celda amarilla lleva los puntos logrados, no un símbolo fijo. El
            rótulo tiene que decir eso: un «5» suelto no se entiende solo. */}
        <Legend cls="bg-warning text-warning-foreground" glyph="5" label={t.dashboard.legendPartial} />
        <Legend cls="bg-destructive-strong text-card" glyph="✕" label={t.dashboard.legendFail} />
        <Legend cls="bg-muted-foreground/25 text-foreground" glyph="?" label={t.dashboard.legendNa} />
        <Legend
          cls="bg-muted-foreground/70 text-card"
          glyph={<WifiOff className="h-2.5 w-2.5" />}
          label={t.dashboard.legendOffline}
        />
      </div>
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-15rem)] overflow-auto">
          {/* w-full + max-w-0 en la columna de comprobación: es ella la que se
              come el ancho sobrante de la tarjeta, en vez de dejarlo en blanco
              a la derecha mientras trunca su propia etiqueta. El min-w es el
              contrapeso: sin él, en una ventana estrecha esa misma columna se
              encoge a cero y su texto se desborda encima del primer alumno. */}
          <table className="w-full border-collapse text-dense">
            <caption className="sr-only">
              {t.dashboard.matrixView}: {t.dashboard.check} × {t.dashboard.members}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-20 w-full min-w-[16rem] max-w-0 truncate border-b border-r border-border bg-card px-3 py-2.5 text-left text-micro font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {t.dashboard.check}
                </th>
                {students.map((s) => (
                  <th
                    key={s.id}
                    scope="col"
                    className="sticky top-0 z-10 border-b border-border bg-card px-2 py-2.5 font-semibold"
                    title={`${s.members} · ${t.dashboard.viewDetail}`}
                  >
                    {/* Solo el nombre de pila: el apellido multiplicaba por dos el
                        ancho de cada columna y con una clase entera (25-30) la
                        tabla se volvía un arrastre lateral constante. El nombre
                        completo sigue en el `title` de la celda y en el detalle.
                        Si dos alumnos comparten nombre de pila, se les añade la
                        inicial para no confundirlos en el proyector. */}
                    <button
                      onClick={() => selectStudent(s.id)}
                      className="mx-auto flex max-w-[7rem] items-center gap-1 rounded transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* La columna entera puede estar en rojo por una máquina
                          apagada, no por el alumno: se dice en su cabecera. */}
                      {s.unreachable && (
                        <WifiOff className="h-3.5 w-3.5 shrink-0 text-destructive-strong" />
                      )}
                      <span className="truncate">{shortNames.get(s.id) ?? s.members}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.targets.map((tgt, ti) => (
                <tr key={tgt.id} className="odd:bg-muted/25 hover:bg-accent/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-full min-w-[16rem] max-w-0 truncate border-b border-r border-border bg-card px-3 py-1.5 text-left font-normal"
                    title={`${tgt.group} · ${tgt.description}`}
                  >
                    {tgt.description}
                    {/* El peso vivía en su propia columna fija; como texto al
                        final de la etiqueta ocupa lo que necesita y deja el
                        ancho a los nombres de los alumnos. */}
                    <span className="tnum ml-2 text-muted-foreground">×{tgt.weight}</span>
                  </th>
                  {students.map((s) => (
                    <td key={s.id} className="border-b border-border px-1 py-1 text-center">
                      <MatrixCellView cell={s.cells[ti]} unreachable={s.unreachable} />
                    </td>
                  ))}
                </tr>
              ))}
              {/* Fila de nota final */}
              <tr className="bg-muted/50 font-semibold">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[16rem] border-r border-border bg-muted/50 px-3 py-2.5 text-left"
                >
                  {t.dashboard.finalGrade}
                </th>
                {students.map((s) => {
                  const record = records[s.members]
                  const best = bestScore(s.grade, record)
                  return (
                    <td key={s.id} className="tnum px-2 py-2.5 text-center">
                      {/* La escala del profesor, igual que en la vista de lista.
                          Los puntos crudos de Teutón siguen a mano en el tooltip:
                          la fila es la nota que se dicta, no la métrica interna. */}
                      <button
                        onClick={() => selectStudent(s.id)}
                        title={`${s.grade} ${t.dashboard.score} · ${t.dashboard.viewDetail}`}
                        className={cn(
                          'rounded px-1 text-ui transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          passColor(s.grade, grading)
                        )}
                      >
                        {formatGrade(s.grade, grading)}
                      </button>
                      {best > s.grade && (
                        <div
                          className="flex items-center justify-center gap-0.5 text-micro font-semibold text-warning-strong"
                          title={t.dashboard.bestSavedHint}
                        >
                          <Trophy className="h-2.5 w-2.5" />
                          {formatGrade(best, grading)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function MatrixCellView({
  cell,
  unreachable
}: {
  cell: { score: number; weight: number; check: boolean; present: boolean }
  unreachable: boolean
}) {
  // Cada estado lleva glifo propio además del color: a distancia de proyector y
  // para quien no distingue rojo de verde, el color solo no basta.
  if (!cell.present) {
    return (
      <span
        title={t.dashboard.legendNa}
        className="inline-block h-6 w-6 rounded bg-muted-foreground/25 text-xs font-bold leading-6 text-foreground"
      >
        ?<span className="sr-only"> {t.dashboard.legendNa}</span>
      </span>
    )
  }
  if (cell.check || cell.score >= cell.weight) {
    return (
      <span className="tnum inline-block h-6 min-w-6 rounded bg-success px-1 text-xs font-bold leading-6 text-success-foreground">
        OK<span className="sr-only"> {t.dashboard.legendOk}</span>
      </span>
    )
  }
  if (cell.score > 0) {
    return (
      <span className="tnum inline-block h-6 min-w-6 rounded bg-warning px-1 text-xs font-bold leading-6 text-warning-foreground">
        {cell.score}
        <span className="sr-only"> {t.dashboard.legendPartial}</span>
      </span>
    )
  }
  // Máquina apagada o inalcanzable: el objetivo no se ha podido ni intentar.
  // Pintarlo del mismo rojo que un fallo real hacía que el alumno con el equipo
  // apagado se leyera como el que peor lo ha hecho de la clase.
  if (unreachable) {
    return (
      <span
        title={t.dashboard.offlineHint}
        className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted-foreground/70 text-card"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">{t.dashboard.legendOffline}</span>
      </span>
    )
  }
  return (
    <span // «strong» + texto del color de la tarjeta: el par se invierte con el tema
      // (rojo oscuro sobre blanco en claro, rojo claro sobre oscuro en oscuro) y
      // así el fallo llega a AA en los dos, que es como se proyecta en clase.
      className="inline-block h-6 w-6 rounded bg-destructive-strong text-xs font-bold leading-6 text-card">
      ✕<span className="sr-only"> {t.dashboard.legendFail}</span>
    </span>
  )
}

function Legend({
  cls,
  glyph,
  label
}: {
  cls: string
  glyph: ReactNode
  label: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-glyph font-bold',
          cls
        )}
      >
        {glyph}
      </span>
      {label}
    </span>
  )
}
