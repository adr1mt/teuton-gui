import { useEffect, useState } from 'react'
import { FolderOpen, Plus, X, Loader2 } from 'lucide-react'
import { useApp } from '../stores/app'
import { t } from '../i18n/es'
import { Button, ConfirmDialog, SectionTitle, ViewHeader } from '../components/ui'
import { isExamInProgress, leaveProject } from '../lib/run'
import type { RecentProject } from '../../../shared/types'

export default function Home() {
  const { setProject, setView } = useApp()
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Abrir otro proyecto con un examen en marcha aborta la corrección de la clase
  // actual, así que se pregunta antes. `pending` guarda qué se iba a hacer.
  const [pending, setPending] = useState<{ dir: string; create: boolean } | null>(null)

  const refresh = async () => {
    try {
      setRecents(await window.teuton.recentProjects())
    } catch (cause) {
      setError(`No se pudieron cargar los proyectos recientes: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function openDir(dir: string) {
    setBusy(dir)
    setError(null)
    try {
      await leaveProject()
      const files = await window.teuton.openProject(dir)
      // App.tsx carga récords y clase activa al detectar el cambio de proyecto.
      setProject(files)
      setView('editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  /** Abre (o crea) pidiendo confirmación si hay una corrección en marcha. */
  async function guard(dir: string, create: boolean) {
    if (isExamInProgress()) {
      setPending({ dir, create })
      return
    }
    await (create ? createDir(dir) : openDir(dir))
  }

  async function handleOpen() {
    try {
      const dir = await window.teuton.pickDirectory()
      if (dir) await guard(dir, false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleCreate() {
    let dir: string | null
    try {
      dir = await window.teuton.pickDirectory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    if (!dir) return
    await guard(dir, true)
  }

  async function createDir(dir: string) {
    setBusy(dir)
    setError(null)
    try {
      await leaveProject()
      const files = await window.teuton.createProject(dir)
      setProject(files)
      setView('editor')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  async function removeRecent(e: React.MouseEvent, dir: string) {
    e.stopPropagation()
    try {
      setRecents(await window.teuton.removeRecent(dir))
    } catch (cause) {
      setError(`No se pudo quitar el proyecto: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Las dos acciones viven en la barra, no en dos tarjetas gigantes con
          icono y descripción: son dos botones, y lo que esta vista tiene que
          enseñar es la lista de proyectos. */}
      <ViewHeader
        title={t.home.title}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleOpen} disabled={busy !== null}>
              <FolderOpen className="h-4 w-4" /> {t.home.open}
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={busy !== null}>
              <Plus className="h-4 w-4" /> {t.home.create}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
        <div className="max-w-3xl">
          {error && (
            <div role="alert" className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-dense text-destructive-strong">
              {error}
            </div>
          )}

          <SectionTitle hint={t.home.subtitle}>{t.home.recent}</SectionTitle>

          {recents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t.home.noRecent}</p>
          ) : (
            <ul>
              {recents.map((r) => (
                <li key={r.dir} className="group relative border-b border-border/70">
                  <button
                    onClick={() => void guard(r.dir, false)}
                    className="flex w-full items-center gap-3 rounded-md py-3 pl-2 pr-10 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {r.dir}
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2">
                    {busy === r.dir ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => removeRecent(e, r.dir)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        title={t.home.removeRecent}
                        aria-label={`${t.home.removeRecent}: ${r.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Hay una corrección en marcha"
        confirmLabel="Abrir de todas formas"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const target = pending
          setPending(null)
          if (target) void (target.create ? createDir(target.dir) : openDir(target.dir))
        }}
      >
        Si abres otro proyecto ahora se detendrá la evaluación de la clase actual y el modo examen.
        Las notas ya guardadas se conservan.
      </ConfirmDialog>
    </div>
  )
}
