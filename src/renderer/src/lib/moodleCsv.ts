import type { GradeRecords, GradingSettings, LoadedResults } from '../../../shared/types'
import { studentRows } from './analytics'
import { bestScore, convertGrade } from './grading'

function escapeCsv(v: string): string {
  // Evita que comas/comillas rompan el CSV de Moodle.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
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
    const rc = results.resume?.cases.find((c) => c.id === r.id)
    const id = rc?.moodleId && rc.moodleId !== 'NODATA' ? rc.moodleId : r.members
    const best = bestScore(r.grade, records[r.members])
    const grade = convertGrade(best, grading).toFixed(2)
    const feedback = `Mejor nota: ${best} pts Teuton (última pasada: ${r.passed}/${r.total} objetivos)`
    lines.push(`${escapeCsv(id)},${grade},${escapeCsv(feedback)}`)
  }
  return lines.join('\n') + '\n'
}
