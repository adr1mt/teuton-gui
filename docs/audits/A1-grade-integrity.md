# A1 — Grade Integrity

Pregunta: ¿puede Teutón GUI mostrar, guardar, restaurar o exportar una nota que
no corresponda fielmente con el resultado válido producido por Teutón?

**Respuesta: sí.** Hay dos caminos críticos demostrados con el Teutón real
(2.10.6) y varios de severidad alta.

## Método

- Lectura del flujo completo: `main/teuton.ts` → `main/ipc.ts` (runStart) →
  `lib/run.ts` (`handleRunEvent`, `loadAfterExit`, `reloadLatestResults`) →
  `main/results.ts` → `lib/analytics.ts` / `lib/integrity.ts` →
  `main/store.ts` (records, backups, CSV) → `lib/moodleCsv.ts` → `Dashboard.tsx`.
- Lectura del código de Teutón 2.10.6 instalado
  (`~/.local/share/gem/ruby/3.2.0/gems/teuton-2.10.6`):
  `case_manager/check_cases.rb`, `case_manager/report.rb`,
  `case_manager/export_manager.rb`, `case/case.rb`.
- Pruebas reales con `teuton run --export=json` sobre un proyecto local
  desechable (en el scratchpad, fuera del repo) y un script desechable que
  empaqueta con esbuild `loadResults`, `studentRows`, `computeKpis`,
  `studentsNeedingAttention`, `gradeRecordsFromResults` y `buildMoodleCsv` y los
  aplica a los informes reales. No se ha tocado código de producción.

Hechos de Teutón 2.10.6 que condicionan todo lo demás:

1. **Nunca borra `var/<test>/`.** `ensure_dir` solo lo crea.
2. **Escribe los `case-NN.json` en hilos y `resume.json` al final**
   (`ExportManager#call`, pasos 2 y 3). Un corte entre ambos deja casos nuevos
   con resumen antiguo.
3. **Con `--case=N` el `resume.json` contiene TODAS las filas**: las no
   seleccionadas salen como `{skip: true, id: "-", members: "-", grade: 0.0}`, y
   sus `case-NN.json` no se reescriben. Verificado:
   `[('-', '-', 0.0, True), ('02', 'Luis', 100.0, False), ('-', '-', 0.0, True)]`.
4. **Un `start.rb` con error de sintaxis sale con código 1 sin tocar
   `var/`**, y **un `start.rb` sin bloque `play` sale con código 0 sin
   tocar `var/`** (verificado por `mtime`).
5. Un `config.yaml` sin casos sale con código 0 y escribe un `resume.json`
   nuevo con `cases: []`, sin tocar los `case-NN.json` anteriores.

---

## Findings

### A1-01 — Reevaluar a un alumno reescribe el CSV de Moodle de la clase con un solo alumno

- **Severity:** Critical
- **File:line:** `src/renderer/src/lib/run.ts:442-451`, `src/renderer/src/lib/moodleCsv.ts:27-29`,
  `src/renderer/src/lib/analytics.ts:42-57`, `src/main/results.ts:231-237`,
  `scripts/fake-teuton.mjs:162-165`
- **Scenario:** examen de 15 alumnos. Al final, el profesor pulsa «Reevaluar» en
  un alumno (o elige casos sueltos en Ejecutar) y cierra.
- **Execution path:** `reevaluateStudent` → `startRun({cases:[idx]})` →
  `teuton run --case=idx` → resume con 14 filas `id "-"` y una real →
  `loadResults` conserva solo `case-idx.json` (el filtro por ids admite `"-"`) →
  `loadAfterExit` → `validateResultIdentity` filtra las filas `"-"` y no ve
  problemas → `buildMoodleCsv` omite las filas `"-"` → `writeClassCsv`
  sobrescribe `informes/moodle-<clase>-<id8>.csv`.
