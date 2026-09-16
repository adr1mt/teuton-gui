import type { CaseReport, LoadedResults, ResumeCase, TeutonTarget } from '../../../shared/types'
import { stalledCycles, type StallMap } from './stall'

export interface StudentRow {
  id: string
  members: string
  grade: number
  state: string
  passed: number
  failed: number
  total: number
  connErrors: number
  caseReport?: CaseReport
}

/**
 * Combina resume + case reports en filas por alumno. `passScore` solo se usa en
 * el camino de respaldo (sin resume.json) para decidir la letra de estado, que
 * Teutón normalmente ya nos da.
 */
export function studentRows(results: LoadedResults, passScore = 50): StudentRow[] {
  const byId = new Map<string, CaseReport>()
  for (const c of results.cases) byId.set(c.caseId, c)

  const countTargets = (c?: CaseReport) => {
    let passed = 0
    let failed = 0
    if (c) {
      for (const g of c.groups) {
        for (const tgt of g.targets) {
          if (tgt.check) passed++
          else failed++
        }
      }
    }
    return { passed, failed, total: passed + failed }
  }

  // Preferimos el resumen (incluye estado y errores de conexión); los casos
  // sueltos solo cuando NO hay resume.json. Un resumen con cero casos es una
  // pasada sin alumnos, no una invitación a leer los informes que queden.
  const resumeCases: ResumeCase[] | null = results.resume?.cases ?? null

  if (resumeCases) {
    // Las filas `skip` (id «-») son alumnos que esta pasada no evaluó: con
    // `--case` Teutón escribe una por cada alumno no elegido. No son alumnos
    // con un 0.
    return resumeCases.filter((rc) => !rc.skip).map((rc) => {
      const c = byId.get(rc.id)
      const counts = countTargets(c)
      return {
        id: rc.id,
        // Nombre sin espacios sobrantes: es la clave del récord histórico y del
        // CSV de Moodle, y «Ana García » partía el historial en dos.
        members: rc.members.trim(),
        grade: rc.grade,
        state: rc.state,
        connErrors: Object.keys(rc.connErrors).length,
        caseReport: c,
        ...counts
      }
    })
  }

  return results.cases.map((c) => {
    const counts = countTargets(c)
    return {
      id: c.caseId,
      members: c.members.trim(),
      grade: c.grade,
      state: c.grade >= 100 ? '✓' : c.grade < passScore ? '✗' : '~',
      connErrors: 0,
      caseReport: c,
      ...counts
    }
  })
}

/**
 * Sin evaluar: algún host no respondió y Teutón dio un 0. Ese 0 mide la red del
 * aula, no al alumno (S-11), así que no se guarda ni se exporta como nota.
 * Una nota mayor que 0 sí la ganó, aunque un host fallara.
 */
export function isUnevaluated(row: Pick<StudentRow, 'connErrors' | 'grade'>): boolean {
  return row.connErrors > 0 && row.grade === 0
}

export interface Kpis {
  count: number
  average: number
  passRate: number
  passCount: number
  max: number
  min: number
  connErrors: number
}

/** KPIs de la clase. El aprobado usa el umbral configurable, no un 50 fijo. */
export function computeKpis(rows: StudentRow[], passScore: number): Kpis {
  if (rows.length === 0) {
    return { count: 0, average: 0, passRate: 0, passCount: 0, max: 0, min: 0, connErrors: 0 }
  }
  const grades = rows.map((r) => r.grade)
  const passed = rows.filter((r) => r.grade >= passScore).length
  return {
    count: rows.length,
    average: Math.round(grades.reduce((a, b) => a + b, 0) / rows.length),
    passRate: Math.round((passed / rows.length) * 100),
    passCount: passed,
    max: Math.max(...grades),
    min: Math.min(...grades),
    connErrors: rows.reduce((a, r) => a + r.connErrors, 0)
  }
}

/**
 * Alumnos que requieren intervención del profesor. Prioriza conexiones caídas
 * (normalmente un problema técnico), después quien lleva varios ciclos sin
 * avanzar —el que de verdad hay que ir a ver, porque una nota baja que sube
 * sola no necesita a nadie— y por último las notas bajo el umbral elegido.
 */
export function studentsNeedingAttention(
  rows: StudentRow[],
  passScore: number,
  stalls: StallMap = {}
): StudentRow[] {
  const stuck = (r: StudentRow): number => (stalledCycles(stalls, r, passScore) > 0 ? 1 : 0)
  return rows
    .filter((r) => r.connErrors > 0 || r.grade < passScore)
    .sort((a, b) =>
      b.connErrors - a.connErrors ||
      stuck(b) - stuck(a) ||
      a.grade - b.grade ||
      b.failed - a.failed ||
      a.members.localeCompare(b.members, 'es')
    )
}

export interface ErrorRow {
  description: string
  group: string
  fails: number
  total: number
  rate: number
}

