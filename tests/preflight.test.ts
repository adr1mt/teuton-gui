import { describe, it, expect } from 'vitest'
import {
  evaluateCheck,
  evaluateConfig,
  evaluateTeuton,
  report
} from '../src/renderer/src/lib/preflight'
import type { CheckResult, TeutonStatus } from '../src/shared/types'

const status = (over: Partial<TeutonStatus> = {}): TeutonStatus => ({
  installed: true,
  version: '2.6.0',
  path: '/usr/bin/teuton',
  source: 'auto',
  ...over
})

const check = (over: Partial<CheckResult> = {}): CheckResult => ({
  ok: true,
  output: '| Targets      | 3     |',
  exitCode: 0,
  ...over
})

describe('evaluateTeuton', () => {
  it('da por buena una instalación detectada', () => {
    expect(evaluateTeuton(status())).toMatchObject({ state: 'ok', detail: 'versión 2.6.0' })
  })

  it('bloquea si no está instalado', () => {
    expect(evaluateTeuton(status({ installed: false }))).toMatchObject({ state: 'fail' })
  })

  // Si el profesor acaba de escribir una ruta a mano, el motivo es ESE, no
  // «no encontrado» genérico, que le haría buscar en el sitio equivocado.
  it('explica el error de la ruta escrita a mano', () => {
    const item = evaluateTeuton(
      status({ installed: false, source: 'manual', manualPathError: 'no es ejecutable' })
    )
    expect(item.detail).toBe('no es ejecutable')
  })
})

describe('evaluateConfig', () => {
  const yamlFor = (cases: string): string => `global:\n  host1_ip: 10.0.0.1\ncases:\n${cases}`

  it('cuenta los alumnos y nombra la clase', () => {
    const items = evaluateConfig(
      yamlFor('  - tt_members: Ana\n    host1_ip: 10.0.0.2\n  - tt_members: Luis\n    host1_ip: 10.0.0.3\n'),
      '1r SMX'
    )
    expect(items.map((i) => i.state)).toEqual(['ok', 'ok'])
    expect(items[1]).toMatchObject({ label: '2 alumnos en el examen', detail: 'clase «1r SMX»' })
  })

  it('un YAML roto bloquea y no dice nada más', () => {
    const items = evaluateConfig('cases:\n  - [unclosed\n', null)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'config', state: 'fail' })
  })

  it('sin alumnos no se puede empezar', () => {
    expect(evaluateConfig('global: {}\ncases: []\n', null)[1]).toMatchObject({
      id: 'students',
      state: 'fail'
    })
  })

  // Un alumno sin nombre no tiene clave para el récord ni para el CSV de
  // Moodle: su nota se pierde al acabar el examen.
  it('un alumno sin nombre bloquea', () => {
    const items = evaluateConfig(yamlFor('  - tt_members: Ana\n  - host1_ip: 10.0.0.9\n'), null)
    expect(items.find((i) => i.id === 'students')).toMatchObject({ state: 'fail' })
  })

  it('faltar la IP es solo un aviso', () => {
    const items = evaluateConfig(yamlFor('  - tt_members: Ana\n'), null)
    expect(items.find((i) => i.id === 'ips')).toMatchObject({ state: 'warn' })
    expect(report(items).ready).toBe(true)
  })

  it('sin clase activa dice que los alumnos son manuales', () => {
    const items = evaluateConfig(yamlFor('  - tt_members: Ana\n    host1_ip: 10.0.0.2\n'), null)
    expect(items[1].detail).toMatch(/a mano/)
  })
})

describe('evaluateCheck', () => {
  it('cuenta las comprobaciones por alumno', () => {
    expect(evaluateCheck(check())).toMatchObject({
      state: 'ok',
      detail: '3 comprobaciones por alumno'
    })
  })

  it('un test con error bloquea y muestra la primera línea útil', () => {
    const item = evaluateCheck(check({ ok: false, exitCode: 1, output: '\n\nstart.rb:4: syntax error\n' }))
    expect(item).toMatchObject({ state: 'fail', detail: 'start.rb:4: syntax error' })
  })

  // Sin la tabla de DSL Stats el test es válido, solo que la barra de progreso
  // irá sin total: es un aviso, no un motivo para no empezar.
  it('sin el recuento de objetivos avisa pero no bloquea', () => {
    const item = evaluateCheck(check({ output: 'todo bien' }))
    expect(item.state).toBe('warn')
    expect(report([item]).ready).toBe(true)
  })
})

describe('report', () => {
  it('un solo fallo impide empezar', () => {
    const items = [
      { id: 'a', label: '', state: 'ok' as const, detail: '' },
      { id: 'b', label: '', state: 'fail' as const, detail: '' }
    ]
    expect(report(items).ready).toBe(false)
  })
})
