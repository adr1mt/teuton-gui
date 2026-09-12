#!/usr/bin/env node
/**
 * Teutón falso para la UAT hostil. Imita lo justo del CLI real — `version`,
 * `check` y `run --export=json` — y añade modos de fallo que con máquinas de
 * verdad no se pueden provocar a voluntad.
 *
 * No existe para sustituir a `teuton` en el uso normal: existe para poder
 * romper la app a propósito sin 30 máquinas ni un aula.
 *
 * Uso:
 *   FAKE_TEUTON_MODE=hang node scripts/fake-teuton.mjs run --export=json .
 *
 * Modos (variable FAKE_TEUTON_MODE):
 *   ok         (por defecto) ejecución normal
 *   slow       un símbolo cada 300 ms, para cancelar a media ejecución
 *   hang       imprime el arranque y NO termina nunca (ssh colgado)
 *   crash      termina con código 1 a mitad, sin escribir resume.json
 *   noresume   escribe los case-NN.json pero ningún resume.json
 *   truncate   deja un case-NN.json con JSON válido + la cola de otro proceso
 *   huge       escupe 40 MB por stdout (revienta el maxBuffer de execFile)
 *   notargets  `check` sin fila Targets (la barra de progreso se queda sin total)
 *   badgrades  notas negativas, no finitas y por encima de 100 en resume.json
 *
 * FAKE_TEUTON_VERSION cambia la versión que anuncia; vacía = no imprime versión
 * (para probar el rechazo de un binario que no es Teutón).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Deja constancia de que este proceso existe, para que la UAT pueda comprobar
 * que no quedan huérfanos tras cerrar la app. Con `pgrep -f` no basta: el patrón
 * se cruza con la propia línea de órdenes de quien busca.
 */
const pidDir = process.env.FAKE_TEUTON_PIDDIR
const pidFile = pidDir ? join(pidDir, `fake-teuton-${process.pid}.pid`) : null
if (pidFile) {
  mkdirSync(pidDir, { recursive: true })
  writeFileSync(pidFile, String(process.pid))
  const clean = () => {
    try {
      rmSync(pidFile, { force: true })
    } catch {
      /* al morir por señal puede no llegar a limpiarse: la UAT comprueba el pid */
    }
  }
  process.on('exit', clean)
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => {
      clean()
      process.exit(1)
    })
  }
}

