# A2 — Silent Failures / Error Propagation

Pregunta: ¿qué operaciones pueden parecer correctas cuando en realidad han
fallado?

**Respuesta:** la mayoría de las fronteras de fallo son visibles o seguras. Hay
un fallo alto: una escritura de metadatos que falla se lleva por delante el
guardado de las notas de esa pasada. Además hay cuatro puntos medios donde el
fallo queda oculto o se sobrescribe.

## Método

Revisión de todos los `catch`, `.catch()`, `void <promesa>` y valores por
defecto en `src/` (`grep -rn "catch\b\|\.catch(\|void "`), más los fallbacks de
parseo (`num`, `str`, `parseConfig`, `getProjectMeta`, `getGrading`). Cada
frontera se clasifica como:

- **A** — error gestionado y visible;
- **B** — fallback silencioso pero seguro;
- **C** — error potencialmente ocultado.

No se marcan como bug los fallbacks documentados en `CLAUDE.md` sin un riesgo
demostrado.

## Clasificación de fronteras

| Frontera | Fichero:línea | Clase | Nota |
|---|---|---|---|
| Guardar borradores antes de ejecutar | `lib/run.ts:75-88` | A | Aborta la pasada con error |
| Lanzar `teuton run` | `lib/run.ts:96-106` | A | Error visible y el monitor sigue |
| `estimateExpectedTotal` | `lib/run.ts:115-123` | B | Solo pierde el total de la barra |
| Evento `error` del hijo | `lib/run.ts:372-378` | A | |
| Evento `exit` con código ≠ 0 | `lib/run.ts:379-391` | **C** | Se procesa como pasada válida → A1-02 |
| `setProjectMeta` en `loadAfterExit` | `lib/run.ts:419-422` | **C** | Aborta récords y CSV → A2-01 |
| `updateRecords` sin persistir | `lib/run.ts:438` | A | Aviso visible (pero ver A1-05) |
| CSV automático | `lib/run.ts:445-455` | A | Aviso visible |
| Avisos de lectura en el CSV automático | `lib/run.ts:442-451` | **C** | → A2-06 |
| Cancelar | `lib/run.ts:161-175` | A/C | Error visible, pero marca «parado» aunque el hijo siga vivo → A3-02 |
| `keepAwake` | `lib/run.ts:264`, `:272` | **C** | → A2-05 |
| Banner de error único | `stores/app.ts:273`, `App.tsx:214` | **C** | → A2-03 |
| Carga inicial de ajustes | `App.tsx:72-79` | A/C | Error visible, pero la escala queda en 70/10 → A2-04 |
| Carga de metadatos del proyecto | `App.tsx:88-105` | A | |
| `readJson` de informes | `main/results.ts:54-71` | A | Aviso en `warnings` |
| `num()` / `str()` en informes | `main/results.ts:123-130` | **C** | Nota ausente = 0 → A1-06 |
| `findOutputDir` / `dirExists` | `main/results.ts:73-121` | A | Solo ENOENT es ausencia |
| `moodle.csv` y `stat` de `resume.json` | `main/results.ts:247-266` | A | |
| `readJson` de `userData` | `main/store.ts:35-51` | A | Solo ENOENT es ausencia |
| `getGrading` con valores inválidos | `main/store.ts:159-166` | **C** | → A2-04 |
| Descifrado de credenciales | `main/store.ts:229-264` | A | Visible en Ajustes (documentado) |
| `encFileExists` | `main/store.ts:212-219` | B | |
| `readRecords` | `main/store.ts:372-416` | A | Solo ENOENT o vacío es ausencia |
| `readRecords` con JSON válido que no es objeto | `main/store.ts:415` | C (Low) | Un array cuenta como «sin historial» → A5-08 |
| `writeBackup` | `main/store.ts:466-468` | **C** | Solo `console.error` → A2-02 |
| `readBackup` dentro de `writeBackup` | `main/store.ts:613` | C (Low) | → A5-07 |
| Poda de copias, `unlink` | `main/store.ts:620` | B | |
| `listRecordBackups`, copia ilegible | `main/store.ts:646-648` | B | Documentado |
| `restoreRecordBackup` con historial ilegible | `main/store.ts:677-682` | C | Documentado, pero ver A5-02 |
| `getProjectMeta` con JSON dañado | `main/store.ts:718-720` | C (Low) | → A2-07 |
| `fsync` del directorio | `main/store.ts:123-127` | B | |
| `unlink` del CSV sin sufijo | `main/store.ts:763` | B | |
| `writeAtomic` de proyecto (sin `fsync`) | `main/projects.ts:37-64` | C | → A5-03 |
| `teuton new` fallido | `main/projects.ts:113` | B | Hay esqueleto de repuesto |
| `getRecents` | `main/projects.ts:145-158` | C (Low) | → A2-08 |
| `broadcast` a ventana cerrada | `main/ipc.ts:320-328` | B | |
| `sendSignal` | `main/ipc.ts:185-195` | B | Hay repuesto `child.kill` |
| Errores de tubería `stdout`/`stderr` | `main/ipc.ts:414-415` | B | Evita tumbar main |
| `runTeutonSync` código no numérico | `main/teuton.ts:547-555` | A | Motivo en `stderr` |
| Búsqueda de `teuton` en el PATH | `main/teuton.ts:294-373`, `:442-456` | B | |
| `uncaughtException` / `unhandledRejection` | `main/index.ts:157-162` | B | Documentado |
| `parseConfig` / `loadRawScalars` | `lib/config.ts:64`, `:95` | A/B | La tabla se bloquea con error |
| Preflight | `lib/preflight.ts:154-195` | A | |
| Estado de credenciales en Ajustes | `routes/Settings.tsx:42` | C (Low) | Si el IPC falla, no aparece el aviso |
| Error boundary | `App.tsx:276` | A | |

