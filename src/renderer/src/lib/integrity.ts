import type { ClassRoster, GradeRecords, LoadedResults } from '../../../shared/types'
import { findDuplicateStudentIdentities } from '../../../shared/identity'
import { isUnevaluated, studentRows } from './analytics'

export interface IntegrityIssue {
  kind: 'name-empty' | 'name-duplicate' | 'moodle-empty' | 'moodle-duplicate'
  message: string
}

export function validateRosterIdentity(roster: ClassRoster): IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const emptyNames = roster.students.filter((student) => !student.name.trim()).length
  if (emptyNames > 0) {
    issues.push({ kind: 'name-empty', message: `${emptyNames} alumno(s) no tienen nombre.` })
  }
  const repeated = findDuplicateStudentIdentities(roster.students)
  if (repeated.names.length > 0) {
    issues.push({
      kind: 'name-duplicate',
      message: `Hay nombres repetidos: ${repeated.names.join(', ')}. Cada alumno necesita un nombre único.`
    })
  }
  if (repeated.moodleIds.length > 0) {
    issues.push({
      kind: 'moodle-duplicate',
      message: `Hay IDs de Moodle repetidos: ${repeated.moodleIds.join(', ')}.`
    })
  }
  return issues
}

export function validateResultIdentity(results: LoadedResults): IntegrityIssue[] {
  const rows = studentRows(results).filter((row) => row.members !== '-' && row.members.trim())
  const issues: IntegrityIssue[] = []
  const identities = rows.map((row) => ({
    name: row.members,
    moodleId: results.resume?.cases.find((entry) => entry.id === row.id)?.moodleId
  }))
  const repeated = findDuplicateStudentIdentities(identities)
  if (repeated.names.length > 0) {
    issues.push({
      kind: 'name-duplicate',
      message: `Los resultados contienen alumnos con el mismo nombre: ${repeated.names.join(', ')}.`
    })
  }
  const moodleIds = identities.map((identity) => identity.moodleId ?? '')
  const missingMoodle = moodleIds.filter((id) => !id || id === 'NODATA').length
  if (missingMoodle > 0) {
    issues.push({
      kind: 'moodle-empty',
      message: `${missingMoodle} alumno(s) no tienen ID de Moodle; no se exportará hasta completarlo.`
    })
  }
  const repeatedMoodle = findDuplicateStudentIdentities(
    identities.filter((identity) => identity.moodleId !== 'NODATA')
  ).moodleIds
  if (repeatedMoodle.length > 0) {
    issues.push({
      kind: 'moodle-duplicate',
      message: `Los resultados contienen IDs de Moodle repetidos: ${repeatedMoodle.join(', ')}.`
    })
  }
  return issues
}

export function gradeRecordsFromResults(results: LoadedResults): {
  grades: GradeRecords
  issues: IntegrityIssue[]
} {
  const issues = validateResultIdentity(results).filter((issue) => issue.kind.startsWith('name-'))
  if (issues.length > 0) return { grades: {}, issues }
  const grades: GradeRecords = {}
  for (const row of studentRows(results)) {
    if (row.members === '-' || !row.members.trim() || isUnevaluated(row)) continue
    grades[row.members] = row.grade
  }
  return { grades, issues: [] }
}

/** Alumnos sin evaluar y sin nota guardada: el CSV los deja fuera (S-11). */
export function unevaluatedStudents(results: LoadedResults, records: GradeRecords): string[] {
  return studentRows(results)
    .filter((row) => row.members !== '-' && row.members && isUnevaluated(row))
    .filter((row) => records[row.members] === undefined)
    .map((row) => row.members)
}