/** Objetivos fallados con más frecuencia, agregando todos los casos. */
export function frequentErrors(results: LoadedResults): ErrorRow[] {
  const map = new Map<string, ErrorRow>()
  for (const c of results.cases) {
    for (const g of c.groups) {
      for (const tgt of g.targets) {
        const key = `${g.title}||${tgt.description}`
        const row = map.get(key) ?? {
          description: tgt.description || '(sin descripción)',
          group: g.title,
          fails: 0,
          total: 0,
          rate: 0
        }
        row.total++
        if (!tgt.check) row.fails++
        map.set(key, row)
      }
    }
  }
  const rows = Array.from(map.values())
  for (const r of rows) r.rate = r.total > 0 ? Math.round((r.fails / r.total) * 100) : 0
  return rows.filter((r) => r.fails > 0).sort((a, b) => b.fails - a.fails || b.rate - a.rate)
}

export interface GroupSuccess {
  group: string
  passed: number
  total: number
  rate: number
}

export function groupSuccess(results: LoadedResults): GroupSuccess[] {
  const map = new Map<string, GroupSuccess>()
  for (const c of results.cases) {
    for (const g of c.groups) {
      const row = map.get(g.title) ?? { group: g.title, passed: 0, total: 0, rate: 0 }
      for (const tgt of g.targets) {
        row.total++
        if (tgt.check) row.passed++
      }
      map.set(g.title, row)
    }
  }
  const rows = Array.from(map.values())
  for (const r of rows) r.rate = r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0
  return rows.sort((a, b) => a.rate - b.rate)
}

// ---- Matriz comprobación × alumno (inspirada en teutonv9.sh) ----

export interface MatrixTarget {
  id: string
  description: string
  group: string
  weight: number
}

export interface MatrixCell {
  score: number
  weight: number
  check: boolean
  present: boolean
}

export interface MatrixStudent {
  id: string
  members: string
  grade: number
  /**
   * Teutón no pudo conectar con su máquina. Sin esto, un equipo apagado pinta
   * la columna entera de rojo y se lee igual que un alumno que lo ha hecho todo
   * mal: uno necesita que vayas a su sitio, el otro no.
   */
  unreachable: boolean
  cells: MatrixCell[]
}

export interface Matrix {
  targets: MatrixTarget[]
  students: MatrixStudent[]
}

/**
 * Construye una matriz de objetivos (filas) por alumno (columnas). Las columnas
 * salen de las MISMAS filas que la vista de lista (`studentRows`), no de
 * `results.cases`: si un case-NN.json falta o no se pudo leer, el alumno sigue
 * apareciendo con su nota y la columna a "?" en vez de desaparecer de la vista.
 * Los objetivos se identifican por target_id, estable entre casos.
 */
export function buildMatrix(rows: StudentRow[]): Matrix {
  // Lista canónica de objetivos: la del caso con más objetivos.
  const countTargetsOf = (c: CaseReport) => c.groups.reduce((a, g) => a + g.targets.length, 0)
  let canonical: CaseReport | undefined
  for (const row of rows) {
    const c = row.caseReport
    if (c && (!canonical || countTargetsOf(c) > countTargetsOf(canonical))) canonical = c
  }
  const targets: MatrixTarget[] = []
  for (const g of canonical?.groups ?? []) {
    for (const tgt of g.targets) {
      targets.push({
        id: tgt.target_id,
        description: tgt.description || '(sin descripción)',
        group: g.title,
        weight: tgt.weight
      })
    }
  }

  const students: MatrixStudent[] = rows.map((row) => {
    const byId = new Map<string, TeutonTarget>()
    for (const g of row.caseReport?.groups ?? []) {
      for (const tgt of g.targets) byId.set(tgt.target_id, tgt)
    }
    const cells: MatrixCell[] = targets.map((t) => {
      const hit = byId.get(t.id)
      return hit
        ? { score: hit.score, weight: hit.weight, check: hit.check, present: true }
        : { score: 0, weight: t.weight, check: false, present: false }
    })
    return {
      id: row.id,
      members: row.members,
      grade: row.grade,
      unreachable: row.connErrors > 0,
      cells
    }
  })

  return { targets, students }
}

export interface DistBucket {
  label: string
  count: number
}

/** Distribución de notas en tramos de 10. */
export function gradeDistribution(rows: StudentRow[]): DistBucket[] {
  const buckets: DistBucket[] = []
  for (let i = 0; i < 10; i++) {
    const lo = i * 10
    const hi = i === 9 ? 100 : lo + 9
    buckets.push({ label: `${lo}-${hi}`, count: 0 })
  }
  for (const r of rows) {
    // Acotado por los dos lados: una nota negativa o no finita en resume.json
    // daba un índice fuera del array y lanzaba durante el render, dejando toda
    // la vista de Analíticas en el error boundary.
    const raw = Number.isFinite(r.grade) ? Math.floor(r.grade / 10) : 0
    buckets[Math.min(9, Math.max(0, raw))].count++
  }
  return buckets
}
