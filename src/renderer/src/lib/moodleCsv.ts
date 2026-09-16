import type { GradeRecords, GradingSettings, LoadedResults } from '../../../shared/types'
import { isUnevaluated, studentRows } from './analytics'
import { bestScore, convertGrade } from './grading'

function escapeCsv(v: string): string {
  // El \r cuenta: un nombre con un retorno de carro suelto (el YAML lo conserva)
  // dejaba un campo sin entrecomillar con un salto dentro, y Moodle leía una
  // fila partida.
  const quoted = /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  // Un campo que empieza por = + - @ o tabulador lo ejecuta LibreOffice/Excel
  // como fórmula al abrir el CSV. Se neutraliza con un apóstrofo inicial; los
  // identificadores de Moodle y los nombres reales nunca empiezan así.
  return /^[=+\-@\t]/.test(v) ? `"'${v.replace(/"/g, '""')}"` : quoted
}

/**
 * Construye el CSV de Moodle de la clase actual usando SIEMPRE la mejor nota
 * (récord histórico): si un alumno acabó el examen con un 10 y apagó su máquina,
 * ese 10 es su nota final aunque la última pasada le diera un 0.
 */
export function buildMoodleCsv(
  results: LoadedResults,
  records: GradeRecords,
  grading: GradingSettings
): string {
  const lines = ['MoodleID,Nota,Feedback']
  for (const r of studentRows(results)) {
    if (r.members === '-' || r.members === '') continue // casos saltados (tt_skip)
    // Máquina sin conexión y sin nota previa: no hay nota que subir. Fuera del
    // CSV, Moodle deja la casilla vacía en vez de un 0 que nadie ha puesto.
    if (isUnevaluated(r) && records[r.members] === undefined) continue
    const rc = results.resume?.cases.find((c) => c.id === r.id)
    const id = rc?.moodleId && rc.moodleId !== 'NODATA' ? rc.moodleId : r.members
    const best = bestScore(r.grade, records[r.members])
    const grade = convertGrade(best, grading).toFixed(2)
    const feedback = `Mejor nota: ${best} pts Teuton (última pasada: ${r.passed}/${r.total} objetivos)`
    lines.push(`${escapeCsv(id)},${grade},${escapeCsv(feedback)}`)
  }
  return lines.join('\n') + '\n'
}
