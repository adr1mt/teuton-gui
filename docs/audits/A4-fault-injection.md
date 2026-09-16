# A4 — Fault Injection / Adversarial Testing Gaps

Pregunta: ¿qué modos de fallo importantes todavía NO estamos simulando?

**Respuesta:** la UAT ataca bien el **proceso** (colgarse, morir, solaparse,
cerrar la app) y la **forma** de los informes (basura final, notas imposibles).
Casi no ataca la **procedencia** de los informes (¿son de esta pasada?) ni el
**disco** (lleno, sin permisos, solo lectura, `rename`/`fsync` fallando). Y el
teuton falso no imita el formato real de `--case`, que es justo donde está el
fallo crítico A1-01.

## Inventario actual

| Capa | Qué hay | Qué ataca |
|---|---|---|
| `scripts/fake-teuton.mjs` | modos `ok`, `slow`, `hang`, `crash`, `noresume`, `truncate`, `huge`, `notargets`, `badgrades`, `offline` | proceso y forma de informes |
| `tests/e2e/*.spec.ts` (25) | arranque, doble arranque, cancelar/relanzar, cierre, huérfanos, YAML roto, notas imposibles, informe con basura, nombres hostiles, CSP, IPC, modo examen, copias, preflight, máquina apagada, proyector | sobre la app real |
| `tests/results.test.ts` | informe normal, basura final, llaves en cadenas, caso ilegible, huérfanos, `var/` más reciente, sin `var/`, formas raras, 300 alumnos, array, nota imposible | parser |
| `tests/store.test.ts` | escritura sin directorio, v1→v2, metadatos, historial ilegible, espacios, dos escrituras, `classes.json` sin permisos, 300 alumnos | persistencia (con `vi.mock('electron')`) |
| `tests/run.test.ts` | `runId`, monitor tras error, cesión de turno, vigilante, keepAwake, `leaveProject` | ciclo de vida del renderer |
| `tests/ipc-runs.test.ts` | reserva, liberación, runId repetido, fallo al lanzar, cancelar y esperar, IPC confinado, salida | ciclo de vida en main |

## Discrepancias del teuton falso con Teutón 2.10.6

Comprobadas leyendo la gema instalada y ejecutándola (ver A1):

1. **`--case`**: el real deja en `resume.json` todas las filas, las no elegidas
   con `id: "-"`, `members: "-"`, `skip: true`, `grade: 0.0`. El falso solo
   escribe el caso elegido. → oculta A1-01.
2. **Orden de escritura**: el real escribe los casos en hilos y el resumen al
   final, y nunca borra `var/`. El falso escribe cada caso en el bucle; su modo
   `crash` sale antes del resumen, pero la UAT lo usa sobre un proyecto sin
   informes previos. → oculta A1-02.
3. **Salidas sin informes con código 0** (script sin `play`) y **código 1 sin
   tocar `var/`** (error de sintaxis): no existen en el falso.
4. **`config.yaml` sin casos**: el real escribe `resume.json` con `cases: []`;
   el falso no tiene modo para ello. → oculta A1-03.
5. **`tt_testname` / `tt_outdir`**: el falso siempre escribe en
   `var/<carpeta>`. → oculta A1-04.

## Gaps y tests propuestos

Ordenados por riesgo. «Hoy» indica qué hace el código según A1–A3 y A5.

