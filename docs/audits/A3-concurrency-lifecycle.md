# A3 — Concurrency & Lifecycle

Pregunta: ¿hay carreras o estados imposibles en el ciclo de vida de una pasada,
del modo examen y de la aplicación?

**Respuesta:** las carreras que ya costaron un bug (doble arranque, cancelar y
relanzar, eventos tardíos, cambio de proyecto) están cerradas. Queda un fallo
alto: un `teuton` colgado detiene el modo examen para siempre, y el vigilante
no lo rescata aunque `CLAUDE.md` diga que sí. Hay además dos medios.

## Máquinas de estados reconstruidas

### Pasada (renderer, `useApp.run`)

```
idle/done/failed ──startRun──▶ running(runId, contexto congelado)   [reserva síncrona]
running ──saveDrafts falla──▶ failed        (+ scheduleNextCycle si monitor)
running ──IPC run falla────▶ failed        (+ scheduleNextCycle si monitor)
running ──ev.error─────────▶ failed        (+ scheduleNextCycle si monitor)
running ──ev.exit(code)────▶ done|failed ──▶ loadAfterExit (processingExit=true)
                                              └─ finally: scheduleNextCycle si monitor
running ──cancelRun────────▶ idle(runId=null)   (+ scheduleNextCycle si monitor)
running ──leaveProject─────▶ idle(runId=null), monitor parado
cualquier evento con runId ≠ activo ─▶ descartado
```

### Proceso (main, `ipc.ts`)

```
reserveDir(dir) ─▶ spawnRun ─▶ activeRuns[runId] ─▶ close/error ─▶ release()
                     └ falla ─▶ busyDirs.delete(dir)
runCancel ─▶ cancelAndWait: SIGTERM al grupo, SIGKILL a los 3 s,
             resuelve al 'close' o rechaza a los 10 s
before-quit / window-all-closed / SIGTERM|SIGINT|SIGHUP ─▶ stopActiveRuns (SIGTERM+SIGKILL inmediatos)
ventana 'close' ─▶ pregunta solo si hasActiveRuns()
```

### Modo examen

```
startMonitor ─▶ active, keepAwake(true), startRun
fin de ciclo ─▶ scheduleNextCycle ─▶ setTimeout(runCycle, intervalo)
runCycle ─▶ proyecto distinto ─▶ stopMonitor + aviso
         └▶ cycles+1, startRun (si hay otra en marcha, cede y reprograma)
vigilante (30 s) ─▶ si !running && !processingExit && (sin timer || vencido +60 s) ─▶ runCycle
stopMonitor ─▶ clearTimeout, keepAwake(false)
```

Invariante verificada en todos los caminos de fin de ciclo:
**monitor activo ⇒ siguiente ciclo programado**, *salvo* mientras
`run.status === 'running'` (ver A3-01).

---

## Findings

### A3-01 — Un `teuton` colgado detiene el modo examen indefinidamente

- **Severity:** High
- **File:line:** `src/renderer/src/lib/run.ts:333`, `src/main/teuton.ts:572-590`,
  `tests/run.test.ts:93-98`
- **Scenario:** un objetivo cuyo comando no termina en la máquina de un alumno
  (`ping` sin `-c`, un `apt` esperando el bloqueo, un servicio que no responde
  tras conectar). Teutón 2.10.6 solo pone `timeout: 30` a la *conexión* SSH
  (`execute_ssh.rb:48`), no a la ejecución.
- **Execution path:** el hijo nunca emite `close` → `run.status` sigue en
  `running` → `checkMonitorHealth` devuelve `false` en la línea 333 → nadie
  reprograma. `spawnRun` no tiene tiempo máximo (decisión documentada).
- **Current behavior:** el panel sigue diciendo que evalúa y la barra se queda
  quieta. No hay más ciclos hasta que el profesor cancela a mano. `CLAUDE.md`
  dice que el vigilante existe para «an `ssh` that hangs and never emits
  `exit`», pero el test `el vigilante no interrumpe un ciclo que está corriendo`
  fija el comportamiento contrario.
- **Risk:** durante el resto del examen no se corrige a nadie, y el estado
  «evaluando» parece normal en una pantalla proyectada.