- **Current behavior:** comprobado con Teutón real. El CSV queda con cabecera y
  **una** fila. En pantalla aparecen además 14 filas llamadas «-» con nota 0:
  `computeKpis` da media 33 y aprobados 33 % para una clase de tres alumnos
  con 100, y `studentsNeedingAttention` lista las dos filas «-».
- **Risk:** el profesor sube a Moodle el CSV automático tras la última
  reevaluación y 14 alumnos quedan sin nota importada, sin ningún aviso. Los
  KPI y la lista «Requieren atención» proyectados son falsos.
- **Expected safe behavior:** una pasada parcial no reescribe el CSV de la
  clase, o lo reescribe con todos los alumnos del récord. Las filas `skip`
  no cuentan como alumnos en la vista.
- **Existing coverage:** ninguna. `scripts/fake-teuton.mjs` con `--case` emite
  solo el caso elegido, no las filas `skip` del Teutón real, así que la
  escena 6 de la UAT nunca ve este formato. `moodleCsv.test.ts` sí cubre que
  se omiten las filas «-».
- **Regression test:** (1) `fake-teuton` imita el formato real con `--case`;
  (2) unit: `loadResults` sobre un `resume.json` real de `--case=2` → `studentRows`
  no devuelve filas «-» y los KPI cuentan 1 alumno; (3) e2e: ejecutar la clase,
  reevaluar a un alumno y comprobar que el CSV automático sigue teniendo todas
  las filas.
- **Fix concept:** en `studentRows` descartar las filas `skip`. En
  `loadAfterExit` no escribir el CSV automático cuando la ejecución llevaba
  `options.cases` (o construirlo desde el récord completo de la clase).

### A1-02 — Una ejecución que no escribe informes se trata como nueva: notas de otra ejecución (incluso de otra clase) entran en el historial y en el CSV

- **Severity:** Critical
- **File:line:** `src/renderer/src/lib/run.ts:379-391`, `src/renderer/src/lib/run.ts:395-451`,
  `src/main/results.ts:206-276`
- **Scenario (a):** el profesor pasó el examen al grupo A. Importa el grupo B
  (con un alumno que se llama igual que uno de A, p. ej. «Ana») y toca
  `start.rb` dejando un error de sintaxis, o borra el bloque `play`. Pulsa
  Ejecutar o está en modo examen.
- **Scenario (b):** Teutón muere (SIGKILL, OOM, disco lleno) después de escribir
  algunos `case-NN.json` y antes del `resume.json`.
- **Execution path:** `child.on('close', code)` → `handleRunEvent('exit')` →
  `loadAfterExit(code, …)` se ejecuta **con cualquier código**, incluido 1 o
  `null` → `loadResults` lee lo que haya en `var/<test>/` sin comprobar que sea
  posterior al arranque → `setProjectMeta({lastRunClassId: B})` →
  `updateRecords(grades de A, classId B)` → `writeClassCsv(B, CSV con alumnos
  e IDs de Moodle de A)`.
- **Current behavior:** verificado con Teutón real: código 1 (sintaxis) y código
  0 (sin `play`) dejan `resume.json` con el `mtime` anterior, y la sonda carga
  a Ana, Luis y Eva (grupo A) con 100. `validateResultIdentity` no encuentra
  nada raro (los IDs de Moodle existen), así que se escribe
  `moodle-B-<id8>.csv` con los alumnos de A, y el historial de B recibe
  `{Ana: 100, Luis: 100, Eva: 100}`. La Ana de B tiene desde ese momento un
  100 como nota mínima en todos sus CSV. En el caso (b) la lista (resumen
  antiguo) y la matriz (casos nuevos) enseñan notas distintas del mismo
  alumno. La única pista en el caso (a) es el aviso de resultados obsoletos del
  panel, y con código 0 ni siquiera se ve «Error en la ejecución».
- **Risk:** nota incorrecta y silenciosa en Moodle para un alumno que comparte
  nombre con otro grupo; CSV de un grupo con los alumnos de otro; en modo
  examen, cada ciclo vuelve a meter los datos viejos.