| # | Modo de fallo | Cubierto hoy | Hoy | Test propuesto |
|---|---|---|---|---|
| G1 | **`--case` con el formato real** | No | CSV de la clase con 1 alumno; filas «-» en KPI (A1-01) | `fake-teuton`: con `--case` escribir las filas `skip` como el real. **E2E** `reevaluar-csv.spec.ts`: correr la clase, reevaluar a uno, leer `informes/moodle-*.csv` → 4 filas; el panel no muestra filas «-». **Unit** `results.test.ts` con un `resume.json` real capturado de `--case=2`. |
| G2 | **Exit ≠ 0 dejando informes antiguos válidos** (otra clase) | No | Récords y CSV de la clase nueva con alumnos de la anterior (A1-02) | **E2E**: correr grupo A (`ok`), importar B con un alumno homónimo, correr en `crash` → historial de B sin cambios, ningún `moodle-B*.csv`, error visible. |
| G3 | **Exit 0 sin informes** | No | Igual que G2, sin siquiera «Error en la ejecución» | Nuevo modo `noreports` (sale 0 tras «Finished», sin escribir). E2E como G2. |
| G4 | **Resume nuevo con `cases: []` + cases antiguos** | No | Alumnos antiguos al historial (A1-03) | **Unit** `results.test.ts`: `resume.json` `{cases: []}` + tres `case-NN.json` → `cases` vacío. Modo `emptyresume` en el falso para E2E. |
| G5 | **Cases nuevos + resume antiguo** (muerte entre ambos) | Parcial (`noresume`, sin informes previos) | Lista y matriz con notas distintas (A1-02 b) | Modo `staleresume`: reescribe casos con otra nota y no toca el `resume.json` previo. **E2E**: la nota de la lista y la de la matriz del mismo alumno no pueden discrepar sin aviso. |
| G6 | **`tt_testname` / `tt_outdir` propios** con `var/<carpeta>` viejo | No | Panel congelado en la pasada vieja (A1-04) | **Unit** `results.test.ts`: `var/proj` antiguo + `var/examen2` nuevo → `loadResults(dir, 'proj')` no devuelve el antiguo sin aviso. Falso: respetar `tt_testname`. |
| G7 | **`teuton` colgado con el modo examen activo** | Parcial (escena 4 solo cierra la app) | El modo examen no vuelve a corregir (A3-01) | **Unit** `run.test.ts`: `running` desde hace más del umbral → el vigilante cancela y reprograma. **E2E** modo `hang`, intervalo 1 min → aviso y segundo ciclo. |
| G8 | **Historial ilegible (EACCES) durante una pasada** | Parcial (`store.test.ts` no reescribe el historial) | CSV reescrito con la última pasada (A1-05) | **Unit** de `loadAfterExit` con `window.teuton` simulado: `updateRecords` → `persisted:false` → `writeClassCsv` no se llama. **E2E**: `chmod 000` al historial tras un ciclo → CSV intacto. |
| G9 | **`.teuton-gui-meta.json` no escribible** | No | Ninguna nota se guarda en todo el examen (A2-01) | **E2E**: `chmod 444` al meta → tras un ciclo, el historial sí tiene las notas. |
| G10 | **ENOSPC** (disco lleno) en historial, CSV y proyecto | No (manual en `UAT.md`) | `persisted:false` visible en historial; CSV avisa; copia de seguridad silenciosa (A2-02) | **Unit** `store.test.ts` con `vi.spyOn(fs, 'open')` / `handle.writeFile` que rechaza `ENOSPC` → `persisted:false`, fichero anterior intacto, sin `.tmp` sobrante. |
| G11 | **`rename` falla** | No | `writeAtomic` borra el temporal y lanza | **Unit**: `fs.rename` rechaza `EXDEV`/`EACCES` → original intacto, sin `.tmp`. |
| G12 | **`fsync` falla** (`handle.sync` rechaza `EIO`) | No | Lanza y no renombra (correcto) | **Unit**: `sync` rechaza → no hay `rename`, original intacto. |
| G13 | **Filesystem de solo lectura** (proyecto en un montaje `ro`) | No | Guardar borradores falla → pasada abortada (visible) | **Unit** con `EROFS` simulado en `saveProject` y en `updateRecords`. **Manual**: imagen loop montada `ro`. |
| G14 | **Copia de seguridad que falla** | No | Solo `console.error` (A2-02) | **Unit**: `copias-notas` es un fichero → `updateRecords` devuelve un aviso de copia. |
| G15 | **Copia de la hora actual dañada** | No | Se sobrescribe sin fusionar (A5-07) | **Unit**: escribir `YYYY-MM-DD-HH.json` truncado → `updateRecords` → la copia no pierde las notas que se puedan recuperar, o se conserva aparte. |
| G16 | **Restaurar tras reiniciar otra clase** | No | Vuelven las notas de práctica de la otra clase (A5-01) | **Unit**: A y B con notas, reiniciar B, restaurar para A → B sigue vacío. |
| G17 | **Restaurar con historial sin permisos** (no dañado) | No | Se sustituye por la copia; notas más nuevas perdidas (A5-02) | **Unit**: historial con nota 90 y `chmod 000`, copia con 40 → restaurar no deja 40. |
| G18 | **Corrupción selectiva de un solo alumno** | Sí (escena 10, `results.test.ts`) | Aviso y alumno visible | Ampliar: comprobar además que el CSV automático no exporta `0/0 objetivos` sin marca (A2-06). |
| G19 | **Informes modificándose mientras se leen** | No | Lectura de un `case-NN.json` truncado → aviso | **Unit**: `fs.readFile` devuelve medio JSON para un caso → aviso y alumno presente. **E2E**: modo `slowwrite` que escribe en dos tiempos. |
| G20 | **Directorio `var/<test>` que desaparece durante la lectura** | No | `readdir`/`readFile` lanzan → error visible | **Unit**: `findOutputDir` encuentra el directorio y `readdir` da `ENOENT` → error legible, sin récords. |
| G21 | **Cierre durante una escritura** | Parcial (escena 17/18, sin comprobar datos) | Atómico: pierde el último ciclo (A3-03) | **E2E**: SIGTERM justo tras `exit` con `slow` en el guardado (retardo inyectado) → historial válido JSON y ≥ al anterior. |
| G22 | **Dos procesos de la app sobre el mismo proyecto** | No | Colas por proceso, no entre procesos; nada lo impide (A5-06) | **E2E**: lanzar la app dos veces → la segunda cede el foco a la primera. | |
| G23 | **Datos antiguos tras un crash de la app** | No | Al reabrir, «Cargar últimos resultados» usa `lastRunClassId` antiguo (A1-08) | **Unit**: meta con clase A, `var/` con pasada de B más nueva → la recarga no escribe en A. |
| G24 | **Escala de notas inválida** | No | 70/10 en silencio (A2-04) | **Unit** `getGrading` con `passScore: 62.5`. |
| G25 | **Nota ausente o texto en `resume.json`** | No (solo números imposibles) | 0 legítimo (A1-06) | **Unit** `results.test.ts`: `grade: null`, `"N/A"`, ausente → aviso. |
| G26 | **Cancelación que no mata** | No | Renderer en `idle`, main bloqueado (A3-02) | **Unit** `ipc-runs.test.ts` con hijo que ignora señales + `run.test.ts` que no anula `runId` si `cancelRun` rechaza. |
| G27 | **Cancelar durante el guardado de borradores** | No | Pasada sin dueño (A3-04) | **Unit** `run.test.ts` con `saveProject` diferido. |
| G28 | **Cerrar la ventana entre ciclos del modo examen** | No | Cierra sin preguntar (A3-03) | **E2E** en `cierre.spec.ts`. |
| G29 | **Corte de luz tras guardar `config.yaml`** | No | `projects.ts` no hace `fsync` (A5-03) | **Unit** con espía de `FileHandle.sync`: `saveProject` sincroniza los dos ficheros. El corte real no se automatiza. |

## Recomendación de infraestructura (sin implementar)

1. **Capturar informes reales como fixtures**: guardar en `tests/fixtures/` el
   `var/` de Teutón 2.10.6 para: pasada completa, `--case=2`, config sin casos.
   Así los tests del parser dejan de depender de lo que el teuton falso cree que
   hace Teutón.
2. **Modos nuevos en `fake-teuton.mjs`**: `noreports`, `emptyresume`,
   `staleresume`, `slowwrite`, y `--case` con filas `skip` en todos los modos.
3. **Arnés de `loadAfterExit`**: `run.test.ts` ya simula `window.teuton`; basta
   con exportar un punto de entrada (o probarlo vía `handleRunEvent`) para
   cubrir G2, G3, G8 y G9 sin Electron.
4. **Inyección de errores de disco**: `vi.spyOn` sobre `fs.promises` en
   `store.test.ts` (ya mockea `electron`) para G10–G15.
