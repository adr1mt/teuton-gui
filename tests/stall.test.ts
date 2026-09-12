import { describe, it, expect } from 'vitest'
import { STALL_CYCLES, stalledCycles, updateStalls, type StallMap } from '../src/renderer/src/lib/stall'
import type { StudentRow } from '../src/renderer/src/lib/analytics'

function row(members: string, passed: number, grade: number): StudentRow {
  return { id: '01', members, grade, state: '~', passed, failed: 0, total: passed, connErrors: 0 }
}

/** Encadena N ciclos idénticos, como haría el modo examen sin que nadie avance. */
function cycles(rows: StudentRow[][], start: StallMap = {}): StallMap {
  return rows.reduce((acc, r) => updateStalls(acc, r), start)
}

describe('updateStalls', () => {
  it('el primer ciclo nunca cuenta como parón', () => {
    const map = updateStalls({}, [row('Ana', 0, 0)])
    expect(map.Ana).toEqual({ cycles: 0, passed: 0, grade: 0 })
  })

  it('cuenta los ciclos seguidos sin mejorar', () => {
    const map = cycles([[row('Ana', 2, 40)], [row('Ana', 2, 40)], [row('Ana', 2, 40)]])
    expect(map.Ana.cycles).toBe(2)
  })

  it('un objetivo más reinicia el contador aunque la nota no cambie', () => {
    const map = cycles([[row('Ana', 2, 40)], [row('Ana', 2, 40)], [row('Ana', 3, 40)]])
    expect(map.Ana.cycles).toBe(0)
  })

  it('más nota reinicia el contador aunque los objetivos no cambien', () => {
    const map = cycles([[row('Ana', 2, 40)], [row('Ana', 2, 55)]])
    expect(map.Ana.cycles).toBe(0)
  })

  it('bajar de nota no reinicia: sigue sin avanzar', () => {
    const map = cycles([[row('Ana', 3, 60)], [row('Ana', 2, 40)]])
    expect(map.Ana.cycles).toBe(1)
  })

  // Reevaluar a un alumno suelto no puede borrar el historial de los demás:
  // a ellos no se les ha vuelto a mirar.
  it('los alumnos ausentes de la pasada conservan su contador', () => {
    const before = cycles([[row('Ana', 1, 10), row('Luis', 1, 10)], [row('Ana', 1, 10), row('Luis', 1, 10)]])
    const after = updateStalls(before, [row('Luis', 2, 30)])
    expect(after.Ana.cycles).toBe(1)
    expect(after.Luis.cycles).toBe(0)
  })
})

describe('stalledCycles', () => {
  const stuck = cycles(Array.from({ length: STALL_CYCLES + 1 }, () => [row('Ana', 1, 40)]))

  it('avisa a partir del umbral', () => {
    expect(stalledCycles(stuck, row('Ana', 1, 40), 70)).toBe(STALL_CYCLES)
  })

  it('no avisa antes del umbral', () => {
    const few = cycles([[row('Ana', 1, 40)], [row('Ana', 1, 40)]])
    expect(stalledCycles(few, row('Ana', 1, 40), 70)).toBe(0)
  })

  // Quien ya ha aprobado y deja de subir ha terminado, no está atascado.
  it('no avisa si el alumno ya aprueba', () => {
    const done = cycles(Array.from({ length: STALL_CYCLES + 1 }, () => [row('Ana', 5, 90)]))
    expect(stalledCycles(done, row('Ana', 5, 90), 70)).toBe(0)
  })

  it('un alumno desconocido no está atascado', () => {
    expect(stalledCycles({}, row('Nueva', 0, 0), 70)).toBe(0)
  })
})
