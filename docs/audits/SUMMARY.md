# Resumen de la campaña de auditoría

Base auditada: `main` @ `3bd2ab0` (2026-09-16). Fase solo de auditoría: no se ha
modificado código de producción. Informes: [A1](A1-grade-integrity.md) ·
[A2](A2-silent-failures.md) · [A3](A3-concurrency-lifecycle.md) ·
[A4](A4-fault-injection.md) · [A5](A5-persistence-recovery.md).

## Resultado global

**La app no está lista para un examen real.** Hay dos caminos, probados con
Teutón 2.10.6 real, por los que una nota incorrecta llega en silencio al
historial o al CSV de Moodle. Los dos nacen de la misma suposición: que lo que
hay en `var/<test>/` al terminar es el resultado completo de *esta* pasada.
Teutón no cumple esa suposición: nunca borra `var/`, con `--case` escribe
filas `skip` y puede salir con o sin error sin escribir nada.

| Severidad | Nº |
|---|---|
| Critical | 2 |
| High | 7 |
| Medium | 12 |
| Low | 9 |
| **Total (deduplicado)** | **30** |

Lo que sí está bien protegido (doble arranque, eventos tardíos, contexto
congelado, escritura atómica con `fsync`, colas por fichero, huérfanos, CSP e
IPC) aparece en «Riesgos descartados».

## Fase de corrección (Critical y High)

Infraestructura previa (commit `test: capture real Teutón 2.10.6 reports…`):
informes reales en `tests/fixtures/teuton-2.10.6/` (pasada completa,
`--case=2`, `cases: []`, con el comportamiento observado en su `README.md`),
`fake-teuton.mjs` fiel al real (filas `skip` con `--case`, `tt_testname`,
`tt_outdir`) y modos `noreports`, `syntaxerror`, `emptyresume`,
`staleresume`; `tests/fake-teuton.test.ts` lo compara con los fixtures. La UAT
puede cambiar de modo entre pasadas (`setFakeMode`) y sembrar la clase activa.

| ID | Estado |
|---|---|
| S-01 | **RESOLVED** |
| S-02 | **RESOLVED** |
| S-03 | **RESOLVED** |
| S-04 | **RESOLVED** |
| S-05 | **RESOLVED** |
| S-06 | **RESOLVED** |
| S-07 | **RESOLVED** |
| S-08 | **RESOLVED** |
| S-09 | **RESOLVED** |

### S-02 — RESOLVED

- **Causa raíz:** `loadAfterExit` procesaba cualquier salida (código 1, `null`
  o 0 sin escribir) y leía lo que hubiera en `var/`, que Teutón nunca borra.
- **Solución:** main anota `startedAt` justo antes de lanzar y lo manda en el
  evento `exit`; `loadResults` devuelve el `mtime` de cada `case-NN.json` y
  avisa si alguno es más nuevo que `resume.json`. `isFreshRun` (`lib/run.ts`)
  exige código 0, `resume.json` y todos los casos escritos después del
  arranque; si no, error visible y ni pantalla, ni meta, ni historial, ni CSV.
  La comparación es exacta: redondear al segundo aceptaba la pasada anterior
  cuando las dos caían en el mismo segundo (lo destapó la UAT). Solo un `mtime`
  múltiplo exacto de segundo (FAT, ext3) se compara con el arranque redondeado
  a 2 s.
- **Tests:** `run.test.ts` «procedencia de los informes (S-02)» (G2, G3, G5,
  mismo segundo, FS de segundos, caso bueno); `results.test.ts` «avisa si un
  case-NN.json es más nuevo que su resume.json»; E2E `procedencia.spec.ts`
  (grupo A bien y luego grupo B con `crash`, `noreports`, `syntaxerror` y
  `staleresume`). Antes del arreglo los cuatro E2E dejaban
  `class:bbbbbbbb…` en el historial.
- **De paso:** `datos-hostiles.spec.ts` esperaba cualquier fichero en
  `informes/` y a veces leía el `.tmp` previo al `rename`; ahora espera el `.csv`.
- **Verificado:** `npm run typecheck`, `npm test` (158), `npm run build`,
  `npm run test:e2e` (29); `procedencia.spec.ts` ×8 sin fallos.

### S-03 — RESOLVED

