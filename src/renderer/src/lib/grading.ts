import type { GradingSettings } from '../../../shared/types'

/**
 * Convierte la nota de Teutón (0-100) a la escala del profesor mediante una
 * recta a trozos que pasa por (0,0), (passScore, maxGrade/2) y (100, maxGrade).
 * Con passScore=70 y maxGrade=10: 70 pts → 5, 100 pts → 10, 0 pts → 0.
 */
export function convertGrade(score: number, g: GradingSettings): number {
  const pass = Math.min(99, Math.max(1, g.passScore))
  const half = g.maxGrade / 2
  let grade: number
  if (score <= pass) {
    grade = (score / pass) * half
  } else {
    grade = half + ((score - pass) / (100 - pass)) * half
  }
  return Math.max(0, Math.min(g.maxGrade, grade))
}

/**
 * Puntuación que realmente se guarda y se exporta: la mejor entre la última
 * pasada y el récord histórico. Si un alumno llegó a 90 pts y luego se le cayó
 * un servicio, su nota sigue siendo el 90. Única fuente de esta regla: la usan
 * el CSV de Moodle y la tabla del dashboard, para que nunca discrepen.
 */
export function bestScore(score: number, record?: number): number {
  return Math.max(score, record ?? 0)
}

/**
 * Nota ya convertida y lista para enseñar en pantalla, con coma decimal. Es
 * SOLO presentación: el CSV de Moodle sigue escribiendo `toFixed(2)` con punto,
 * que es lo que Moodle espera, y por eso no comparte esta función.
 */
export function formatGrade(score: number, g: GradingSettings): string {
  return convertGrade(score, g).toFixed(2).replace('.', ',')
}

/** ¿La puntuación de Teutón supera el umbral de aprobado? */
export function isPass(score: number, g: GradingSettings): boolean {
  return score >= Math.min(99, Math.max(1, g.passScore))
}

/**
 * Tinta de la nota cuando se pinta suelta sobre el lienzo, sin chip. Usa las
 * variantes «strong» porque esta cifra es la que se proyecta a 30-44px: el rojo
 * puro se queda en ~4:1 sobre blanco y el proyector se lo come.
 */
export function passColor(score: number, g: GradingSettings): string {
  return isPass(score, g) ? 'text-success-strong' : 'text-destructive-strong'
}

/**
 * Fondo teñido + texto para el chip de la nota. Usa las variantes «strong»: el
 * verde/rojo puros sobre su propio tinte al 15% se quedan en ~2,9:1, y el chip
 * lleva justo el dato que el profesor lee en voz alta.
 */
export function passBg(score: number, g: GradingSettings): string {
  return isPass(score, g)
    ? 'bg-success/15 text-success-strong'
    : 'bg-destructive/15 text-destructive-strong'
}
