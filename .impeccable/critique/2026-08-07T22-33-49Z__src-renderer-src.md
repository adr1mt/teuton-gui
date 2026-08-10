---
target: toda la aplicación
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-07T22-33-49Z
slug: src-renderer-src
---
Method: dual-agent (A: revisión de diseño · B: detector + capturas reales en Electron) · Mode: Operate (Ayuda = Read)

## Design Health Score — 26/40 (Aceptable)

| # | Heurística | Score | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | `MonitorBanner` solo se monta en `Dashboard.tsx:176,261`. Sales a Editor/Analíticas a mitad de examen y desaparece todo rastro del modo examen. |
| 2 | Sistema / mundo real | 3 | `Run.tsx:112` titula "Casos a ejecutar" y cada fila muestra un alumno. El profe selecciona personas; la app habla de casos. |
| 3 | Control y libertad | 2 | `Classes.tsx:82` borra una clase entera detrás de `window.confirm` (prohibido en DESIGN.md), sin contar alumnos y sin deshacer. `window.prompt` en `Classes.tsx:119`, `ConfigTable.tsx:85,94`. |
| 4 | Consistencia y estándares | 2 | El par prohibido `bg-X/10` + `text-X` sigue en 9 archivos **y en el propio `Badge`** (`ui/index.tsx:77-79`), del que hereda toda la app. Dos specs distintos de cabecera de vista (Analíticas y=69 con icono; Resultados/Ejecutar y=59 sin él). |
| 5 | Prevención de errores | 3 | Buenas guardas (`run.ts:44`, `Dashboard.tsx:124`), pero `Monitor.tsx:56` llama `startMonitor` sin condición: pulsado con un run activo mata el bucle y deja `monitor.active = true`. |
| 6 | Reconocer antes que recordar | 3 | `GradeCell` arregló el problema de la nota. Queda: `Run.tsx` no dice a qué clase pertenece la lista de casos, y la selección se pierde al navegar. |
| 7 | Flexibilidad y eficiencia | 2 | Un solo atajo en toda la app (`Editor.tsx:44`, Ctrl+S). Ninguna tecla arranca/para el modo examen. Orden, filtro, modo y casos seleccionados son estado local y se borran al cambiar de vista. |
| 8 | Estética y minimalismo | 2 | Evidencia visual: 3 azules llenos en Ejecutar; matriz que trunca "CLIENT: Comprobar dominio de bús…" con 750px de tarjeta vacía al lado; Inicio, Resultados y Ajustes con 40% de lienzo muerto; franja de crédito permanente (`App.tsx:166`) en la pantalla proyectada. |
| 9 | Recuperación de errores | 3 | `WarningsBanner` (`Dashboard.tsx:383`) es ejemplar, pero vuelca cadenas crudas del parser sin ninguna acción de recuperación. |
| 10 | Ayuda y documentación | 3 | `Help.tsx` son 13 secciones reales. Pero ninguna vista enlaza a su sección, y el índice se esconde por debajo de `lg:` (`Help.tsx:53`). |
| **Total** | | **26/40** | **Aceptable** |

## Design Specificity Verdict

**LLM assessment.** La app se parte en dos. Lo autorizado por el producto está en el Dashboard y en el dominio: `buildMatrix(rows: StudentRow[])` (`analytics.ts:206`) codifica la Regla del Alumno Presente en la firma del tipo, no en un comentario; `GradeCell` (`Dashboard.tsx:577-614`) enseña operandos y resultado de `bestScore` y llama a la misma función que `moodleCsv.ts:25`, así que pantalla y fichero no pueden divergir; `staleResults` (`:85-91`) y el filtro "Requieren atención" (`:291-299`) cierran dos P0/P1 de la crítica anterior.

Lo genérico está justo donde vive la escena crítica. **`Run.tsx` es la vista más floja de la app y es el puesto de mando.** El control más consecuente del producto — arrancar un bucle de dos horas contra 30 máquinas — es una tarjeta metida en un raíl de 288px entre un párrafo y una lista de checkboxes (`Run.tsx:128`), mientras la consola CLI, que nadie lee de un vistazo, ocupa el 70% del viewport pintada con `bg-[#0b0f19]` literal. `Analytics.tsx` es un muestrario de Recharts: cuatro tiles, tres barras, una nube de chips, sin argumento sobre qué importa. `Home.tsx:171` anima `group-hover:scale-105` y `:116,166` elevan tarjetas al hover: dos Don'ts explícitos de DESIGN.md, reflejo SaaS por encima del sistema comprometido.

