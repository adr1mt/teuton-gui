// Verificación end-to-end del parser y las analíticas contra la salida real de
// teuton. Se ejecuta fuera de Electron (results.ts no depende de electron).
import { loadResults } from '../src/main/results'
import {
  studentRows,
  computeKpis,
  frequentErrors,
  groupSuccess,
  gradeDistribution
} from '../src/renderer/src/lib/analytics'

const dir = process.argv[2]
if (!dir) {
  console.error('Uso: verify-parsing <dir-proyecto>')
  process.exit(1)
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`❌ FALLO: ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`✅ ${msg}`)
  }
}

async function main() {
  const results = await loadResults(dir)
  console.log('--- loadResults ---')
  console.log('testName:', results.testName)
  console.log('outputDir:', results.outputDir)
  console.log('cases:', results.cases.length, 'resumeCases:', results.resume?.cases.length)
  console.log('moodleCsv present:', results.moodleCsv !== null)

  if (results.warnings.length > 0) {
    console.log('--- avisos ---')
    for (const w of results.warnings) console.log('⚠️ ', w)
  }

  assert(results.resume !== null, 'resume.json parseado')
  assert(results.cases.length > 0, 'al menos un case-NN.json parseado')
  assert(results.moodleCsv !== null, 'moodle.csv leído')

  const rows = studentRows(results)
  assert(rows.length === (results.resume?.cases.length ?? 0), 'filas de alumno = casos del resumen')
  const first = rows[0]
  console.log('--- primera fila ---', JSON.stringify(first, (k, v) => (k === 'caseReport' ? '[…]' : v)))
  assert(first.total === first.passed + first.failed, 'passed + failed = total')
  assert(first.grade >= 0 && first.grade <= 100, 'nota en rango 0-100')

  const kpis = computeKpis(rows, 70)
  console.log('--- KPIs ---', kpis)
  assert(kpis.count === rows.length, 'KPIs count coherente')

  const errors = frequentErrors(results)
  console.log('--- errores frecuentes ---', errors.map((e) => `${e.description} (${e.fails}/${e.total})`))
  assert(
    errors.every((e) => e.fails > 0 && e.fails <= e.total),
    'errores frecuentes con conteos válidos'
  )

  const groups = groupSuccess(results)
  console.log('--- éxito por grupo ---', groups.map((g) => `${g.group}: ${g.rate}%`))
  assert(groups.every((g) => g.rate >= 0 && g.rate <= 100), 'tasas de grupo en rango')

  const dist = gradeDistribution(rows)
  const distTotal = dist.reduce((a, b) => a + b.count, 0)
  assert(distTotal === rows.length, 'distribución suma el total de alumnos')

  console.log('\n✔ Verificación completada')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
