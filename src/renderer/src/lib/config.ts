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

/**
 * Recupera el texto original de los escalares que `yaml.load` convirtió en
 * número perdiendo información: `tt_moodle_id: 0012345` se lee como 12345 y
 * `stringifyConfig` reescribía el fichero con el identificador destrozado en
 * cuanto se tocaba cualquier celda de la tabla (también `007`, `1.50` y los
 * dígitos por encima de 2^53).
 *
 * Solo se sustituye cuando el texto y el número NO coinciden, así que un
 * `host1_port: 22` normal sigue siendo número y el fichero no se llena de
 * comillas. Los booleanos y los nulos se leen del parseo normal, porque Teutón
 * sí los distingue (`tt_skip`, `tt_sequence`) y el esquema FAILSAFE los daría
 * como texto.
 */
function preserveScalarText(
  parsed: Record<string, unknown>,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parsed }
  for (const [key, value] of Object.entries(parsed)) {
    const text = raw[key]
    if (typeof value === 'number' && typeof text === 'string' && text.trim() !== String(value)) {
      out[key] = text.trim()
    }
  }
  return out
}

/** El mismo documento leído sin resolver tipos: todo escalar es su texto literal. */
function loadRawScalars(text: string): Record<string, unknown> {
  try {
    return normalizeKeys(yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA }) || {})
  } catch {
    return {}
  }
}

/** Parsea el YAML de config a un modelo manejable. Tolerante a errores. */
export function parseConfig(text: string): { config: TeutonConfig; error: string | null } {
  try {
    const raw = (yaml.load(text) || {}) as Record<string, unknown>
    const rawNormalized = normalizeKeys(raw)

    // `extra` (secciones que la interfaz no edita) se deja tal cual venía del
    // parseo normal: se vuelca byte a byte y no debe ganar comillas nuevas.
    const literal = loadRawScalars(text)
    const literalCases = Array.isArray(literal.cases) ? literal.cases.map((c) => normalizeKeys(c)) : []

    const global = preserveScalarText(
      normalizeKeys(rawNormalized.global),
      normalizeKeys(literal.global)
    ) as TeutonConfig['global']
    const casesRaw = Array.isArray(rawNormalized.cases) ? rawNormalized.cases : []
    const cases = casesRaw.map(
      (c, i) => preserveScalarText(normalizeKeys(c), literalCases[i] ?? {}) as ConfigCase
    )

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

/**
 * ¿Es la dirección de una máquina? Solo se tapa en modo proyector: fuera de él
 * el profesor necesita verla y teclearla, y una IP no es un secreto salvo
 * proyectada en la pared del aula delante de toda la clase.
 */
export function isMachineColumn(key: string): boolean {
  return /(^|_)ip\d*$/i.test(key)
}