- **Expected safe behavior:** solo se procesan informes de esta ejecución: exit
  0 **y** `resume.json` con `mtime` posterior al arranque (y cada caso usado
  también). Si no, error visible y ni récords ni CSV.
- **Existing coverage:** `ejecucion.spec.ts` «una ejecución que falla a mitad»
  solo comprueba el texto «Error en la ejecución» sobre un proyecto sin informes
  previos. Nada comprueba récords ni CSV tras un fallo.
- **Regression test:** e2e con `fake-teuton`: correr grupo A en modo `ok`,
  importar B, correr en modo `crash` y en un nuevo modo `noreports` (exit 0 sin
  escribir) → el historial de B y `informes/` no cambian y se ve un error.
  Unit: `loadResults` devuelve la fecha y la sonda de frescura rechaza un
  `resume.json` anterior al arranque.
- **Fix concept:** pasar la hora de arranque al `exit`; en `loadAfterExit`
  procesar récords/CSV solo si `code === 0` y `generatedAt >= startedAt`; en
  `loadResults` descartar (con aviso) los `case-NN.json` con `mtime` anterior al
  `resume.json` de esa misma pasada.

### A1-03 — Un `resume.json` sin casos resucita los `case-NN.json` antiguos como alumnos actuales

- **Severity:** High
- **File:line:** `src/main/results.ts:231`, `src/renderer/src/lib/analytics.ts:60-71`,
  `src/renderer/src/lib/run.ts:424-435`
- **Scenario:** el profesor vacía la tabla de alumnos (para importar otra clase)
  y se lanza una pasada (clic o ciclo del modo examen) con cero casos.
- **Execution path:** Teutón escribe `resume.json` con `cases: []` → el filtro
  `if (resume && resume.cases.length > 0)` no se aplica → se cargan todos los
  `case-NN.json` viejos → `studentRows` usa la rama sin resumen → filas con los
  alumnos anteriores → `gradeRecordsFromResults` → `updateRecords` en la clase
  activa.
- **Current behavior:** verificado con Teutón real: la sonda devuelve Ana, Luis y
  Eva con 100 y `gradeRecordsFromResults` produce `{Ana: 100, Luis: 100, Eva:
  100}`. No se escribe CSV (hay una guarda por `resume.cases.length`), pero el
  historial sí se contamina. El panel muestra el aviso de resultados obsoletos.
- **Risk:** notas de otro grupo guardadas como mejor nota del grupo activo.
- **Expected safe behavior:** un `resume.json` válido con cero casos significa
  «cero alumnos», no «sin filtro».
- **Existing coverage:** `results.test.ts` «descarta los case-NN.json
  huérfanos» solo cubre un resumen con casos.
- **Regression test:** unit: `resume.json` con `cases: []` y tres
  `case-NN.json` → `loadResults(...).cases` vacío.
- **Fix concept:** aplicar el filtro siempre que exista `resume`; la rama sin
  resumen solo cuando `resume.json` no existe.

### A1-04 — Con `tt_testname` o `tt_outdir` propios, cada ciclo lee un directorio antiguo

- **Severity:** High
- **File:line:** `src/main/teuton.ts:590`, `src/main/results.ts:100-103`,
  `src/renderer/src/lib/run.ts:408`
- **Scenario:** el proyecto tiene `var/<carpeta>/` de pasadas antiguas y el
  profesor añade `tt_testname: examen2` en `global` (o `tt_outdir`). Teutón
  escribe en `var/examen2/` (`check_cases.rb`: `tt_outdir || var/tt_testname`).
- **Execution path:** `spawnRun` devuelve `testName = basename(dir)` →
  `exit.testName` → `loadResults(dir, basename(dir))` → `findOutputDir` usa
  `var/<carpeta>` porque existe, sin mirar si es el más reciente.
- **Current behavior:** cada ciclo enseña, guarda y exporta los resultados
  antiguos. Con `tt_outdir` fuera de `var/`, el panel queda vacío (visible).
