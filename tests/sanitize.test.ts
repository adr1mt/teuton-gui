import { describe, expect, it } from 'vitest'
import { sanitizeFileName } from '../src/shared/sanitize'

describe('sanitizeFileName', () => {
  it('conserva letras acentuadas, números y guiones', () => {
    expect(sanitizeFileName('SMX2-Català', 'x')).toBe('SMX2-Català')
  })

  it('elimina separadores de ruta y caracteres problemáticos', () => {
    expect(sanitizeFileName('../etc/passwd', 'x')).toBe('..etcpasswd')
    expect(sanitizeFileName('a:b*c?d"e<f>g|h', 'x')).toBe('abcdefgh')
  })

  it('colapsa los espacios en guiones bajos', () => {
    expect(sanitizeFileName('  1º SMX   grupo B ', 'x')).toBe('1º_SMX_grupo_B')
  })

  it('usa el fallback si no queda nada utilizable', () => {
    expect(sanitizeFileName('///', 'teuton')).toBe('teuton')
    expect(sanitizeFileName('', 'teuton')).toBe('teuton')
  })
})
