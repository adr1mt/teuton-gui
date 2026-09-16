import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadResults, outputLocationFromConfig, readOutputLocation } from '../src/main/results'
import { caseJson, makeProjectDir, resumeJson, writeOutput } from './helpers'

// S-04 (G6). Teutón 2.10.6 escribe en `tt_outdir || var/<tt_testname>`, y los
// case-NN.json siempre en var/<tt_testname> (ver tests/fixtures/…/README.md).
let dir = ''
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true })
  dir = ''
})

describe('directorio de salida real', () => {
  it('lee tt_testname y tt_outdir del config, en estilo moderno y con dos puntos', () => {
    expect(outputLocationFromConfig('/p/examen', '---\ncases: []\n')).toEqual({ testName: 'examen', outDir: null })
    expect(outputLocationFromConfig('/p/examen', '---\nglobal:\n  tt_testname: examen2\n')).toEqual({ testName: 'examen2', outDir: null })
    expect(outputLocationFromConfig('/p/examen', '---\n:global:\n  :tt_testname: examen2\n  :tt_outdir: salida\n'))
      .toEqual({ testName: 'examen2', outDir: 'salida' })
    expect(outputLocationFromConfig('/p/examen', '{"global": {"tt_outdir": "fuera"}}')).toEqual({ testName: 'examen', outDir: 'fuera' })
  })

  it('busca el config como Teutón: <cname>.json antes que <cname>.yaml', async () => {
    dir = await makeProjectDir()
    await fs.writeFile(join(dir, 'config.yaml'), '---\nglobal:\n  tt_testname: desde-yaml\n')
    expect((await readOutputLocation(dir)).testName).toBe('desde-yaml')
    await fs.writeFile(join(dir, 'config.json'), '{"global": {"tt_testname": "desde-json"}}')
    expect((await readOutputLocation(dir)).testName).toBe('desde-json')
  })

  it('con tt_testname lee var/<tt_testname> aunque exista var/<carpeta> antiguo', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'proj', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'viejo', grade: 10 }])),
      'case-01.json': JSON.stringify(caseJson('viejo', 10, [{ id: '01' }]))
    })
    await writeOutput(dir, 'examen2', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'nuevo', grade: 90 }])),
      'case-01.json': JSON.stringify(caseJson('nuevo', 90, [{ id: '01', check: true }]))
    })
    const res = await loadResults(dir, 'examen2')
    expect(res.resume?.cases.map((c) => c.members)).toEqual(['nuevo'])
  })

  it('con tt_outdir lee el resumen de allí y los casos de var/<tt_testname>', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'proj', {
      'resume.json': JSON.stringify(resumeJson([{ id: '01', members: 'viejo', grade: 10 }])),
      'case-01.json': JSON.stringify(caseJson('nuevo', 90, [{ id: '01', check: true }]))
    })
    const salida = join(dir, 'salida')
    await fs.mkdir(salida)
    await fs.writeFile(join(salida, 'resume.json'), JSON.stringify(resumeJson([{ id: '01', members: 'nuevo', grade: 90 }])))

    const res = await loadResults(dir, 'proj', salida)
    expect(res.resume?.cases.map((c) => c.members)).toEqual(['nuevo'])
    expect(res.cases.map((c) => c.members)).toEqual(['nuevo'])
    expect(res.outputDir).toBe(salida)
  })

  it('con tt_outdir y sin var/<tt_testname> no busca casos en otro directorio', async () => {
    dir = await makeProjectDir()
    await writeOutput(dir, 'otro', { 'case-01.json': JSON.stringify(caseJson('ajeno', 10, [{ id: '01' }])) })
    const salida = join(dir, 'salida')
    await fs.mkdir(salida)
    await fs.writeFile(join(salida, 'resume.json'), JSON.stringify(resumeJson([{ id: '01', members: 'nuevo', grade: 90 }])))
    const res = await loadResults(dir, 'proj', salida)
    expect(res.cases).toEqual([])
  })
})
