import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadResults } from '../src/main/results'
import { computeKpis, studentRows, studentsNeedingAttention } from '../src/renderer/src/lib/analytics'
import { buildMoodleCsv } from '../src/renderer/src/lib/moodleCsv'
import { gradeRecordsFromResults } from '../src/renderer/src/lib/integrity'
import { makeProjectDir } from './helpers'

// S-01: `teuton run --case=2` (Teutón 2.10.6 real) deja en resume.json una fila
// por alumno; las no elegidas son `skip` con id «-». No son alumnos.
const REAL = join('tests', 'fixtures', 'teuton-2.10.6')
let dir = ''
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true })
  dir = ''
})

async function load(scenario: string) {
  dir = await makeProjectDir()
  const out = join(dir, 'var', 'proj')
  await fs.mkdir(out, { recursive: true })
  for (const f of await fs.readdir(join(REAL, scenario))) await fs.copyFile(join(REAL, scenario, f), join(out, f))
  return loadResults(dir, 'proj')
}

describe('reevaluación parcial con el formato real (S-01)', () => {
  it('las filas skip de --case no son alumnos en la vista ni en los KPI', async () => {
    const res = await load('case2')
    const rows = studentRows(res)
    expect(rows.map((r) => r.members)).toEqual(['Luis'])
    const grading = { passScore: 50, maxGrade: 10 }
    expect(computeKpis(rows, grading.passScore).count).toBe(1)
    expect(studentsNeedingAttention(rows, grading.passScore).map((r) => r.members)).not.toContain('-')
    expect(gradeRecordsFromResults(res).grades).toEqual({ Luis: 100 })
  })

  it('la pasada completa real sigue dando los tres alumnos', async () => {
    const res = await load('full')
    expect(studentRows(res).map((r) => [r.members, r.grade])).toEqual([['Ana', 100], ['Luis', 100], ['Eva', 50]])
    const csv = buildMoodleCsv(res, {}, { passScore: 50, maxGrade: 10 })
    expect(csv.trim().split('\n')).toHaveLength(4)
  })
})
