import { describe, expect, it } from 'vitest'
import { buildMoodleCsv } from '../src/renderer/src/lib/moodleCsv'
import { gradeRecordsFromResults, unevaluatedStudents } from '../src/renderer/src/lib/integrity'
import { loadedResults, resumeCase } from './helpers'

// S-11: una máquina que no responde no es un cero académico.
const grading = { passScore: 70, maxGrade: 10 }
const off = { connErrors: { host1: 'timeout' } }

function results() {
  return loadedResults({
    resumeCases: [
      resumeCase('01', 'apagado', 0, off),
      resumeCase('02', 'cero', 0),
      resumeCase('03', 'parcial', 40, off)
    ]
  })
}

describe('máquina sin conexión (S-11)', () => {
  it('sin nota previa no sale en el CSV como 0.00', () => {
    const lines = buildMoodleCsv(results(), {}, grading).trim().split('\n')
    expect(lines.some((l) => l.startsWith('apagado,'))).toBe(false)
    // El cero real y la nota parcial sí se exportan.
    expect(lines.find((l) => l.startsWith('cero,'))).toContain(',0.00,')
    expect(lines.some((l) => l.startsWith('parcial,'))).toBe(true)
  })

  it('con nota previa exporta la nota previa', () => {
    const csv = buildMoodleCsv(results(), { apagado: 100 }, grading)
    expect(csv).toContain('apagado,10.00,')
  })

  it('un cero guardado de una pasada con conexión sí es una nota', () => {
    const csv = buildMoodleCsv(results(), { apagado: 0 }, grading)
    expect(csv).toContain('apagado,0.00,')
  })

  it('el historial no guarda el 0 de una máquina sin conexión', () => {
    const { grades } = gradeRecordsFromResults(results())
    expect(grades).toEqual({ cero: 0, parcial: 40 })
  })

  it('lista a los alumnos sin evaluar que quedarán fuera del CSV', () => {
    expect(unevaluatedStudents(results(), {})).toEqual(['apagado'])
    expect(unevaluatedStudents(results(), { apagado: 0 })).toEqual([])
  })
})
