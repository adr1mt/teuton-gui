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

import {
  deleteClass, getProjectMeta, getRecords, listClasses, listRecordBackups, resetRecords, restoreRecordBackup,
  saveClass, setProjectMeta, updateRecords
} from '../src/main/store'
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

describe('las clases guardadas no pueden desaparecer', () => {
  const roster = (id: string, name: string) => ({
    id,
    name,
    students: [{ name: 'Ana Ferrer' }],
    createdAt: 0,
    updatedAt: 0
  })

  it('un classes.json sin permisos de lectura da error, no una lista vacía', async () => {
    runtime.userData = join(tmpdir(), `teuton-classes-${randomUUID()}`)
    temporary.push(runtime.userData)
    await fs.mkdir(runtime.userData, { recursive: true })
    await saveClass(roster('c1', 'SMX2A'))
    const file = join(runtime.userData, 'classes.json')
    const original = await fs.readFile(file, 'utf-8')
    await fs.chmod(file, 0o000)

    try {
      // Devolver [] aquí era pérdida total: parecía «no hay clases» y el
      // siguiente guardado reescribía el fichero sin los grupos anteriores.
      await expect(listClasses()).rejects.toThrow(/No se pudo leer/)
      await expect(saveClass(roster('c2', 'SMX2B'))).rejects.toThrow(/No se pudo leer/)
      await expect(deleteClass('c1')).rejects.toThrow(/No se pudo leer/)
    } finally {
      await fs.chmod(file, 0o600)
    }

    expect(await fs.readFile(file, 'utf-8')).toBe(original)
    expect((await listClasses()).map((c) => c.name)).toEqual(['SMX2A'])
  })

  it('aguanta una clase de 300 alumnos y dos guardados a la vez', async () => {
    runtime.userData = join(tmpdir(), `teuton-classes-${randomUUID()}`)
    temporary.push(runtime.userData)
    await fs.mkdir(runtime.userData, { recursive: true })
    const big = {
      ...roster('grande', 'SMX-300'),
      students: Array.from({ length: 300 }, (_, i) => ({ name: `Alumno ${i + 1}` }))
    }

    await Promise.all([saveClass(big), saveClass(roster('otra', 'SMX2C'))])

    const list = await listClasses()
    expect(list.map((c) => c.id).sort()).toEqual(['grande', 'otra'])
    expect(list.find((c) => c.id === 'grande')!.students).toHaveLength(300)
  })
})

describe('restaurar notas de una copia (S-08, S-09)', () => {
  async function project(): Promise<string> {
    runtime.userData = await fs.mkdtemp(join(tmpdir(), 'teuton-userdata-'))
    const dir = await fs.mkdtemp(join(tmpdir(), 'teuton-restore-'))
    temporary.push(dir, runtime.userData)
    return dir
  }

  // G16: la copia de la hora tiene a las dos clases. Restaurar para A no puede
  // devolver a B las notas de práctica que el profesor acaba de borrar.
  it('restaurar para una clase no resucita las notas reiniciadas de otra', async () => {
    const dir = await project()
    await updateRecords(dir, { Ana: 90 }, 'clase-a')
    await updateRecords(dir, { Pau: 80 }, 'clase-b')
    await resetRecords(dir, 'clase-b')
    const [copia] = await listRecordBackups(dir)

    const outcome = await restoreRecordBackup(dir, copia.id, 'clase-a')

    expect(outcome.data).toEqual({ Ana: 90 })
    expect(await getRecords(dir, 'clase-b')).toEqual({})
    expect(await getRecords(dir, 'clase-a')).toEqual({ Ana: 90 })
  })

  // G17: un historial que no se puede LEER (no dañado) tiene notas más nuevas
  // que la copia; sustituirlo baja notas y encima dice «Notas restauradas».
  it('con el historial sin permisos de lectura no restaura y lo dice', async () => {
    const dir = await project()
    await updateRecords(dir, { Eva: 40 }, 'clase-a')
    const [copia] = await listRecordBackups(dir)
    const file = join(dir, '.teuton-gui-records.json')
    await fs.writeFile(file, JSON.stringify({ version: 2, classes: { 'class:clase-a': { Eva: 95 } } }))
    await fs.chmod(file, 0o000)
    try {
      await expect(restoreRecordBackup(dir, copia.id, 'clase-a')).rejects.toThrow(/leer el historial/)
    } finally {
      await fs.chmod(file, 0o600)
    }
    expect(await getRecords(dir, 'clase-a')).toEqual({ Eva: 95 })
  })

  it('con el historial dañado sí restaura la copia', async () => {
    const dir = await project()
    await updateRecords(dir, { Eva: 40 }, 'clase-a')
    const [copia] = await listRecordBackups(dir)
    await fs.writeFile(join(dir, '.teuton-gui-records.json'), '{"version": 2, "classes": {')

    const outcome = await restoreRecordBackup(dir, copia.id, 'clase-a')

    expect(outcome).toMatchObject({ data: { Eva: 40 }, persisted: true })
  })
})

