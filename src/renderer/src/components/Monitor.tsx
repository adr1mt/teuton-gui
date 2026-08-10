import { useEffect, useState } from 'react'
import { Radio, Square, Loader2, Trophy } from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import { Button, ProgressBar } from './ui'
import { startMonitor, stopMonitor } from '../lib/run'
import { useRunProgress } from '../lib/progress'
import { cn } from '../lib/utils'

const PRESETS = [3, 5, 10]

/**
 * Segundos que faltan para el siguiente ciclo. Vive aquí y no dentro del banner
 * porque el estado del examen se muestra en tres sitios a la vez (la pestaña
 * Ejecutar, el dashboard y el marco fijo del sidebar) y los tres tienen que
 * contar lo mismo.
 */
export function useMonitorCountdown(): number {
  const active = useApp((s) => s.monitor.active)
  const nextRunAt = useApp((s) => s.monitor.nextRunAt)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!active) return
    const tick = () => {
      if (nextRunAt) setRemaining(Math.max(0, Math.round((nextRunAt - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active, nextRunAt])

  return remaining
}

/**
 * Modo examen, en la pestaña Ejecutar. Tiene dos caras y nunca las mezcla:
 * apagado muestra el formulario de arranque; encendido muestra el estado real
 * (ciclo, cuenta atrás, progreso) y la única salida. Que el botón dijera
 * «Iniciar» con el examen ya corriendo era la trampa: invitaba a pulsarlo para
 * comprobar que seguía vivo, y eso reiniciaba el contador de ciclos.
 */
export function MonitorControl() {
  const { project, monitor, setMonitor } = useApp()
  const run = useApp((s) => s.run)
  const remaining = useMonitorCountdown()
  const progress = useRunProgress()
  if (!project) return null

  if (monitor.active) {
    const evaluating = run.status === 'running'
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <PulseDot />
          <h3 className="font-semibold text-primary">{t.monitor.active}</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {evaluating ? t.monitor.evaluating : formatTime(remaining)}
          </span>
          <span className="text-xs text-muted-foreground">
            {evaluating ? '' : t.monitor.nextIn.toLowerCase()}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t.monitor.cycle} {monitor.cycles} · {t.monitor.interval.toLowerCase()}{' '}
          {monitor.intervalMin} {t.monitor.minutes}
        </div>
        {evaluating && (
          <ProgressBar
            className="mt-3"
            percent={progress.percent}
            label={progress.total ? `${progress.done}/${progress.total} ${t.run.checks}` : undefined}
          />
        )}
        <Button variant="destructive" className="mt-3 w-full" onClick={stopMonitor}>
          <Square className="h-4 w-4" /> {t.monitor.stop}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{t.monitor.title}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.monitor.desc}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t.monitor.interval}:</span>
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => setMonitor({ intervalMin: m })}
            aria-pressed={monitor.intervalMin === m}
            className={cn(
              'rounded-md border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              monitor.intervalMin === m
                ? 'border-primary bg-accent font-semibold text-accent-foreground'
                : 'border-border hover:bg-muted'
            )}
          >
            {m} {t.monitor.minutes}
          </button>
        ))}
        <input
          type="number"
          min={1}
          value={monitor.intervalMin}
          aria-label={t.monitor.interval}
          onChange={(e) => setMonitor({ intervalMin: Math.max(1, Number(e.target.value) || 1) })}
          className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Trophy className="h-3.5 w-3.5 shrink-0 text-warning-strong" /> {t.monitor.recordNote}
      </div>

      {/* `outline`: el azul lleno de esta pantalla lo lleva «Ejecutar test».
          Esta tarjeta ya se distingue por su propio panel teñido. */}
      <Button
        variant="outline"
        className="mt-3 w-full border-primary/60"
        onClick={() => startMonitor(project.dir, monitor.intervalMin)}
      >
        <Radio className="h-4 w-4" /> {t.monitor.start}
      </Button>
    </div>
  )
}

/**
 * Estado del examen en el marco fijo (sidebar). El profesor vuelve al portátil
 * y puede aterrizar en cualquier vista: si el único indicador de «hay un examen
 * corriendo» viviera en el dashboard, bastaría abrir el editor para perderlo de
 * vista sin que nada haya cambiado.
 */
export function MonitorSidebarStatus() {
  const active = useApp((s) => s.monitor.active)
  const cycles = useApp((s) => s.monitor.cycles)
  const runStatus = useApp((s) => s.run.status)
  const remaining = useMonitorCountdown()

  if (!active) return null
  const evaluating = runStatus === 'running'

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/15 px-3 py-2">
      <div className="flex items-center gap-2">
        <PulseDot />
        <span className="text-xs font-semibold text-white">{t.monitor.active}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-bold tabular-nums text-white">
          {evaluating ? '···' : formatTime(remaining)}
        </span>
        <span className="text-micro text-sidebar-foreground/70">
          {evaluating ? t.monitor.evaluating : `${t.monitor.cycle} ${cycles}`}
        </span>
      </div>
      <Button variant="destructive" size="sm" className="mt-2 w-full" onClick={stopMonitor}>
        <Square className="h-3.5 w-3.5" /> {t.monitor.stop}
      </Button>
    </div>
  )
}

function PulseDot() {
  return (
    <span className="relative flex h-3 w-3 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
    </span>
  )
}

/**
 * Franja de examen en Resultados. Es la primera cosa que se ve al proyectar, así
 * que dice lo que la clase necesita saber —queda tiempo o se está evaluando— con
 * la cuenta atrás a tamaño de marcador, y nada más. La barra de progreso sustituye
 * al texto mientras corre el ciclo; no se apilan.
 */
export function MonitorBanner() {
  const { monitor, run } = useApp()
  const remaining = useMonitorCountdown()
  const progress = useRunProgress()

  if (!monitor.active) return null
  const evaluating = run.status === 'running'

  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-primary/40 bg-primary/10 px-6 py-2.5">
      <PulseDot />
      <span className="text-micro font-semibold uppercase tracking-[0.09em] text-foreground">
        {t.monitor.active}
      </span>
      <span className="tnum text-xs text-muted-foreground">
        {t.monitor.cycle} {monitor.cycles}
      </span>

      {evaluating ? (
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-4">
          <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.monitor.evaluating}
          </span>
          <ProgressBar className="max-w-[18rem]" percent={progress.percent} />
          <span className="tnum shrink-0 text-xs text-muted-foreground">
            {progress.total ? `${progress.done}/${progress.total}` : ''}
          </span>
        </div>
      ) : (
        <div className="ml-auto flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">{t.monitor.nextIn}</span>
          <span className="tnum text-2xl font-bold leading-none">{formatTime(remaining)}</span>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={stopMonitor} className="ml-4 shrink-0">
        <Square className="h-3.5 w-3.5" /> {t.monitor.stop}
      </Button>
    </div>
  )
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
