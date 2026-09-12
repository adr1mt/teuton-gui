import { useEffect, useMemo, useRef } from 'react'
import { Play, Square, RotateCw, Terminal, Loader2, CheckCircle2, XCircle, ListChecks, Info, GraduationCap, Copy, Check, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import { Button, Card, MetaChip, ProgressBar, SectionTitle, ViewHeader } from '../components/ui'
import { parseConfig } from '../lib/config'
import { cn } from '../lib/utils'
import { startRun, cancelRun, reloadLatestResults } from '../lib/run'
import { useRunProgress } from '../lib/progress'
import { MonitorControl } from '../components/Monitor'
import { runPreflight, type PreflightItem, type PreflightReport } from '../lib/preflight'
import { useRedactor } from '../lib/redact'
import { useState } from 'react'

export default function Run() {
  const { project, configDraft, dirty, run, activeClass, setView } = useApp()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)
  // La consola en crudo ocupaba el 70% de la vista sin que nadie la lea de un
  // vistazo. Se pliega por defecto y se abre sola en cuanto hay algo que ver.
  const [showConsole, setShowConsole] = useState(false)
  const [preflight, setPreflight] = useState<PreflightReport | null>(null)
  const [checking, setChecking] = useState(false)
  const consoleRef = useRef<HTMLDivElement>(null)
  const progress = useRunProgress()
  // La salida de Teutón nombra la IP de cada máquina en cada comprobación.
  const hide = useRedactor()
  const shownLog = useMemo(() => hide(run.log), [hide, run.log])

  function copyConsole() {
    navigator.clipboard.writeText(shownLog)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const cases = useMemo(() => parseConfig(configDraft).config.cases, [configDraft])

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight })
  }, [run.log])

  // Abre la consola al arrancar una ejecución manual: es cuando su contenido
  // deja de ser ruido. En modo examen no la fuerza — ahí se mira el dashboard.
  const monitorActive = useApp((s) => s.monitor.active)
  useEffect(() => {
    if (run.status === 'running' && !monitorActive) setShowConsole(true)
  }, [run.status, monitorActive])

  async function start() {
    if (!project) return
    const cs = selected.size > 0 ? Array.from(selected).sort((a, b) => a - b) : undefined
    await startRun(project.dir, { cases: cs, cname: project.cname })
  }

  async function check() {
    setChecking(true)
    try {
      setPreflight(await runPreflight())
    } finally {
      setChecking(false)
    }
  }

  async function loadLast() {
    const r = await reloadLatestResults()
    if (r && (r.resume || r.cases.length)) setView('dashboard')
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t.editor.noProject}
      </div>
    )
  }

  const running = run.status === 'running'

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title={t.run.title}
        meta={
          <>
            <StatusPill status={run.status} />
            {activeClass && (
              <MetaChip icon={<GraduationCap className="h-3.5 w-3.5" />}>{activeClass}</MetaChip>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConsole((s) => !s)}
              aria-pressed={showConsole}
            >
              <Terminal className="h-4 w-4" /> {showConsole ? t.run.hideConsole : t.run.showConsole}
            </Button>
            <Button variant="outline" size="sm" onClick={check} disabled={running || checking}>
              <ClipboardCheck className="h-4 w-4" />
              {checking ? t.preflight.checking : t.preflight.title}
            </Button>
            <Button variant="outline" size="sm" onClick={loadLast} disabled={running}>
              <ListChecks className="h-4 w-4" /> {t.run.loadResults}
            </Button>
            {running ? (
              <Button variant="destructive" size="sm" onClick={cancelRun}>
                <Square className="h-4 w-4" /> {t.run.cancel}
              </Button>
            ) : (
              <Button size="sm" onClick={start}>
                {run.status === 'idle' ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                {run.status === 'idle' ? t.run.start : t.run.rerun}
              </Button>
            )}
          </>
        }
      />

      {dirty && !running && (
        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-6 py-2 text-xs text-warning-strong">
          <Info className="h-3.5 w-3.5 shrink-0" /> {t.run.autoSave}
        </div>
      )}

      {(running || (run.status === 'done' && progress.total)) && (
        <div className="border-b border-border px-6 py-3">
          <ProgressBar
            percent={progress.percent}
            label={
              progress.total
                ? `${progress.done}/${progress.total} ${t.run.checks}`
                : t.run.running
            }
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Modo examen + selección de casos */}
        <div
          className={cn(
            'flex flex-col overflow-y-auto px-6 py-5',
            showConsole ? 'w-80 shrink-0 border-r border-border px-4' : 'flex-1'
          )}
        >
          {/* Con la consola plegada el panel llega a 1100px: el modo examen se
              queda en una columna legible en vez de estirar su botón de lado a
              lado de la pantalla. */}
          <div className={cn(!showConsole && 'max-w-2xl')}>
            {preflight && <PreflightPanel report={preflight} className="mb-6" />}
            <MonitorControl />
          </div>

          <div className="mt-6 max-w-5xl">
            <SectionTitle
              hint={
                selected.size === 0
                  ? `${t.run.allWillRun} (${cases.length})`
                  : `${selected.size} ${t.run.selectedCount}`
              }
              actions={
                selected.size > 0 ? (
                  <button
                    onClick={() => setSelected(new Set())}
                    className="rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.run.allCases}
                  </button>
                ) : undefined
              }
            >
              {t.run.selectCases}
            </SectionTitle>
          </div>
          {/* Con la consola plegada la lista aprovecha el ancho en columnas en
              vez de dejar media pantalla vacía bajo un raíl estrecho. */}
          <div
            className={cn(
              'gap-1.5',
              showConsole ? 'space-y-1' : 'grid max-w-5xl grid-cols-2 xl:grid-cols-3'
            )}
          >
            {cases.map((c, i) => {
              const idx = i + 1
              const on = selected.has(idx)
              return (
                <button
                  key={idx}
                  onClick={() => toggle(idx)}
                  disabled={running}
                  role="checkbox"
                  aria-checked={on}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    on ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-muted'
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-glyph',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">{idx}</span>
                  <span className="truncate">{String(c.tt_members ?? `alumno_${idx}`)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Console */}
        <div
          className={cn('flex flex-1 flex-col overflow-hidden bg-console', !showConsole && 'hidden')}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs font-medium text-console-foreground/60">
            <Terminal className="h-3.5 w-3.5" /> {t.run.console}
            {running && (
              <span className="flex items-center gap-1.5 text-primary">
                <Info className="h-3.5 w-3.5" /> {t.run.background}
              </span>
            )}
            {run.log.length > 0 && (
              <button
                onClick={copyConsole}
                className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-console-foreground/50 transition-colors hover:bg-white/10 hover:text-console-foreground"
                title={t.common.copy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t.common.copied : t.common.copy}
              </button>
            )}
          </div>
          <div
            ref={consoleRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-dense leading-relaxed text-console-foreground"
          >
            {run.log.length === 0 ? (
              <span className="text-console-foreground/45">{t.run.empty}</span>
            ) : (
              <pre className="whitespace-pre-wrap">{shownLog}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'idle' | 'running' | 'done' | 'failed' }) {
  if (status === 'idle') return null
  const map = {
    running: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: t.run.running, cls: 'bg-primary/15 text-primary' },
    done: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: t.run.done, cls: 'bg-success/15 text-success-strong' },
    failed: { icon: <XCircle className="h-3.5 w-3.5" />, label: t.run.failed, cls: 'bg-destructive/15 text-destructive-strong' }
  } as const
  const s = map[status]
  return (
    <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', s.cls)}>
      {s.icon}
      {s.label}
    </span>
  )
}

/**
 * Resultado de «¿Todo listo?». Un bloque por comprobación, con icono además de
 * color: esto se mira con el aula llena y proyectado. Los avisos (ámbar) no
 * impiden empezar; los fallos (rojo) sí, y por eso el titular lo dice entero
 * en vez de dejarlo a la suma de iconos.
 */
function PreflightPanel({ report, className }: { report: PreflightReport; className?: string }) {
  const failed = report.items.some((i) => i.state === 'fail')
  const warned = report.items.some((i) => i.state === 'warn')
  const headline = failed
    ? t.preflight.blocked
    : warned
      ? t.preflight.readyWithWarnings
      : t.preflight.ready

  return (
    <Card className={cn('p-4', className)}>
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          failed ? 'text-destructive-strong' : warned ? 'text-warning-strong' : 'text-success-strong'
        )}
      >
        {failed ? (
          <XCircle className="h-4 w-4 shrink-0" />
        ) : warned ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        )}
        {headline}
      </div>
      <ul className="mt-3 space-y-2.5">
        {report.items.map((item) => (
          <PreflightLine key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  )
}

function PreflightLine({ item }: { item: PreflightItem }) {
  const tone =
    item.state === 'fail'
      ? 'text-destructive-strong'
      : item.state === 'warn'
        ? 'text-warning-strong'
        : 'text-success-strong'
  const Icon = item.state === 'fail' ? XCircle : item.state === 'warn' ? AlertTriangle : CheckCircle2
  return (
    <li className="flex gap-2 text-sm">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
      <div className="min-w-0">
        <div className={cn('font-medium', item.state === 'ok' ? 'text-foreground' : tone)}>
          {item.label}
        </div>
        {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
      </div>
    </li>
  )
}