**Deterministic scan.** `detect.mjs --json src/renderer/src` → exit 2, **15 hallazgos**, 2 reglas: `design-system-font-size` ×14, `overused-font` ×1.
- **Falsos positivos (6):** `globals.css:92` (Inter — DESIGN.md se compromete a fuentes de sistema sin empaquetar, a propósito), y `Dashboard.tsx:765,773,780,790,845` + `Run.tsx:146` (glifos dentro de celdas de 20px y checkboxes de 16px; el tamaño lo dicta un spec documentado).
- **Reales (8):** `App.tsx:101,144,167` (10-11px), `ConfigTable.tsx:195` (10px), `StudentDetail.tsx:67` y `Dashboard.tsx:602` (0.6875rem), `Dashboard.tsx:735` (0.625rem), `Run.tsx:182` (13px, escalón inventado entre mono 12 y body 14). Tres escalones tipográficos por debajo del `label` documentado, varios en la superficie proyectada.
- **Lo que el detector no cubre y sí existe:** el par tinte+color puro en `App.tsx:189,198`, `Dashboard.tsx:263`, `Analytics.tsx:284`, `Run.tsx:90,200,201`, `ConfigTable.tsx:153`, `Home.tsx:88`, `Settings.tsx:113,128` y en las variantes de `Badge`.

**Evidencia visual.** No hay overlay en navegador: es un renderer de Electron y sin el bridge `window.teuton` no arranca en una URL servible. En su lugar se capturó la app real bajo `DISPLAY=:1` con una copia adaptada de `scripts/screenshot.ts` (el fichero del repo no se tocó): las 8 vistas en claro y oscuro, más matriz y detalle, en el scratchpad de la sesión.

## Overall Impression

El dominio está mejor diseñado que la interfaz. Las reglas duras del producto — la nota sale del CLI, ningún alumno desaparece, el récord manda en el CSV — están implementadas con criterio y, en dos casos, blindadas por el sistema de tipos. Lo que falla es todo lo que rodea a la escena crítica: el modo examen no tiene estado visible, puede suicidarse en silencio, y desaparece en cuanto sales del Dashboard. La mayor oportunidad: **convertir el modo examen en un estado de la aplicación, no en un control dentro de una pestaña.**

## What's Working

1. **La celda `?` es una decisión de diseño escrita en una firma de tipo.** `buildMatrix(rows: StudentRow[])` — no `(results)`. Como las columnas derivan del mismo array que alimenta la lista, un `case-NN.json` corrupto no puede producir un alumno presente en la lista y ausente en la matriz. Ningún autor futuro puede romper el Principio 2 filtrando la colección equivocada.
2. **`GradeCell` enseña los operandos y el resultado de una regla invisible.** Nota de la última pasada grande, récord debajo, `Trophy` + "se guarda" cuando gana el récord. El profe que ve un 0.00 de alguien que acabó y apagó no tiene que recordar la regla ni calcular el `max()`.
3. **Ningún indicador de color va sin glifo.** `MatrixCellView` emite `OK` / cifra / `✕` / `?`, nunca un cuadro de color; la leyenda muestra el glifo. Una decisión que resuelve tres problemas a la vez: proyector lavado, daltonismo y lector de pantalla (vía `sr-only`).

## Priority Issues

### [P0] El modo examen no tiene estado, y puede matarse solo
**Qué.** `Monitor.tsx:13-60` se renderiza idéntico esté corriendo o no: el botón siempre dice "Iniciar modo examen" y no hay control de parada. Pulsarlo durante un examen llama a `startMonitor` (`run.ts:185`), que limpia el timer, resetea `cycles: 0` y llama a `startRun`. Si hay un ciclo en vuelo, `startRun` retorna en `run.ts:44` y **nunca se llama a `scheduleNextCycle`**: `monitor.active` sigue `true`, `nextRunAt` sigue `null`, y `MonitorBanner` muestra "Próxima evaluación en 0:00" para siempre mientras no corre nada.
**Por qué importa.** Minuto 40 de un examen de dos horas, vuelves al portátil, aterrizas en Ejecutar, lees "Iniciar modo examen" y — razonablemente — lo pulsas porque no sabes si sigue vivo. El bucle muere. El dashboard proyectado se congela con notas de hace 40 minutos y **sigue diciendo que está en directo**. Te enteras al exportar. Es el único fallo que rompe el criterio de éxito del producto.
**Fix.** (a) `Monitor.tsx` bifurca por `monitor.active`: activo → ciclos, cuenta atrás y botón `destructive` de parada, presets `disabled`; nunca "Iniciar" estando activo. (b) `run.ts:185` `startMonitor` guarda `if (useApp.getState().monitor.active) return`. (c) `run.ts:44` — el retorno temprano debe llamar a `scheduleNextCycle(dir)` cuando `monitor.active`, igual que las ramas de `:53` y `:81`. La invariante "monitor.active ⇒ hay ciclo programado" tiene exactamente esta fuga.
**Suggested command:** `/impeccable harden`

