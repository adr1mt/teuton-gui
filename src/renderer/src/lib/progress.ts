import { useMemo } from 'react'
import { useApp } from '../stores/app'
import type { ConfigCase } from './config'

/**
 * Extrae el nº de "Targets" (comprobaciones por caso) de la tabla "DSL Stats"
 * que imprime `teuton check`. Formato real observado:
 *   | Targets      | 3     |
 */
export function parseTargetsFromCheckOutput(output: string): number | null {
  const match = output.match(/\|\s*Targets\s*\|\s*(\d+)\s*\|/i)
  if (!match) return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Nº total de comprobaciones esperadas para el conjunto de casos que se van a
 * ejecutar. Un caso con tt_skip:true solo emite 1 símbolo ("S"), el resto emite
 * un símbolo por cada target definido en start.rb.
 */
export function computeExpectedTotal(
  cases: ConfigCase[],
  selectedIndices: number[] | undefined,
  targetsPerCase: number
): number {
  const indices =
    selectedIndices && selectedIndices.length > 0
      ? selectedIndices
      : cases.map((_, i) => i + 1)
  let total = 0
  for (const idx of indices) {
    const row = cases[idx - 1]
    const skip = row ? String(row.tt_skip).toLowerCase() === 'true' : false
    total += skip ? 1 : targetsPerCase
  }
  return total
}

/**
 * Cuenta comprobaciones completadas a partir de la salida en vivo de `teuton run`.
 * Teutón imprime un carácter por comprobación entre las líneas "Started at" y
 * "Finished in": "." (superado), "F" (fallado) o "S" (caso completo saltado).
 *
 * Nota: esta función define la SEMÁNTICA de referencia (qué cuenta y qué no),
 * pero ya no se usa en producción porque exige re-escanear con regex todo el
 * log acumulado (hasta 500.000 caracteres) en cada chunk de stdout — justo la
 * degradación que el truncado del log pretendía evitar, y además se rompe si
 * el truncado se lleva la línea "Started at" (la barra volvería a 0%). El
 * conteo real en producción lo hace `scanProgressChunk`, de forma incremental
 * y por chunk, reproduciendo esta misma semántica. Se conserva exportada como
 * referencia verificable (ver script de verificación ad-hoc).
 */
export function computeLiveProgress(fullText: string): number {
  const startIdx = fullText.indexOf('Started at')
  if (startIdx === -1) return 0
  const newlineIdx = fullText.indexOf('\n', startIdx)
  if (newlineIdx === -1) return 0
  let region = fullText.slice(newlineIdx + 1)
  const finishIdx = region.indexOf('Finished in')
  if (finishIdx !== -1) region = region.slice(0, finishIdx)
  // En modo secuencial (tt_sequence: true) Teutón intercala líneas informativas
  // ("==> Running case [Nombre]") que podrían contener letras coincidentes.
  region = region.replace(/==>[^\n]*/g, '')
  const matches = region.match(/[.FS]/g)
  return matches ? matches.length : 0
}

/** Fases del escáner incremental de progreso (ver `scanProgressChunk`). */
export type ProgressScanPhase = 'before' | 'skip-line' | 'counting' | 'finished'

/**
 * Estado del escáner incremental que persiste ENTRE chunks de stdout, guardado
 * en `RunState.scan` (ver stores/app.ts).
 *
 * `phase`:
 *   - 'before': aún no hemos visto "Started at"; nada cuenta.
 *   - 'skip-line': estamos dentro de la línea de "Started at" o de una línea
 *     informativa "==> ..."; se descarta todo hasta el próximo salto de línea.
 *   - 'counting': contamos "." / "F" / "S" según van llegando.
 *   - 'finished': ya vimos "Finished in"; nada vuelve a contar jamás.
 *
 * `pending` NO es "la línea incompleta" (Teutón imprime todos los símbolos de
 * una comprobación en una sola línea kilométrica sin saltos hasta el final,
 * así que esperar a un '\n' dejaría la barra clavada en 0% toda la ejecución
 * — ese fue el defecto de la primera versión de este escáner). `pending` es
 * SOLO el sufijo del chunk que podría ser el arranque partido de uno de los
 * marcadores relevantes ("Started at", "Finished in", "==>"): p.ej. una 'F'
 * suelta al final de un chunk es indistinguible de la 'F' con la que empieza
 * "Finished in" hasta que llega el resto en el siguiente chunk. Todo lo demás
 * se procesa en cuanto llega.
 */
export interface ProgressScanState {
  phase: ProgressScanPhase
  pending: string
}

export const INITIAL_SCAN_STATE: ProgressScanState = { phase: 'before', pending: '' }

const STARTED_AT = 'Started at'
const FINISHED_IN = 'Finished in'
const ARROW = '==>'

function countSymbols(s: string): number {
  const matches = s.match(/[.FS]/g)
  return matches ? matches.length : 0
}

/**
 * Mayor sufijo de `text` que es un prefijo PROPIO (no completo — si fuera
 * completo ya lo habría encontrado el `indexOf` correspondiente) de alguno de
 * `markers`. Es lo único que se retiene entre chunks: un carácter contable
 * ('.', 'F', 'S') nunca forma parte de estos marcadores salvo la 'F' de
 * "Finished in", así que esta retención es la única fuente legítima de
 * "cuenta pendiente de confirmar".
 */
function longestMarkerPrefixSuffix(text: string, markers: string[]): string {
  const maxLen = Math.min(text.length, Math.max(...markers.map((m) => m.length)) - 1)
  for (let len = maxLen; len >= 1; len--) {
    const suffix = text.slice(text.length - len)
    if (markers.some((m) => m.startsWith(suffix))) return suffix
  }
  return ''
}

/**
 * Versión incremental de `computeLiveProgress`: procesa el chunk nuevo tan
 * pronto como llega —no espera a un salto de línea, porque Teutón imprime
 * TODOS los símbolos de una tanda en una única línea sin '\n' hasta justo
 * antes de "Finished in"— y actualiza el estado del escáner para que la
 * frontera entre chunks nunca pierda ni duplique información.
 *
 * Nota sobre códigos ANSI: si el proceso se lanzara con tty, Teutón envuelve
 * cada símbolo en secuencias SGR (`\x1b[32m`, `\x1b[0m`, …). No hace falta
 * limpiarlas aquí para que el conteo sea correcto: una secuencia SGR completa
 * son bytes de control + dígitos/`;` + terminador `m`, y ninguno de esos
 * caracteres es `.`, `F` ni `S`, así que un resto de ANSI nunca puede
 * confundirse con un símbolo real, se parta como se parta entre chunks (y en
 * esta app el proceso se lanza sin tty vía `spawn`, y `stripAnsi` en
 * `lib/run.ts` ya limpia cada chunk antes de llegar aquí, así que en la
 * práctica ni siquiera aparecen).
 *
 * Invariante: la suma de los `delta` de aplicar `scanProgressChunk`
 * sucesivamente sobre todos los chunks de una ejecución es exactamente igual
 * a `computeLiveProgress(logCompletoSinTruncar)`, sea cual sea el punto de
 * corte de los chunks (una comprobación aparece en el `delta` del chunk en el
 * que se confirma su símbolo, que puede no ser el mismo chunk en el que
 * llegó el carácter si este quedó retenido en `pending` por ambigüedad con
 * un marcador). Reglas (idénticas a las de `computeLiveProgress`):
 *   - Antes de ver "Started at": no cuenta nada; esa línea tampoco cuenta.
 *   - Cada línea de "==> ..." (informativa de tt_sequence) no cuenta.
 *   - Tras "Started at" y hasta "Finished in": cuentan "." / "F" / "S".
 *   - Desde que aparece "Finished in": nada vuelve a contar nunca.
 */
export function scanProgressChunk(
  state: ProgressScanState,
  chunk: string
): { state: ProgressScanState; delta: number } {
  if (state.phase === 'finished') return { state, delta: 0 }
  const text = state.pending + chunk
  let phase: ProgressScanPhase = state.phase
  let pos = 0
  let delta = 0

  for (;;) {
    if (phase === 'finished') {
      return { state: { phase, pending: '' }, delta }
    }

    if (phase === 'before') {
      const idx = text.indexOf(STARTED_AT, pos)
      if (idx !== -1) {
        phase = 'skip-line'
        pos = idx + STARTED_AT.length
        continue
      }
      const pending = longestMarkerPrefixSuffix(text.slice(pos), [STARTED_AT])
      return { state: { phase, pending }, delta }
    }

    if (phase === 'skip-line') {
      const idx = text.indexOf('\n', pos)
      if (idx !== -1) {
        phase = 'counting'
        pos = idx + 1
        continue
      }
      // Todo lo que queda es parte de la línea descartada; nada que retener.
      return { state: { phase, pending: '' }, delta }
    }

    // phase === 'counting'
    const finIdx = text.indexOf(FINISHED_IN, pos)
    const arrIdx = text.indexOf(ARROW, pos)
    const hasFin = finIdx !== -1
    const hasArr = arrIdx !== -1
    if (hasFin && (!hasArr || finIdx <= arrIdx)) {
      delta += countSymbols(text.slice(pos, finIdx))
      pos = finIdx + FINISHED_IN.length
      phase = 'finished'
      continue
    }
    if (hasArr) {
      delta += countSymbols(text.slice(pos, arrIdx))
      pos = arrIdx + ARROW.length
      phase = 'skip-line'
      continue
    }
    // Ningún marcador en lo que queda: cuenta todo salvo el sufijo que
    // pudiera ser el arranque partido de "Finished in" o "==>".
    const rest = text.slice(pos)
    const pending = longestMarkerPrefixSuffix(rest, [FINISHED_IN, ARROW])
    delta += countSymbols(rest.slice(0, rest.length - pending.length))
    return { state: { phase, pending }, delta }
  }
}

/**
 * Cuenta como confirmado el resto de `pending` que `scanProgressChunk` había
 * retenido por ambigüedad con un marcador ("F" podría ser el arranque de
 * "Finished in", "=" el de "==>"...). Solo hace falta cuando el proceso
 * termina de forma anómala (cancelado, caído) y por tanto ese marcador nunca
 * llega a completarse ni a desambiguarse — en el camino normal, "Finished in"
 * siempre resuelve cualquier `pending` antes de que la fase pase a
 * 'finished'. Sin este flush, un símbolo real quedaría sin contar y la barra
 * de progreso se quedaría una comprobación corta tras cancelar.
 */
export function flushPendingSymbols(state: ProgressScanState): number {
  return state.phase === 'counting' ? countSymbols(state.pending) : 0
}

export interface RunProgress {
  done: number
  total: number | null
  percent: number | null
}

/** Progreso en vivo de la ejecución actual, derivado del store global. */
export function useRunProgress(): RunProgress {
  const done = useApp((s) => s.run.done)
  const total = useApp((s) => s.run.expectedTotal)
  return useMemo(() => {
    const percent = total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null
    return { done, total, percent }
  }, [done, total])
}
