export interface StudentIdentity {
  name: string
  moodleId?: string | null
}

export interface DuplicateStudentIdentities {
  names: string[]
  moodleIds: string[]
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('es')
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    const key = normalized(value)
    if (!key) continue
    if (seen.has(key)) repeated.add(value.trim())
    else seen.add(key)
  }
  return [...repeated]
}

/** Aplica la misma regla de identidad a ambos lados de la frontera IPC. */
export function findDuplicateStudentIdentities(
  students: StudentIdentity[]
): DuplicateStudentIdentities {
  return {
    names: duplicates(students.map((student) => student.name)),
    moodleIds: duplicates(
      students.map((student) => student.moodleId ?? '').filter(Boolean)
    )
  }
}
