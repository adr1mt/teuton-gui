import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CaseReport, LoadedResults, ResumeCase, TeutonTarget } from '../src/shared/types'

/** Directorio de proyecto temporal; el llamante lo borra en afterEach. */
export async function makeProjectDir(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'teuton-test-'))
}

export interface FakeTarget {
  id: string
  description?: string
  check?: boolean
  score?: number
  weight?: number
}

/** Objeto con la forma del case-NN.json que escribe Teutón. */
export function caseJson(members: string, grade: number, targets: FakeTarget[]): unknown {
  return {
    config: { tt_members: members },
    groups: [
      {
        title: 'Grupo 1',
        targets: targets.map((t) => ({
          target_id: t.id,
          check: t.check ?? false,
          score: t.score ?? 0,
          weight: t.weight ?? 1,
          description: t.description ?? `Objetivo ${t.id}`
        }))
      }
    ],
    results: { grade }
  }
}

export interface FakeResumeCase {
  id: string
  members: string
  grade: number
  letter?: string
  moodle_id?: string
  conn_status?: Record<string, string>
}

export function resumeJson(cases: FakeResumeCase[]): unknown {
  return {
    config: {},
    cases: cases.map((c) => ({ letter: '~', conn_status: {}, ...c })),
    results: {}
  }
}

/** Escribe `var/<test>/` con los ficheros indicados (contenido crudo). */
export async function writeOutput(
  dir: string,
  testName: string,
  files: Record<string, string>
): Promise<string> {
  const out = join(dir, 'var', testName)
  await fs.mkdir(out, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(join(out, name), content)
  }
  return out
}

// ---- Fábricas para las funciones puras del renderer ----

export function target(t: FakeTarget): TeutonTarget {
  return {
    target_id: t.id,
    check: t.check ?? false,
    score: t.score ?? 0,
    weight: t.weight ?? 1,
    description: t.description ?? `Objetivo ${t.id}`
  }
}

export function caseReport(
  caseId: string,
  members: string,
  grade: number,
  targets: FakeTarget[]
): CaseReport {
  return {
    caseId,
    config: { tt_members: members },
    groups: [{ title: 'Grupo 1', targets: targets.map(target) }],
    results: { grade },
    grade,
    members,
    raw: {}
  }
}

export function loadedResults(opts: {
  resumeCases?: ResumeCase[]
  cases?: CaseReport[]
  warnings?: string[]
}): LoadedResults {
  return {
    testName: 'test',
    outputDir: '/tmp/test/var/test',
    resume: opts.resumeCases ? { config: {}, cases: opts.resumeCases, results: {} } : null,
    cases: opts.cases ?? [],
    moodleCsv: null,
    generatedAt: null,
    warnings: opts.warnings ?? []
  }
}

export function resumeCase(
  id: string,
  members: string,
  grade: number,
  extra: Partial<ResumeCase> = {}
): ResumeCase {
  return { id, members, grade, state: '~', connErrors: {}, ...extra }
}