- **Causa raíz:** `loadResults` solo filtraba los `case-NN.json` por el
  resumen si este tenía casos, y `studentRows` pasaba a la rama «sin resumen»
  con `cases: []`. Teutón 2.10.6 escribe justo eso al vaciar la tabla y deja
  los informes del grupo anterior.
- **Solución:** el filtro se aplica siempre que exista `resume.json`, y
  `studentRows` usa el resumen aunque esté vacío. Con S-02 la pasada ya se
  rechazaba (casos anteriores al arranque); el hueco seguía abierto por
  «Cargar últimos resultados».
- **Tests:** `results.test.ts` «un resume.json sin casos no resucita…» (con el
  fixture real `emptycases`); `analytics.test.ts` «studentRows con un resumen
  sin casos»; E2E `procedencia.spec.ts` «…no resucita a los del grupo anterior
  (S-03)» (antes del arreglo el historial de B recibía los 4 alumnos de A).
- **Verificado:** `npm run typecheck`, `npm test` (160), `npm run build`,
  `npm run test:e2e` (30).

## Fase de corrección (Medium del gate: S-11, S-14, S-17, S-21)

| ID | Estado |
|---|---|
| S-11 | **RESOLVED** |
| S-14 | **RESOLVED** |
| S-17 | Pendiente |
| S-21 | Pendiente |

### S-11 — RESOLVED

- **Causa raíz:** `studentRows` ya sabía qué alumno tenía hosts sin conexión
  (`connErrors`), pero `gradeRecordsFromResults` y `buildMoodleCsv` no lo
  miraban: el 0 de Teutón entraba en el historial y salía en el CSV como
  `0.00`, igual que un suspenso real.
- **Semántica:** `isUnevaluated` (`lib/analytics.ts`) = algún host sin
  conexión **y** nota 0. Ese 0 es «sin evaluar», no una nota: no se guarda en
  el historial y, sin nota guardada, no sale en el CSV (Moodle deja la casilla
  vacía). Con nota guardada se exporta la guardada, aunque sea un 0 de una
  pasada con conexión. Una nota mayor que 0 con un host caído sí se guarda y
  exporta: la ganó. La lista muestra «—» en vez de la nota y un aviso nombra a
  quien quedará fuera del CSV; no bloquea la exportación del resto.
- **Tests:** `unreachable.test.ts` (CSV sin nota previa, con nota previa, con
  un 0 guardado, historial, lista de sin evaluar); E2E `maquina-apagada.spec.ts`
  «no llega al CSV como un 0» (antes: 5 filas con Ana en 0.00).
- **Verificado:** `npm run typecheck`, `npm test` (185), `npm run build`,
  `npm run test:e2e` (37).

### S-14 — RESOLVED

- **Causa raíz:** el store tenía un solo hueco (`operationalError`) y cada
  `setOperationalError` lo sustituía. El «no se han guardado las notas» de un
  ciclo lo tapaba el aviso del siguiente; cambiar de proyecto también lo
  borraba.
- **Solución:** `notices` en el store (`stores/app.ts`), con la misma llamada
  `setOperationalError`. Los errores se quedan hasta que el profesor cierra
  cada uno. Los avisos informativos (`{ info: true }`: reevaluación parcial,
  vigilante que reanuda o cancela un ciclo) se sustituyen entre sí y nunca a un
  error. El mismo mensaje repetido suma «(×N)» en vez de apilarse: sin
  avalancha en modo examen. Máximo 5 en pantalla; si se apartan más antiguos,
  una línea lo dice. Cambiar de proyecto conserva los errores y quita los
  informativos.
- **Tests:** `notices.test.ts` (7: error + informativo, error + error,
  informativos, repetición ×20, límite, cerrar uno, cambio de proyecto);
  `run.test.ts` lee el último aviso de la lista.
- **Riesgo residual:** con más de 5 errores distintos sin cerrar, los más
  antiguos se apartan; queda la línea «Y N avisos anteriores».
- **Verificado:** `npm run typecheck`, `npm test` (192), `npm run build`,
  `npm run test:e2e` (37).