---

## Findings

### A2-01 — Si no se pueden escribir los metadatos del proyecto, no se guarda ninguna nota

- **Severity:** High
- **File:line:** `src/renderer/src/lib/run.ts:419-435`, `src/main/store.ts:723-728`
- **Scenario:** `.teuton-gui-meta.json` sin permiso de escritura (copiado desde
  otro usuario o con otro dueño), o fallo transitorio de escritura justo en esa
  llamada, durante el modo examen.
- **Execution path:** `loadAfterExit` → `await setProjectMeta(...)` lanza →
  salta al `catch` general → no llega a `updateRecords` ni a `writeClassCsv`.
- **Current behavior:** en pantalla se ven las notas de la pasada, con un aviso
  genérico: «No se pudo completar el procesamiento de resultados: EACCES…».
  El aviso no dice que las notas no se han guardado. Pasa en cada ciclo.
- **Risk:** la red de seguridad de la mejor nota queda desactivada todo el
  examen. Un alumno que llega a 100 y apaga la máquina acaba con 0 en el CSV.
- **Expected safe behavior:** los metadatos no bloquean el guardado de notas, y
  cualquier fallo de guardado de notas lo dice con esas palabras.
- **Existing coverage:** ninguna.
- **Regression test:** unit sobre `loadAfterExit` con `window.teuton` simulado:
  `setProjectMeta` rechaza → `updateRecords` se llama igualmente y el aviso
  menciona las notas.
- **Fix concept:** guardar récords primero y capturar el fallo de
  `setProjectMeta` por separado (sin perder A1-08: registrar la clase antes de
  lanzar).

### A2-02 — Si la copia de seguridad de notas falla, solo queda en el log

- **Severity:** Medium
- **File:line:** `src/main/store.ts:466-468`
- **Scenario:** `~/.config/teuton-gui/copias-notas/` no se puede escribir
  (partición `/` llena, que en esta máquina está al 96 %, o permisos).
- **Execution path:** `updateRecords` → `writeBackup` lanza →
  `.catch(console.error)` → `{persisted: true}`.
