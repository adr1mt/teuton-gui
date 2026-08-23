import { describe, expect, it } from 'vitest'
import {
  validatedGrading,
  validatedPath,
  validatedMeta,
  validatedRecords,
  validatedRoster
} from '../src/main/validation'

describe('validación de la frontera IPC', () => {
  it('acepta una escala válida y rechaza estados intermedios', () => {
    expect(validatedGrading({ passScore: 70, maxGrade: 10 })).toEqual({ passScore: 70, maxGrade: 10 })
    expect(() => validatedGrading({ passScore: 0, maxGrade: 10 })).toThrow(/entre 1 y 99/)
    expect(() => validatedGrading({ passScore: 70.5, maxGrade: 10 })).toThrow(/entero/)
    expect(() => validatedGrading({ passScore: 70, maxGrade: 0 })).toThrow(/mayor que 0/)
  })

  it('impide nombres e IDs de Moodle duplicados sin distinguir mayúsculas', () => {
    const base = { id: 'clase-1', name: 'ASIX', createdAt: 0, updatedAt: 0 }
    expect(() => validatedRoster({
      ...base,
      students: [{ name: 'Ana', moodleId: 'a@example.test' }, { name: ' ana ', moodleId: 'b@example.test' }]
    })).toThrow(/repetido/)
    expect(() => validatedRoster({
      ...base,
      students: [{ name: 'Ana', moodleId: 'A@example.test' }, { name: 'Luis', moodleId: 'a@example.test' }]
    })).toThrow(/Moodle/)
  })

  it('rechaza rutas relativas y notas fuera de rango', () => {
    expect(() => validatedPath('../proyecto')).toThrow(/ruta/i)
    expect(() => validatedRecords({ Ana: 101 })).toThrow(/no es válida/)
  })

  it('conserva el carácter parcial de los metadatos del proyecto', () => {
    expect(validatedMeta({ lastRunClassId: 'clase-2', lastRunClassName: 'ASIX B' })).toEqual({
      lastRunClassId: 'clase-2',
      lastRunClassName: 'ASIX B'
    })
    expect(validatedMeta({ activeClassId: 'clase-1' })).toEqual({ activeClassId: 'clase-1' })
  })
})
