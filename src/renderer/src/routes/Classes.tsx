import { useEffect, useState } from 'react'
import {
  Users,
  Plus,
  Trash2,
  Save,
  GraduationCap,
  ClipboardPaste,
  UserPlus,
  ChevronDown,
  Info
} from 'lucide-react'
import { t } from '../i18n/es'
import { Button, Card, ConfirmDialog, CustomFieldEntry, Input, ViewHeader } from '../components/ui'
import { cn } from '../lib/utils'
import { CLASS_COMMON_FIELDS, CLASS_FIXED_FIELD } from '../lib/fields'
import { isSecretColumn } from '../lib/config'
import type { ClassRoster, Student } from '../../../shared/types'

function emptyClass(): ClassRoster {
  return { id: crypto.randomUUID(), name: '', students: [], createdAt: 0, updatedAt: 0 }
}

/**
 * Columnas de "fields" a mostrar. La IP (host1_ip) va siempre primera y fija,
 * aunque ningún alumno la tenga aún rellena, para no esconderla tras el «+».
 */
function fieldColumns(students: Student[]): string[] {
  const cols: string[] = [CLASS_FIXED_FIELD]
  const seen = new Set<string>(cols)
  for (const s of students) {
    for (const key of Object.keys(s.fields || {})) {
      if (!seen.has(key)) {
        seen.add(key)
        cols.push(key)
      }
    }
  }
  return cols
}