**Gate de la fase Critical/High (2026-09-16):** `npm run typecheck`, `npm test` (180),
`npm run build`, `npm run test:e2e` (36), `npm run verify:parsing` sobre un
proyecto ejecutado con Teutón 2.10.6 (completo y `--case=2`; la aserción de
filas cuenta ahora solo casos no saltados), `./scripts/instalar.sh --forzar` y
escenario 15 (`empaquetada.spec.ts`) sobre ese build. Todo en verde. Quedan
los puntos 2, 7 y 8 del gate de examen (ver `docs/HANDOFF.md`).

Orden seguido: infraestructura → S-02 → S-03 → S-01 → S-04 → S-05/S-06 →
S-07 → S-08 → S-09. Sin cambios de orden respecto al pedido; S-04 se apoya en
la guarda de S-02 y S-07 obligó a corregir el orden de `cancelRun`.

### S-01 — RESOLVED

- **Causa raíz:** con `--case`, Teutón 2.10.6 escribe una fila `skip` (id
  «-») por cada alumno no elegido. `studentRows` las trataba como alumnos con
  0, y `loadAfterExit` reescribía el CSV de la clase con los pocos alumnos
  reevaluados. El teuton falso escribía solo el caso elegido y lo ocultaba.
- **Solución:** `studentRows` descarta las filas `skip`. La pasada congela
  `partial` al arrancar (`options.cases`); una pasada parcial guarda la nota en
  el historial pero **no** reescribe el CSV automático y lo dice. El panel
  bloquea la exportación manual mientras muestra resultados parciales (con
  aviso), y al recargar de disco `isPartialResume` distingue `--case` de un
  `tt_skip: true` del config.
- **Tests:** `partial.test.ts` (fixtures reales `case2` y `full`: vista, KPI,
  «Requieren atención», récords, CSV); `run.test.ts` «reevaluación parcial
  (S-01)» e «isPartialResume»; E2E `reevaluar-csv.spec.ts` (antes del arreglo
  el CSV quedaba con la cabecera y un alumno).
- **Riesgo residual:** si la última acción del examen es una reevaluación, el
  CSV automático conserva la nota anterior de ese alumno hasta la siguiente
  pasada completa (nunca la baja ni quita a nadie). El aviso lo dice.
- **Verificado:** `npm run typecheck`, `npm test` (166), `npm run build`,
  `npm run test:e2e` (31).

### S-04 — RESOLVED

- **Causa raíz:** `spawnRun` devolvía siempre `basename(dir)` como nombre de
  test y `loadResults` leía `var/<carpeta>` si existía. Teutón escribe en
  `tt_outdir || var/<tt_testname>` (y los casos siempre en
  `var/<tt_testname>`, comprobado con 2.10.6).
- **Solución:** `readOutputLocation` (`main/results.ts`) lee `tt_testname` y
  `tt_outdir` del config antes de lanzar, buscándolo como Teutón
  (`<cname>.json` y luego `.yaml`, claves con o sin dos puntos). El evento
  `exit` lleva `testName` y `outDir`; `loadResults` lee el resumen de
  `tt_outdir` y los casos solo de `var/<tt_testname>`. `tt_outdir` fuera del
  proyecto se rechaza con error (`insideProject` en `ipc.ts`). «Cargar últimos
  resultados» también resuelve `tt_outdir` desde el config.
- **Dependencia:** necesita la guarda de S-02: con ella, antes de este arreglo
  cada ciclo ya daba «no ha producido informes nuevos» en vez de congelarse
  en silencio.
- **Hallazgo real nuevo:** con `tt_outdir`, si `var/<tt_testname>` no existe,
  Teutón 2.10.6 sale con 1 (`Errno::ENOENT`). La app lo muestra como pasada
  fallida (S-02). El teuton falso lo imita.
- **Tests:** `output-dir.test.ts` (5); `ipc-runs.test.ts` «no lee informes de
  un tt_outdir fuera del proyecto»; `fake-teuton.test.ts` ampliado; E2E
  `procedencia.spec.ts` «con tt_testname / tt_outdir … (S-04)» (antes: 0
  alumnos guardados para el grupo B). Contrastado con Teutón 2.10.6 real sobre
  un proyecto con `tt_outdir: salida` y `tt_testname: ex2`.
- **Verificado:** `npm run typecheck`, `npm test` (172), `npm run build`,
  `npm run test:e2e` (33).

### S-05 y S-06 — RESOLVED (un commit: mismo orden de guardado)

