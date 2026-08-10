import { describe, expect, it } from 'vitest'
import {
  computeExpectedTotal,
  computeLiveProgress,
  flushPendingSymbols,
  INITIAL_SCAN_STATE,
  parseTargetsFromCheckOutput,
  scanProgressChunk,
  type ProgressScanState
} from '../src/renderer/src/lib/progress'
import type { ConfigCase } from '../src/renderer/src/lib/config'

describe('parseTargetsFromCheckOutput', () => {
  it('lee la fila Targets de la tabla DSL Stats', () => {
    expect(
      parseTargetsFromCheckOutput('| Groups | 2 |\n| Targets      | 14    |\n| Cases | 1 |')
    ).toBe(14)
  })

  it('devuelve null si no está', () => {
    expect(parseTargetsFromCheckOutput('sin tabla')).toBeNull()
  })
})

describe('computeExpectedTotal', () => {
  const cases: ConfigCase[] = [
    { tt_members: 'a' },
    { tt_members: 'b', tt_skip: 'true' },
    { tt_members: 'c' }
  ]

  it('un caso saltado cuenta 1, no targetsPerCase', () => {
    expect(computeExpectedTotal(cases, undefined, 10)).toBe(21)
  })

  it('respeta la selección de casos (índices 1-based)', () => {
    expect(computeExpectedTotal(cases, [1, 3], 10)).toBe(20)
    expect(computeExpectedTotal(cases, [2], 10)).toBe(1)
  })

  it('selección vacía = todos', () => {
    expect(computeExpectedTotal(cases, [], 10)).toBe(21)
  })
})

describe('computeLiveProgress', () => {
  const log = (body: string) => `teuton run\nStarted at 2026-08-07 10:00\n${body}`

  it('cuenta ./F/S solo entre los marcadores', () => {
    expect(computeLiveProgress(log('..F.S\nFinished in 3.2 seconds'))).toBe(5)
  })

  it('antes de "Started at" no cuenta nada', () => {
    expect(computeLiveProgress('Loading config...\nFFF')).toBe(0)
  })

  it('no cuenta los puntos de una nota como 100.0 tras "Finished in"', () => {
    expect(computeLiveProgress(log('..\nFinished in 3.2 seconds\nGrade: 100.0\nFAILED: 0'))).toBe(2)
  })

  it('ignora las líneas informativas "==>" de tt_sequence', () => {
    expect(computeLiveProgress(log('==> Running case [Fernando Sanz]\n..F\nFinished in 1s'))).toBe(3)
  })
})

describe('scanProgressChunk', () => {
  /** Aplica el escáner troceando el log en chunks de tamaño `size`. */
  function scanInChunks(text: string, size: number): { total: number; state: ProgressScanState } {
    let state = INITIAL_SCAN_STATE
    let total = 0
    for (let i = 0; i < text.length; i += size) {
      const r = scanProgressChunk(state, text.slice(i, i + size))
      state = r.state
      total += r.delta
    }
    return { total, state }
  }

  const full =
    'teuton run\nStarted at 2026-08-07 10:00\n==> Running case [Ana]\n..F.\n==> Running case [Luis]\nS..\nFinished in 3.2 seconds\nGrade: 100.0\n'

  it('el total troceado coincide con computeLiveProgress, corte donde corte', () => {
    const expected = computeLiveProgress(full)
    expect(expected).toBe(7)
    for (const size of [1, 2, 3, 5, 7, 13, 64, 4096]) {
      expect(scanInChunks(full, size).total, `chunks de ${size}`).toBe(expected)
    }
  })

  it('una vez visto "Finished in" no vuelve a contar nunca', () => {
    const { state } = scanInChunks(full, 8)
    expect(state.phase).toBe('finished')
    expect(scanProgressChunk(state, '....FFF').delta).toBe(0)
  })

  it('flushPendingSymbols recupera el símbolo retenido al cancelar', () => {
    // La 'F' final es ambigua: puede ser un fallo o el arranque de "Finished in".
    const r = scanProgressChunk(INITIAL_SCAN_STATE, 'Started at ya\n..F')
    expect(r.delta).toBe(2)
    expect(r.state.pending).toBe('F')
    expect(flushPendingSymbols(r.state)).toBe(1)
  })

  it('no cuenta nada pendiente si la ejecución ya había terminado', () => {
    const { state } = scanInChunks(full, 16)
    expect(flushPendingSymbols(state)).toBe(0)
  })
})
