import { describe, expect, it } from 'vitest'
import {
  caseColumns,
  isSecretColumn,
  parseConfig,
  stringifyConfig
} from '../src/renderer/src/lib/config'

describe('parseConfig', () => {
  it('normaliza el estilo clásico de símbolos Ruby (":clave:")', () => {
    const { config, error } = parseConfig(`---
:global:
  :tt_testname: dns
:cases:
  - :tt_members: pepito
    :host1_ip: 10.0.0.1
`)
    expect(error).toBeNull()
    expect(config.global.tt_testname).toBe('dns')
    expect(config.cases[0].tt_members).toBe('pepito')
    expect(config.cases[0].host1_ip).toBe('10.0.0.1')
  })

  it('acepta igual el estilo moderno', () => {
    const { config } = parseConfig('---\nglobal:\n  tt_testname: dns\ncases:\n  - tt_members: ana\n')
    expect(config.global.tt_testname).toBe('dns')
    expect(config.cases[0].tt_members).toBe('ana')
  })

  it('conserva en extra las secciones que la GUI no edita', () => {
    const { config } = parseConfig(`---
global:
  tt_testname: dns
alias:
  foo: bar
tt_include:
  - otro.rb
cases:
  - tt_members: ana
`)
    expect(config.extra).toEqual({ alias: { foo: 'bar' }, tt_include: ['otro.rb'] })
  })

  it('es tolerante: YAML inválido devuelve error y un modelo vacío', () => {
    const { config, error } = parseConfig('---\nglobal: [esto: no\n  cierra')
    expect(error).not.toBeNull()
    expect(config).toEqual({ global: {}, cases: [], extra: {} })
  })

  it('un fichero vacío no revienta', () => {
    expect(parseConfig('')).toEqual({ config: { global: {}, cases: [], extra: {} }, error: null })
  })
})

describe('stringifyConfig', () => {
  it('el ida y vuelta preserva datos y escribe en estilo moderno', () => {
    const original = `---
:global:
  :tt_testname: dns
:alias:
  foo: bar
:cases:
  - :tt_members: pepito
    :host1_ip: 10.0.0.1
`
    const first = parseConfig(original).config
    const yaml = stringifyConfig(first)

    expect(yaml).not.toContain(':tt_members:')
    expect(yaml.startsWith('---\n')).toBe(true)

    const second = parseConfig(yaml).config
    expect(second).toEqual(first)
    // La sección que la GUI no edita sobrevive al guardado.
    expect(second.extra.alias).toEqual({ foo: 'bar' })
  })

  it('un global vacío se escribe como null (formato de Teutón)', () => {
    const yaml = stringifyConfig({ global: {}, cases: [{ tt_members: 'ana' }], extra: {} })
    expect(yaml).toContain('global: null')
  })
})

describe('caseColumns e isSecretColumn', () => {
  it('pone tt_members y tt_moodle_id primero, sin duplicar el resto', () => {
    expect(
      caseColumns([
        { host1_ip: '10.0.0.1', tt_members: 'ana' },
        { tt_moodle_id: 'a@b.c', tt_members: 'luis', host2_ip: '10.0.0.2' }
      ])
    ).toEqual(['tt_members', 'tt_moodle_id', 'host1_ip', 'host2_ip'])
  })

  it('detecta campos sensibles', () => {
    expect(isSecretColumn('host1_password')).toBe(true)
    expect(isSecretColumn('API_KEY')).toBe(true)
    expect(isSecretColumn('host1_ip')).toBe(false)
  })
})
