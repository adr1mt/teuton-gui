import { execFileSync, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeProjectDir } from './helpers'

// El teuton falso solo sirve si se comporta como el real. Estos tests comparan
// su salida con los informes capturados de Teutón 2.10.6 (tests/fixtures/).
const FAKE = resolve('scripts/fake-teuton.mjs')
const REAL = resolve('tests/fixtures/teuton-2.10.6')

let dir = ''
afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true })
  dir = ''
})

function fake(args: string[], mode = 'ok'): number {
  const out = spawnSync(process.execPath, [FAKE, ...args], {
    cwd: dir,
    env: { ...process.env, FAKE_TEUTON_MODE: mode }
  })
  return out.status ?? -1
}

async function json(path: string): Promise<{ cases: Record<string, unknown>[] }> {
  return JSON.parse(await fs.readFile(path, 'utf-8'))
}

async function project(): Promise<string> {
  dir = await makeProjectDir()
  await fs.copyFile(join(REAL, 'config.yaml'), join(dir, 'config.yaml'))
  return join(dir, 'var', dir.split('/').pop()!)
}

const shape = (c: Record<string, unknown>) => Object.keys(c).sort()

describe('teuton falso frente a Teutón 2.10.6', () => {
  it('con --case escribe las filas skip como el real y no toca los otros casos', async () => {
    const out = await project()
    expect(fake(['run', '--export=json', '.'])).toBe(0)
    const old = new Date('2020-01-01')
    for (const f of ['case-01.json', 'case-03.json']) await fs.utimes(join(out, f), old, old)

    expect(fake(['run', '--export=json', '--case=2', '.'])).toBe(0)

    const real = (await json(join(REAL, 'case2', 'resume.json'))).cases
    const got = (await json(join(out, 'resume.json'))).cases
    expect(got.map((c) => [c.id, c.members, c.skip])).toEqual(real.map((c) => [c.id, c.members, c.skip]))
    const { moodle_feedback: _a, ...realSkip } = real[0]
    const { moodle_feedback: _b, ...fakeSkip } = got[0]
    expect(fakeSkip).toEqual(realSkip)
    expect(shape(got[1])).toEqual(expect.arrayContaining(shape(real[1]).filter((k) => k !== 'letter')))
    expect((await fs.stat(join(out, 'case-01.json'))).mtime.getFullYear()).toBe(2020)
  })

  it('noreports sale con 0 y syntaxerror con 1, sin tocar var/', async () => {
    const out = await project()
    expect(fake(['run', '.'])).toBe(0)
    const before = (await fs.stat(join(out, 'resume.json'))).mtimeMs
    expect(fake(['run', '.'], 'noreports')).toBe(0)
    expect(fake(['run', '.'], 'syntaxerror')).toBe(1)
    expect((await fs.stat(join(out, 'resume.json'))).mtimeMs).toBe(before)
  })

  it('emptyresume deja cases: [] y los case-NN.json anteriores, como el real', async () => {
    const out = await project()
    expect(fake(['run', '.'])).toBe(0)
    expect(fake(['run', '.'], 'emptyresume')).toBe(0)
    expect((await json(join(out, 'resume.json'))).cases).toEqual((await json(join(REAL, 'emptycases', 'resume.json'))).cases)
    expect(await fs.readdir(out)).toContain('case-03.json')
  })

  it('staleresume reescribe los casos y deja el resume.json anterior', async () => {
    const out = await project()
    expect(fake(['run', '.'])).toBe(0)
    const resume = await fs.readFile(join(out, 'resume.json'), 'utf-8')
    const case1 = await fs.readFile(join(out, 'case-01.json'), 'utf-8')
    expect(fake(['run', '.'], 'staleresume')).not.toBe(0)
    expect(await fs.readFile(join(out, 'resume.json'), 'utf-8')).toBe(resume)
    expect(await fs.readFile(join(out, 'case-01.json'), 'utf-8')).not.toBe(case1)
  })

  it('respeta tt_testname y tt_outdir donde los respeta el real', async () => {
    await project()
    const config = await fs.readFile(join(dir, 'config.yaml'), 'utf-8')
    await fs.writeFile(join(dir, 'config.yaml'), config.replace('global:', 'global:\n  tt_testname: examen2'))
    expect(fake(['run', '.'])).toBe(0)
    expect(await fs.readdir(join(dir, 'var', 'examen2'))).toEqual(expect.arrayContaining(['resume.json', 'case-01.json']))

    await fs.writeFile(join(dir, 'config.yaml'), config)
    expect(fake(['run', '.'])).toBe(0)
    await fs.writeFile(join(dir, 'config.yaml'), config.replace('global:', 'global:\n  tt_outdir: salida'))
    expect(fake(['run', '.'])).toBe(0)
    expect(await fs.readdir(join(dir, 'salida'))).toContain('resume.json')
    expect(await fs.readdir(join(dir, 'salida'))).not.toContain('case-01.json')

    // Como el real: con tt_outdir, si var/<tt_testname> no existe, sale con 1.
    await fs.writeFile(join(dir, 'config.yaml'), config.replace('global:', 'global:\n  tt_outdir: salida\n  tt_testname: nuevo'))
    expect(fake(['run', '.'])).toBe(1)
  })

  it('el fixture real se capturó con Teutón 2.10.6', () => {
    const fixture = execFileSync('grep', ['-o', 'Teuton (2.10.6)', join(REAL, 'full', 'resume.json')]).toString()
    expect(fixture.trim()).toBe('Teuton (2.10.6)')
  })
})