- **Causa raíz:** en `loadAfterExit`, `setProjectMeta` iba antes que los
  récords y su fallo saltaba al `catch` general (S-06: ninguna nota guardada
  en todo el examen). Y el CSV se construía con `outcome.data` aunque
  `persisted` fuera `false`, que entonces son solo las notas de esta pasada
  (S-05).
- **Solución:** el fallo del meta se captura aparte y se avisa sin impedir el
  guardado. Si el historial no se guarda, error que dice «No se han guardado
  las notas…» y que el CSV no se ha reescrito; ni CSV ni cambio del historial
  en pantalla.
- **Tests:** `run.test.ts` «orden de guardado al terminar (S-05, S-06)» (G8,
  G9); E2E `guardado.spec.ts` (meta con `chmod 000` → el historial se guarda;
  historial con `chmod 000` y Ana a 0 → el CSV conserva su 10). Antes del
  arreglo: historial vacío, y `Ana Ferrer…,10.00` pasaba a `0.00`.
- **Verificado:** `npm run typecheck`, `npm test` (174), `npm run build`,
  `npm run test:e2e` (35).

### S-07 — RESOLVED

- **Causa raíz:** `checkMonitorHealth` salía sin hacer nada con
  `run.status === 'running'`, y Teutón 2.10.6 solo limita la conexión SSH, no
  los comandos. No había hora de arranque en el estado de la pasada.
- **Solución:** `run.startedAt` se anota al reservar el turno. Con el modo
  examen activo, una pasada que lleva más de `cycleLimitMs` (10 min o 3
  intervalos, lo que sea mayor) se cancela con un aviso («…llevaba más de N
  min sin terminar…») y la cancelación encadena el ciclo siguiente.
  `CLAUDE.md` corregido.
- **Dependencia descubierta:** main emite el `exit` del proceso matado antes
  de resolver `runCancel`, y `cancelRun` anulaba el `runId` después: la pasada
  cancelada se procesaba (con S-02 se rechazaba, y su aviso tapaba el de
  S-07; antes de S-02 se habrían guardado los informes viejos). `cancelRun`
  anula ahora el `runId` antes de esperar, como ya decía su comentario. Es
  parte del mismo arreglo; S-16 (cancelación que no mata) sigue abierto.
- **Tests:** `run.test.ts` «el vigilante cancela una pasada colgada…»,
  «startRun anota la hora de arranque», «cancelar descarta el exit del proceso
  cancelado»; E2E `modo-examen.spec.ts` «una pasada colgada del modo examen se
  cancela y llega el ciclo siguiente» (modo `hang`, reloj simulado de
  Playwright en la ventana: +16 min → aviso y proceso muerto; +6 min → otro
  proceso).
- **Verificado:** `npm run typecheck`, `npm test` (177), `npm run build`,
  `npm run test:e2e` (36); el E2E nuevo ×3 sin fallos.

### S-08 — RESOLVED

- **Causa raíz:** `restoreRecordBackup` fusionaba **todas** las clases de la
  copia (`mergeScoped(current, backup)`), aunque la vista pedía una.
- **Solución:** solo se fusiona `backup.classes[classScope(classId)]` (más el
  historial legado si es el ámbito manual).
- **Tests:** `store.test.ts` «restaurar para una clase no resucita las notas
  reiniciadas de otra» (antes: B volvía a `{Pau: 80}`) y «con el historial
  dañado sí restaura la copia». `copias-notas.spec.ts` sigue en verde.
- **Verificado:** `npm run typecheck` y `npm test` sobre el commit aislado;
  `npm run build` y `npm run test:e2e` (36) sobre el árbol con S-08 + S-09
  (los dos cambios tocan solo `restoreRecordBackup`).

### S-09 — RESOLVED

- **Causa raíz:** el `catch` de `restoreRecordBackup` trataba cualquier fallo
  de `readRecords` como «historial dañado» y partía de cero; con EACCES el
  `rename` sustituía un historial con notas más nuevas por la copia.
- **Solución:** `readRecords` lanza `CorruptRecordsError` solo cuando el
  contenido no se puede interpretar; la restauración solo sigue en ese caso.
  Un error de lectura se propaga y el panel muestra «No se pudieron restaurar
  las notas: No se pudo leer el historial…».