- **Risk:** panel congelado que parece funcionar; récords y CSV de una pasada
  vieja (de otra clase, si la hubo).
- **Expected safe behavior:** leer el directorio que Teutón usó de verdad o, al
  menos, rechazar un `resume.json` anterior al arranque (misma guarda que
  A1-02).
- **Existing coverage:** `results.test.ts` «sin testName elige el más reciente»
  cubre solo la llamada sin `testName`.
- **Regression test:** unit: `var/proj/resume.json` antiguo y `var/examen2/`
  reciente → `loadResults(dir, 'proj')` no devuelve el antiguo sin aviso.
- **Fix concept:** calcular el directorio de salida desde `tt_outdir` /
  `tt_testname` del config guardado, o elegir siempre el más reciente y
  compararlo con la hora de arranque.

### A1-05 — Si el historial no se puede leer, el CSV automático se reescribe con las notas de la última pasada

- **Severity:** High
- **File:line:** `src/main/store.ts:441-451`, `src/renderer/src/lib/run.ts:435-451`
- **Scenario:** `.teuton-gui-records.json` sin permiso de lectura o dañado a
  mitad de examen. Un alumno que tenía un 100 ha apagado su máquina.
- **Execution path:** `updateRecords` falla al leer → devuelve
  `{data: safeGrades (solo esta pasada), persisted: false}` → `loadAfterExit`
  usa `rec = outcome.data` → `buildMoodleCsv(res, rec)` → `writeClassCsv`.
- **Current behavior:** se muestra el aviso «No se pudo leer el historial…»,
  pero el CSV bueno (con mejores notas) se sustituye por uno con el 0 de la
  última pasada. El aviso no menciona el CSV.
- **Risk:** CSV de Moodle con notas más bajas que las reales.
- **Expected safe behavior:** sin historial legible no se reescribe el CSV.
- **Existing coverage:** `store.test.ts` «no reescribe el historial si no se
  puede leer» cubre el fichero de récords, no el CSV.
- **Regression test:** unit sobre `loadAfterExit` (con `window.teuton`
  simulado): `updateRecords` → `persisted:false` → `writeClassCsv` no se llama.
- **Fix concept:** en `loadAfterExit`, escribir el CSV solo si
  `outcome.persisted`.

### A1-06 — Una nota ausente o no numérica en `resume.json` se muestra, guarda y exporta como 0

- **Severity:** Medium
- **File:line:** `src/main/results.ts:123-126`, `src/main/results.ts:192`
- **Scenario:** `resume.json` con `"grade": null`, `"grade": "N/A"` o sin campo
  (versión distinta de Teutón, escritura parcial recuperada).
- **Execution path:** `num(line.grade)` → fallback 0 → `studentRows` →
  `gradeRecordsFromResults` → `updateRecords` → CSV `0.00`.
- **Current behavior:** 0 legítimo en todas partes, sin aviso. El historial lo
  limita con `Math.max`, pero un alumno sin récord previo exporta 0.
- **Risk:** error de datos convertido en suspenso.
- **Expected safe behavior:** nota no numérica = incidencia visible; el
  alumno sale con «?» y queda fuera de récords y CSV.
- **Existing coverage:** `results.test.ts` «una nota imposible llega tal cual»
  cubre números fuera de rango, no ausentes ni texto.
- **Regression test:** unit: `grade: "N/A"` y sin `grade` → aviso en
  `warnings` y alumno excluido de `gradeRecordsFromResults`.
- **Fix concept:** `num` sin fallback para `grade`; registrar la incidencia.

### A1-07 — Un alumno cuya máquina nunca respondió se exporta con un 0 normal

- **Severity:** Medium
- **File:line:** `src/renderer/src/lib/moodleCsv.ts:27-33`,
  `src/renderer/src/lib/integrity.ts:43-75`
- **Scenario:** un alumno con el equipo apagado todo el examen (o un fallo de
  red del aula).
