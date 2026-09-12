import type { StudentRow } from './analytics'

/**
 * Alumnos que no avanzan de un ciclo a otro del modo examen.
 *
 * Durante un examen el profesor mira la pantalla cada pocos minutos y ve notas
 * bajas, pero no puede recordar cuáles son las MISMAS notas bajas de hace media
 * hora. Un alumno atascado (no entiende el enunciado, tiene la máquina a medio
 * arrancar) se confunde con uno que simplemente va despacio, y son dos cosas
 * distintas: al primero hay que ir a su sitio.
 *
 * Se guarda el último recuento de objetivos superados y la última nota; si en
 * el ciclo siguiente ninguno de los dos sube, el contador de ciclos parados
 * avanza. Los alumnos que NO vienen en la pasada actual (reevaluación de uno
 * solo) conservan su contador intacto: su situación no se ha vuelto a mirar.
 */
export interface StallEntry {
  /** Ciclos consecutivos sin mejorar. */
  cycles: number
  passed: number
  grade: number
}

export type StallMap = Record<string, StallEntry>

/** Ciclos seguidos sin avanzar a partir de los cuales se avisa. */
export const STALL_CYCLES = 3

export function updateStalls(prev: StallMap, rows: StudentRow[]): StallMap {
  const next: StallMap = { ...prev }
  for (const row of rows) {
    const before = prev[row.members]
    const improved = !before || row.passed > before.passed || row.grade > before.grade
    next[row.members] = {
      cycles: improved ? 0 : before.cycles + 1,
      passed: row.passed,
      grade: row.grade
    }
  }
  return next
}

/**
 * ¿Hay que avisar de este alumno? Solo si además sigue por debajo del aprobado:
 * quien ya ha aprobado y no sube más no está atascado, ha terminado.
 */
export function stalledCycles(stalls: StallMap, row: StudentRow, passScore: number): number {
  if (row.grade >= passScore) return 0
  const cycles = stalls[row.members]?.cycles ?? 0
  return cycles >= STALL_CYCLES ? cycles : 0
}
