import { describe, it, expect } from 'vitest'
import { redactText, secretValues } from '../src/renderer/src/lib/redact'
import { parseConfig } from '../src/renderer/src/lib/config'
import { isMachineColumn } from '../src/renderer/src/lib/config'

const YAML = `
global:
  host1_username: usuario
  host1_password: elpuig2026
cases:
  - tt_members: Ana
    host1_ip: 192.168.1.10
    host1_password: ana-secreta
  - tt_members: Luis
    host1_ip: 192.168.1.11
`

describe('secretValues', () => {
  it('recoge las contraseñas del global y de cada alumno, las largas primero', () => {
    const { config } = parseConfig(YAML)
    expect(secretValues(config)).toEqual(['ana-secreta', 'elpuig2026'])
  })

  it('ignora los valores demasiado cortos para sustituirlos sin destrozar el texto', () => {
    const { config } = parseConfig('global:\n  host1_password: ab\ncases: []\n')
    expect(secretValues(config)).toEqual([])
  })
})

describe('redactText', () => {
  const { config } = parseConfig(YAML)
  const secrets = secretValues(config)

  it('tapa la IP y la contraseña de una orden de ssh', () => {
    const out = redactText('sshpass -p ana-secreta ssh usuario@192.168.1.10 systemctl status', secrets)
    expect(out).toBe('sshpass -p •••••• ssh usuario@•••.•••.•••.••• systemctl status')
  })

  it('no toca una nota con decimales', () => {
    expect(redactText('Grade: 100.0 puntos', secrets)).toBe('Grade: 100.0 puntos')
  })

  it('sin modo proyector el texto no pasa por aquí, pero sin secretos sigue tapando IPs', () => {
    expect(redactText('ping 10.0.0.1', [])).toBe('ping •••.•••.•••.•••')
  })
})

describe('isMachineColumn', () => {
  it('reconoce las columnas de dirección y solo esas', () => {
    expect(isMachineColumn('host1_ip')).toBe(true)
    expect(isMachineColumn('host2_ip')).toBe(true)
    expect(isMachineColumn('tt_members')).toBe(false)
    expect(isMachineColumn('host1_port')).toBe(false)
  })
})