- **Expected safe behavior:** un ciclo que supera un umbral (p. ej. 3 × su
  duración habitual o N minutos) se avisa en pantalla y se cancela para que el
  siguiente ciclo arranque.
- **Existing coverage:** escena 4 (modo `hang`) solo comprueba que cerrar la app
  no deja huérfanos.
- **Regression test:** unit: monitor activo, `run.status = 'running'` desde hace
  más del umbral → el vigilante cancela y reprograma. E2E: modo `hang` con modo
  examen de 1 min → aparece el aviso y hay un segundo ciclo.
- **Fix concept:** guardar `startedAt` en `run`; el vigilante cancela (vía
  `cancelRun`) un ciclo del modo examen que supera el umbral y lo dice.
  Corregir la frase de `CLAUDE.md`.

### A3-02 — Si cancelar no mata al proceso, la app lo olvida pero main sigue bloqueado

- **Severity:** Medium
- **File:line:** `src/renderer/src/lib/run.ts:161-175`, `src/main/ipc.ts:283-297`,
  `src/main/ipc.ts:401-404`
- **Scenario:** un proceso que no muere en 10 s ni con SIGKILL (estado `D`
  esperando un disco o un montaje de red).
- **Execution path:** `cancelAndWait` rechaza → el renderer muestra el error y,
  en `finally`, pone `idle` con `runId = null` → main mantiene `activeRuns` y
  `busyDirs` hasta el `close`.
- **Current behavior:** cada ciclo posterior falla con «Ya hay una evaluación
  activa para este proyecto» (visible). Cuando el proceso termina por fin, su
  `exit` se descarta: sus notas no se guardan.
- **Risk:** examen parado con avisos repetidos; resultados perdidos.
- **Expected safe behavior:** si la cancelación no se confirma, el estado sigue
  siendo «cancelando» y el `exit` tardío se procesa o se anuncia.
- **Existing coverage:** `ipc-runs.test.ts` «cancelar espera a que el proceso
  muera» cubre solo el caso en que muere.
- **Regression test:** unit con un hijo falso que ignora señales → el renderer no
  queda en `idle` con el directorio aún reservado.
- **Fix concept:** estado `cancelling` en el renderer hasta el `exit`; no anular
  `runId` si `cancelRun` rechaza.

### A3-03 — Cerrar la ventana entre dos ciclos del modo examen no pide confirmación

- **Severity:** Medium
- **File:line:** `src/main/index.ts:79-95`, `src/main/ipc.ts:309-314`
- **Scenario:** modo examen activo con intervalo de 5 min; la pasada dura
  ~30 s. El profesor cierra la ventana por error en cualquiera de los 4,5 min
  restantes, o justo cuando acaba una pasada y se están guardando las notas.
- **Execution path:** `hasActiveRuns()` solo mira procesos vivos → `false` →
  la ventana se cierra sin aviso → `window-all-closed` → `app.quit()` mientras
  `loadAfterExit` puede estar a mitad de `updateRecords`/`writeClassCsv`.
- **Current behavior:** el modo examen muere sin pregunta la mayor parte del
  tiempo. Si coincide con el guardado, la última mejora de nota y el CSV de
  ese ciclo pueden perderse (las escrituras son atómicas: no hay corrupción,
  solo pérdida del último ciclo).
- **Risk:** la clase deja de corregirse; el último 10 de un alumno no llega al
  historial.
- **Expected safe behavior:** preguntar también con el modo examen activo o con
  un guardado pendiente.
- **Existing coverage:** escenas 16 y 17 cubren «sin nada en marcha» y «con
  proceso vivo», no «modo examen entre ciclos».
- **Regression test:** e2e: modo examen activo, esperar al fin del primer ciclo,
  cerrar → aparece el aviso.
- **Fix concept:** el renderer informa a main de `monitor.active` y de
  `processingExit` (un IPC booleano, como `keepAwake`), y `close` lo consulta.

### A3-04 — Cancelar o cambiar de proyecto mientras se guardan los borradores deja una pasada sin dueño

