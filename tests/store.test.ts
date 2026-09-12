import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ userData: '/tmp/teuton-store-tests' }))

vi.mock('electron', () => ({
  app: { getPath: () => runtime.userData },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf-8')
  }
}))

import { getProjectMeta, getRecords, setProjectMeta, updateRecords } from '../src/main/store'
import { validatedMeta } from '../src/main/validation'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })))
})

describe('persistencia de récords', () => {
  it('avisa y conserva el dato en memoria si no puede escribir', async () => {
    const missingParent = join(tmpdir(), `teuton-missing-${randomUUID()}`, 'proyecto')
    const outcome = await updateRecords(missingParent, { Ana: 87 }, 'clase-1')
    expect(outcome).toMatchObject({ data: { Ana: 87 }, persisted: false })
    expect(outcome.warning).toContain('No se pudo guardar')
  })

  it('migra el formato v1 sin mezclarlo con una clase importada', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'teuton-records-'))
    temporary.push(dir)
    await fs.writeFile(join(dir, '.teuton-gui-records.json'), JSON.stringify({ Ana: 91 }))

    expect(await getRecords(dir)).toEqual({ Ana: 91 })
    expect(await getRecords(dir, 'clase-1')).toEqual({})
  })
})

describe('persistencia de metadatos del proyecto', () => {
  it('actualiza la última ejecución sin borrar la clase activa', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'teuton-meta-'))
    temporary.push(dir)
    await setProjectMeta(dir, { activeClassId: 'clase-1', activeClass: 'ASIX A' })

    await setProjectMeta(dir, validatedMeta({
      lastRunClassId: 'clase-1',
      lastRunClassName: 'ASIX A'
    }))

    expect(await getProjectMeta(dir)).toEqual({
      activeClassId: 'clase-1',
      activeClass: 'ASIX A',
      lastRunClassId: 'clase-1',
      lastRunClassName: 'ASIX A'
    })
  })
})

describe('un fichero ilegible no puede borrar datos', () => {
  it('no reescribe el historial si no se puede leer', async () => {
    const dir = join(tmpdir(), `teuton-records-${randomUUID()}`)
    temporary.push(dir)
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, '.teuton-gui-records.json')
    await fs.writeFile(file, '{ esto no es JSON', 'utf-8')

    const outcome = await updateRecords(dir, { Ana: 40 }, 'clase-1')

    // Partir de cero y escribir habría sustituido el historial de la clase por
    // las notas de esta única pasada, que es justo lo que el récord evita.
    expect(outcome.persisted).toBe(false)
    expect(outcome.warning).toMatch(/dañado|no se pudo leer/i)
    expect(await fs.readFile(file, 'utf-8')).toBe('{ esto no es JSON')
  })

  it('fusiona las notas cuyo nombre solo difiere en espacios sobrantes', async () => {
    const dir = join(tmpdir(), `teuton-records-${randomUUID()}`)
    temporary.push(dir)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      join(dir, '.teuton-gui-records.json'),
      JSON.stringify({ version: 2, classes: { 'class:c1': { 'Ana Ferrer': 90, 'Ana Ferrer ': 30 } } }),
      'utf-8'
    )

    const records = await getRecords(dir, 'c1')

    expect(Object.keys(records)).toEqual(['Ana Ferrer'])
    expect(records['Ana Ferrer']).toBe(90)
  })

  it('dos actualizaciones a la vez no se pisan la mejor nota', async () => {
    const dir = join(tmpdir(), `teuton-records-${randomUUID()}`)
    temporary.push(dir)
    await fs.mkdir(dir, { recursive: true })

    // Sin cola, ambas leen el mismo fichero vacío y la última escritura gana:
    // la clase que terminó antes perdía sus notas.
    await Promise.all([
      updateRecords(dir, { Ana: 80 }, 'clase-a'),
      updateRecords(dir, { Bruno: 60 }, 'clase-b')
    ])

    expect(await getRecords(dir, 'clase-a')).toEqual({ Ana: 80 })
    expect(await getRecords(dir, 'clase-b')).toEqual({ Bruno: 60 })
  })
})
