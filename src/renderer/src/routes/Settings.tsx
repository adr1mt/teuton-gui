import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import {
  Button,
  Input,
  SectionTitle,
  Segmented,
  SegmentedItem,
  Spinner,
  ViewHeader
} from '../components/ui'
import { formatGrade } from '../lib/grading'
import { isSecretColumn } from '../lib/config'
import { cn } from '../lib/utils'

export default function Settings() {
  const { teutonStatus, setTeutonStatus, theme, setTheme, grading, setGrading } = useApp()
  const defaultGlobals = useApp((s) => s.defaultGlobals)
  const setDefaultGlobals = useApp((s) => s.setDefaultGlobals)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gradingSaved, setGradingSaved] = useState(false)
  const [globalsSaved, setGlobalsSaved] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [savingPath, setSavingPath] = useState(false)
  const [pathSaved, setPathSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.teuton.getTeutonPath().then((p) => {
      if (!cancelled) setManualPath(p ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveManualPath() {
    setSavingPath(true)
    const status = await window.teuton.setTeutonPath(manualPath.trim() || null)
    setTeutonStatus(status)
    setSavingPath(false)
    setPathSaved(true)
    setTimeout(() => setPathSaved(false), 1500)
  }

  async function saveGrading(next: { passScore: number; maxGrade: number }) {
    setGrading(next)
    await window.teuton.setGrading(next)
    setGradingSaved(true)
    setTimeout(() => setGradingSaved(false), 1500)
  }

  // Editamos las credenciales como lista local de pares para poder mostrar filas
  // con la clave aún vacía mientras el profesor la teclea. El objeto persistido
  // se reconstruye ignorando las claves vacías. El inicializador perezoso lee el
  // store, que App.tsx ya rellena al arrancar antes de llegar a Ajustes.
  const [globalRows, setGlobalRows] = useState<[string, string][]>(() =>
    Object.entries(defaultGlobals)
  )
  // Enfocamos la casilla "campo" de la fila recién añadida para que se vea que
  // ha aparecido una fila nueva editable (sus placeholders no la hacían obvia).
  const keyInputs = useRef<(HTMLInputElement | null)[]>([])
  const [focusRow, setFocusRow] = useState<number | null>(null)
  useEffect(() => {
    if (focusRow == null) return
    keyInputs.current[focusRow]?.focus()
    setFocusRow(null)
  }, [focusRow])

  async function persistGlobals(rows: [string, string][]) {
    setGlobalRows(rows)
    const obj: Record<string, string> = {}
    for (const [k, v] of rows) if (k.trim()) obj[k.trim()] = v
    setDefaultGlobals(obj)
    await window.teuton.setDefaultGlobals(obj)
    setGlobalsSaved(true)
    setTimeout(() => setGlobalsSaved(false), 1500)
  }

  function updateGlobalRow(idx: number, key: string, value: string) {
    void persistGlobals(globalRows.map((r, i) => (i === idx ? [key, value] : r)))
  }

  function addGlobalRow() {
    setFocusRow(globalRows.length)
    setGlobalRows((rows) => [...rows, ['', '']])
  }

  function removeGlobalRow(idx: number) {
    void persistGlobals(globalRows.filter((_, i) => i !== idx))
  }

  async function recheck() {
    setChecking(true)
    const status = await window.teuton.detect()
    setTeutonStatus(status)
    setChecking(false)
  }

  function copyCmd() {
    navigator.clipboard.writeText(t.teuton.installHint)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader title={t.nav.settings} />
      {/* El scroll va en el contenedor a ancho completo: dentro de la columna
          centrada, la barra aparecía flotando en mitad del contenido. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-14 pt-5">
      <div className="flex max-w-2xl flex-col gap-9">

      <section>
        <SectionTitle>Teutón CLI</SectionTitle>
        <div className="space-y-4">
          {teutonStatus?.installed ? (
            <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-3.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-strong" />
              <div>
                <div className="font-medium text-success-strong">{t.teuton.installed}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {t.teuton.version} {teutonStatus.version}
                </div>
                {teutonStatus.path && (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {teutonStatus.path}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive-strong" />
              <div className="flex-1">
                <div className="font-medium text-destructive-strong">{t.teuton.notInstalled}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {t.teuton.notInstalledDesc}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md bg-background/60 px-3 py-2 font-mono text-sm">
                  <span className="text-muted-foreground">$</span>
                  <span className="flex-1">{t.teuton.installHint}</span>
                  <button
                    onClick={copyCmd}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <Button variant="outline" onClick={recheck} disabled={checking}>
            {checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            {t.teuton.recheck}
          </Button>

          <div className="border-t border-border pt-4">
            <label className="text-sm font-medium">{t.teuton.manualPathLabel}</label>
            <p className="mb-1.5 text-xs text-muted-foreground">{t.teuton.manualPathHint}</p>
            <div className="flex items-center gap-2">
              <Input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={t.teuton.manualPathPlaceholder}
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={saveManualPath} disabled={savingPath}>
                {savingPath ? <Spinner /> : t.teuton.manualPathSave}
              </Button>
            </div>
            {pathSaved && (
              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" /> {t.teuton.manualPathSaved}
              </div>
            )}
            {teutonStatus?.source && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {teutonStatus.source === 'manual'
                  ? t.teuton.manualPathSourceManual
                  : t.teuton.manualPathSourceAuto}
              </p>
            )}
            {teutonStatus?.manualPathError && (
              <p className="mt-1.5 text-xs text-destructive">{teutonStatus.manualPathError}</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>{t.grading.title}</SectionTitle>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t.grading.passScore}</label>
              <p className="mb-1.5 text-xs text-muted-foreground">{t.grading.passScoreHint}</p>
              <Input
                type="number"
                min={1}
                max={99}
                value={grading.passScore}
                onChange={(e) =>
                  saveGrading({ ...grading, passScore: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t.grading.maxGrade}</label>
              <p className="mb-1.5 text-xs text-muted-foreground">{t.grading.maxGradeHint}</p>
              <Input
                type="number"
                min={1}
                value={grading.maxGrade}
                onChange={(e) =>
                  saveGrading({ ...grading, maxGrade: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-micro font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {t.grading.preview}
            </div>
            <div className="grid grid-cols-5 divide-x divide-border rounded-md border border-border text-center">
              {[0, 40, grading.passScore, 85, 100].map((score, i) => {
                const pass = score >= grading.passScore
                return (
                  <div key={i} className="px-2 py-2.5">
                    <div className="tnum text-xs text-muted-foreground">{score} pts</div>
                    <div
                      className={cn(
                        'tnum mt-0.5 text-lg font-bold',
                        pass ? 'text-success-strong' : 'text-destructive-strong'
                      )}
                    >
                      {formatGrade(score, grading)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {gradingSaved && (
            <div className="flex items-center gap-1.5 text-sm text-success-strong">
              <Check className="h-4 w-4" /> {t.grading.saved}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle hint={t.credentials.note}>{t.credentials.title}</SectionTitle>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.credentials.desc}</p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-micro font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              <span>{t.credentials.field}</span>
              <span>{t.credentials.value}</span>
              <span className="w-8" />
            </div>
            {globalRows.map(([key, value], i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input
                  ref={(el) => (keyInputs.current[i] = el)}
                  value={key}
                  placeholder="host2_ip"
                  onChange={(e) => updateGlobalRow(i, e.target.value, value)}
                  className="font-mono text-sm"
                />
                <Input
                  type={isSecretColumn(key) ? 'password' : 'text'}
                  value={value}
                  placeholder="valor"
                  onChange={(e) => updateGlobalRow(i, key, e.target.value)}
                />
                <button
                  onClick={() => removeGlobalRow(i)}
                  className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-strong"
                  aria-label={`Quitar ${key || 'campo'}`}
                  title="Quitar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={addGlobalRow}>
              <Plus className="h-4 w-4" /> {t.credentials.add}
            </Button>
            {globalsSaved && (
              <span className="flex items-center gap-1.5 text-sm text-success-strong">
                <Check className="h-4 w-4" /> {t.credentials.saved}
              </span>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle hint="El proyector de clase suele leerse mejor con el tema claro.">
          Apariencia
        </SectionTitle>
        <Segmented className="w-fit">
          <SegmentedItem
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            className="px-3 py-1.5"
          >
            Claro
          </SegmentedItem>
          <SegmentedItem
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            className="px-3 py-1.5"
          >
            Oscuro
          </SegmentedItem>
        </Segmented>
      </section>

      <section>
        <SectionTitle>Acerca de</SectionTitle>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Teutón GUI</span> es una interfaz gráfica
            independiente construida sobre el motor de evaluación{' '}
            <button
              onClick={() => window.teuton.openExternal('https://github.com/teuton-software/teuton')}
              className="font-medium text-primary hover:underline"
            >
              teuton-software/teuton
            </button>
            . Todo el mérito del motor es de sus autores (David Vargas Ruiz y colaboradores).
          </p>
          <p>
            Interfaz desarrollada por{' '}
            <span className="font-medium text-foreground">Adrià Muñoz</span>{' '}
            <button
              onClick={() => window.teuton.openExternal('mailto:amuno123@xtec.cat')}
              className="text-primary hover:underline"
            >
              amuno123@xtec.cat
            </button>
            . Licencia MPL-2.0, igual que Teutón.
          </p>
        </div>
      </section>
      </div>
      </div>
    </div>
  )
}
