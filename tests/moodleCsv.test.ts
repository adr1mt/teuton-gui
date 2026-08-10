import { describe, expect, it } from 'vitest'
import { buildMoodleCsv } from '../src/renderer/src/lib/moodleCsv'
import { caseReport, loadedResults, resumeCase } from './helpers'

const grading = { passScore: 70, maxGrade: 10 }

describe('buildMoodleCsv', () => {
  it('usa la MEJOR nota, no la de la última pasada', () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', 'pepito', 0)],
      cases: [caseReport('01', 'pepito', 0, [{ id: '01' }])]
    })
    // El alumno acabó con 100 y apagó la máquina: la última pasada le da 0.
    const csv = buildMoodleCsv(res, { pepito: 100 }, grading)
    expect(csv.split('\n')[1]).toContain('10.00')
    expect(csv).toContain('Mejor nota: 100 pts')
  })

  it('si la pasada actual supera al récord, gana la actual', () => {
    const res = loadedResults({ resumeCases: [resumeCase('01', 'pepito', 100)] })
    expect(buildMoodleCsv(res, { pepito: 40 }, grading).split('\n')[1]).toContain('10.00')
  })

  it('prefiere el ID de Moodle y descarta el centinela NODATA', () => {
    const res = loadedResults({
      resumeCases: [
        resumeCase('01', 'pepito', 100, { moodleId: 'pepito@elpuig.xeill.net' }),
        resumeCase('02', 'ana', 100, { moodleId: 'NODATA' })
      ]
    })
    const lines = buildMoodleCsv(res, {}, grading).split('\n')
    expect(lines[1]).toContain('pepito@elpuig.xeill.net')
    expect(lines[2]).toContain('ana')
    expect(lines[2]).not.toContain('NODATA')
  })

  it('omite los casos saltados (tt_skip deja el nombre vacío o "-")', () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', '-', 0), resumeCase('02', '', 0), resumeCase('03', 'ana', 100)]
    })
    const lines = buildMoodleCsv(res, {}, grading).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('ana')
  })

  it('escapa comas y comillas para no romper el CSV', () => {
    const res = loadedResults({ resumeCases: [resumeCase('01', 'Sanz, Ana "La Jefa"', 100)] })
    const line = buildMoodleCsv(res, {}, grading).split('\n')[1]
    expect(line.startsWith('"Sanz, Ana ""La Jefa"""')).toBe(true)
  })

  it('siempre lleva cabecera y salto final', () => {
    const csv = buildMoodleCsv(loadedResults({}), {}, grading)
    expect(csv).toBe('MoodleID,Nota,Feedback\n')
  })
})
