import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadResults } from '../src/main/results'
import { caseJson, makeProjectDir, resumeJson, writeOutput } from './helpers'

let dir = ''
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true })
  dir = ''
})

describe('loadResults', () => {
  it('lee un informe normal', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'dns', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'pepito', grade: 50 }])),
      'case-01.json': JSON.stringify(
        caseJson('pepito', 50, [{ id: '01', check: true }, { id: '02' }])
      ),
      'moodle.csv': 'MoodleID,Nota,Feedback\n'
    })

    const res = await loadResults(dir)
    expect(res.warnings).toEqual([])
    expect(res.cases).toHaveLength(1)
    expect(res.cases[0].members).toBe('pepito')
    expect(res.resume?.cases).toHaveLength(1)
    expect(res.moodleCsv).not.toBeNull()
  })

  // El fallo que dejaba a pepito fuera de la matriz: dos `teuton run` solapados
  // dejan un case-NN.json con un JSON válido seguido de la cola del anterior.
  it('recupera un case-NN.json con basura al final y avisa', async () => {
    dir = await makeProjectDir()
    const good = JSON.stringify(caseJson('pepito', 42, [{ id: '01', check: true }]))
    await writeOutput(dir, 'dns', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'pepito', grade: 42 }])),
      'case-01.json': good + '}'
    })

    const res = await loadResults(dir)
    expect(res.cases).toHaveLength(1)
    expect(res.cases[0].members).toBe('pepito')
    expect(res.cases[0].groups[0].targets).toHaveLength(1)
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('case-01.json')
  })

  it('no confunde llaves dentro de cadenas al recuperar', async () => {
    dir = await makeProjectDir()
    const withBraces = caseJson('pepito', 0, [{ id: '01' }]) as {
      groups: { targets: Record<string, unknown>[] }[]
    }
    withBraces.groups[0].targets[0].output = 'error: unexpected } in "quoted \\" string"'
    await writeOutput(dir, 'dns', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'pepito', grade: 0 }])),
      'case-01.json': JSON.stringify(withBraces) + '}{basura'
    })

    const res = await loadResults(dir)
    expect(res.cases).toHaveLength(1)
    expect(res.cases[0].groups[0].targets[0].output).toContain('unexpected }')
  })

  it('un caso ilegible no tumba al resto y queda registrado', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'dns', {
      'resume.json': JSON.stringify(
        resumeJson([
          { id: '01', members: 'pepito', grade: 10 },
          { id: '02', members: 'ana', grade: 90 }
        ])
      ),
      'case-01.json': 'esto no es JSON ni de lejos',
      'case-02.json': JSON.stringify(caseJson('ana', 90, [{ id: '01', check: true }]))
    })

    const res = await loadResults(dir)
    expect(res.cases.map((c) => c.members)).toEqual(['ana'])
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('case-01.json')
  })

  it('descarta los case-NN.json huérfanos de ejecuciones anteriores', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'dns', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'pepito', grade: 0 }])),
      'case-01.json': JSON.stringify(caseJson('pepito', 0, [{ id: '01' }])),
      // Sobrante de una clase anterior de 3 alumnos: no debe aparecer.
      'case-02.json': JSON.stringify(caseJson('alumno-viejo', 100, [{ id: '01', check: true }])),
      'case-03.json': JSON.stringify(caseJson('otro-viejo', 100, [{ id: '01', check: true }]))
    })

    const res = await loadResults(dir)
    expect(res.cases.map((c) => c.members)).toEqual(['pepito'])
    expect(res.warnings).toEqual([])
  })

  it('sin testName elige el var/<x>/ con resume.json más reciente', async () => {
    dir = await makeProjectDir()
    const viejo = await writeOutput(dir, 'viejo', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'antiguo', grade: 0 }]))
    })
    await fs.utimes(join(viejo, 'resume.json'), new Date(0), new Date(0))
    await writeOutput(dir, 'nuevo', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'pepito', grade: 0 }]))
    })

    const res = await loadResults(dir)
    expect(res.testName).toBe('nuevo')
    expect(res.resume?.cases[0].members).toBe('pepito')
  })

  it('proyecto sin var/ devuelve resultados vacíos sin reventar', async () => {
    dir = await makeProjectDir()
    const res = await loadResults(dir)
    expect(res.cases).toEqual([])
    expect(res.resume).toBeNull()
    expect(res.warnings).toEqual([])
  })

  it('ignora elementos anidados con forma inesperada sin lanzar', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'raro', {
      'resume.json': JSON.stringify({ config: [], cases: [null, 7, { id: '01', members: 'Ana', grade: 75, conn_status: ['mal'] }], results: [] }),
      'case-01.json': JSON.stringify({
        config: { tt_members: 'Ana' },
        groups: [null, { title: 'Grupo', targets: [null, 4, { target_id: '01', check: true }] }],
        results: { grade: 75 }
      })
    })

    const res = await loadResults(dir)
    expect(res.resume?.cases).toHaveLength(1)
    expect(res.resume?.cases[0].connErrors).toEqual({})
    expect(res.cases[0].groups).toHaveLength(1)
    expect(res.cases[0].groups[0].targets).toHaveLength(1)
  })
})
