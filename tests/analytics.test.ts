import { describe, expect, it } from 'vitest'
import {
  buildMatrix,
  computeKpis,
  frequentErrors,
  gradeDistribution,
  groupSuccess,
  studentRows,
  type StudentRow,
  studentsNeedingAttention
} from '../src/renderer/src/lib/analytics'
import { updateStalls, type StallMap } from '../src/renderer/src/lib/stall'
import { caseReport, loadedResults, resumeCase } from './helpers'

describe('studentRows', () => {
  it('prefiere el resumen y le engancha su informe detallado', () => {
    const res = loadedResults({
      resumeCases: [
        resumeCase('01', 'pepito', 50, { state: '~', connErrors: { host1: 'timeout' } }),
        resumeCase('02', 'ana', 100, { state: '✓' })
      ],
      cases: [
        caseReport('01', 'pepito', 50, [{ id: '01', check: true }, { id: '02' }]),
        caseReport('02', 'ana', 100, [{ id: '01', check: true }, { id: '02', check: true }])
      ]
    })

    const rows = studentRows(res)
    expect(rows.map((r) => r.members)).toEqual(['pepito', 'ana'])
    expect(rows[0]).toMatchObject({ passed: 1, failed: 1, total: 2, connErrors: 1 })
    expect(rows[1]).toMatchObject({ passed: 2, failed: 0, connErrors: 0 })
  })

  it('sin resume.json cae a los casos y usa el umbral configurable, no un 50 fijo', () => {
    const res = loadedResults({ cases: [caseReport('01', 'pepito', 60, [{ id: '01' }])] })
    expect(studentRows(res, 70)[0].state).toBe('✗')
    expect(studentRows(res, 50)[0].state).toBe('~')
  })

  it('mantiene al alumno del resumen aunque falte su case-NN.json', () => {
    const res = loadedResults({ resumeCases: [resumeCase('01', 'pepito', 42)], cases: [] })
    const rows = studentRows(res)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ members: 'pepito', grade: 42, total: 0 })
    expect(rows[0].caseReport).toBeUndefined()
  })
})

describe('buildMatrix', () => {
  it('una columna por alumno con sus celdas', () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', 'pepito', 50), resumeCase('02', 'ana', 100)],
      cases: [
        caseReport('01', 'pepito', 50, [
          { id: '01', check: true, score: 1 },
          { id: '02', score: 0 }
        ]),
        caseReport('02', 'ana', 100, [
          { id: '01', check: true, score: 1 },
          { id: '02', check: true, score: 1 }
        ])
      ]
    })

    const m = buildMatrix(studentRows(res))
    expect(m.targets.map((t) => t.id)).toEqual(['01', '02'])
    expect(m.students.map((s) => s.members)).toEqual(['pepito', 'ana'])
    expect(m.students[0].cells[0]).toMatchObject({ check: true, present: true })
    expect(m.students[0].cells[1]).toMatchObject({ check: false, present: true })
  })

  // El fallo reportado: pepito salía en la Lista pero no en la Matriz porque su
  // case-01.json estaba corrupto y buildMatrix solo miraba results.cases.
  it('mantiene la columna de un alumno sin informe detallado, con celdas "?"', () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', 'pepito', 42), resumeCase('02', 'ana', 100)],
      cases: [caseReport('02', 'ana', 100, [{ id: '01', check: true }, { id: '02', check: true }])]
    })

    const m = buildMatrix(studentRows(res))
    expect(m.students.map((s) => s.members)).toEqual(['pepito', 'ana'])
    const pepito = m.students[0]
    expect(pepito.grade).toBe(42)
    expect(pepito.cells).toHaveLength(2)
    expect(pepito.cells.every((c) => !c.present)).toBe(true)
  })

  it('la lista canónica de objetivos es la del caso más completo', () => {
    const res = loadedResults({
      resumeCases: [resumeCase('01', 'pepito', 0), resumeCase('02', 'ana', 0)],
      cases: [
        caseReport('01', 'pepito', 0, [{ id: '01' }]),
        caseReport('02', 'ana', 0, [{ id: '01' }, { id: '02' }, { id: '03' }])
      ]
    })

    const m = buildMatrix(studentRows(res))
    expect(m.targets).toHaveLength(3)
    expect(m.students[0].cells.map((c) => c.present)).toEqual([true, false, false])
  })

  it('sin ningún informe detallado no hay filas de objetivos', () => {
    const res = loadedResults({ resumeCases: [resumeCase('01', 'pepito', 0)] })
    expect(buildMatrix(studentRows(res)).targets).toEqual([])
  })

  // Una máquina apagada falla todos los objetivos y se leía igual que el alumno
  // que peor lo ha hecho; la matriz necesita poder pintarla distinto.
  it('marca la columna del alumno cuya máquina no responde', () => {
    const res = loadedResults({
      resumeCases: [
        resumeCase('01', 'pepito', 0, { connErrors: { host1: 'timeout' } }),
        resumeCase('02', 'ana', 0)
      ],
      cases: [
        caseReport('01', 'pepito', 0, [{ id: 't1', check: false }]),
        caseReport('02', 'ana', 0, [{ id: 't1', check: false }])
      ]
    })
    const students = buildMatrix(studentRows(res)).students
    expect(students.map((s) => s.unreachable)).toEqual([true, false])
  })
})