export default function Classes() {
  const [classes, setClasses] = useState<ClassRoster[]>([])
  const [editing, setEditing] = useState<ClassRoster | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [showAddField, setShowAddField] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ClassRoster | null>(null)

  useEffect(() => {
    window.teuton.listClasses().then(setClasses)
  }, [])

  useEffect(() => {
    if (!showAddField) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowAddField(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAddField])

  function newClass() {
    setEditing(emptyClass())
    setPasteText('')
    setShowPaste(false)
  }

  function editClass(c: ClassRoster) {
    setEditing(JSON.parse(JSON.stringify(c)))
    setShowPaste(false)
  }

  async function save() {
    if (!editing) return
    if (!editing.name.trim()) {
      editing.name = 'Clase sin nombre'
    }
    const list = await window.teuton.saveClass(editing)
    setClasses(list)
    setEditing(null)
  }

  async function remove(id: string) {
    setPendingDelete(null)
    setClasses(await window.teuton.deleteClass(id))
    if (editing?.id === id) setEditing(null)
  }

  function patchStudent(idx: number, patch: Partial<Student>) {
    if (!editing) return
    const students = editing.students.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    setEditing({ ...editing, students })
  }

  function patchStudentField(idx: number, key: string, value: string) {
    if (!editing) return
    const students = editing.students.map((s, i) =>
      i === idx ? { ...s, fields: { ...s.fields, [key]: value } } : s
    )
    setEditing({ ...editing, students })
  }

  function addStudent() {
    if (!editing) return
    setEditing({ ...editing, students: [...editing.students, { name: '', moodleId: '' }] })
  }

  function removeStudent(idx: number) {
    if (!editing) return
    setEditing({ ...editing, students: editing.students.filter((_, i) => i !== idx) })
  }

  function addFieldColumn(key: string) {
    if (!editing) return
    const students = editing.students.map((s) => ({ ...s, fields: { ...s.fields, [key]: s.fields?.[key] ?? '' } }))
    setEditing({ ...editing, students })
    setShowAddField(false)
  }

  function removeFieldColumn(key: string) {
    if (!editing) return
    const students = editing.students.map((s) => {
      if (!s.fields) return s
      const fields = { ...s.fields }
      delete fields[key]
      return { ...s, fields }
    })
    setEditing({ ...editing, students })
  }

  function applyPaste() {
    if (!editing) return
    // Columnas esperadas al pegar de una hoja de cálculo (tab) o CSV: Nombre,
    // Email (→ ID de Moodle) e IP (→ host1_ip). Filas con solo el nombre, o
    // nombre+email, también valen: las columnas que falten se dejan vacías.
    const parsed: Student[] = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, moodleId, ip] = line.split(/[,;\t]/).map((x) => x.trim())
        const student: Student = { name, moodleId: moodleId || undefined }
        if (ip) student.fields = { host1_ip: ip }
        return student
      })
      .filter((s) => s.name)
    setEditing({ ...editing, students: [...editing.students, ...parsed] })
    setPasteText('')
    setShowPaste(false)
  }

  const fCols = editing ? fieldColumns(editing.students) : []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader
        title={t.classes.title}
        meta={
          <span className="tnum text-xs text-muted-foreground">
            {classes.length} {classes.length === 1 ? 'clase' : 'clases'}
          </span>
        }
        actions={
          // Único «Nueva clase» de la vista: el estado vacío del panel derecho
          // repetía el mismo botón a 30cm del primero.
          <Button size="sm" onClick={newClass}>
            <Plus className="h-4 w-4" /> {t.classes.newClass}
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Lista de clases */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border p-3">
        {classes.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t.classes.empty}</p>
        )}
        <div className="space-y-0.5">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => editClass(c)}
              aria-current={editing?.id === c.id ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                editing?.id === c.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
            >
              <GraduationCap className="h-4 w-4 shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="tnum text-xs opacity-70">
                  {c.students.length} {c.students.length === 1 ? t.classes.student : t.classes.students}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor de clase */}
      <div className="flex-1 overflow-y-auto">
        {!editing ? (
          // Dos estados distintos: «aún no hay clases» y «no has abierto
          // ninguna». Enseñar el primero con 13 clases en la lista de al lado
          // se contradice consigo mismo.
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
            <Users className="h-8 w-8 opacity-30" />
            {classes.length === 0 ? (
              <>
                <p className="max-w-sm text-center text-sm">{t.classes.subtitle}</p>
                <p className="max-w-sm text-center text-xs">{t.classes.importInfo}</p>
              </>
            ) : (
              <p className="max-w-sm text-center text-sm">{t.classes.pickOne}</p>
            )}
          </div>
        ) : (
          <div className="max-w-4xl p-6">
            <div className="mb-2 flex items-center gap-3">
              <Input
                value={editing.name}
                placeholder={t.classes.className}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="h-11 max-w-sm text-lg font-semibold"
              />
              <div className="ml-auto flex gap-2">
                {editing.createdAt > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setPendingDelete(editing)}>
                    <Trash2 className="h-4 w-4" /> {t.classes.delete}
                  </Button>
                )}
                <Button size="sm" onClick={save}>
                  <Save className="h-4 w-4" /> {t.classes.save}
                </Button>
              </div>
            </div>

            <p className="mb-4 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t.classes.fieldsHint}
            </p>

            <Card className="overflow-visible">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">{t.classes.name}</th>
                      <th className="px-3 py-2.5">{t.classes.moodleId}</th>
                      {fCols.map((col) => (
                        <th key={col} className="border-l border-border px-3 py-2.5 font-mono">
                          <div className="flex items-center gap-1.5">
                            {col}
                            {col !== CLASS_FIXED_FIELD && (
                              <button
                                onClick={() => removeFieldColumn(col)}
                                className="rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive-strong"
                                aria-label={`Quitar columna ${col}`}
                                title={`Quitar columna ${col}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="w-10 border-l border-border px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {editing.students.map((s, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1 text-center text-xs text-muted-foreground">{i + 1}</td>
                        <td className="p-0">
                          <input
                            value={s.name}
                            onChange={(e) => patchStudent(i, { name: e.target.value })}
                            className="w-full min-w-[120px] bg-transparent px-3 py-2 font-medium outline-none focus:bg-accent/40"
                          />
                        </td>
                        <td className="p-0">
                          <input
                            value={s.moodleId ?? ''}
                            placeholder="—"
                            onChange={(e) => patchStudent(i, { moodleId: e.target.value })}
                            className="w-full min-w-[160px] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:bg-accent/40"
                          />
                        </td>
                        {fCols.map((col) => {
                          const secret = isSecretColumn(col)
                          return (
                            <td key={col} className="border-l border-border p-0">
                              <input
                                type={secret ? 'password' : 'text'}
                                value={s.fields?.[col] ?? ''}
                                placeholder={col === 'host1_ip' ? '192.168.1.10' : ''}
                                onChange={(e) => patchStudentField(i, col, e.target.value)}
                                className="w-full min-w-[120px] bg-transparent px-3 py-2 text-sm outline-none focus:bg-accent/40"
                              />
                            </td>
                          )
                        })}
                        <td className="border-l border-border text-center">
                          <button
                            onClick={() => removeStudent(i)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Eliminar alumno ${s.name || i + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {editing.students.length === 0 && (
                      <tr>
                        <td colSpan={4 + fCols.length} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Añade alumnos o pega una lista.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={addStudent}>
                <UserPlus className="h-4 w-4" /> {t.classes.addStudent}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowPaste((s) => !s)}>
                <ClipboardPaste className="h-4 w-4" /> {t.classes.paste}
              </Button>
              {/* Fuera de la cabecera de la tabla: allí el desplegable lo
                  recortaba el contenedor con scroll horizontal. */}
              <div className="relative">
                <Button size="sm" variant="ghost" onClick={() => setShowAddField((s) => !s)}>
                  <Plus className="h-4 w-4" /> {t.editor.addColumn}
                  <ChevronDown className="h-3 w-3" />
                </Button>
                {showAddField && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddField(false)} />
                    <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
                      {CLASS_COMMON_FIELDS.filter((f) => !fCols.includes(f.key)).map((f) => (
                        <button
                          key={f.key}
                          onClick={() => addFieldColumn(f.key)}
                          className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {f.label}
                        </button>
                      ))}
                      <CustomFieldEntry
                        label="+ Campo personalizado…"
                        placeholder="host2_ip"
                        onAdd={addFieldColumn}
                        className="border-t border-border"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {showPaste && (
              <div className="mt-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={t.classes.pasteHint}
                  rows={6}
                  className="w-full rounded-lg border border-input bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="sm" onClick={applyPaste} className="mt-2" disabled={!pasteText.trim()}>
                  <Plus className="h-4 w-4" /> Añadir {pasteText.split('\n').filter((l) => l.trim()).length} alumno(s)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        destructive
        title={t.classes.confirmDeleteTitle}
        confirmLabel={t.classes.delete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
      >
        <p>
          {t.classes.confirmDeleteBody(
            pendingDelete?.name || t.classes.unnamed,
            pendingDelete?.students.length ?? 0
          )}
        </p>
        <p>{t.classes.confirmDeleteConsequence}</p>
      </ConfirmDialog>
      </div>
    </div>
  )
}