### [P0] El estado del examen no existe fuera del Dashboard
**Qué.** `MonitorBanner` se monta solo en `Dashboard.tsx:176,261`. `App.tsx:107-138` muestra un `Loader2` en el ítem "Ejecutar" y nada más: ni indicador de examen, ni ciclo, ni cuenta atrás, ni parada.
**Por qué importa.** PRODUCT.md: *"se mueve por el aula y vuelve al portátil"*. Vuelves a un portátil que puede estar en Editor, Clases o Analíticas — todas a un clic, todas borran cualquier rastro de que hay un examen corriendo. DESIGN.md ya legisla la respuesta (la Regla del Marco Fijo): el sidebar es lo que sigue ahí. No lleva el único estado que importa.
**Fix.** Bloque persistente de examen en el pie del sidebar (`App.tsx`, encima de `<TeutonBadge />` en `:152`) cuando `monitor.active`: punto pulsante + "Modo examen · ciclo N" + cuenta atrás `mm:ss` tabular + botón de parada. Extraer la cuenta atrás atrapada en `Monitor.tsx:69-79` a un `useMonitorCountdown()`; `MonitorBanner` se reduce entonces a la barra de progreso.
**Suggested command:** `/impeccable harden`

### [P1] El fallo de contraste que motivó los tokens `-strong` sigue en 9 archivos y en el `Badge`
**Qué.** `ui/index.tsx:75-79` define las cuatro variantes de `Badge` como `bg-X/15 text-X`: **toda la app hereda el fallo**. Instancias literales en `App.tsx:189,198` (el chip de Teutón, siempre visible), `Run.tsx:90,200,201`, `Dashboard.tsx:263,321`, `Analytics.tsx:284`, `ConfigTable.tsx:153`, `Home.tsx:88`, `Settings.tsx:113,128`. Aparte: `Analytics.tsx:91` pone `text-warning` (`38 92% 50%`) en una cifra de 30px bold sobre tarjeta blanca — ~1.9:1, por debajo incluso del suelo de 3:1 para texto grande, y es justamente el número de "requieren atención".
**Por qué importa.** Verificado en las capturas: "Teutón detectado" en Ajustes y "Revisar conexión (1)" en Analíticas se ven lavados en pantalla, antes de pasar por un proyector. La mitad de estos se proyectan durante el examen. Los tokens existen y solo están cableados en `grading.ts:45` y el Dashboard.
**Fix.** `ui/index.tsx:70-85` → `text-success-strong` / `text-warning-strong` / `text-destructive-strong`. Barrer luego las instancias literales de la lista. Mecánico, cierra ~15 hallazgos de golpe.
**Suggested command:** `/impeccable audit`

### [P1] `window.confirm` / `window.prompt` crean y destruyen datos de alumnos en tres archivos
**Qué.** `Classes.tsx:82` borra una clase entera — nombres, IDs de Moodle, IPs, campos por alumno — con "¿Eliminar esta clase?" y sin contar alumnos. `Classes.tsx:119` y `ConfigTable.tsx:85,94` usan `window.prompt` para nombrar campos.
**Por qué importa.** DESIGN.md lo prohíbe explícitamente: salen sin estilo, en el idioma del sistema, y se descartan por reflejo. La app ya trae el componente correcto: `ConfirmDialog` (`ui/index.tsx:163`) enfoca Cancelar, atrapa Escape, y el diálogo de reset del Dashboard demuestra el patrón de copy (ámbito + recuento + irreversibilidad). Una lista de clase vale **más** que el fichero de récords y tiene la guarda más débil.
**Fix.** `ConfirmDialog` destructivo en `Classes.tsx` con "Se eliminará «{nombre}» y sus {n} alumnos. No se puede deshacer." Para los dos `window.prompt`, reutilizar el popover en línea que ya existe al lado (`ConfigTable.tsx:236-253`, `Classes.tsx:274-291`).
**Suggested command:** `/impeccable harden`

