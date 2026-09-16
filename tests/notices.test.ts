import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from '../src/renderer/src/stores/app'

// S-14: un aviso posterior no puede borrar uno de notas no guardadas.
const lost = 'No se han guardado las notas de esta pasada: EACCES.'
const messages = () => useApp.getState().notices.map((n) => n.message)

const project = {
  dir: '/tmp/proyecto', cname: 'start', script: '', config: '', scriptFile: 'start.rb', configFile: 'config.yaml'
}

describe('avisos operativos (S-14)', () => {
  beforeEach(() => useApp.getState().setOperationalError(null))

  it('un aviso informativo posterior no sustituye a un error', () => {
    const st = useApp.getState()
    st.setOperationalError(lost)
    st.setOperationalError('El modo examen se había quedado parado; se reanuda ahora.', { info: true })
    expect(messages()).toContain(lost)
    expect(messages()).toHaveLength(2)
  })

  it('un error posterior tampoco lo sustituye', () => {
    const st = useApp.getState()
    st.setOperationalError(lost)
    st.setOperationalError('Las notas se calcularon, pero no se pudo guardar el CSV: ENOSPC')
    expect(messages()).toEqual([lost, 'Las notas se calcularon, pero no se pudo guardar el CSV: ENOSPC'])
  })

  it('los informativos no se acumulan: el nuevo sustituye al anterior', () => {
    const st = useApp.getState()
    st.setOperationalError('uno', { info: true })
    st.setOperationalError('dos', { info: true })
    expect(messages()).toEqual(['dos'])
  })

  it('el mismo error en cada ciclo del modo examen no crea una avalancha', () => {
    for (let i = 0; i < 20; i++) useApp.getState().setOperationalError(lost)
    expect(useApp.getState().notices).toHaveLength(1)
    expect(useApp.getState().notices[0].count).toBe(20)
  })

  it('la lista está acotada y dice cuántos avisos antiguos se han apartado', () => {
    for (let i = 0; i < 12; i++) useApp.getState().setOperationalError(`error ${i}`)
    expect(useApp.getState().notices.length).toBeLessThanOrEqual(5)
    expect(messages()).toContain('error 11')
    expect(useApp.getState().droppedNotices).toBe(7)
  })

  it('solo desaparece el que el profesor cierra', () => {
    const st = useApp.getState()
    st.setOperationalError(lost)
    st.setOperationalError('otro')
    st.dismissNotice(useApp.getState().notices[1].id)
    expect(messages()).toEqual([lost])
  })

  it('cambiar de proyecto no borra un error de notas sin leer', () => {
    const st = useApp.getState()
    st.setOperationalError(lost)
    st.setOperationalError('informativo', { info: true })
    st.closeProject()
    st.setProject(project)
    expect(messages()).toEqual([lost])
  })
})