- **Tests:** `store.test.ts` «con el historial sin permisos de lectura no
  restaura y lo dice» (antes: `{Eva: 40}` con `persisted: true` sobre un
  fichero con 95).
- **Verificado:** `npm run typecheck`, `npm test` (180), `npm run build`,
  `npm run test:e2e` (36).

## Findings consolidados

Los ID de origen enlazan al detalle (escenario, camino, test y arreglo).

### Critical

| ID | Origen | Qué pasa |
|---|---|---|
| S-01 | A1-01 | **RESOLVED.** **Reevaluar a un alumno reescribe el CSV de Moodle de la clase con un solo alumno.** Con Teutón real, `--case` deja 14 filas `"-"` que además salen en pantalla como alumnos con 0 (media, aprobados y «Requieren atención» falsos). El teuton falso no imita este formato. |
| S-02 | A1-02 (+ A2 «exit ≠ 0») | **RESOLVED.** **Una pasada que no escribe informes se procesa como nueva.** Exit 1 (error de sintaxis) o exit 0 (sin `play`) dejan los informes anteriores, que pueden ser de otra clase: sus notas entran en el historial de la clase actual y su CSV se escribe con los alumnos de la otra. Incluye el caso «casos nuevos + resumen viejo». |

### High

| ID | Origen | Qué pasa |
|---|---|---|
| S-03 | A1-03 | **RESOLVED.** `resume.json` con `cases: []` desactiva el filtro: los `case-NN.json` viejos entran como alumnos actuales en el historial. |
| S-04 | A1-04 | **RESOLVED.** Con `tt_testname`/`tt_outdir` y un `var/<carpeta>` viejo, cada ciclo lee la pasada vieja. |
| S-05 | A1-05 | **RESOLVED.** Historial ilegible → el CSV automático se reescribe con las notas de la última pasada, no con las mejores. |
| S-06 | A2-01 | **RESOLVED.** Si `.teuton-gui-meta.json` no se puede escribir, no se guarda ninguna nota en todo el examen; el aviso es genérico. |
| S-07 | A3-01 | **RESOLVED.** Un `teuton` colgado detiene el modo examen para siempre; el vigilante no actúa con `running`. `CLAUDE.md` afirma lo contrario. |
| S-08 | A5-01 | **RESOLVED.** Restaurar una copia para una clase resucita las notas de práctica de otra clase ya reiniciada. |
| S-09 | A5-02 | **RESOLVED.** Restaurar con el historial sin permisos de lectura baja notas y dice «Notas restauradas». |

### Medium

| ID | Origen | Qué pasa |
|---|---|---|
| S-10 | A1-06 | Nota ausente o no numérica en `resume.json` → 0 legítimo en pantalla, historial y CSV. |
| S-11 | A1-07 | **RESOLVED.** Alumno con la máquina apagada todo el examen → `0.00` en el CSV sin marca. |
| S-12 | A1-08 | «Cargar últimos resultados» puede atribuir la pasada a la clase anterior si `loadAfterExit` falló. |
| S-13 | A2-02 | La copia de seguridad que falla solo queda en el log. |
| S-14 | A2-03 | **RESOLVED.** Un aviso de error se sustituye por el siguiente; los de «notas no guardadas» se pierden. |
| S-15 | A2-04 | Escala de notas inválida o ilegible → 70/10 sin aviso (o con uno que se cierra) para todos los CSV. |
| S-16 | A3-02 | Cancelación no confirmada: el renderer queda en «parado» y main sigue bloqueado; el resultado tardío se descarta. |
| S-17 | A3-03 | Cerrar la ventana entre ciclos del modo examen no pide confirmación (y puede cortar el guardado del último ciclo). |
| S-18 | A5-03 | `config.yaml` y `start.rb` se guardan sin `fsync`. |
| S-19 | A5-04 | Las copias no aparecen si la carpeta del examen se ha movido o renombrado. |
| S-20 | A5-05 | Renombrar a un alumno deja su mejor nota fuera del CSV (clave = nombre). |
| S-21 | A5-06 | Sin bloqueo de instancia única: dos ventanas sobre el mismo proyecto se pisan informes e historial. |

### Low

