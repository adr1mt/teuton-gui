# A5 — Persistence & Recovery

Pregunta: ¿puede la persistencia perder, sobrescribir, corromper o mezclar notas,
o restaurar algo incorrecto?

**Respuesta:** la escritura en sí es sólida (temporal + `fsync` + `rename` +
`fsync` del directorio, cola por fichero, solo ENOENT es ausencia). Los fallos
están en la **recuperación**: restaurar puede bajar notas y resucitar notas
borradas de otra clase, y las copias no aparecen si la carpeta se ha movido.

## Método

Lectura completa de `src/main/store.ts`, `src/main/projects.ts` y de los
llamantes (`lib/run.ts`, `Dashboard.tsx`, `ConfigTable.tsx`). Tres
comportamientos se han comprobado con un script desechable que empaqueta
`main/store.ts` con esbuild (`--alias:electron=<stub>`, el método que indica
`CLAUDE.md`) y lo ejecuta sobre directorios del scratchpad:

```
B tras reset {}
B tras restaurar A { Pau: 80 }
copias en la ruta nueva 0
restore { data: { Eva: 40 }, persisted: true }   ← el fichero tenía Eva: 95
```

---

## Findings

### A5-01 — Restaurar una copia devuelve las notas de práctica de otra clase ya reiniciada

- **Severity:** High
- **File:line:** `src/main/store.ts:683`, `src/main/store.ts:577-592`,
  `src/renderer/src/routes/Dashboard.tsx:187`
- **Scenario:** el grupo B hace una pasada de prueba; el profesor pulsa
  «Reiniciar historial» en B. Más tarde, en esa misma hora o con una copia
  anterior, restaura notas para recuperar al grupo A.
- **Execution path:** `restoreRecordBackup(dir, id, 'A')` → `mergeScoped(current,
  backup)` fusiona **todas** las clases de la copia → escribe → la vista
  devuelve solo A.
- **Current behavior:** verificado: B vuelve a tener `{Pau: 80}`. El aviso dice
  «Notas restauradas · N alumnos» contando solo A. Nada indica que B ha
  cambiado.
- **Risk:** la nota de práctica vuelve a ser la nota mínima de Pau en todos los
  CSV de B. Nota incorrecta sin señal para B.
- **Expected safe behavior:** restaurar solo el ámbito de la clase que se está
  viendo (o avisar de qué otras clases cambian).
- **Existing coverage:** `copias-notas.spec.ts` restaura una sola clase.
- **Regression test:** unit en `store.test.ts`: A y B con notas, reiniciar B,
  restaurar para A → `getRecords(dir, 'B')` sigue vacío.
- **Fix concept:** en `restoreRecordBackup`, fusionar solo
  `backup.classes[classScope(classId)]` (y `legacy` si es `manual`).

### A5-02 — Restaurar con el historial sin permisos de lectura baja notas

- **Severity:** High
- **File:line:** `src/main/store.ts:674-686`
- **Scenario:** `.teuton-gui-records.json` sin permiso de lectura para el
  profesor pero con el directorio escribible (p. ej. copiado con `sudo`). Las
  pasadas muestran «No se pudo leer el historial…», y el profesor intenta
  arreglarlo con «Restaurar notas».
- **Execution path:** `readRecords` lanza EACCES → el `catch` lo trata como
  «dañado» y parte de `{}` → `writeAtomic` sustituye el fichero por la copia
  (el `rename` solo necesita permiso en el directorio).
- **Current behavior:** verificado: el fichero tenía `Eva: 95`, la copia
  `Eva: 40`; el resultado es `Eva: 40` con `persisted: true` y el aviso «Notas
  restauradas». La pista de la pantalla dice «nunca baja una nota».
- **Risk:** nota más baja guardada y exportada, con confirmación de éxito.
- **Expected safe behavior:** el atajo «restaurar aunque el historial no se
  pueda interpretar» solo para JSON dañado; un error de lectura (EACCES, EIO)
  detiene la restauración y lo dice.
- **Existing coverage:** ninguna.
- **Regression test:** el del bloque de arriba, en `store.test.ts`.
- **Fix concept:** distinguir en `readRecords` «no se puede leer» de «no se puede
  interpretar» (dos tipos de error) y solo seguir en el segundo.

### A5-03 — `config.yaml` y `start.rb` se guardan sin `fsync`

- **Severity:** Medium
- **File:line:** `src/main/projects.ts:37-64`, `:100-105`
- **Scenario:** el profesor importa la clase (se guarda `config.yaml`) y hay un
  corte de luz o un apagado forzado en los segundos siguientes.
