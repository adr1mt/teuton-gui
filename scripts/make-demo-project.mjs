/**
 * Genera `sandbox/examen-demo/`: un proyecto de Teutón con 15 alumnos inventados para ver
 * el dashboard poblado sin montar máquinas virtuales. Uso:
 *
 *     node scripts/make-demo-project.mjs
 *
 * No usa SSH: cada `target` hace `echo` de un campo del propio caso y lo compara
 * con la respuesta correcta, así que corre en local en milisegundos. Las notas
 * están repartidas a mano (ver ROSTER) para que la pantalla enseñe todos sus
 * estados: sobresalientes, aprobados justos y suspensos.
 *
 * Escribe también la clase DEMO-15 en el classes.json de la app; volver a
 * ejecutarlo la actualiza en vez de duplicarla. `sandbox/` está en .gitignore.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const PROJ = join(REPO, 'sandbox', 'examen-demo')
mkdirSync(PROJ, { recursive: true })

const OK = { p1:'443', p2:'22', p3:'255.255.255.0', p4:'dhcp', p5:'53',
             p6:'10.0.0.0', p7:'ip route', p8:'dns', p9:'127.0.0.1', p10:'21' }
const KO = { p1:'8080', p2:'3389', p3:'255.255.0.0', p4:'arp', p5:'67',
             p6:'172.16.0.0', p7:'ifconfig', p8:'nat', p9:'192.168.0.1', p10:'25' }

// nombre -> nº de aciertos (sobre 10)
const ROSTER = [
  ['Ana Ferrer', 10], ['Marc Oliva', 10], ['Laia Puig', 10], ['Hugo Ramos', 10],
  ['Nerea Cano', 9],  ['Iván Sales', 9],  ['Carla Vidal', 9],
  ['Pau Estruch', 8], ['Sara Moliner', 8],
  ['Dani Bosch', 7],  ['Aitana Ros', 7],
  ['Marc Gisbert', 5],['Elena Prats', 5],
  ['Joel Camps', 3],  ['Nadia Alonso', 1]
]

const slug = (n) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'.')
const KEYS = Object.keys(OK)

const students = ROSTER.map(([name, hits]) => {
  const fields = {}
  KEYS.forEach((k, i) => { fields[k] = i < hits ? OK[k] : KO[k] })
  return { name, moodleId: `${slug(name)}@elpuig.xeill.net`, fields }
})

// --- config.yaml ---
const yaml = ['---', 'global:', '  tt_sequence: false', 'cases:']
for (const s of students) {
  yaml.push(`  - tt_members: ${s.name}`)
  yaml.push(`    tt_moodle_id: ${s.moodleId}`)
  for (const k of KEYS) yaml.push(`    ${k}: "${s.fields[k]}"`)
}
writeFileSync(join(PROJ, 'config.yaml'), yaml.join('\n') + '\n')

// --- start.rb ---
const PREGUNTAS = [
  ['p1', 'Puerto por defecto de HTTPS'],
  ['p2', 'Puerto por defecto de SSH'],
  ['p3', 'Máscara /24 en notación decimal'],
  ['p4', 'Protocolo que reparte IPs automáticamente'],
  ['p5', 'Puerto por defecto de DNS'],
  ['p6', 'Red privada de clase A'],
  ['p7', 'Comando que muestra la tabla de rutas'],
  ['p8', 'Servicio que traduce nombres a IPs'],
  ['p9', 'Dirección de loopback IPv4'],
  ['p10','Puerto de control de FTP']
]
const rb = ['group "Cuestionario de redes (demo local, sin máquinas)" do', '']
PREGUNTAS.forEach(([k, texto], i) => {
  rb.push(`  target "P${i + 1}. ${texto}"`)
  rb.push(`  run "echo '#{get(:${k})}'"`)
  rb.push(`  expect "${OK[k]}"`)
  rb.push('')
})
rb.push('end', '', 'play do', '  show', '  export', 'end', '')
writeFileSync(join(PROJ, 'start.rb'), rb.join('\n'))

// --- clase en userData ---
const CLASSES = join(homedir(), '.config', 'teuton-gui', 'classes.json')
const list = existsSync(CLASSES) ? JSON.parse(readFileSync(CLASSES, 'utf-8')) : []
const now = Date.now()
const idx = list.findIndex((c) => c.name === 'DEMO-15')
const roster = {
  id: idx >= 0 ? list[idx].id : randomUUID(),
  name: 'DEMO-15',
  students,
  createdAt: idx >= 0 ? list[idx].createdAt : now,
  updatedAt: now
}
if (idx >= 0) list[idx] = roster; else list.push(roster)
writeFileSync(CLASSES, JSON.stringify(list, null, 2))

writeFileSync(join(PROJ, '.teuton-gui-meta.json'), JSON.stringify(
  { activeClass: roster.name, activeClassId: roster.id }, null, 2))

console.log('proyecto:', PROJ, '\nclase id:', roster.id, '\nalumnos:', students.length)