- **Current behavior:** ninguna señal en pantalla. «Restaurar notas» aparece
  vacío o con copias antiguas el día que hace falta.
- **Risk:** el profesor confía en una red de seguridad que no existe; tras un
  «Reiniciar historial» por error no hay nada que recuperar.
- **Expected safe behavior:** la escritura principal sigue siendo un éxito, pero
  `PersistenceResult` lleva un aviso de copia fallida y la UI lo enseña.
- **Existing coverage:** `copias-notas.spec.ts` solo cubre el caso feliz.
- **Regression test:** unit con `copias-notas` como fichero (no directorio) →
  `updateRecords` devuelve `persisted: true` **y** un aviso.
- **Fix concept:** añadir `backupWarning` al resultado y mostrarlo.

### A2-03 — Un aviso de error se sustituye por el siguiente

- **Severity:** Medium
- **File:line:** `src/renderer/src/stores/app.ts:273`, `src/renderer/src/App.tsx:214-224`,
  `src/renderer/src/lib/run.ts:426`, `:438`, `:454`, `:342`
- **Scenario:** en un ciclo, `updateRecords` devuelve `persisted:false`
  (fallo puntual). En ese ciclo o el siguiente aparece otro aviso (CSV,
  vigilante «se reanuda ahora», IDs de Moodle).
- **Execution path:** cada `setOperationalError(msg)` reemplaza el anterior.
- **Current behavior:** el profesor solo ve el último mensaje. El «no se
  pudieron guardar los récords» puntual desaparece sin haberse leído.
- **Risk:** una pasada cuya mejor nota no se guardó pasa desapercibida.
- **Expected safe behavior:** los avisos de pérdida de notas no se pisan con
  avisos menores (cola o prioridad).
- **Existing coverage:** ninguna.
- **Regression test:** unit del store: aviso de récords seguido de aviso del
  vigilante → siguen visibles los dos (o el de récords).
- **Fix concept:** lista acotada de avisos, o prioridad «notas» que no se
  sustituye por avisos informativos.

### A2-04 — La escala de notas vuelve a 70/10 sin avisar

- **Severity:** Medium
- **File:line:** `src/main/store.ts:159-166`, `src/renderer/src/App.tsx:72-79`,
  `src/renderer/src/stores/app.ts:167`
- **Scenario (a):** `grading.json` con un valor que `validatedGrading` rechaza
  (p. ej. `passScore: 62.5` escrito a mano o por otra versión).
- **Scenario (b):** `grading.json` ilegible → `getGrading` lanza.
- **Execution path:** (a) `catch { return DEFAULT_GRADING }`. (b) el
  `Promise.all` de `App.tsx` muestra un error, pero `grading` queda en el valor
  inicial `{70, 10}`.
- **Current behavior:** (a) sin ninguna señal; (b) un aviso que se puede
  cerrar. En ambos casos cada CSV automático convierte con 70/10.
- **Risk:** las notas exportadas no usan la escala que el profesor configuró.
- **Expected safe behavior:** escala inválida = aviso persistente, y el CSV
  automático no se escribe hasta confirmar la escala.
- **Existing coverage:** ninguna.
- **Regression test:** unit de `getGrading` con `passScore: 62.5` → error o
  aviso, no 70/10 en silencio.
- **Fix concept:** que `getGrading` lance como `readJson`, y que la UI bloquee
  el CSV mientras la escala no esté cargada.

### A2-05 — Si no se puede impedir la suspensión, el modo examen no lo dice

- **Severity:** Low
- **File:line:** `src/renderer/src/lib/run.ts:264`, `:272`
- **Scenario:** `powerSaveBlocker.start` falla o el IPC `keepAwake` rechaza.
- **Current behavior:** `.catch(() => undefined)`. El modo examen se ve activo y
  el equipo puede suspenderse a las 2 h.
- **Risk:** la clase deja de corregirse al final del examen (el vigilante lo
  reanuda al despertar, pero no durante la suspensión).