- **Execution path:** `writeFile(temp)` → `rename` sin `sync` del fichero ni del
  directorio. Es exactamente el patrón que `store.ts:110-127` corrigió.
- **Current behavior:** tras el corte, `config.yaml` puede quedar vacío o
  truncado con el bueno ya sustituido. El siguiente arranque abre un YAML roto
  (la tabla se bloquea: visible) o vacío (sin alumnos).
- **Risk:** se pierde la lista de clase del examen (con IPs); la clase queda en
  `classes.json`, así que se puede reimportar, pero las columnas propias del
  examen (servicio, puerto…) se pierden.
- **Expected safe behavior:** mismas garantías que `store.ts`.
- **Existing coverage:** ninguna.
- **Regression test:** unit con espía de `FileHandle.sync` → `saveProject` lo
  llama para los dos ficheros.
- **Fix concept:** reutilizar el `writeAtomic` de `store.ts` (conservando la
  lógica de permisos de proyecto).

### A5-04 — Las copias de seguridad no aparecen si la carpeta del examen se ha movido

- **Severity:** Medium
- **File:line:** `src/main/store.ts:537-543`, `:624-634`
- **Scenario:** el profesor mueve o renombra la carpeta del examen (o la
  recupera en otra ruta) y abre «Restaurar notas».
- **Execution path:** `backupsDir` = nombre + `sha1(ruta)` → la ruta nueva da
  otro hash → `listRecordBackups` devuelve `[]`.
- **Current behavior:** verificado: `copias en la ruta nueva 0`. La pantalla dice
  «Todavía no hay copias de seguridad». Las copias existen en
  `copias-notas/<nombre>-<hash antiguo>/`. `CLAUDE.md` presenta las copias como
  la defensa contra «deleting or moving the exam folder».
- **Risk:** el profesor cree que no hay nada que recuperar.
- **Expected safe behavior:** listar también las copias de otras rutas con el
  mismo nombre de carpeta (el campo `projectDir` ya va dentro de cada copia) o,
  al menos, decir dónde están.
- **Existing coverage:** `copias-notas.spec.ts` restaura en la misma ruta.
- **Regression test:** unit: copia en `/a/proj`, mover a `/b/proj` →
  `listRecordBackups('/b/proj')` la ofrece (marcada con la ruta original).
- **Fix concept:** buscar carpetas `<nombre>-*` y mostrar su `projectDir`.

### A5-05 — Renombrar a un alumno deja su mejor nota fuera del CSV

- **Severity:** Medium
- **File:line:** `src/main/store.ts:458-460`, `src/renderer/src/lib/moodleCsv.ts:31`
- **Scenario:** a mitad de examen el profesor corrige una errata en el nombre de
  un alumno (en Clases o en la tabla) que ya tenía un 90.
- **Execution path:** el historial usa el nombre como clave → la pasada
  siguiente guarda la nota bajo el nombre nuevo → `buildMoodleCsv` busca
  `records[nombre nuevo]`.
- **Current behavior:** el 90 queda guardado bajo el nombre viejo y no cuenta. Si
  el alumno ya había apagado la máquina, el CSV le pone su última nota.
- **Risk:** pérdida silenciosa de la mejor nota tras una corrección inocente.
- **Expected safe behavior:** clave estable (ID de Moodle, que ya es
  obligatorio para exportar) o aviso al renombrar con historial.
- **Existing coverage:** ninguna.
- **Regression test:** unit: récord `{ 'Ana Garcia': 90 }`, resultados con
  `Ana García` y el mismo `moodle_id` → el CSV exporta 9,00.
- **Fix concept:** guardar el récord por `moodleId` cuando existe, o migrar la
  clave al renombrar en la clase.

### A5-06 — Dos ventanas de la app sobre el mismo proyecto se pisan

- **Severity:** Medium
- **File:line:** `src/main/index.ts:121-129` (no hay
  `app.requestSingleInstanceLock`), `src/main/store.ts:64-75`,
  `src/main/ipc.ts:64-69`
- **Scenario:** el profesor abre la app dos veces desde el menú (doble clic) y
  pone el modo examen en marcha en ambas, o corrige en una mientras la otra
  sigue en modo examen.
- **Execution path:** `serialized` y `busyDirs` viven en memoria de cada proceso
  → dos `teuton run` sobre el mismo `var/` y dos lectura-fusión-escritura
  independientes del historial.
- **Current behavior:** vuelve la escritura entrelazada de informes que motivó el
  rescate de `results.ts`, y una instancia puede escribir el historial leído
  antes de la escritura de la otra (se pierde la nota más alta de ese ciclo).
