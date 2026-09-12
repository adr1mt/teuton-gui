import { useMemo } from 'react'
import { useApp } from '../stores/app'
import { isSecretColumn, parseConfig, type TeutonConfig } from './config'

/**
 * Ocultar datos de máquina mientras la pantalla se proyecta («modo proyector»).
 *
 * El panel de resultados no enseña IPs ni contraseñas, pero el detalle de un
 * alumno sí: las órdenes que Teutón ha lanzado llevan la IP del equipo y, en
 * las comprobaciones por ssh, la contraseña en la propia línea de órdenes. La
 * consola de Ejecutar arrastra lo mismo. Proyectado en el aula, eso es entregar
 * el acceso a la máquina de un compañero a quien esté mirando.
 *
 * Las contraseñas NO se detectan por heurística: se toman del config del
 * proyecto (los campos que `isSecretColumn` ya considera sensibles) y se
 * sustituyen por su valor exacto, así que no depende de cómo las escriba
 * Teutón en la orden. Las IPv4 sí van por patrón, que es inequívoco.
 */

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
const HIDDEN_IP = '•••.•••.•••.•••'
const HIDDEN = '••••••'

/** Valores sensibles literales del proyecto: globales y por alumno. */
export function secretValues(config: TeutonConfig): string[] {
  const out = new Set<string>()
  const collect = (obj: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(obj)) {
      // Por debajo de 3 caracteres el reemplazo destrozaría texto inocente.
      if (isSecretColumn(key) && typeof value === 'string' && value.length >= 3) out.add(value)
    }
  }
  collect(config.global)
  for (const c of config.cases) collect(c)
  // Primero los más largos: si una contraseña contiene a otra, se sustituye la
  // completa y no queda media a la vista.
  return [...out].sort((a, b) => b.length - a.length)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactText(text: string, secrets: string[]): string {
  let out = text
  for (const s of secrets) out = out.split(s).join(HIDDEN)
  return out.replace(IPV4, HIDDEN_IP)
}

/**
 * Devuelve la función de tapado vigente. Fuera del modo proyector es la
 * identidad, de modo que quien la usa no necesita comprobar el modo ni pagar
 * el coste del reemplazo (la consola de un examen largo llega a 500 kB).
 */
export function useRedactor(): (text: string) => string {
  const projector = useApp((s) => s.projector)
  const configDraft = useApp((s) => s.configDraft)
  const defaultGlobals = useApp((s) => s.defaultGlobals)
  return useMemo(() => {
    if (!projector) return (text: string) => text
    const { config } = parseConfig(configDraft)
    const secrets = secretValues(config)
    // La contraseña por defecto de la app puede no estar en el config del
    // proyecto (se vuelca al importar la clase) y sale igual en las órdenes.
    const extra = defaultGlobals.host1_password
    const all = extra && extra.length >= 3 ? [...new Set([...secrets, extra])].sort((a, b) => b.length - a.length) : secrets
    return (text: string) => redactText(text, all)
  }, [projector, configDraft, defaultGlobals])
}