- **Severity:** Low
- **File:line:** `src/renderer/src/lib/run.ts:75-97`, `:161-169`, `:187-199`
- **Scenario:** el profesor pulsa «Cancelar» o abre otro proyecto en los
  milisegundos entre la reserva del turno y `window.teuton.run`, mientras
  `saveDraftsIfDirty` escribe.
- **Execution path:** `cancelRun` llama a `cancelRun(runId)` en main, que no
  tiene entrada → pone `idle`. `startRun` sigue tras el `await` y llama a
  `window.teuton.run(dir, …, runId)` sin comprobar que `runId` sigue activo.
- **Current behavior:** se lanza un `teuton` cuyos eventos se descartan: nadie
  lo ve ni guarda sus notas. Ocupa `busyDirs` (el siguiente ciclo falla con
  error visible) y escribe `var/` del proyecto anterior, que después se leerá
  como resultado nuevo (A1-02).
- **Risk:** poco probable (ventana de milisegundos), pero sin señal.
- **Expected safe behavior:** no lanzar si el `runId` ya no es el activo.
- **Existing coverage:** ninguna.
- **Regression test:** unit: `saveProject` pendiente → `cancelRun()` →
  resolver `saveProject` → `window.teuton.run` no se llama.
- **Fix concept:** `if (useApp.getState().run.runId !== runId) return` antes de
  `window.teuton.run`.

### A3-05 — Se puede lanzar una pasada nueva mientras la anterior aún guarda notas

- **Severity:** Low
- **File:line:** `src/renderer/src/lib/run.ts:386-391`, `:53`, `:154`
- **Scenario:** justo al terminar una pasada, el profesor pulsa «Ejecutar» o
  «Reevaluar».
- **Execution path:** `exit` pone `done` antes de que termine `loadAfterExit`;
  `startRun` y `reevaluateStudent` solo miran `status === 'running'`, no
  `processingExit`.
- **Current behavior:** las dos cadenas de guardado conviven. Las escrituras en
  main están serializadas por fichero, así que no se corrompe nada, y Teutón
  escribe informes al final, así que la lectura anterior casi siempre termina
  antes. No se ha podido provocar una mezcla real.
- **Risk:** bajo; hardening.
- **Expected safe behavior:** no arrancar hasta que acabe el guardado.
- **Existing coverage:** ninguna.
- **Regression test:** unit: `processingExit` verdadero → `startRun` cede.
- **Fix concept:** tratar `processingExit` como «ocupado» en `startRun`.

---

## Riesgos descartados

- **Dos arranques en el mismo tick:** reserva síncrona en el renderer
  (`run.ts:63-72`) y `reserveDir` antes del `await` en main (`ipc.ts:387`).
  Escena 2 y `ipc-runs.test.ts`.
- **Cancelar y relanzar al instante:** `cancelAndWait` espera al `close`
  (escena 3).
- **Eventos tardíos de un proceso cancelado:** descartados por `runId`.
- **`release()` borrando la entrada de otro proceso:** compara el hijo
  (`ipc.ts:401-404`).
- **Resultados atribuidos a otra clase o proyecto por cambiar de contexto:**
  contexto congelado (`run.ts:381-385`).
- **Monitor activo sin ciclo tras fallo de arranque, error o cancelación:** los
  cuatro caminos llaman a `scheduleNextCycle` (tests de `run.test.ts`).
- **Suspensión del equipo o temporizador perdido:** vigilante con margen de
  60 s (`run.ts:340-345`).
- **Modo examen tras cambiar de proyecto:** `leaveProject` para el monitor y
  `runCycle` comprueba el directorio.
- **Temporizador desbordado:** `intervalMs` acota a 24 h.
- **Reentrar en `startMonitor`:** ignorado si ya está activo.
- **Huérfanos al cerrar, al cerrar sesión o con `check`/`export`:** grupo de
  procesos, `syncChildren` y señales (escenas 4, 17 y 18).
- **Escrituras concurrentes del historial, metadatos, clases y CSV:** cola por
  fichero (`store.ts:64-75`), probado en `store.test.ts`.
- **`exportAs` compitiendo con una pasada:** usa la misma reserva; además no lo
  llama ninguna vista (solo existe en `preload`).