describe('computeKpis', () => {
  it('el aprobado usa el umbral, no un 50 fijo', () => {
    const rows = studentRows(
      loadedResults({
        resumeCases: [
          resumeCase('01', 'pepito', 60),
          resumeCase('02', 'ana', 80),
          resumeCase('03', 'luis', 100, { connErrors: { host1: 'timeout' } })
        ]
      })
    )

    expect(computeKpis(rows, 70)).toMatchObject({ count: 3, average: 80, passCount: 2, passRate: 67 })
    expect(computeKpis(rows, 50).passCount).toBe(3)
    expect(computeKpis(rows, 70)).toMatchObject({ max: 100, min: 60, connErrors: 1 })
  })

  it('sin alumnos devuelve ceros en vez de NaN/-Infinity', () => {
    expect(computeKpis([], 70)).toEqual({
      count: 0, average: 0, passRate: 0, passCount: 0, max: 0, min: 0, connErrors: 0
    })
  })
})

describe('studentsNeedingAttention', () => {
  it('prioriza conexiones caídas y luego notas bajas según el umbral', () => {
    const rows = studentRows(
      loadedResults({
        resumeCases: [
          resumeCase('01', 'ana', 90),
          resumeCase('02', 'pepito', 30),
          resumeCase('03', 'luis', 65),
          resumeCase('04', 'marta', 100, { connErrors: { host1: 'timeout' } })
        ]
      })
    )

    expect(studentsNeedingAttention(rows, 70).map((r) => r.members)).toEqual([
      'marta',
      'pepito',
      'luis'
    ])
    expect(studentsNeedingAttention(rows, 50).map((r) => r.members)).toEqual(['marta', 'pepito'])
  })

  // Entre dos suspensos, el que lleva ciclos sin moverse va primero: es al que
  // hay que ir a ver. El host caído sigue ganando a los dos.
  it('quien no avanza adelanta a un suspenso peor pero que sube', () => {
    const rows = studentRows(
      loadedResults({
        resumeCases: [
          resumeCase('01', 'ana', 20),
          resumeCase('02', 'luis', 50),
          resumeCase('03', 'marta', 10, { connErrors: { host1: 'timeout' } })
        ]
      })
    )
    // ana mejora en cada vuelta; luis lleva cuatro sin tocar nada.
    let stalls: StallMap = {}
    for (const anaGrade of [5, 10, 15, 20]) {
      stalls = updateStalls(stalls, [
        { ...rows[0], grade: anaGrade },
        rows[1],
        rows[2]
      ])
    }

    expect(studentsNeedingAttention(rows, 70, stalls).map((r) => r.members)).toEqual([
      'marta',
      'luis',
      'ana'
    ])
    // Sin el historial, manda la nota: ana la tiene peor.
    expect(studentsNeedingAttention(rows, 70).map((r) => r.members)).toEqual([
      'marta',
      'ana',
      'luis'
    ])
  })
})

describe('frequentErrors / groupSuccess / gradeDistribution', () => {
  const res = loadedResults({
    cases: [
      caseReport('01', 'pepito', 0, [{ id: '01', description: 'DNS' }, { id: '02', description: 'DHCP', check: true }]),
      caseReport('02', 'ana', 50, [{ id: '01', description: 'DNS' }, { id: '02', description: 'DHCP', check: true }])
    ]
  })

  it('agrega los objetivos fallados y omite los que nadie falla', () => {
    const errors = frequentErrors(res)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ description: 'DNS', fails: 2, total: 2, rate: 100 })
  })

  it('calcula la tasa de éxito por grupo', () => {
    expect(groupSuccess(res)).toEqual([{ group: 'Grupo 1', passed: 2, total: 4, rate: 50 }])
  })

  it('reparte las notas en 10 tramos, con el 100 en el último', () => {
    const rows = studentRows(
      loadedResults({
        resumeCases: [
          resumeCase('01', 'a', 0),
          resumeCase('02', 'b', 55),
          resumeCase('03', 'c', 100)
        ]
      })
    )
    const dist = gradeDistribution(rows)
    expect(dist).toHaveLength(10)
    expect(dist[0]).toEqual({ label: '0-9', count: 1 })
    expect(dist[5]).toEqual({ label: '50-59', count: 1 })
    expect(dist[9]).toEqual({ label: '90-100', count: 1 })
  })
})

describe('robustez de la distribución de notas', () => {
  it('no lanza con notas fuera de rango ni no finitas', () => {
    const rows = [
      { grade: -25 },
      { grade: 150 },
      { grade: Number.NaN },
      { grade: 100 },
      { grade: 0 }
    ] as StudentRow[]
    // Antes, un índice negativo accedía a buckets[-1] y lanzaba DENTRO del
    // render, dejando toda la vista de Analíticas en el error boundary.
    const dist = gradeDistribution(rows)
    expect(dist).toHaveLength(10)
    expect(dist.reduce((sum, b) => sum + b.count, 0)).toBe(rows.length)
    expect(dist[0].count).toBe(3) // negativa, NaN y 0 caen en el primer tramo
    expect(dist[9].count).toBe(2) // 100 y 150
  })
})