| ID | Origen | Qué pasa |
|---|---|---|
| S-22 | A2-05 | Fallo al impedir la suspensión, sin aviso. |
| S-23 | A2-06 | El CSV automático ignora los avisos de lectura que la exportación manual sí confirma. |
| S-24 | A2-07 | `.teuton-gui-meta.json` dañado se trata como vacío y se sobrescribe. |
| S-25 | A2-08 | Cualquier error al leer recientes vacía la lista. |
| S-26 | A3-04 | Cancelar durante el guardado de borradores lanza una pasada sin dueño. |
| S-27 | A3-05 | Se puede arrancar una pasada mientras la anterior aún guarda notas. |
| S-28 | A5-07 | Copia de la hora actual ilegible → se sobrescribe sin apartarla. |
| S-29 | A5-08 | Historial con JSON válido pero forma inesperada cuenta como vacío. |
| S-30 | A5-09 | Renombrar una clase deja el CSV antiguo junto al nuevo. |

## Tests nuevos recomendados

Ordenados por riesgo. El detalle de cada uno está en
[A4](A4-fault-injection.md) (columna «Test propuesto»).

1. **Infraestructura previa:** fixtures reales de Teutón 2.10.6 (pasada
   completa, `--case=2`, config sin casos) y modos nuevos del teuton falso
   (`--case` con filas `skip`, `noreports`, `emptyresume`, `staleresume`).
2. **G1** — reevaluar a un alumno mantiene el CSV completo y sin filas «-»
   (S-01).
3. **G2 / G3** — pasada con `crash` y con `noreports` tras otra clase: ni
   historial ni CSV cambian; error visible (S-02).
4. **G5** — casos nuevos + resumen viejo no se muestran como coherentes (S-02).
5. **G4** — `resume.json` con `cases: []` no carga casos viejos (S-03).
6. **G6** — `tt_testname` propio no congela el panel (S-04).
7. **G8** — historial ilegible no reescribe el CSV (S-05).
8. **G9** — meta no escribible no impide guardar notas (S-06).
9. **G7** — `hang` en modo examen: aviso y segundo ciclo (S-07).
10. **G16 / G17** — restaurar no toca otras clases ni baja notas (S-08, S-09).
11. **G25, G24** — nota no numérica y escala inválida (S-10, S-15).
12. **G14, G10–G13** — copia fallida, ENOSPC, `rename`, `fsync`, EROFS (S-13).
13. **G28, G26, G27** — cierre entre ciclos, cancelación que no mata,
    cancelar durante el guardado (S-17, S-16, S-26).
14. **G22, G23, G29, G15, G18–G21** — resto de huecos.

## Orden recomendado de corrección

Cada paso deja la suite en verde antes de pasar al siguiente. Primero el test
que falla, luego el arreglo.

1. **Fidelidad del teuton falso y fixtures reales** (A4 §Recomendación). Sin
   esto, S-01 a S-04 no se pueden reproducir en la UAT. ~1 h.
2. **Guarda de frescura** (S-02): hora de arranque en el `exit`, procesar solo
   con `code === 0` y `resume.json` posterior al arranque, casos más viejos que
   su resumen con aviso. Es la base de S-04, y reduce el daño de S-12 y S-26.
   ~1,5 h.
3. **Filtro por resumen siempre que exista** (S-03). ~15 min.
4. **Filas `skip` y pasadas parciales** (S-01): fuera de `studentRows`; sin CSV
   automático cuando la pasada lleva `cases` (o CSV desde el récord completo).
   ~45 min.
5. **Orden de guardado en `loadAfterExit`** (S-06, S-05): récords primero, meta
   aparte, CSV solo si `persisted`. Registrar la clase antes de lanzar (S-12).
   ~45 min.
6. **Directorio de salida real** (S-04). Depende de 2. ~30 min.
7. **Vigilante con tiempo máximo de ciclo** (S-07) y corregir `CLAUDE.md`.
   ~1 h.
8. **Restauración por ámbito y sin atajo en EACCES** (S-08, S-09). ~45 min.
9. **Avisos persistentes y sin pisarse** (S-14), luego S-13 y S-15 que los usan.
   ~1 h.
10. **Instancia única** (S-21) y **confirmación de cierre con modo examen**
    (S-17). ~45 min.
11. **Resto de Medium** (S-10, S-11, S-16, S-18, S-19, S-20). ~3 h.
12. **Low**, según tiempo.

