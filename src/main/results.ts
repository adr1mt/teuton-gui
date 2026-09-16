import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  CaseReport,
  LoadedResults,
  ResumeCase,
  ResumeReport,
  TeutonGroup
} from '../shared/types'

interface JsonRead {
  value: unknown | null
  /** Incidencia legible, o null si el fichero simplemente no existe (normal). */
  warning: string | null
}

/**
 * Decodifica el PRIMER valor JSON completo del texto e ignora lo que venga
 * detrás (equivalente al `raw_decode` de Python). Teutón escribe cada informe
 * con `File.open(f, "w")`, así que dos `teuton run` solapados sobre el mismo
 * `var/<test>/` dejan el fichero del segundo seguido de la cola del primero:
 * un JSON válido más basura. Sin esto, `JSON.parse` falla y el alumno entero
 * desaparece de la matriz y de las analíticas.
 */
function parseFirstJsonValue(text: string): unknown | undefined {
  const start = text.search(/[{[]/)
  if (start < 0) return undefined
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

async function readJson(path: string, label: string): Promise<JsonRead> {
  let text: string
  try {
    text = await fs.readFile(path, 'utf-8')
  } catch (error) {
    if (isMissing(error)) return { value: null, warning: null }
    const detail = error instanceof Error ? error.message : String(error)
    return { value: null, warning: `${label}: no se pudo leer (${detail})` }
  }
  try {
    return { value: JSON.parse(text), warning: null }
  } catch {
    const recovered = parseFirstJsonValue(text)
    return recovered === undefined
      ? { value: null, warning: `${label}: JSON ilegible, se ha ignorado` }
      : { value: recovered, warning: `${label}: JSON con basura al final (datos recuperados)` }
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p)
    return s.isDirectory()
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Localiza el directorio de salida del test. Por defecto es var/<testName>,
 * pero si no se pasa testName buscamos el subdirectorio de var/ con resume.json
 * más reciente (robusto ante tt_testname/tt_outdir personalizados).
 */
async function findOutputDir(dir: string, testName?: string): Promise<string | null> {
  const base = join(dir, 'var')
  if (testName) {
    const candidate = join(base, testName)
    if (await dirExists(candidate)) return candidate
  }
  if (!(await dirExists(base))) return null
  let best: { path: string; mtime: number } | null = null
  const entries = await fs.readdir(base, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const resume = join(base, e.name, 'resume.json')
    try {
      const s = await fs.stat(resume)
      if (!best || s.mtimeMs > best.mtime) {
        best = { path: join(base, e.name), mtime: s.mtimeMs }
      }
    } catch (error) {
      if (!isMissing(error)) throw error
      // sin resume.json → se ignora
    }
  }
  return best?.path ?? null
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown, fallback = ''): string {
  return v === null || v === undefined ? fallback : String(v)
}

function normalizeGroups(raw: unknown): TeutonGroup[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((g) => {
    const group = record(g)
    if (!group) return []
    const targets = Array.isArray(group.targets) ? group.targets : []
    return [{
      title: str(group.title, 'Grupo'),
      targets: targets.flatMap((t) => {
        const target = record(t)
        if (!target) return []
        return [{
          target_id: str(target.target_id),
          check: Boolean(target.check),
          score: num(target.score),
          weight: num(target.weight),
          description: str(target.description),
          conn_type: str(target.conn_type) || undefined,
          duration: (target.duration as string | number) ?? undefined,
          command: str(target.command) || undefined,
          output: str(target.output) || undefined,
          alterations: str(target.alterations) || undefined,
          expected: str(target.expected) || undefined,
          result: str(target.result) || undefined
        }]
      })
    }]
  })
}

function parseCaseReport(fileName: string, raw: unknown): CaseReport | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const config = record(data.config) || {}
  const results = record(data.results) || {}
  const caseId = (fileName.match(/case-(\w+)\.json/)?.[1] ?? fileName).replace(/\.json$/, '')
  return {
    caseId,
    config,
    groups: normalizeGroups(data.groups),
    results,
    grade: num(results.grade),
    members: str(config.tt_members, 'anónimo'),
    raw
  }
}

function parseResume(raw: unknown): ResumeReport | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const casesRaw = Array.isArray(data.cases) ? data.cases : []
  const cases: ResumeCase[] = casesRaw.flatMap((c) => {
    const line = record(c)
    if (!line) return []
    const connRaw = record(line.conn_status) || {}
    const conn: Record<string, string> = {}
    for (const [key, value] of Object.entries(connRaw)) conn[key] = str(value)
    return [{
      id: str(line.id, '-'),
      members: str(line.members, 'anónimo'),
      grade: num(line.grade),
      state: str(line.letter, '?'),
      moodleId: str(line.moodle_id) || undefined,
      skip: Boolean(line.skip),
      connErrors: conn
    }]
  })
  return {
    config: record(data.config) || {},
    cases,
    results: record(data.results) || {}
  }
}

async function mtime(path: string, label: string, warnings: string[]): Promise<number | null> {
  try {
    return (await fs.stat(path)).mtimeMs
  } catch (error) {
    if (!isMissing(error)) {
      const detail = error instanceof Error ? error.message : String(error)
      warnings.push(`${label}: no se pudo consultar la fecha (${detail})`)
    }
    return null
  }
}

export async function loadResults(dir: string, testName?: string): Promise<LoadedResults> {
  const outputDir = await findOutputDir(dir, testName)
  if (!outputDir) {
    return {
      testName: testName || '',
      outputDir: join(dir, 'var'),
      resume: null,
      cases: [],
      moodleCsv: null,
      generatedAt: null,
      warnings: []
    }
  }

  const warnings: string[] = []
  const resumeRead = await readJson(join(outputDir, 'resume.json'), 'resume.json')
  if (resumeRead.warning) warnings.push(resumeRead.warning)
  const resume = parseResume(resumeRead.value)

  const entries = await fs.readdir(outputDir)
  let caseFiles = entries.filter((f) => /^case-\w+\.json$/.test(f)).sort()
  // Teutón sobrescribe los case-NN de la ejecución actual pero NO borra los de
  // ejecuciones anteriores con más casos (p.ej. al pasar de 4 alumnos a 1 tras
  // importar otra clase). Filtramos por los casos que declara el resume actual
  // para no mezclar alumnos de distintas clases/ejecuciones. Un resume sin
  // casos también filtra: Teutón lo escribe así con `cases: []` y deja los
  // case-NN.json de la clase anterior, que no son alumnos de esta pasada.
  if (resume) {
    const validIds = new Set(resume.cases.map((c) => c.id))
    caseFiles = caseFiles.filter((f) => {
      const id = f.match(/^case-(\w+)\.json$/)?.[1]
      return id !== undefined && validIds.has(id)
    })
  }
  const cases: CaseReport[] = []
  for (const f of caseFiles) {
    const read = await readJson(join(outputDir, f), f)
    if (read.warning) warnings.push(read.warning)
    const parsed = parseCaseReport(f, read.value)
    if (parsed) cases.push({ ...parsed, generatedAt: await mtime(join(outputDir, f), f, warnings) })
    else if (!read.warning) warnings.push(`${f}: contenido inesperado, se ha ignorado`)
  }

  let moodleCsv: string | null = null
  try {
    moodleCsv = await fs.readFile(join(outputDir, 'moodle.csv'), 'utf-8')
  } catch (error) {
    if (!isMissing(error)) {
      const detail = error instanceof Error ? error.message : String(error)
      warnings.push(`moodle.csv: no se pudo leer (${detail})`)
    }
  }

  const generatedAt = await mtime(join(outputDir, 'resume.json'), 'resume.json', warnings)
  // Teutón escribe los case-NN.json y DESPUÉS resume.json. Un caso más nuevo
  // que su resumen significa que la pasada murió entre medias: el resumen es
  // de otra pasada y la lista y la matriz enseñarían notas distintas.
  if (resume && generatedAt !== null) {
    for (const c of cases) {
      if (c.generatedAt != null && c.generatedAt > generatedAt + 1000) {
        warnings.push(`case-${c.caseId}.json: es más nuevo que resume.json; el resumen es de otra pasada`)
      }
    }
  }

  return {
    testName: basename(outputDir) || testName || '',
    outputDir,
    resume,
    cases,
    moodleCsv,
    generatedAt,
    warnings
  }
}
