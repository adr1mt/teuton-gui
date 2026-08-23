import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Save, ShieldCheck, FileCode2, Settings2, Table2, Braces, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import { Button, Segmented, SegmentedItem, ViewHeader } from '../components/ui'
import ConfigTable from '../components/ConfigTable'
import type { CheckResult } from '../../../shared/types'

const CodeEditor = lazy(() => import('../components/CodeEditor'))

type Pane = 'script' | 'config'
type ConfigMode = 'table' | 'yaml'

export default function Editor() {
  const {
    project,
    scriptDraft,
    configDraft,
    setScriptDraft,
    setConfigDraft,
    dirty,
    markSaved
  } = useApp()
  const [pane, setPane] = useState<Pane>('script')
  const [configMode, setConfigMode] = useState<ConfigMode>('table')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const setOperationalError = useApp((s) => s.setOperationalError)

  useEffect(() => {
    setCheck(null)
  }, [project?.dir])

  // Ctrl/Cmd+S guarda. Guardamos la función en un ref para que el atajo use
  // siempre los borradores actuales, no los del primer render.
  const saveRef = useRef<() => void>(() => {})
  saveRef.current = () => {
    if (project && dirty && !saving) void save()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {t.editor.noProject}
      </div>
    )
  }

  async function save(): Promise<boolean> {
    if (!project) return false
    setSaving(true)
    try {
      await window.teuton.saveProject({
        dir: project.dir,
        scriptFile: project.scriptFile,
        configFile: project.configFile,
        script: scriptDraft,
        config: configDraft
      })
      markSaved()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      return true
    } catch (cause) {
      setOperationalError(`No se pudieron guardar los cambios: ${cause instanceof Error ? cause.message : String(cause)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function runCheck() {
    if (!project) return
    setChecking(true)
    try {
      if (dirty && !(await save())) return
      const res = await window.teuton.check(project.dir, project.cname)
      setCheck(res)
    } catch (cause) {
      setOperationalError(`No se pudo comprobar el proyecto: ${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title={t.nav.editor}
        meta={
          <>
            <Segmented>
              <SegmentedItem active={pane === 'script'} onClick={() => setPane('script')}>
                <FileCode2 className="h-3.5 w-3.5" /> {t.editor.script}
              </SegmentedItem>
              <SegmentedItem active={pane === 'config'} onClick={() => setPane('config')}>
                <Settings2 className="h-3.5 w-3.5" /> {t.editor.config}
              </SegmentedItem>
            </Segmented>
            {pane === 'config' && (
              <Segmented>
                <SegmentedItem
                  active={configMode === 'table'}
                  onClick={() => setConfigMode('table')}
                >
                  <Table2 className="h-3.5 w-3.5" /> {t.editor.table}
                </SegmentedItem>
                <SegmentedItem active={configMode === 'yaml'} onClick={() => setConfigMode('yaml')}>
                  <Braces className="h-3.5 w-3.5" /> {t.editor.rawYaml}
                </SegmentedItem>
              </Segmented>
            )}
          </>
        }
        actions={
          <>
            {dirty && (
              <span className="flex items-center gap-1.5 text-xs text-warning-strong">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {t.editor.unsaved}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {t.editor.check}
            </Button>
            <Button size="sm" onClick={save} disabled={saving || (!dirty && !savedFlash)} title="Ctrl+S">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedFlash ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savedFlash ? t.editor.saved : t.editor.save}
            </Button>
          </>
        }
      />

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {pane === 'script' ? (
          <EditorLoader><CodeEditor language="ruby" value={scriptDraft} onChange={setScriptDraft} /></EditorLoader>
        ) : configMode === 'table' ? (
          <ConfigTable yamlText={configDraft} onChange={setConfigDraft} />
        ) : (
          <EditorLoader><CodeEditor language="yaml" value={configDraft} onChange={setConfigDraft} /></EditorLoader>
        )}
      </div>

      {/* Diagnostics */}
      {check && (
        <div className="max-h-56 shrink-0 overflow-y-auto border-t border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium">
            {check.ok ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            {t.editor.diagnostics}
            <button
              onClick={() => setCheck(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              {t.common.close}
            </button>
          </div>
          <pre className="whitespace-pre-wrap px-4 pb-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {check.output || 'Sin observaciones.'}
          </pre>
        </div>
      )}
    </div>
  )
}

function EditorLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t.common.loading}
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