Tras cada paso: `npm run typecheck && npm test`, `npm run build && npm run
test:e2e`, `./scripts/instalar.sh`, y actualizar `docs/HANDOFF.md`.

## Riesgos investigados y descartados

No hace falta volver a auditarlos mientras no cambie el código citado.

- **Doble arranque en el mismo tick** — reserva síncrona (`run.ts:63-72`) y
  `reserveDir` antes del `await` (`ipc.ts:387`); escena 2.
- **Cancelar y relanzar** — `cancelAndWait` espera al `close`; escena 3.
- **Eventos tardíos o de otra pasada** — descartados por `runId`.
- **Cambio de clase o proyecto durante la pasada** — contexto congelado;
  `leaveProject` cancela y para el monitor; `runCycle` comprueba el directorio.
- **Monitor activo sin ciclo** tras fallo de arranque, error, cancelación o
  suspensión — `scheduleNextCycle` en todos los caminos y vigilante con margen
  (salvo S-07).
- **Procesos huérfanos** al cerrar, cerrar sesión o durante `check`/`export` —
  grupo de procesos, `syncChildren`, señales; escenas 4, 17 y 18.
- **Escritura a medias** de historial, meta, clases y ajustes — temporal +
  `fsync` + `rename` + `fsync` del directorio.
- **Escrituras concurrentes dentro de la app** — `serialized` por fichero.
- **Ficheros ilegibles leídos como vacíos** en `classes.json`, historial y
  ajustes — solo ENOENT es ausencia.
- **Historial ilegible sobrescrito por la pasada** — no se escribe.
- **Mezcla del formato v1 con clases** — `legacy` solo en `manual`.
- **`case-NN.json` huérfanos de una clase mayor** — filtrados por el resumen
  (cuando tiene casos).
- **`case-NN.json` con basura final** — se recupera y avisa; el alumno no
  desaparece.
- **Nombres duplicados o con espacios** — bloquean récords; se fusionan por
  máximo.
- **Notas negativas, infinitas o >100** — rechazadas con error visible.
- **Exportación manual con datos obsoletos o de otra clase** — bloqueada.
- **Pantalla y CSV con notas distintas** — ambos usan `bestScore`.
- **Fórmulas y saltos de línea en el CSV** — neutralizados.
- **Reevaluar al alumno equivocado** — `caseIndexFor` valida por nombre.
- **Reinicio que borra también la copia** — la copia de la hora se fusiona.
- **Copias sin límite** — 48 por proyecto.
- **Restaurar una copia con notas imposibles** — rechazada.
- **Colisión del sufijo `<id8>`** — ids de clase UUID.
- **`exportAs` compitiendo con una pasada** — misma reserva; además ninguna
  vista lo usa.
- **Rutas IPC fuera del proyecto, CSP en el AppImage** — escenas 12, 13 y 15.

## Gate antes de usar en examen

La app se considera preparada cuando se cumple **todo** lo siguiente:

1. **Corregidos:** S-01, S-02 (Critical) y S-03 a S-09 (High).
2. **Corregidos o aceptados por escrito en `docs/HANDOFF.md`:** S-11 (máquina
   apagada exportada como 0), S-14 (avisos que se pisan), S-17 (cierre entre
   ciclos) y S-21 (dos ventanas). Son los Medium que pueden terminar en una nota
   equivocada o en un examen sin corregir.
3. **Tests nuevos en verde:** G1, G2, G3, G4, G5, G6, G7, G8, G9, G16 y G17,
   ejecutados contra el teuton falso **ya ajustado al formato real** de `--case`.
4. **Tests existentes en verde:** `npm run typecheck`, `npm test`,
   `npm run build && npm run test:e2e` (25 escenarios + los nuevos).
5. **Contraste con Teutón real:** `npm run verify:parsing` sobre un proyecto
   ejecutado con Teutón 2.10.6, una vez completo y otra con `--case`.
6. **Instalado:** `./scripts/instalar.sh --forzar` y escenario 15 en verde con el
   AppImage resultante.
7. **Ensayo de aula:** una pasada de modo examen de 30 min con máquinas reales,
   reevaluando a un alumno a mitad, y el CSV de `informes/` revisado a mano
   contra el panel antes de subirlo a Moodle.
8. **Comprobaciones manuales de `docs/UAT.md`** pendientes: disco lleno y
   suspender con el modo examen activo.
