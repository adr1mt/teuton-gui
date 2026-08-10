import { describe, it, expect } from 'vitest'
import { shortNameMap } from '../src/renderer/src/lib/names'

const map = (names: string[]): string[] => {
  const students = names.map((members, i) => ({ id: `c${i}`, members }))
  const out = shortNameMap(students)
  return students.map((s) => out.get(s.id) ?? '')
}

describe('shortNameMap', () => {
  it('deja solo el nombre de pila cuando no hay choque', () => {
    expect(map(['Ana Ferrer', 'Marc Oliva'])).toEqual(['Ana', 'Marc'])
  })

  it('añade la inicial del apellido a los dos que comparten nombre', () => {
    expect(map(['Marc Oliva', 'Marc Gisbert', 'Laia Puig'])).toEqual(['Marc O.', 'Marc G.', 'Laia'])
  })

  it('cae al nombre completo si la inicial tampoco desempata', () => {
    expect(map(['Marc Oliva', 'Marc Ortiz'])).toEqual(['Marc Oliva', 'Marc Ortiz'])
  })

  it('desempata solo a los que chocan, no a toda la clase', () => {
    expect(map(['Marc Oliva', 'Marc Ortiz', 'Ana Ferrer'])).toEqual([
      'Marc Oliva',
      'Marc Ortiz',
      'Ana'
    ])
  })

  it('respeta un caso con varios alumnos (tt_members con coma)', () => {
    expect(map(['ana, luis', 'Marc Oliva'])).toEqual(['ana, luis', 'Marc'])
  })

  it('acepta un solo nombre sin apellido', () => {
    expect(map(['pepito'])).toEqual(['pepito'])
  })

  it('no rompe con nombre único sin apellido repetido', () => {
    // Dos «pepito» sin apellido: no hay inicial que añadir, así que se quedan igual.
    expect(map(['pepito', 'pepito'])).toEqual(['pepito', 'pepito'])
  })

  it('ignora los espacios de más', () => {
    expect(map(['  Ana   Ferrer  '])).toEqual(['Ana'])
  })

  it('devuelve una entrada por alumno', () => {
    const students = [
      { id: 'a', members: 'Ana Ferrer' },
      { id: 'b', members: 'Marc Oliva' }
    ]
    expect(shortNameMap(students).size).toBe(2)
  })
})
