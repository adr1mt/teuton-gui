import { ArrowLeft, CheckCircle2, XCircle, ChevronDown, RotateCw, Trophy } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n/es'
import { useApp } from '../stores/app'
import { Button, SectionTitle } from './ui'
import { cn, formatDuration } from '../lib/utils'
import { bestScore, formatGrade, passColor } from '../lib/grading'
import { caseIndexFor, reevaluateStudent } from '../lib/run'
import { useRedactor } from '../lib/redact'
import type { StudentRow } from '../lib/analytics'

export default function StudentDetail({
  row,
  onBack
}: {
  row: StudentRow
  onBack: () => void
}) {
  const report = row.caseReport
  const grading = useApp((s) => s.grading)
  const project = useApp((s) => s.project)
  const configDraft = useApp((s) => s.configDraft)
  const running = useApp((s) => s.run.status === 'running')
  const record = useApp((s) => s.records[row.members])
  const caseIdx = caseIndexFor(row, configDraft)
  const canReevaluate = project !== null && caseIdx !== null
  const best = bestScore(row.grade, record)
  const recordWins = best > row.grade

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> {t.dashboard.back}
        </Button>
        <h1 className="text-ui font-semibold tracking-tight">{row.members}</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {t.dashboard.case} {row.id}
        </span>
        <div className="ml-auto flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reevaluateStudent(row)}
            disabled={running || !canReevaluate}
            title={canReevaluate ? t.dashboard.reevaluateHint : t.dashboard.reevaluateUnavailable}
          >
            <RotateCw className="h-4 w-4" /> {t.dashboard.reevaluate}
          </Button>
          <span className="tnum text-xs text-muted-foreground">
            {row.passed}/{row.total} {t.dashboard.passed.toLowerCase()} · {row.grade} pts
          </span>
          {/* Misma pareja que en la lista: nota de esta pasada, y debajo la
              mejor — resaltada cuando es la que se guardará. */}
          <div className="flex flex-col items-end">
            <div className={cn('tnum text-2xl font-bold leading-none', passColor(row.grade, grading))}>
              {formatGrade(row.grade, grading)}
            </div>
            {record !== undefined && (
              <span
                className={cn(
                  'tnum mt-1 inline-flex items-center gap-1 text-micro',
                  recordWins ? 'font-semibold text-warning-strong' : 'text-muted-foreground'
                )}
                title={recordWins ? t.dashboard.bestSavedHint : undefined}
              >
                <Trophy className="h-3 w-3" />
                {t.dashboard.best} {formatGrade(best, grading)}
                {recordWins && ` · ${t.dashboard.bestSaved}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
        {!report ? (
          <p className="text-sm text-muted-foreground">{t.dashboard.noDetail}</p>
        ) : (
          <div className="max-w-4xl space-y-7">
            {report.groups.map((g, gi) => (
              <section key={gi}>
                <SectionTitle>{g.title}</SectionTitle>
                <div className="space-y-1.5">
                  {g.targets.map((tgt, ti) => (
                    <TargetItem key={ti} target={tgt} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TargetItem({
  target
}: {
  target: import('../../../shared/types').TeutonTarget
}) {
  const [open, setOpen] = useState(false)
  // La orden y su salida llevan la IP del equipo y, por ssh, la contraseña.
  const hide = useRedactor()
  const hasDetail = target.command || target.output || target.expected || target.result
  return (
    <div
      className={cn(
        'rounded-md border',
        target.check ? 'border-border bg-transparent' : 'border-destructive/30 bg-destructive/5'
      )}
    >
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        aria-expanded={hasDetail ? open : undefined}
        className="flex w-full items-center gap-3 rounded-md px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {target.check ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-strong" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-destructive-strong" />
        )}
        <span className="flex-1 text-sm">{target.description || t.dashboard.noDescription}</span>
        <span className="tnum font-mono text-xs text-muted-foreground">
          {target.score}/{target.weight}
        </span>
        {hasDetail && (
          <ChevronDown
            className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && hasDetail && (
        <div className="space-y-2 border-t border-border/50 px-4 py-3 text-xs">
          <DetailRow label={t.dashboard.command} value={hide(target.command ?? '')} mono />
          <DetailRow label={t.dashboard.expected} value={hide(target.expected ?? '')} />
          <DetailRow label={t.dashboard.result} value={hide(target.result ?? '')} />
          <DetailRow label={t.dashboard.output} value={hide(target.output ?? '')} mono />
          <div className="flex gap-4 pt-1 text-muted-foreground">
            {target.conn_type && (
              <span>
                {t.dashboard.connection}: {target.conn_type}
              </span>
            )}
            <span>
              {t.dashboard.duration}: {formatDuration(target.duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className={cn('break-words', mono && 'font-mono')}>{value}</span>
    </div>
  )
}
