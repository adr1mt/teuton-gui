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
| S-01 | pendiente |
| S-02 | **RESOLVED** |
| S-03 | **RESOLVED** |
| S-04 | pendiente |
| S-05 | pendiente |
| S-06 | pendiente |
| S-07 | pendiente |
| S-08 | pendiente |
| S-09 | pendiente |

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

## Findings consolidados

Los ID de origen enlazan al detalle (escenario, camino, test y arreglo).

### Critical

| ID | Origen | Qué pasa |
|---|---|---|
| S-01 | A1-01 | **Reevaluar a un alumno reescribe el CSV de Moodle de la clase con un solo alumno.** Con Teutón real, `--case` deja 14 filas `"-"` que además salen en pantalla como alumnos con 0 (media, aprobados y «Requieren atención» falsos). El teuton falso no imita este formato. |
| S-02 | A1-02 (+ A2 «exit ≠ 0») | **RESOLVED.** **Una pasada que no escribe informes se procesa como nueva.** Exit 1 (error de sintaxis) o exit 0 (sin `play`) dejan los informes anteriores, que pueden ser de otra clase: sus notas entran en el historial de la clase actual y su CSV se escribe con los alumnos de la otra. Incluye el caso «casos nuevos + resumen viejo». |

### High

| ID | Origen | Qué pasa |
|---|---|---|
| S-03 | A1-03 | **RESOLVED.** `resume.json` con `cases: []` desactiva el filtro: los `case-NN.json` viejos entran como alumnos actuales en el historial. |
| S-04 | A1-04 | Con `tt_testname`/`tt_outdir` y un `var/<carpeta>` viejo, cada ciclo lee la pasada vieja. |
| S-05 | A1-05 | Historial ilegible → el CSV automático se reescribe con las notas de la última pasada, no con las mejores. |
| S-06 | A2-01 | Si `.teuton-gui-meta.json` no se puede escribir, no se guarda ninguna nota en todo el examen; el aviso es genérico. |
| S-07 | A3-01 | Un `teuton` colgado detiene el modo examen para siempre; el vigilante no actúa con `running`. `CLAUDE.md` afirma lo contrario. |
| S-08 | A5-01 | Restaurar una copia para una clase resucita las notas de práctica de otra clase ya reiniciada. |
| S-09 | A5-02 | Restaurar con el historial sin permisos de lectura baja notas y dice «Notas restauradas». |

### Medium

| ID | Origen | Qué pasa |
|---|---|---|
| S-10 | A1-06 | Nota ausente o no numérica en `resume.json` → 0 legítimo en pantalla, historial y CSV. |
| S-11 | A1-07 | Alumno con la máquina apagada todo el examen → `0.00` en el CSV sin marca. |
| S-12 | A1-08 | «Cargar últimos resultados» puede atribuir la pasada a la clase anterior si `loadAfterExit` falló. |
| S-13 | A2-02 | La copia de seguridad que falla solo queda en el log. |
| S-14 | A2-03 | Un aviso de error se sustituye por el siguiente; los de «notas no guardadas» se pierden. |
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
