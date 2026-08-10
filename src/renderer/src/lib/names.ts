/**
 * Etiqueta corta para las cabeceras de la matriz: el nombre de pila. Si dos
 * alumnos lo comparten, ambos pasan a «Nombre A.»; si aún así chocan, se quedan
 * con el nombre completo — dos columnas con el mismo rótulo sobre un proyector
 * son peores que una columna ancha.
 *
 * Un `tt_members` con coma lista varios alumnos en un mismo caso: ahí no hay
 * «nombre de pila» que valga y se deja tal cual.
 */
export function shortNameMap(students: { id: string; members: string }[]): Map<string, string> {
  const parts = (m: string) => m.trim().split(/\s+/).filter(Boolean)
  const label = (m: string, withInitial: boolean): string => {
    if (m.includes(',')) return m
    const p = parts(m)
    if (p.length === 0) return m
    if (!withInitial || p.length === 1) return p[0]
    return `${p[0]} ${p[1][0]}.`
  }

  const tally = (withInitial: boolean): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const s of students) {
      const l = label(s.members, withInitial)
      counts.set(l, (counts.get(l) ?? 0) + 1)
    }
    return counts
  }

  const firstNames = tally(false)
  const withInitials = tally(true)

  const out = new Map<string, string>()
  for (const s of students) {
    const plain = label(s.members, false)
    if ((firstNames.get(plain) ?? 0) === 1) {
      out.set(s.id, plain)
      continue
    }
    const initialed = label(s.members, true)
    out.set(s.id, (withInitials.get(initialed) ?? 0) === 1 ? initialed : s.members)
  }
  return out
}