const args = process.argv.slice(2)
const mode = process.env.FAKE_TEUTON_MODE || 'ok'
const command = args[0]
const cwd = process.cwd()
const testName = basename(cwd)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Alumnos del config.yaml, leídos con un parseo mínimo (sin dependencias). */
function readCases() {
  const file = ['config.yaml', 'config.yml'].map((n) => join(cwd, n)).find((p) => existsSync(p))
  if (!file) return []
  const cases = []
  let inCases = false
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (/^:?cases:/.test(line)) {
      inCases = true
      continue
    }
    if (/^[^\s#-]/.test(line)) inCases = false
    if (!inCases) continue
    const member = line.match(/^\s*-?\s*:?tt_members:\s*(.*)$/)
    if (member) {
      cases.push({ members: member[1].trim().replace(/^['"]|['"]$/g, ''), moodleId: '' })
      continue
    }
    const moodle = line.match(/^\s*:?tt_moodle_id:\s*(.*)$/)
    if (moodle && cases.length > 0) {
      cases[cases.length - 1].moodleId = moodle[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return cases
}

const TARGETS_PER_CASE = 4

function caseReport(entry, index, grade) {
  const passed = Math.round((grade / 100) * TARGETS_PER_CASE)
  return {
    config: { tt_testname: testName, tt_members: entry.members, tt_moodle_id: entry.moodleId, tt_skip: false },
    logs: [],
    groups: [
      {
        title: 'Comprobaciones simuladas',
        targets: Array.from({ length: TARGETS_PER_CASE }, (_, t) => ({
          target_id: String(t + 1).padStart(2, '0'),
          check: t < passed,
          score: t < passed ? 1 : 0,
          weight: 1,
          description: `Comprobación ${t + 1}`,
          conn_type: 'local',
          duration: 0.01,
          command: `echo comprobacion-${t + 1}`,
          output: t < passed ? 'ok' : 'mal',
          expected: 'ok',
          result: t < passed ? 1 : 0
        }))
      }
    ],
    results: { grade, case_id: String(index + 1).padStart(2, '0') }
  }
}

/** Nota simulada estable por alumno, para que dos pasadas no bailen. */
function gradeFor(entry, index) {
  if (mode === 'badgrades') return [-25, Number.POSITIVE_INFINITY, 150, 0][index % 4]
  const scale = [100, 75, 50, 100, 25, 0]
  return scale[index % scale.length]
}

async function main() {
  if (command === 'version') {
    const version = process.env.FAKE_TEUTON_VERSION ?? '2.10.6'
    process.stdout.write(version ? `teuton version ${version}\n` : 'no soy teuton\n')
    return 0
  }

  if (command === 'check') {
    const cases = readCases()
    process.stdout.write('DSL Stats\n+--------------+-------+\n')
    if (mode !== 'notargets') {
      process.stdout.write(`| Targets      | ${TARGETS_PER_CASE}     |\n`)
    }
    process.stdout.write(`| Cases        | ${cases.length}     |\n+--------------+-------+\n`)
    return 0
  }

  if (command !== 'run') {
    process.stderr.write(`fake-teuton: subcomando no soportado: ${command}\n`)
    return 2
  }

  if (mode === 'huge') {
    // 40 MB de una sola vez: por encima del maxBuffer de 32 MB de execFile.
    const chunk = 'x'.repeat(1024 * 1024)
    for (let i = 0; i < 40; i++) process.stdout.write(chunk)
    return 0
  }

  const selected = (args.find((a) => a.startsWith('--case=')) || '').replace('--case=', '')
  const only = selected ? selected.split(',').map((n) => parseInt(n, 10)) : null
  const all = readCases()
  const chosen = only ? all.filter((_, i) => only.includes(i + 1)) : all

  process.stdout.write(`Started at ${new Date().toISOString()}\n`)

  if (mode === 'hang') {
    // Nunca termina: es el `ssh` a una máquina apagada que no devuelve el control.
    // Hace falta un temporizador vivo: con solo una promesa pendiente, Node se
    // queda sin nada que hacer y sale con código 0, que es lo contrario de colgarse.
    process.stdout.write('.')
    const keepAlive = setInterval(() => undefined, 1000)
    await new Promise(() => keepAlive)
  }

  const outDir = join(cwd, 'var', testName)
  mkdirSync(outDir, { recursive: true })

  const resumeCases = []
  for (const [index, entry] of chosen.entries()) {
    const globalIndex = only ? only[index] - 1 : index
    const grade = gradeFor(entry, globalIndex)
    const passed = Math.round((Math.max(0, Math.min(100, grade)) / 100) * TARGETS_PER_CASE)
    for (let t = 0; t < TARGETS_PER_CASE; t++) {
      process.stdout.write(t < passed ? '.' : 'F')
      if (mode === 'slow') await sleep(300)
    }
    const id = String(globalIndex + 1).padStart(2, '0')
    const body = JSON.stringify(caseReport(entry, globalIndex, grade))
    // JSON válido seguido de la cola de otro proceso: es lo que queda cuando dos
    // `teuton run` escriben el mismo fichero y uno es más corto que el otro.
    const content = mode === 'truncate' && index === 0 ? `${body}${'"basura":true}]}'.repeat(3)}` : body
    writeFileSync(join(outDir, `case-${id}.json`), content)
    resumeCases.push({
      skip: false,
      id,
      letter: grade >= 100 ? '✔' : '',
      grade,
      members: entry.members,
      conn_status: {},
      moodle_id: entry.moodleId || 'NODATA',
      moodle_feedback: `"Filename: case-${id}."`
    })

    if (mode === 'crash' && index === Math.floor(chosen.length / 2)) {
      process.stderr.write('fake-teuton: fallo simulado a mitad de la ejecución\n')
      return 1
    }
  }

  process.stdout.write(`\nFinished in 1.23 seconds\n`)

  if (mode === 'noresume') return 0

  writeFileSync(
    join(outDir, 'resume.json'),
    JSON.stringify({
      config: { tt_testname: testName, tt_title: 'fake-teuton' },
      cases: resumeCases,
      results: {}
    })
  )
  writeFileSync(
    join(outDir, 'moodle.csv'),
    ['MoodleID, TeutonGrade, TeutonFeedback']
      .concat(resumeCases.map((c) => `${c.moodle_id},${c.grade},"case-${c.id}"`))
      .join('\n') + '\n'
  )
  return 0
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`fake-teuton: ${error.message}\n`)
    process.exit(3)
  }
)
