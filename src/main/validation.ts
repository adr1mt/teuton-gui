import { isAbsolute, resolve } from 'node:path'
import type {
  ClassRoster,
  DefaultGlobals,
  GradeRecords,
  GradingSettings,
  ProjectMeta
} from '../shared/types'
import { findDuplicateStudentIdentities } from '../shared/identity'

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} no es válido.`)
  }
  return value as Record<string, unknown>
}

export function validatedText(value: unknown, label: string, max = 256, allowEmpty = false): string {
  if (typeof value !== 'string' || value.includes('\0') || value.length > max || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} no es válido.`)
  }
  return value
}

export function validatedPath(value: unknown, label = 'La ruta'): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0') || value.length > 4096) {
    throw new Error(`${label} no es válida.`)
  }
  return resolve(value)
}

export function validatedOptionalId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return validatedText(value, label, 128)
}

export function validatedGrading(value: unknown): GradingSettings {
  const input = plainObject(value, 'La escala de notas')
  const passScore = input.passScore
  const maxGrade = input.maxGrade
  if (!Number.isInteger(passScore) || (passScore as number) < 1 || (passScore as number) > 99) {
    throw new Error('Los puntos de aprobado deben ser un entero entre 1 y 99.')
  }
  if (typeof maxGrade !== 'number' || !Number.isFinite(maxGrade) || maxGrade <= 0 || maxGrade > 100) {
    throw new Error('La nota máxima debe ser un número mayor que 0 y no superior a 100.')
  }
  return { passScore: passScore as number, maxGrade }
}

export function validatedGlobals(value: unknown): DefaultGlobals {
  const input = plainObject(value, 'Las credenciales por defecto')
  if (Object.keys(input).length > 100) throw new Error('Hay demasiados campos globales.')
  const result: DefaultGlobals = {}
  for (const [key, raw] of Object.entries(input)) {
    const safeKey = validatedText(key, 'El nombre del campo', 128)
    result[safeKey] = validatedText(raw, `El valor de ${safeKey}`, 10_000, true)
  }
  return result
}

export function validatedRoster(value: unknown): ClassRoster {
  const input = plainObject(value, 'La clase')
  const studentsRaw = input.students
  if (!Array.isArray(studentsRaw) || studentsRaw.length > 1000) {
    throw new Error('La lista de alumnos no es válida o es demasiado grande.')
  }
  const students = studentsRaw.map((raw, index) => {
    const student = plainObject(raw, `El alumno ${index + 1}`)
    const fieldsRaw = student.fields
    let fields: Record<string, string> | undefined
    if (fieldsRaw !== undefined) {
      const source = plainObject(fieldsRaw, `Los campos del alumno ${index + 1}`)
      if (Object.keys(source).length > 100) throw new Error(`El alumno ${index + 1} tiene demasiados campos.`)
      fields = {}
      for (const [key, rawValue] of Object.entries(source)) {
        fields[validatedText(key, 'El nombre del campo', 128)] = validatedText(rawValue, 'El valor del campo', 10_000, true)
      }
    }
    return {
      name: validatedText(student.name, `El nombre del alumno ${index + 1}`, 256).trim(),
      moodleId:
        student.moodleId === undefined || student.moodleId === ''
          ? undefined
          : validatedText(student.moodleId, `El ID de Moodle del alumno ${index + 1}`, 256).trim(),
      fields
    }
  })
  const repeated = findDuplicateStudentIdentities(students)
  if (repeated.names[0]) throw new Error(`El alumno «${repeated.names[0]}» está repetido.`)
  if (repeated.moodleIds[0]) throw new Error(`El ID de Moodle «${repeated.moodleIds[0]}» está repetido.`)
  const roster: ClassRoster = {
    id: validatedText(input.id, 'El identificador de la clase', 128),
    name: validatedText(input.name, 'El nombre de la clase', 128).trim(),
    students,
    createdAt: typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : 0,
    updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : 0
  }
  return roster
}

export function validatedRecords(value: unknown): GradeRecords {
  const input = plainObject(value, 'Las notas')
  if (Object.keys(input).length > 2000) throw new Error('Hay demasiadas notas para guardar.')
  const result: GradeRecords = {}
  for (const [name, grade] of Object.entries(input)) {
    const safeName = validatedText(name, 'El nombre del alumno', 256)
    if (typeof grade !== 'number' || !Number.isFinite(grade) || grade < 0 || grade > 100) {
      throw new Error(`La nota de «${safeName}» no es válida.`)
    }
    result[safeName] = grade
  }
  return result
}

export function validatedMeta(value: unknown): ProjectMeta {
  const input = plainObject(value, 'Los metadatos del proyecto')
  const optionalText = (raw: unknown, label: string): string | null | undefined => {
    if (raw === undefined) return undefined
    if (raw === null) return null
    return validatedText(raw, label, 128)
  }
  const result: ProjectMeta = {}
  if (Object.hasOwn(input, 'activeClassId')) {
    result.activeClassId = optionalText(input.activeClassId, 'El identificador de la clase') ?? undefined
  }
  if (Object.hasOwn(input, 'activeClass')) {
    result.activeClass = optionalText(input.activeClass, 'El nombre de la clase') ?? undefined
  }
  if (Object.hasOwn(input, 'lastRunClassId')) {
    result.lastRunClassId = optionalText(input.lastRunClassId, 'El identificador de la última clase')
  }
  if (Object.hasOwn(input, 'lastRunClassName')) {
    result.lastRunClassName = optionalText(input.lastRunClassName, 'El nombre de la última clase')
  }
  return result
}
