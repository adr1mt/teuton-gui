import { describe, expect, it } from 'vitest'
import { gradeRecordsFromResults, validateResultIdentity, validateRosterIdentity } from '../src/renderer/src/lib/integrity'
import { loadedResults, resumeCase } from './helpers'

describe('integridad de identidad', () => {
  it('bloquea nombres ambiguos al construir récords', () => {
    const results = loadedResults({
      resumeCases: [resumeCase('01', 'Ana', 80), resumeCase('02', ' ana ', 20)]
    })
    const outcome = gradeRecordsFromResults(results)
    expect(outcome.grades).toEqual({})
    expect(outcome.issues[0]?.kind).toBe('name-duplicate')
  })

  it('bloquea exportación con IDs Moodle vacíos o duplicados', () => {
    const results = loadedResults({
      resumeCases: [
        resumeCase('01', 'Ana', 80, { moodleId: 'same@example.test' }),
        resumeCase('02', 'Luis', 20, { moodleId: 'SAME@example.test' }),
        resumeCase('03', 'Marta', 60)
      ]
    })
    expect(validateResultIdentity(results).map((issue) => issue.kind)).toEqual([
      'moodle-empty',
      'moodle-duplicate'
    ])
  })

  it('una clase válida conserva alumnos distintos', () => {
    expect(validateRosterIdentity({
      id: 'clase-1',
      name: 'ASIX',
      createdAt: 0,
      updatedAt: 0,
      students: [
        { name: 'Ana', moodleId: 'ana@example.test' },
        { name: 'Luis', moodleId: 'luis@example.test' }
      ]
    })).toEqual([])
  })
})