### [P1] La composición contradice la escena: se trunca texto con 750px vacíos al lado
**Qué.** Evidencia de las capturas. **Matriz**: la tarjeta mide ~1110px, el contenido ocupa ~340px, y aun así "CLIENT: Comprobar dominio de bús…" se corta con elipsis; 15 glifos rojos idénticos se apilan en una barra vertical indiferenciada sin cebreado de filas. **Ejecutar**: tres azules llenos a la vez (Ejecutar test, Iniciar modo examen, y el chip "5 min" seleccionado) contra la regla del único azul; el control segmentado de intervalos desborda la columna izquierda y genera scroll horizontal, con un cuarto chip recortado. **Inicio / Resultados / Ajustes**: 40% del lienzo muerto (Ajustes es una columna de 675px dentro de 1160, con la barra de scroll a x≈1197, dentro del contenido). **Clases**: dos botones "Nueva clase" simultáneos y el panel derecho muestra el estado vacío de "no hay clases" mientras la lista tiene 13; "1 alumnos". **Títulos**: las vistas de operación titulan a `text-lg` mientras Inicio/Ajustes/Ayuda usan `text-3xl` — el escalón display se le da a las vistas tranquilas y se le niega a la ruidosa.
**Por qué importa.** Principio 3: se lee a tres metros o no sirve. Ahora mismo lo único dimensionado para tres metros son tres cifras, y la más útil — quién está caído — es un recuento, no una lista de nombres.
**Fix.** `/impeccable layout` sobre `Run.tsx`, `Dashboard.tsx` (matriz), `Classes.tsx` y `Settings.tsx`: una sola acción azul por pantalla, el ancho de la tarjeta al servicio de la columna que se trunca, un único spec de cabecera de vista, y consola colapsada por defecto en Ejecutar.
**Suggested command:** `/impeccable layout`

## Persona Red Flags

**Alex (usuario experto).** Un solo atajo en toda la app (`Editor.tsx:44`). Ninguna tecla arranca/para el modo examen ni salta a Resultados ni alterna Lista/Matriz. Todo el estado de vista es local y se evapora al navegar: `sort` (`Dashboard.tsx:422`), `filter`/`mode`/`attentionOnly` (`:63-65`), casos seleccionados (`Run.tsx:15`), `pane`/`configMode` (`Editor.tsx:25-26`). Vuelve a marcar los mismos 6 casos cada vez que sale de Ejecutar. El orden tri-estado (`:432-440`, tercer clic = orden natural) es indescubrible: el tooltip solo dice "Ordenar por X". `Home.tsx:128` "Quitar de recientes" es `opacity-0` sin `focus-visible` — invisible al teclado (el equivalente del Dashboard, `:553`, sí lo hace bien).

**Sam (accesibilidad / teclado / contraste / proyector).** El primitivo `Badge` falla contraste en sus cuatro variantes; `Analytics.tsx:91` pinta un KPI de 30px a ~1.9:1. Los toggles de caso (`Run.tsx:135-156`) son `<button>` con un `✓` dibujado a mano: sin `aria-pressed`, sin `role="checkbox"`, se anuncian como botón sin etiqueta. `Home.tsx:159` `ActionCard` y `Editor.tsx:183` `TabBtn` **no tienen anillo de foco**, y `TabBtn` tampoco `aria-pressed` (el casi idéntico `ModeBtn`, `Dashboard.tsx:868`, sí: mismo patrón, dos implementaciones, una accesible). `ConfigTable.tsx:290` y `Classes.tsx:302-326` son `<input>` pelados con `outline-none`, sin `<label>` y sin foco visible — una rejilla de 30×7 campos sin etiquetar. Glifos de matriz a 10px y la línea de récord a 11px están por debajo de lo que resuelve un proyector a 3 metros. El tema por defecto es `'dark'` (`stores/app.ts:98`), la peor opción con una lámpara lavada.