- **Expected safe behavior:** aviso visible si falla la activación.
- **Existing coverage:** `run.test.ts` y escena 19 cubren el caso feliz.
- **Regression test:** unit: `keepAwake` rechaza → aparece un aviso.
- **Fix concept:** mostrar el error en el `.catch` de la activación.

### A2-06 — El CSV automático se escribe aunque la lectura de informes haya dado avisos

- **Severity:** Low
- **File:line:** `src/renderer/src/lib/run.ts:442-451`, comparar con
  `src/renderer/src/routes/Dashboard.tsx:229`
- **Scenario:** un `case-NN.json` ilegible o recuperado con basura final.
- **Current behavior:** la exportación manual pide confirmación si hay
  `warnings`; el CSV automático se escribe sin mirarlos. Hoy el daño es
  limitado porque la nota sale de `resume.json`, pero el comentario del CSV
  lleva `0/0 objetivos`.
- **Expected safe behavior:** mismo criterio en ambos caminos.
- **Existing coverage:** `datos-hostiles.spec.ts` (escena 10) solo mira la lista.
- **Regression test:** unit: resultados con `warnings` → el CSV automático no se
  escribe o se marca.
- **Fix concept:** reutilizar la condición de la exportación manual.

### A2-07 — Un `.teuton-gui-meta.json` dañado se trata como vacío y se sobrescribe

- **Severity:** Low
- **File:line:** `src/main/store.ts:713-720`, `:723-728`
- **Scenario:** el fichero de metadatos está truncado (editado a mano o
  copiado a medias).
- **Current behavior:** `getProjectMeta` devuelve `{}` sin aviso; la clase
  activa se pierde y la primera `setProjectMeta` reescribe el fichero. Las
  recargas atribuyen la pasada a la clase activa (o a `manual`).
- **Risk:** historial en el ámbito equivocado tras una recarga.
- **Expected safe behavior:** el mismo criterio que `readRecords`: error, sin
  sobrescribir.
- **Existing coverage:** ninguna.
- **Regression test:** unit: meta con `{"activeClassId":` → `getProjectMeta`
  lanza y `setProjectMeta` no escribe.
- **Fix concept:** lanzar en el `catch` del parseo.

### A2-08 — Cualquier error al leer los recientes vacía la lista

- **Severity:** Low
- **File:line:** `src/main/projects.ts:145-158`, `:166-173`
- **Scenario:** `recent-projects.json` ilegible o dañado.
- **Current behavior:** `getRecents` devuelve `[]`; la siguiente apertura
  reescribe la lista con un solo proyecto. Como `allowedRoots` depende de esa
  lista, los proyectos desaparecen de Inicio sin aviso.
- **Risk:** no afecta a notas; el profesor tiene que volver a buscar la carpeta.
- **Expected safe behavior:** solo ENOENT es «sin recientes».
- **Existing coverage:** ninguna.
- **Regression test:** unit: fichero sin permisos → error, no `[]`.
- **Fix concept:** mismo patrón que `readJson` de `store.ts`.

---

## Riesgos descartados

- **Ficheros ilegibles leídos como «sin datos»** en `classes.json`, historial y
  ajustes: solo ENOENT cuenta como ausencia (`store.ts:35-51`, `:372-384`).
- **Escritura del historial fallida:** devuelve `persisted:false` y se avisa
  (`store.ts:461-476`).
- **Pisar el historial cuando no se puede leer:** no se escribe
  (`store.ts:441-452`).
- **Credenciales ilegibles:** visible en Ajustes (documentado).
- **Tubería rota o ventana cerrada durante la pasada:** capturado sin tumbar
  main (`ipc.ts:320-328`, `:414-415`).
- **Fallo al arrancar o al guardar borradores:** error visible y el modo examen
  programa el siguiente ciclo.
- **Informe ilegible:** aviso en el panel y el alumno sigue en la lista.
- **YAML roto:** la tabla se bloquea y no se escribe (`lib/config.ts`).
- **Timeout o `maxBuffer` en `check`:** llega como código ≠ 0 con motivo.
