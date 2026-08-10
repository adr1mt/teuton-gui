// Campos habituales de Teutón que el profesor suele necesitar por alumno.
export const COMMON_FIELDS: { key: string; label: string }[] = [
  { key: 'host1_ip', label: 'IP (host1_ip)' },
  { key: 'host1_username', label: 'Usuario (host1_username)' },
  { key: 'host1_password', label: 'Contraseña (host1_password)' },
  { key: 'host1_port', label: 'Puerto (host1_port)' },
  { key: 'tt_moodle_id', label: 'ID Moodle (tt_moodle_id)' },
  { key: 'tt_skip', label: 'Saltar (tt_skip)' }
]

/** Columna que las Clases muestran siempre fija (la IP de examen de cada alumno). */
export const CLASS_FIXED_FIELD = 'host1_ip'

/**
 * Campos que el menú «+» de Clases ofrece añadir. No incluye usuario/contraseña
 * (van como credenciales por defecto de la app, no por alumno) ni host1_ip (ya
 * es columna fija). Se sugiere host2_ip para exámenes con una segunda máquina.
 */
export const CLASS_COMMON_FIELDS: { key: string; label: string }[] = [
  { key: 'host2_ip', label: 'IP 2º host (host2_ip)' },
  { key: 'host1_port', label: 'Puerto (host1_port)' },
  { key: 'tt_skip', label: 'Saltar (tt_skip)' }
]