**Riley (estrés).** *40 alumnos*: la matriz renderiza `targets × 40` celdas sin virtualizar dentro de `max-h-[70vh]` (`Dashboard.tsx:656`) y repinta la rejilla entera en cada ciclo. *Nombres largos*: la cabecera trunca a `max-w-[90px]` (`:684`); la celda de nombre de la lista (`:521`) no trunca en absoluto, así que un nombre largo empuja la nota fuera de pantalla. *`tt_members` duplicados*: sigue sin arreglar desde la crítica anterior — `records[r.members]` (`:540`), `records[s.members]` (`:722`) y `moodleCsv.ts:25` indexan por nombre visible, así que dos alumnos homónimos comparten récord y fila de CSV. *Casos `tt_skip`*: cuentan en "N alumnos" (`:199`) y en `kpis.count`, pero `moodleCsv.ts:22` los salta — el recuento del recibo de exportación puede superar las filas del CSV sin explicación. *Cabecera de `Run.tsx:64`*: sin `flex-wrap` (el Dashboard ya lo tiene), un nombre de clase largo expulsa los botones.

**"El profesor a mitad de examen" (derivado de PRODUCT.md).** Está a tres metros con un alumno y necesita un segundo. Lo que ve: una franja de 32px acreditándose a sí mismo (`App.tsx:166`), tres cifras de 30px y una tabla de 14px. **Nada está dimensionado para tres metros salvo tres números, y el más útil es un recuento, no nombres.** La vista que quiere existe: `Analytics.tsx:102-153`, la tabla de atención prioritaria con nombres, notas y motivo — en la pestaña que nunca tiene abierta durante el examen.

## Minor Observations

- `Dashboard.tsx:35` importa `passColor` sin usarlo; `grading.ts:36` es código muerto.
- Claves i18n muertas: `dashboard.record`, `onlyFailing`, `maxGrade`, `minGrade`, `state`, `target`, `grade`, `export`, `confirmResetRecords`, `home.openFolder`.
- ~30 literales en español se saltan `i18n/es.ts` (`Home`, `Classes`, `ConfigTable`, `Settings`, `App`, `Run`, `Editor`): funcionalmente inocuo en una app monolingüe, pero la capa de strings ya no es el sitio donde revisar el copy.
- `Run.tsx:161` usa `bg-[#0b0f19]`, `text-slate-200`, `border-white/10`: cuatro colores literales donde tocaría un token `--console`.
- `ConfigTable.tsx:143` y `Classes.tsx:273` reimplementan a mano el backdrop de sus dropdowns mientras `ui/index.tsx:239` `Menu` ya resuelve clic-fuera y Escape. Tres implementaciones de un comportamiento.
- `Analytics.tsx:105` usa un icono `WifiOff` para una tarjeta que va sobre todo de notas suspensas, no de conectividad. Su gráfico de barras horizontales acolcha el dominio x y deja media tarjeta vacía.
- `Settings.tsx:306` duplica el toggle de tema del sidebar con otra forma de control; la página no tiene ninguna acción primaria.
- `Help.tsx` usa `leading-relaxed` y `h2` a 20px: se lee más suelto y más grande que el resto de la app, y usa azul para enlaces, numerales y el icono del callout a la vez, diluyendo la reserva "azul = sistema".
- `Dashboard.tsx:120` el recibo de exportación se autodescarta a los 6s y no nombra la clase — la única confirmación de que se escribió un fichero de notas.
- Editor: la superficie de código va a sangre, sin el margen de página de 32px del resto de vistas.

## Questions to Consider

1. **Si la pantalla proyectada solo pudiera mostrar una cosa, ¿sería un número o una lista de nombres?** `studentsNeedingAttention` ya calcula la respuesta y se muestra como recuento en un tile y como tabla en la pestaña que nunca está abierta.
2. **¿Por qué el modo examen es un control dentro de una pestaña y no un modo de la aplicación entera?** Si fuera estado de app — sidebar transformado, banner en el marco fijo, Editor con guarda — el bug P0 del bucle muerto sería arquitectónicamente imposible.
3. **La app conoce cuatro identidades de clase (`activeClass`, `run.classId`, `meta.lastRunClassId`, el sufijo del CSV) y te enseña un chip de 12px.** ¿Y si la clase fuera el marco en vez de una etiqueta?
4. **Los tokens `-strong` nacieron de un fallo de contraste real y se aplicaron a dos archivos mientras el `Badge` seguía enviando el par roto.** ¿Deberían los primitivos ser el único sitio donde esos colores pueden aparecer?
5. **`Run.tsx` da el 70% del viewport a texto de CLI que nadie lee y 288px al botón que arranca el examen.** Si la consola estuviera colapsada por defecto, ¿qué ocuparía su sitio? ¿La clase a punto de evaluarse, con sus IPs?