- **Risk:** notas perdidas o informes corruptos sin aviso.
- **Expected safe behavior:** una sola instancia (enfocar la ventana existente).
- **Existing coverage:** ninguna.
- **Regression test:** e2e: lanzar dos veces la app con el mismo `userData` → la
  segunda sale y la primera recibe el foco.
- **Fix concept:** `app.requestSingleInstanceLock()` + `second-instance`.

### A5-07 — Una copia de la hora actual ilegible se sobrescribe sin fusionar

- **Severity:** Low
- **File:line:** `src/main/store.ts:613-616`
- **Scenario:** la copia de esta hora está dañada o tiene una nota imposible
  (`sanitizeScoped` lanza).
- **Execution path:** `readBackup(...).catch(() => null)` → se escribe solo el
  historial actual.
- **Current behavior:** si el historial actual acaba de reiniciarse, la copia de
  la hora pierde lo que se pudiera salvar de ella.
- **Risk:** bajo (la copia de la hora anterior sigue ahí).
- **Expected safe behavior:** apartar la copia ilegible (`.corrupta`) antes de
  escribir.
- **Existing coverage:** ninguna.
- **Regression test:** unit: copia de la hora truncada → tras `updateRecords`
  existe la versión apartada.
- **Fix concept:** renombrar en lugar de sobrescribir.

### A5-08 — Un historial con JSON válido pero forma inesperada cuenta como vacío

- **Severity:** Low
- **File:line:** `src/main/store.ts:385`, `:388-399`, `:415`
- **Scenario:** `.teuton-gui-records.json` vacío, `[]`, `null`, o v2 con una
  clase cuyo valor no es un objeto de números.
- **Current behavior:** vacío/array/primitivo → `null` («sin historial») y la
  siguiente escritura lo reemplaza sin aviso. En v2, los valores de cada clase
  no pasan por `validatedRecords` (sí en las copias), así que una nota en texto
  llega a `Math.max`/comparaciones.
- **Risk:** bajo; solo con edición externa.
- **Expected safe behavior:** forma inesperada = «dañado» (error, sin escribir).
- **Existing coverage:** `store.test.ts` «no reescribe el historial si no se
  puede leer» cubre JSON inválido, no JSON válido con otra forma.
- **Regression test:** unit con `[]` y con `{"version":2,"classes":{"class:A":{"Ana":"90"}}}`.
- **Fix concept:** aplicar `sanitizeScoped` también en `readRecords`.

### A5-09 — Renombrar una clase deja el CSV antiguo junto al nuevo

- **Severity:** Low
- **File:line:** `src/main/store.ts:755-764`
- **Scenario:** el profesor renombra «1SMX-A» a «1SMX A mañana» y sigue
  corrigiendo.
- **Current behavior:** se crea `moodle-1SMX_A_mañana-<id8>.csv`; el
  `moodle-1SMX-A-<id8>.csv` queda con notas congeladas. Solo se borra la
  variante sin sufijo.
- **Risk:** subir a Moodle el fichero desactualizado.
- **Expected safe behavior:** un solo CSV por `classId`.
- **Existing coverage:** ninguna.
- **Regression test:** unit: dos escrituras con el mismo `classId` y nombres
  distintos → un solo `moodle-*-<id8>.csv`.
- **Fix concept:** borrar `moodle-*-<id8>.csv` distintos del actual.

---

## Riesgos descartados

- **Escritura a medias del historial, metadatos, clases o ajustes:**
  `writeAtomic` con `fsync` del temporal y del directorio (`store.ts:92-132`).
- **Temporal que sobrevive a un fallo:** se borra en el `catch`.
- **Dos escrituras simultáneas dentro de la app:** `serialized` por fichero
  (`store.test.ts` «dos actualizaciones a la vez»).
- **Historial ilegible sustituido por la pasada actual:** `updateRecords` no
  escribe (`store.ts:441-452`) — pero ver A1-05 para el CSV.
- **`classes.json` ilegible vaciado:** error (test existente).
- **Mezcla del formato v1 con clases importadas:** `legacy` solo alimenta
  `manual`.
- **Merge por máximo:** `updateRecords`, `mergeScoped` y `mergeTrimmedKeys`
  nunca bajan una nota dentro de un mismo ámbito legible.
- **Reinicio que borra también la copia:** `resetRecords` no escribe copia y la
  siguiente escritura de la hora fusiona con la existente.
- **Copias que crecen sin límite:** 48 por proyecto, unos KB cada una.
- **Restaurar una copia con notas imposibles:** `sanitizeScoped` la rechaza.
- **Permisos del CSV:** 0600 por defecto y se conserva un modo cambiado a mano.
- **Colisión de sufijo `<id8>`:** los ids de clase son UUID aleatorios.
