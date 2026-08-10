import yaml from 'js-yaml'

export interface ConfigCase {
  [key: string]: string | number | boolean | null
}

export interface TeutonConfig {
  global: Record<string, string | number | boolean | null>
  cases: ConfigCase[]
  /**
   * Otras secciones del fichero que esta GUI no edita directamente
   * (p.ej. `alias`, `macros`, `tt_include`). Se preservan para no perderlas al guardar.
   */
  extra: Record<string, unknown>
}

// Teutón (Ruby/Psych) acepta tanto claves modernas ("tt_members") como el estilo
// clásico de símbolos Ruby (":tt_members"), ya que Psych interpreta ":foo" como
// símbolo. js-yaml no hace esa conversión, así que la normalizamos aquí.
function stripColon(key: string): string {
  return key.length > 1 && key.startsWith(':') ? key.slice(1) : key
}

function normalizeKeys(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[stripColon(k)] = v
  }
  return out
}

/** Parsea el YAML de config a un modelo manejable. Tolerante a errores. */
export function parseConfig(text: string): { config: TeutonConfig; error: string | null } {
  try {
    const raw = (yaml.load(text) || {}) as Record<string, unknown>
    const rawNormalized = normalizeKeys(raw)

    const global = normalizeKeys(rawNormalized.global) as TeutonConfig['global']
    const casesRaw = Array.isArray(rawNormalized.cases) ? rawNormalized.cases : []
    const cases = casesRaw.map((c) => normalizeKeys(c) as ConfigCase)

    const extra: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rawNormalized)) {
      if (k !== 'global' && k !== 'cases') extra[k] = v
    }

    return { config: { global, cases, extra }, error: null }
  } catch (e) {
    return {
      config: { global: {}, cases: [], extra: {} },
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/** Serializa el modelo de vuelta a YAML respetando el formato de Teutón. */
export function stringifyConfig(config: TeutonConfig): string {
  const doc: Record<string, unknown> = {
    ...config.extra,
    global: config.global && Object.keys(config.global).length > 0 ? config.global : null,
    cases: config.cases
  }
  const body = yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false })
  return `---\n${body}`
}

/** Devuelve la unión ordenada de todas las claves usadas en los casos. */
export function caseColumns(cases: ConfigCase[]): string[] {
  const cols: string[] = []
  const seen = new Set<string>()
  // tt_members siempre primero si existe
  for (const key of ['tt_members', 'tt_moodle_id']) {
    if (cases.some((c) => key in c)) {
      cols.push(key)
      seen.add(key)
    }
  }
  for (const c of cases) {
    for (const key of Object.keys(c)) {
      if (!seen.has(key)) {
        seen.add(key)
        cols.push(key)
      }
    }
  }
  return cols
}

/** Heurística: ¿es un campo sensible (contraseña) que debe enmascararse? */
export function isSecretColumn(key: string): boolean {
  return /pass|secret|token|key/i.test(key)
}
