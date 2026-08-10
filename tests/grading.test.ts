import { describe, expect, it } from 'vitest'
import { bestScore, convertGrade, isPass, passBg, passColor } from '../src/renderer/src/lib/grading'

const g = { passScore: 70, maxGrade: 10 }

describe('convertGrade', () => {
  it('pasa por (0,0), (passScore, mitad) y (100, máximo)', () => {
    expect(convertGrade(0, g)).toBe(0)
    expect(convertGrade(70, g)).toBe(5)
    expect(convertGrade(100, g)).toBe(10)
  })

  it('interpola linealmente en cada tramo', () => {
    expect(convertGrade(35, g)).toBeCloseTo(2.5)
    expect(convertGrade(85, g)).toBeCloseTo(7.5)
  })

  it('acota fuera de rango', () => {
    expect(convertGrade(-20, g)).toBe(0)
    expect(convertGrade(150, g)).toBe(10)
  })

  it('un passScore absurdo no produce división por cero ni Infinity', () => {
    expect(Number.isFinite(convertGrade(50, { passScore: 0, maxGrade: 10 }))).toBe(true)
    expect(Number.isFinite(convertGrade(100, { passScore: 100, maxGrade: 10 }))).toBe(true)
  })

  it('respeta otras escalas', () => {
    expect(convertGrade(100, { passScore: 50, maxGrade: 4 })).toBe(4)
    expect(convertGrade(50, { passScore: 50, maxGrade: 4 })).toBe(2)
  })
})

describe('bestScore', () => {
  it('se queda con la mejor nota, no con la última', () => {
    // El caso real: el alumno llegó a 90 y luego se le cayó un servicio.
    expect(bestScore(0, 90)).toBe(90)
    expect(bestScore(95, 90)).toBe(95)
  })

  it('sin récord, la nota es la de la pasada actual', () => {
    expect(bestScore(42, undefined)).toBe(42)
    expect(bestScore(0, undefined)).toBe(0)
  })
})

describe('isPass y los helpers de color', () => {
  it('el umbral es el configurado', () => {
    expect(isPass(69, g)).toBe(false)
    expect(isPass(70, g)).toBe(true)
    expect(isPass(60, { passScore: 50, maxGrade: 10 })).toBe(true)
  })

  it('los colores derivan de isPass', () => {
    expect(passColor(70, g)).toContain('success')
    expect(passColor(69, g)).toContain('destructive')
    expect(passBg(70, g)).toContain('success')
    expect(passBg(69, g)).toContain('destructive')
  })
})
