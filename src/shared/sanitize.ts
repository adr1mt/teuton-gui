// Utilidades de saneado compartidas entre main y renderer.

/** Sanea un nombre para usarlo como nombre de fichero en cualquier SO. */
export function sanitizeFileName(name: string, fallback: string): string {
  const clean = name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().replace(/\s+/g, '_')
  return clean || fallback
}
