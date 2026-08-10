import { useEffect } from 'react'
import {
  Home,
  FileCode2,
  PlayCircle,
  LayoutDashboard,
  BarChart3,
  Users,
  Settings as SettingsIcon,
  HelpCircle,
  Moon,
  Sun,
  CheckCircle2,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { useApp, type View } from './stores/app'
import { cn } from './lib/utils'
import { t } from './i18n/es'
import { useRunManager } from './lib/run'
import { MonitorSidebarStatus } from './components/Monitor'
import HomeView from './routes/Home'
import EditorView from './routes/Editor'
import RunView from './routes/Run'
import DashboardView from './routes/Dashboard'
import AnalyticsView from './routes/Analytics'
import ClassesView from './routes/Classes'
import SettingsView from './routes/Settings'
import HelpView from './routes/Help'

const NAV: { id: View; label: string; icon: typeof Home; needsProject?: boolean }[] = [
  { id: 'home', label: t.nav.home, icon: Home },
  { id: 'editor', label: t.nav.editor, icon: FileCode2, needsProject: true },
  { id: 'run', label: t.nav.run, icon: PlayCircle, needsProject: true },
  { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard, needsProject: true },
  { id: 'analytics', label: t.nav.analytics, icon: BarChart3, needsProject: true },
  { id: 'classes', label: t.nav.classes, icon: Users },
  { id: 'settings', label: t.nav.settings, icon: SettingsIcon },
  { id: 'help', label: t.nav.help, icon: HelpCircle }
]

export default function App() {
  const { theme, view, setView, toggleTheme, project, teutonStatus, setTeutonStatus, dirty } =
    useApp()
  const setGrading = useApp((s) => s.setGrading)
  const setDefaultGlobals = useApp((s) => s.setDefaultGlobals)
  const runStatus = useApp((s) => s.run.status)

  useRunManager()

  useEffect(() => {
    window.teuton.detect().then(setTeutonStatus)
    window.teuton.getGrading().then(setGrading)
    window.teuton.getDefaultGlobals().then(setDefaultGlobals)
  }, [setTeutonStatus, setGrading, setDefaultGlobals])

  // Al (re)abrir un proyecto, carga sus datos persistidos (récords y clase
  // activa), sea cual sea la vía. Depende del objeto proyecto (no solo de la
  // ruta) para cubrir también la reapertura del mismo directorio.
  const currentProject = useApp((s) => s.project)
  useEffect(() => {
    if (!currentProject) return
    const dir = currentProject.dir
    window.teuton
      .getProjectMeta(dir)
      .then(async (m) => {
        // La lectura es asíncrona: si el profesor abrió otro proyecto mientras
        // tanto, nunca volcamos el historial del proyecto anterior en la UI.
        if (useApp.getState().project?.dir !== dir) return
        const state = useApp.getState()
        state.setActiveClass(m.activeClass ?? null, m.activeClassId ?? null)
        const records = await window.teuton.getRecords(dir, m.activeClassId)
        if (useApp.getState().project?.dir === dir) useApp.getState().setRecords(records)
      })
  }, [currentProject])

  const views: Record<View, JSX.Element> = {
    home: <HomeView />,
    editor: <EditorView />,
    run: <RunView />,
    dashboard: <DashboardView />,
    analytics: <AnalyticsView />,
    classes: <ClassesView />,
    settings: <SettingsView />,
    help: <HelpView />
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-sidebar text-sidebar-foreground">
        <div className="drag flex items-center gap-2.5 px-5 pb-4 pt-5">
          {/* Marca plana: el halo azul bajo el cuadro era la única sombra
              coloreada del sistema y no describía ninguna profundidad. */}
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-base font-bold">T</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{t.app.name}</div>
            <div className="text-micro text-sidebar-foreground/50">{t.app.tagline}</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const disabled = item.needsProject && !project
            const active = view === item.id
            return (
              <button
                key={item.id}
                disabled={disabled}
                onClick={() => setView(item.id)}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/20 text-white'
                    : 'text-sidebar-foreground/70 hover:bg-white/5 hover:text-white',
                  disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent'
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
                {item.id === 'editor' && dirty && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-warning" />
                )}
                {item.id === 'run' && runStatus === 'running' && (
                  <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Estado del examen + proyecto + teuton */}
        <div className="space-y-3 px-4 pb-4">
          <MonitorSidebarStatus />
          {project && (
            <div className="rounded-md bg-white/5 px-3 py-2">
              <div className="text-glyph font-semibold uppercase tracking-[0.09em] text-sidebar-foreground/40">
                Proyecto
              </div>
              <div className="truncate text-xs font-medium text-white" title={project.dir}>
                {project.dir.split('/').filter(Boolean).pop()}
              </div>
            </div>
          )}
          <TeutonBadge />
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
          </button>
        </div>
      </aside>

      {/* Content */}
      {/* La franja de crédito permanente salió de aquí: ocupaba 32px de todas
          las pantallas, incluida la que se proyecta durante el examen. El
          crédito vive en Ajustes → Acerca de. */}
      <main key={view} className="flex flex-1 animate-fade-in flex-col overflow-hidden bg-background">
        {views[view]}
      </main>
    </div>
  )

  function TeutonBadge() {
    if (!teutonStatus) return null
    return teutonStatus.installed ? (
      <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success-strong">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {t.teuton.installed} · {teutonStatus.version}
        </span>
      </div>
    ) : (
      <button
        onClick={() => setView('settings')}
        className="flex w-full items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-left text-xs text-destructive-strong transition-colors hover:bg-destructive/20"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">{t.teuton.notInstalled}</span>
      </button>
    )
  }
}