- **Execution path:** Teutón da 0 y `conn_status` con error → `studentRows`
  guarda `connErrors > 0` → `buildMoodleCsv` no lo mira → `0.00` con el
  comentario «Mejor nota: 0 pts».
- **Current behavior:** la matriz lo pinta como «sin conexión», pero el CSV
  automático y el manual lo exportan igual que un suspenso real.
- **Risk:** un fallo de infraestructura acaba como calificación en Moodle.
- **Expected safe behavior:** alumno sin conexión y sin récord previo = fuera
  del CSV (o marcado en el comentario) y aviso antes de exportar.
- **Existing coverage:** `maquina-apagada.spec.ts` solo cubre la matriz.
- **Regression test:** unit: `buildMoodleCsv` con un alumno `connErrors > 0` y
  sin récord → no sale con `0.00` sin marca.
- **Fix concept:** en `validateResultIdentity` (o en la exportación) añadir la
  incidencia «sin conexión y sin nota previa».

### A1-08 — «Cargar últimos resultados» puede atribuir la pasada a la clase anterior

- **Severity:** Medium
- **File:line:** `src/renderer/src/lib/run.ts:408-422`, `src/renderer/src/lib/run.ts:219-235`
- **Scenario:** la pasada del grupo B termina, pero `loadResults` o
  `setProjectMeta` fallan en `loadAfterExit` (error transitorio de disco).
  `lastRunClassId` sigue apuntando a A. Después el profesor pulsa «Cargar
  últimos resultados».
- **Execution path:** `reloadLatestResults` → `meta.lastRunClassId = A` →
  `updateRecords(resultados de B, A)`.
- **Current behavior:** la primera vez se ve un error; la recarga posterior
  mete las notas de B en el historial de A sin aviso (el panel marca el
  desajuste de clase, pero los récords ya están escritos).
- **Risk:** contaminación entre clases con nombres coincidentes.
- **Expected safe behavior:** la clase de una pasada se registra antes de
  lanzarla (o junto a los informes), no después de leerlos.
- **Existing coverage:** ninguna.
- **Regression test:** unit: `setProjectMeta` falla en `loadAfterExit` →
  `reloadLatestResults` no escribe récords de otra clase.
- **Fix concept:** escribir `lastRunClassId` (con la hora de arranque) antes de
  `spawnRun` y marcarlo como «pendiente» hasta que la carga termine.

---

## Riesgos descartados

- **Eventos de un proceso cancelado:** `handleRunEvent` descarta por `runId`
  (`run.ts:368`).
- **Cambio de clase o proyecto durante la pasada:** `loadAfterExit` usa el
  contexto congelado y solo pinta si coincide (`run.ts:402-416`).
- **`case-NN.json` huérfanos de una clase con más alumnos:** filtrados por los
  ids de `resume.json` (`results.ts:231-237`) cuando hay casos.
- **Nombres duplicados o que solo difieren en espacios:** bloquean récords
  (`integrity.ts:84-95`) y se fusionan por máximo (`store.ts:363-370`).
- **Mezcla entre clases en el historial:** ámbitos `class:<id>` / `manual`, el
  formato v1 solo alimenta `manual` (`store.ts:423-426`).
- **Exportación manual con resultados obsoletos o de otra clase:** bloqueada
  (`Dashboard.tsx:130-140`).
- **Notas negativas, infinitas o >100:** `validatedRecords` las rechaza con error
  visible; no entran en el historial.
- **`case-NN.json` con basura final:** se recupera el primer JSON y se avisa;
  el alumno no desaparece (`results.ts:54-71`, `buildMoodleCsv` sale de las
  mismas filas).
- **Pantalla frente a CSV:** ambas usan `bestScore` con los mismos récords.
- **Inyección de fórmulas y saltos de línea en el CSV:** neutralizados
  (`moodleCsv.ts:4-13`).
- **Reevaluar al alumno equivocado:** `caseIndexFor` valida por nombre y no
  ofrece el botón si no cuadra.
