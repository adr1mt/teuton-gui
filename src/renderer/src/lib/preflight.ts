import type { CheckResult, TeutonStatus } from '../../../shared/types'
import { useApp } from '../stores/app'
import { parseConfig } from './config'
import { parseTargetsFromCheckOutput } from './progress'
import { saveDraftsIfDirty } from './run'

/**
 * «¿Todo listo?»: las comprobaciones previas al examen, hechas de golpe y con
 * los alumnos todavía fuera del aula.
 *
 * Cada una de estas cosas ya se puede descubrir por separado (Ajustes dice si
 * Teutón está, la tabla se bloquea si el YAML está roto, `teuton check` está en
 * la barra de progreso), pero se descubren de una en una y en mitad de la
 * ejecución. Aquí se responden todas antes de empezar, que es cuando aún hay
 * tiempo de arreglarlas.
 */
export type PreflightState = 'ok' | 'warn' | 'fail'

export interface PreflightItem {
  id: string
  label: string
  state: PreflightState
  detail: string
}

export interface PreflightReport {
  items: PreflightItem[]
  /** Ningún «fail»: se puede empezar (los avisos no bloquean). */
  ready: boolean
}

export function evaluateTeuton(status: TeutonStatus): PreflightItem {
  if (status.installed) {
    return {
      id: 'teuton',
      label: 'Teutón está instalado',
      state: 'ok',
      detail: `versión ${status.version ?? '?'}`
    }
  }
  return {
    id: 'teuton',
    label: 'No se encuentra el programa Teutón',
    state: 'fail',
    detail:
      status.manualPathError ??
      'Instálalo, o indica su ruta en Ajustes → Ruta de Teutón. Sin él no se puede corregir.'
  }
}

/**
 * Configuración y alumnos. Se leen del borrador del editor, que es lo que el
 * profesor ve; el preflight guarda antes en disco, igual que hace `startRun`.
 */
export function evaluateConfig(configDraft: string, activeClass: string | null): PreflightItem[] {
  const { config, error } = parseConfig(configDraft)
  if (error) {
    return [
      {
        id: 'config',
        label: 'El fichero de configuración tiene un error',
        state: 'fail',
        detail: `${error} Corrígelo en el editor: sin esto no se puede evaluar a nadie.`
      }
    ]
  }

  const items: PreflightItem[] = [
    { id: 'config', label: 'La configuración se entiende', state: 'ok', detail: '' }
  ]

  const cases = config.cases
  if (cases.length === 0) {
    items.push({
      id: 'students',
      label: 'No hay ningún alumno en el examen',
      state: 'fail',
      detail: 'Importa una clase desde el editor, o añade alumnos a mano.'
    })
    return items
  }

  const unnamed = cases.filter((c) => String(c.tt_members ?? '').trim() === '').length
  const noIp = cases.filter((c) => String(c.host1_ip ?? '').trim() === '').length
  items.push({
    id: 'students',
    label: `${cases.length} ${cases.length === 1 ? 'alumno' : 'alumnos'} en el examen`,
    state: unnamed > 0 ? 'fail' : 'ok',
    detail:
      unnamed > 0
        ? `${unnamed} sin nombre: su nota no se podrá guardar ni exportar a Moodle.`
        : activeClass
          ? `clase «${activeClass}»`
          : 'añadidos a mano (no vienen de ninguna clase guardada)'
  })

  if (noIp > 0) {
    items.push({
      id: 'ips',
      label: `${noIp} ${noIp === 1 ? 'alumno' : 'alumnos'} sin IP`,
      state: 'warn',
      detail: 'Si su máquina se localiza de otra forma, ignóralo; si no, no se les podrá conectar.'
    })
  }

  return items
}

export function evaluateCheck(res: CheckResult): PreflightItem {
  if (!res.ok) {
    // La salida cruda de Teutón es la única pista útil aquí, pero no cabe
    // entera: la primera línea con contenido suele ser el error de Ruby.
    const firstLine = res.output.split('\n').map((l) => l.trim()).find(Boolean)
    return {
      id: 'check',
      label: 'El test tiene un error y no se puede ejecutar',
      state: 'fail',
      detail: firstLine || 'Teutón terminó con error al revisar el test.'
    }
  }
  const targets = parseTargetsFromCheckOutput(res.output)
  if (targets == null) {
    return {
      id: 'check',
      label: 'El test se revisa sin errores',
      state: 'warn',
      detail: 'No se ha podido contar las comprobaciones: la barra de progreso irá sin total.'
    }
  }
  return {
    id: 'check',
    label: 'El test se revisa sin errores',
    state: 'ok',
    detail: `${targets} ${targets === 1 ? 'comprobación' : 'comprobaciones'} por alumno`
  }
}

export function report(items: PreflightItem[]): PreflightReport {
  return { items, ready: items.every((i) => i.state !== 'fail') }
}

/**
 * Ejecuta las comprobaciones contra el proyecto abierto. Guarda antes los
 * borradores del editor por la misma razón que `startRun`: `teuton check` lee
 * los ficheros del disco, así que sin guardar revisaría el examen anterior.
 */
export async function runPreflight(): Promise<PreflightReport> {
  const st = useApp.getState()
  const project = st.project
  if (!project) return report([])

  try {
    await saveDraftsIfDirty()
  } catch (error) {
    return report([
      {
        id: 'save',
        label: 'No se han podido guardar los cambios del editor',
        state: 'fail',
        detail: error instanceof Error ? error.message : String(error)
      }
    ])
  }

  const items: PreflightItem[] = []
  let teutonOk = false
  try {
    const status = await window.teuton.detect()
    teutonOk = status.installed
    items.push(evaluateTeuton(status))
  } catch (error) {
    items.push({
      id: 'teuton',
      label: 'No se ha podido comprobar si Teutón está instalado',
      state: 'fail',
      detail: error instanceof Error ? error.message : String(error)
    })
  }

  const configItems = evaluateConfig(useApp.getState().configDraft, st.activeClass)
  items.push(...configItems)

  // `teuton check` solo tiene sentido si hay binario y el YAML se entiende:
  // si no, su error sería el mismo que ya estamos contando arriba, dos veces.
  const configBroken = configItems.some((i) => i.state === 'fail')
  if (teutonOk && !configBroken) {
    try {
      items.push(evaluateCheck(await window.teuton.check(project.dir, project.cname)))
    } catch (error) {
      items.push({
        id: 'check',
        label: 'No se ha podido revisar el test',
        state: 'fail',
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return report(items)
}
