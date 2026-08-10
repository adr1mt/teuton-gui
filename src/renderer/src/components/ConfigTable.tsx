import { useEffect, useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, Users, GraduationCap, ChevronDown } from 'lucide-react'
import {
  caseColumns,
  isSecretColumn,
  parseConfig,
  stringifyConfig,
  type TeutonConfig
} from '../lib/config'
import { t } from '../i18n/es'
import { Button, CustomFieldEntry, Input } from './ui'
import { cn } from '../lib/utils'
import { COMMON_FIELDS } from '../lib/fields'
import { useApp } from '../stores/app'
import type { ClassRoster } from '../../../shared/types'

export default function ConfigTable({
  yamlText,
  onChange
}: {
  yamlText: string
  onChange: (yaml: string) => void
}) {
  const { config, error } = parseConfig(yamlText)
  const [showSecrets, setShowSecrets] = useState(false)
  const [classes, setClasses] = useState<ClassRoster[]>([])
  const [showImport, setShowImport] = useState(false)
  const [showAddField, setShowAddField] = useState(false)

  useEffect(() => {
    window.teuton.listClasses().then(setClasses)
  }, [])

  // Cerrar los desplegables con la tecla Escape.
  useEffect(() => {
    if (!showImport && !showAddField) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowImport(false)
        setShowAddField(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showImport, showAddField])

  const columns = caseColumns(config.cases)
  if (columns.length === 0) columns.push('tt_members')

  function emit(next: TeutonConfig) {
    onChange(stringifyConfig(next))
  }

  function updateCell(rowIdx: number, col: string, value: string) {
    const cases = config.cases.map((c, i) => (i === rowIdx ? { ...c, [col]: value } : c))
    emit({ ...config, cases })
  }

  function addCase() {
    // El alumno nuevo hereda todas las columnas existentes (incluida la IP).
    const template: Record<string, string> = {}
    for (const col of columns) template[col] = ''
    template.tt_members = `alumno_${config.cases.length + 1}`
    emit({ ...config, cases: [...config.cases, template] })
  }

  function removeCase(idx: number) {
    emit({ ...config, cases: config.cases.filter((_, i) => i !== idx) })
  }

  function addField(name: string) {
    if (!name) return
    if (columns.includes(name)) {
      setShowAddField(false)
      return
    }
    const cases = config.cases.length
      ? config.cases.map((c) => ({ ...c, [name]: '' }))
      : [{ tt_members: 'alumno_1', [name]: '' }]
    emit({ ...config, cases })
    setShowAddField(false)
  }

  function updateGlobal(key: string, value: string) {
    emit({ ...config, global: { ...config.global, [key]: value } })
  }

  function addGlobal(name: string) {
    emit({ ...config, global: { ...config.global, [name]: '' } })
  }

  function importClass(roster: ClassRoster) {
    // Solo conservamos los valores específicos (servicio, puerto...) al volver
    // a importar LA MISMA clase. Al cambiar de grupo partimos de sus propios
    // datos: un alumno homónimo no puede heredar IPs ni credenciales del grupo
    // anterior.
    const sameClass = useApp.getState().activeClassId === roster.id
    const existingByName = sameClass
      ? new Map(config.cases.map((c) => [String(c.tt_members ?? ''), c]))
      : new Map<string, typeof config.cases[number]>()
    const cases = roster.students.map((s) => {
      const existing = existingByName.get(s.name) || {}
      const row: Record<string, string> = { ...(existing as Record<string, string>), tt_members: s.name }
      if (s.moodleId) row.tt_moodle_id = s.moodleId
      if (s.fields) Object.assign(row, s.fields)
      if (!('host1_ip' in row)) row.host1_ip = ''
      return row
    })
    // Vuelca las credenciales por defecto (usuario/contraseña de las máquinas)
    // a la sección global: del proyecto, sin pisar lo que el profesor ya tuviera
    // puesto ahí explícitamente.
    const defaults = useApp.getState().defaultGlobals
    const global = { ...defaults, ...(config.global || {}) }
    emit({ ...config, global, cases })
    // Recuerda qué clase está activa en este proyecto: da nombre al CSV de
    // Moodle por clase y persiste entre sesiones.
    const st = useApp.getState()
    st.setActiveClass(roster.name, roster.id)
    if (st.project) {
      void window.teuton.setProjectMeta(st.project.dir, {
        activeClass: roster.name,
        activeClassId: roster.id
      })
      // Al cambiar de grupo también cambia el historial que se enseña. Así el
      // dashboard nunca muestra como récord los datos de la clase anterior.
      void window.teuton.getRecords(st.project.dir, roster.id).then(st.setRecords)
    }
    setShowImport(false)
  }

  const globalKeys = Object.keys(config.global || {})

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Backdrop para cerrar desplegables al hacer clic fuera */}
      {(showImport || showAddField) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowImport(false)
            setShowAddField(false)
          }}
        />
      )}
      {error && (
        <div className="mx-4 mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
          No se pudo interpretar el YAML: {error}. Edítalo en la pestaña «{t.editor.rawYaml}».
        </div>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Global */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">{t.editor.global}</h3>
            <CustomFieldEntry
              label={`+ ${t.editor.addColumn}`}
              placeholder="host1_username"
              onAdd={addGlobal}
              className="w-auto"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {globalKeys.length === 0 && (
              <p className="col-span-2 rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                Sin configuración global. Añade campos comunes a todos los alumnos (p.ej.
                host1_username).
              </p>
            )}
            {globalKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <label className="w-36 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {key}
                </label>
                <Input
                  value={String(config.global[key] ?? '')}
                  onChange={(e) => updateGlobal(key, e.target.value)}
                  className="h-8"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Cases */}
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Users className="h-4 w-4" />
              {t.editor.cases}
              <span className="rounded-full bg-muted px-2 py-0.5 text-glyph">
                {config.cases.length}
              </span>
            </h3>
            <div className="ml-auto flex flex-wrap gap-1">
              {/* Importar clase */}
              <div className="relative">
                <Button size="sm" variant="outline" onClick={() => setShowImport((s) => !s)}>
                  <GraduationCap className="h-3.5 w-3.5" /> Importar clase
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {showImport && (
                  <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {classes.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No hay clases guardadas. Créalas en la pestaña «Clases».
                      </p>
                    ) : (
                      classes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => importClass(c)}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="truncate">{c.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.students.length}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* Añadir campo común */}
              <div className="relative">
                <Button size="sm" variant="ghost" onClick={() => setShowAddField((s) => !s)}>
                  <Plus className="h-3.5 w-3.5" /> {t.editor.addColumn}
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {showAddField && (
                  <div className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {COMMON_FIELDS.filter((f) => !columns.includes(f.key)).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => addField(f.key)}
                        className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        {f.label}
                      </button>
                    ))}
                    <CustomFieldEntry
                      label="+ Campo personalizado…"
                      placeholder="host2_ip"
                      onAdd={addField}
                      className="border-t border-border"
                    />
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowSecrets((s) => !s)}>
                {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showSecrets ? 'Ocultar' : 'Mostrar'} claves
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="w-10 border-b border-border px-2 py-2 text-xs font-medium text-muted-foreground">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="border-b border-l border-border px-3 py-2 text-left font-mono text-xs font-medium text-muted-foreground"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="w-10 border-b border-l border-border" />
                </tr>
              </thead>
              <tbody>
                {config.cases.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-muted/30">
                    <td className="border-b border-border px-2 py-1 text-center text-xs text-muted-foreground">
                      {rowIdx + 1}
                    </td>
                    {columns.map((col) => {
                      const secret = isSecretColumn(col) && !showSecrets
                      return (
                        <td key={col} className="border-b border-l border-border p-0">
                          <input
                            type={secret ? 'password' : 'text'}
                            value={String(row[col] ?? '')}
                            placeholder={col === 'host1_ip' ? '192.168.1.10' : ''}
                            onChange={(e) => updateCell(rowIdx, col, e.target.value)}
                            className={cn(
                              'w-full min-w-[120px] bg-transparent px-3 py-1.5 text-sm outline-none focus:bg-accent/40',
                              col === 'tt_members' && 'font-medium'
                            )}
                          />
                        </td>
                      )
                    })}
                    <td className="border-b border-l border-border text-center">
                      <button
                        onClick={() => removeCase(rowIdx)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={t.editor.removeCase}
                        aria-label={`${t.editor.removeCase} alumno ${rowIdx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {config.cases.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length + 2}
                      className="px-3 py-6 text-center text-sm text-muted-foreground"
                    >
                      No hay alumnos. Añade el primero o importa una clase.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Button size="sm" variant="outline" onClick={addCase} className="mt-3">
            <Plus className="h-4 w-4" /> {t.editor.addCase}
          </Button>
        </section>
      </div>
    </div>
  )
}
