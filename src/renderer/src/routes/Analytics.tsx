import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList
} from 'recharts'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  GraduationCap,
  Play,
  TrendingDown,
  Hourglass,
  WifiOff
} from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import {
  studentRows,
  computeKpis,
  frequentErrors,
  groupSuccess,
  gradeDistribution,
  studentsNeedingAttention
} from '../lib/analytics'
import { stalledCycles } from '../lib/stall'
import { useChartColors } from '../lib/useChartColors'
import { Button, MetaChip, SectionTitle, ViewHeader } from '../components/ui'
import { formatGrade } from '../lib/grading'

/**
 * Cuántos alumnos de la lista de atención se muestran aquí. Esta vista es de
 * lectura: sirve para saber *cuántos* y *quiénes son los primeros*, no para
 * recorrer la clase entera — eso es Resultados, que además tiene el detalle de
 * cada alumno. Sin este tope, una clase floja empujaba los tres gráficos por
 * debajo del pliegue y la vista se convertía en una segunda lista de alumnos.
 */
const ATTENTION_PREVIEW = 8

export default function Analytics() {
  const { results, grading, activeClass, project, stalls, setView, setAttentionOnly } = useApp()
  const colors = useChartColors()

  const data = useMemo(() => {
    if (!results) return null
    const rows = studentRows(results)
    return {
      rows,
      kpis: computeKpis(rows, grading.passScore),
      attention: studentsNeedingAttention(rows, grading.passScore, stalls),
      errors: frequentErrors(results).slice(0, 10),
      groups: groupSuccess(results),
      dist: gradeDistribution(rows)
    }
  }, [results, grading.passScore, stalls])

  if (!results || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
        <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-center text-sm text-muted-foreground">{t.analytics.noResults}</p>
        {project && (
          <Button size="sm" onClick={() => setView('run')}>
            <Play className="h-4 w-4" /> {t.dashboard.goToRun}
          </Button>
        )}
      </div>
    )
  }

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 6,
    fontSize: 12,
    padding: '6px 10px',
    color: 'hsl(var(--popover-foreground))'
  }
  const axisTick = { fill: colors.muted, fontSize: 11 }
  // Tramo de la distribución donde cae el aprobado del profesor. Marca la línea
  // y decide el color de las barras: el 50 y el 90 que había fijos en el código
  // contradecían el umbral configurable en cuanto se cambiaba.
  const passBucket = Math.min(9, Math.floor(grading.passScore / 10))
  // El tramo solo es ámbar si el umbral lo parte por la mitad. Con un aprobado
  // en 70 (múltiplo de 10) el tramo 70-79 aprueba entero, y pintarlo de ámbar
  // decía que esos alumnos estaban a medias.
  const splitBucket = grading.passScore % 10 !== 0

  const attentionShown = data.attention.slice(0, ATTENTION_PREVIEW)
  const attentionHidden = data.attention.length - attentionShown.length

  function openAttentionInResults() {
    setAttentionOnly(true)
    setView('dashboard')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader
        title={t.analytics.title}
        meta={
          <>
            {activeClass && (
              <MetaChip icon={<GraduationCap className="h-3.5 w-3.5" />}>{activeClass}</MetaChip>
            )}
            {/* Resumen en una línea: el marcador con las cifras grandes es
                Resultados. Aquí las mismas cifras solo sitúan lo que se lee. */}
            <span className="tnum text-xs text-muted-foreground">
              {data.kpis.count} {t.dashboard.students} · {t.analytics.averageGrade.toLowerCase()}{' '}
              <strong className="font-semibold text-foreground">
                {formatGrade(data.kpis.average, grading)}
              </strong>{' '}
              · {data.kpis.passCount} {t.dashboard.passRate.toLowerCase()}
              {results.generatedAt && (
                <>
                  {' · '}
                  {t.analytics.updatedAt}{' '}
                  {new Date(results.generatedAt).toLocaleTimeString('es-ES', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </>
              )}
            </span>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
        {/* Medida única para toda la vista: las cuatro secciones empiezan y
            acaban en la misma columna, y una tabla de cuatro campos no se
            estira hasta perder la fila de vista. */}
        <div className="max-w-5xl space-y-9">
          {/* 1. A quién hay que ir a ver. Lo único de esta vista que se acciona. */}
          <section>
            <SectionTitle hint={t.analytics.attentionDesc}>
              {t.analytics.attention}
              {data.attention.length > 0 && (
                <span className="tnum ml-2 font-normal text-muted-foreground">
                  {data.attention.length}
                </span>
              )}
            </SectionTitle>
            {data.attention.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-success-strong">
                <CheckCircle2 className="h-4 w-4" /> {t.analytics.noAttention}
              </p>
            ) : (
              <>
                {/* Medida propia: cuatro campos cortos estirados a 1000px
                    dejan un canalón entre el nombre y su nota que rompe la
                    lectura de la fila. */}
                <table className="w-full max-w-3xl text-sm">
                  <thead>
                    <tr className="text-left text-micro uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-1.5 font-semibold">
                        {t.analytics.student}
                      </th>
                      <th scope="col" className="w-20 py-1.5 text-right font-semibold">
                        {t.analytics.grade}
                      </th>
                      <th scope="col" className="w-40 py-1.5 text-right font-semibold">
                        {t.analytics.objectives}
                      </th>
                      <th scope="col" className="w-56 py-1.5 pl-6 font-semibold">
                        {t.analytics.action}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionShown.map((row) => (
                      <tr key={row.id} className="border-t border-border/70">
                        <td className="py-2.5 font-medium">{row.members}</td>
                        <td className="tnum py-2.5 text-right font-semibold">
                          {formatGrade(row.grade, grading)}
                        </td>
                        <td className="tnum py-2.5 text-right text-muted-foreground">
                          {row.failed}/{row.total} {t.analytics.objectivesFailed}
                        </td>
                        {/* Icono además del color: la fila se proyecta, y el
                            motivo no puede depender de distinguir rojo de ámbar. */}
                        <td className="py-2.5 pl-6">
                          {row.connErrors > 0 ? (
                            <span className="flex items-center gap-1.5 font-medium text-destructive-strong">
                              <WifiOff className="h-3.5 w-3.5 shrink-0" />
                              {t.analytics.technicalIssue} ({row.connErrors})
                            </span>
                          ) : stalledCycles(stalls, row, grading.passScore) > 0 ? (
                            /* Nota baja que no se mueve entre vueltas: es otro
                               problema que una nota baja que va subiendo. */
                            <span className="flex items-center gap-1.5 font-medium text-warning-strong">
                              <Hourglass className="h-3.5 w-3.5 shrink-0" />
                              {t.analytics.stalled} (
                              {stalledCycles(stalls, row, grading.passScore)})
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-warning-strong">
                              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                              {t.analytics.belowPass}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* El salto lleva el filtro puesto: aterrizar en la clase entera
                    obligaría a volver a buscar a los mismos alumnos. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 mt-2 text-primary"
                  onClick={openAttentionInResults}
                >
                  {attentionHidden > 0
                    ? `${t.analytics.andMore} ${attentionHidden} · ${t.analytics.seeInResults}`
                    : t.analytics.seeInResults}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </section>

          {/* 2. Qué ha fallado. Sin rejilla ni eje: la cifra va pegada a la barra. */}
          <section>
            <SectionTitle
              hint={
                data.errors.length >= 10
                  ? t.analytics.frequentErrorsHint
                  : t.analytics.frequentErrorsHintFew
              }
            >
              {t.analytics.frequentErrors}
            </SectionTitle>
            {data.errors.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-success-strong">
                <CheckCircle2 className="h-4 w-4" /> {t.analytics.noErrors}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={data.errors.length * 34 + 12}>
                <BarChart
                  data={data.errors}
                  layout="vertical"
                  barSize={14}
                  margin={{ left: 0, right: 56, top: 4, bottom: 4 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="description"
                    width={300}
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                    formatter={(value: number, _n, item) => [
                      `${value} ${t.analytics.failsWord} · ${item?.payload?.rate}% ${t.analytics.ofCases}`,
                      item?.payload?.group
                    ]}
                  />
                  <Bar dataKey="fails" fill={colors.destructive} radius={2}>
                    <LabelList
                      dataKey="fails"
                      position="right"
                      fill={colors.foreground}
                      fontSize={12}
                      fontWeight={600}
                      formatter={(v: number) => `${v}×`}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          <div className="grid grid-cols-1 gap-9 lg:grid-cols-2">
            {/* 3. Cómo se reparte la clase, con el aprobado marcado donde el
                   profesor lo ha puesto. */}
            <section>
              <SectionTitle hint={`${t.analytics.passAt} ${grading.passScore} pts`}>
                {t.analytics.gradeDistribution}
              </SectionTitle>
              {/* Sin eje de valores: cada barra ya lleva su recuento encima, y un
                eje repitiendo la misma cifra es rejilla disfrazada. */}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dist} margin={{ left: 0, right: 8, top: 18, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={axisTick}
                    tickFormatter={(v: string) => v.split('-')[0]}
                  />
                  {/* Eje numérico oculto y paralelo: los diez tramos ocupan
                      [0,10], así que el umbral cae en passScore/10 — la
                      frontera real. Sobre el eje de categorías la línea se
                      dibujaba en el centro de la barra y parecía partir en dos
                      un tramo que aprueba entero. */}
                  <XAxis xAxisId="pos" type="number" domain={[0, 10]} hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  />
                  <ReferenceLine
                    xAxisId="pos"
                    x={grading.passScore / 10}
                    stroke={colors.foreground}
                    strokeDasharray="2 3"
                    label={{
                      value: `${t.analytics.passLabel} ≥ ${grading.passScore}`,
                      position: 'top',
                      fill: colors.muted,
                      fontSize: 11
                    }}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {data.dist.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i < passBucket
                            ? colors.destructive
                            : i === passBucket && splitBucket
                              ? colors.warning
                              : colors.success
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="top"
                      fill={colors.muted}
                      fontSize={11}
                      formatter={(v: number) => (v > 0 ? v : '')}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* 4. Qué parte del test cuesta más. Azul: es una comparación entre
                   bloques del test, no el estado de ningún alumno. */}
            <section>
              <SectionTitle hint={t.analytics.groupSuccessHint}>
                {t.analytics.groupSuccess}
              </SectionTitle>
              <ResponsiveContainer
                width="100%"
                height={Math.max(140, data.groups.length * 34 + 12)}
              >
                <BarChart
                  data={data.groups}
                  layout="vertical"
                  barSize={14}
                  margin={{ left: 0, right: 48, top: 4, bottom: 4 }}
                >
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="group"
                    width={200}
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                    formatter={(value: number, _n, item) => [
                      `${value}% (${item?.payload?.passed}/${item?.payload?.total})`,
                      t.analytics.successRate
                    ]}
                  />
                  <Bar dataKey="rate" fill={colors.primary} radius={2}>
                    <LabelList
                      dataKey="rate"
                      position="right"
                      formatter={(v: number) => `${v}%`}
                      fill={colors.foreground}
                      fontSize={12}
                      fontWeight={600}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
