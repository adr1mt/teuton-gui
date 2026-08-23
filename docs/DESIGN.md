---
name: Teutón GUI
description: El marcador del aula — un panel de escritorio que se lee de un vistazo mientras corriges un examen en directo.
colors:
  signal-blue: "hsl(217 91% 52%)"
  ink-night: "hsl(222 47% 11%)"
  classroom-white: "hsl(220 27% 98%)"
  surface-card: "hsl(0 0% 100%)"
  quiet-grey: "hsl(220 14% 96%)"
  quiet-grey-ink: "hsl(220 9% 46%)"
  hairline: "hsl(220 13% 91%)"
  blue-wash: "hsl(214 100% 96%)"
  pass-green: "hsl(142 76% 29%)"
  pass-green-strong: "hsl(142 78% 24%)"
  partial-amber: "hsl(38 92% 50%)"
  partial-amber-strong: "hsl(32 95% 30%)"
  fail-red: "hsl(0 72% 51%)"
  fail-red-strong: "hsl(0 74% 38%)"
  console-ink: "hsl(222 47% 6%)"
  console-paper: "hsl(220 14% 86%)"
typography:
  marker:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  marker-lg:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  figure:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  name:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.2
  ui:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  dense:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.09em"
  glyph:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  glyph: "0.25rem"
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  section: "36px"
  page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "hsl(217 91% 52% / 0.9)"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-night}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.blue-wash}"
    textColor: "hsl(221 83% 45%)"
  button-destructive:
    backgroundColor: "{colors.fail-red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink-night}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.classroom-white}"
    textColor: "{colors.ink-night}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  badge-success:
    backgroundColor: "hsl(142 76% 29% / 0.15)"
    textColor: "{colors.pass-green-strong}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  view-header:
    backgroundColor: "transparent"
    textColor: "{colors.ink-night}"
    typography: "{typography.ui}"
    minHeight: "56px"
    padding: "8px 24px"
    borderBottom: "1px solid {colors.hairline}"
  scoreboard-reading:
    backgroundColor: "transparent"
    textColor: "{colors.ink-night}"
    typography: "{typography.marker}"
    padding: "20px 24px"
    borderLeft: "1px solid {colors.hairline}"
  roster-row:
    backgroundColor: "transparent"
    typography: "{typography.name}"
    padding: "12px 4px"
    borderBottom: "1px solid {colors.hairline}"
  segmented-item-active:
    backgroundColor: "{colors.quiet-grey}"
    textColor: "{colors.ink-night}"
    typography: "{typography.label}"
    rounded: "{rounded.glyph}"
    padding: "4px 10px"
  section-title:
    textColor: "{colors.ink-night}"
    typography: "{typography.title}"
    borderBottom: "1px solid {colors.hairline}"
    padding: "0 0 8px"
  nav-item-active:
    backgroundColor: "hsl(217 91% 52% / 0.2)"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  matrix-cell-pass:
    backgroundColor: "{colors.pass-green}"
    textColor: "#ffffff"
    rounded: "{rounded.glyph}"
    size: "24px"
---

# Design System: Teutón GUI

## Overview

**Creative North Star: "El marcador del aula"**

Esto es un marcador, no un panel de administración. La pantalla existe para que una
persona que está de pie, a tres metros y atendiendo a otro alumno, gire la cabeza y
sepa en un segundo quién va bien, quién va a medias y quién está caído. Todo lo demás
—editor, ajustes, importar clases— es infraestructura al servicio de ese momento. Cifra
grande, glifo de color, y nada compitiendo por la atención alrededor.

La superficie de trabajo es clara y fría (`classroom-white`, tarjetas blancas, filetes
de 1px), anclada por una barra lateral de tinta oscura que no cambia nunca entre temas:
es el marco fijo del marcador. El azul señal se usa con avaricia —navegación activa,
foco, un CTA por pantalla— para que el color quede libre y el verde, el ámbar y el rojo
signifiquen exclusivamente el estado de un alumno. Cuando en esta interfaz aparece
color, es información.

El sistema ya está tensionado por la proyección: los tokens `-strong` existen porque el
verde y el ámbar puros se quedaban en 2-3:1 sobre superficies teñidas, justo en la nota
del alumno y en los chips de la matriz, que es lo que más se ve en el proyector. Esa es
la regla de oro del mundo visual: si un valor no aguanta un proyector de aula malo, no
entra. Anti-referencia declarada: el cuaderno editorial en papel, con tipografía de
lectura y densidad baja. Aquí se escanea, no se lee.

**Key Characteristics:**

- Marcador primero: en Resultados, tres lecturas enormes y una fila por alumno con su
  nombre y su nota a tamaño de proyector. La cabecera mide al menos 56px y crece una
  segunda línea cuando el ancho mínimo no permite alojar todos los controles.
- Lateral de tinta fija + lienzo claro; el contraste de zonas orienta antes que el texto.
- Color semántico y racionado: azul = sistema, verde/ámbar/rojo = alumno.
- Densidad de instrumento: cuerpo base de 14px y cero aire decorativo, con la escala
  grande reservada a lo que se lee a tres metros.
- Contraste calibrado para proyector, con variantes `-strong` para texto sobre tinte y
  para toda cifra grande.
- **Plano.** El filete de 1px y el tono hacen la profundidad; la sombra solo aparece
  bajo lo que se cierra (menú y diálogo).
- Un solo chasis: `ViewHeader` + `SectionTitle` + `Segmented` en las ocho vistas.

## Colors

Una paleta fría de trabajo —azul señal sobre gris casi blanco— con tres colores de
estado que son el único lugar donde el sistema se permite saturación.

Todos los tokens se declaran como tripletas HSL en `src/renderer/src/styles/globals.css`
y se consumen vía `hsl(var(--token))`. Cada uno tiene su pareja en `.dark`; el
frontmatter recoge el tema claro como canónico y la variante oscura vive en
`.impeccable/design.json`.

### Primary

- **Azul Señal** (`{colors.signal-blue}`): el único acento del sistema. Item de
  navegación activo, anillo de foco, barra de progreso, botón principal, filtro
  seleccionado. Nunca marca estado de alumno.

### Secondary

- **Lavado Azul** (`{colors.blue-wash}`): fondo de hover en controles fantasma y
  contorno, y de los chips informativos de contexto (clase activa). Es azul sin ser
  acento: señala «interactivo» sin gritar.

### Tertiary — colores de estado

Los tres colores del marcador. Nunca se usan para decorar ni para jerarquía visual.

- **Verde Aprobado** (`{colors.pass-green}`): caso superado, nota que aprueba, chip
  «OK» de la matriz, Teutón detectado.
- **Ámbar Parcial** (`{colors.partial-amber}`): resultado parcial, borrador sin
  guardar, récord guardado mejor que la nota actual, avisos de informe corrupto.
- **Rojo Caído** (`{colors.fail-red}`): caso fallido, nota suspensa, alumno que
  necesita atención, Teutón ausente.
- **Variantes `-strong`** (`{colors.pass-green-strong}`, `{colors.partial-amber-strong}`,
  `{colors.fail-red-strong}`): la misma familia, oscurecida, **obligatoria** para texto o
  glifo sobre una superficie teñida con ese mismo color al 10-15%.

### Neutral

- **Tinta Nocturna** (`{colors.ink-night}`): texto principal, y fondo de la barra
  lateral en tema claro. El mismo valor hace de texto y de marco: es lo que cose las
  dos zonas.
- **Blanco Aula** (`{colors.classroom-white}`): lienzo de la aplicación, ligeramente
  frío para que la tarjeta blanca pura se despegue.
- **Superficie Tarjeta** (`{colors.surface-card}`): tarjetas, popovers, diálogos.
- **Gris Callado** (`{colors.quiet-grey}`) y su tinta (`{colors.quiet-grey-ink}`):
  fondos secundarios, pistas, metadatos, cabeceras de tabla.
- **Tinta de Consola** (`{colors.console-ink}` / `{colors.console-paper}`): la salida
  del CLI es oscura en los dos temas, porque es una terminal. Existe como token justo
  para que eso no se escriba como `bg-[#0b0f19] text-slate-200` en un componente.
- **Filete** (`{colors.hairline}`): separador universal de 1px. Aplicado globalmente
  vía `* { border-color: hsl(var(--border)) }`, así que cualquier `border` sale ya del
  sistema sin pedirlo.

### Named Rules

**La Regla del Color Reservado.** Verde, ámbar y rojo solo describen el estado de un
alumno o del sistema. Ningún gráfico decorativo, ninguna categoría, ninguna marca de
sección puede tomarlos prestados: en cuanto el rojo significa dos cosas, el marcador
deja de leerse.

**La Regla del Tinte y el Strong.** Color puro sobre fondo neutro; variante `-strong`
en cuanto el fondo lleva ese mismo color al 10-15%. La combinación `bg-warning/10` +
`text-warning` está prohibida — es exactamente el fallo de contraste que motivó los
tokens.

**La Regla del Único Azul.** Una pantalla tiene como mucho una acción en azul lleno.
Si aparece la segunda, una de las dos pasa a `outline`.

## Typography

**Familia única:** Inter (con `system-ui`, `-apple-system`, Segoe UI, Roboto de
respaldo).
**Mono:** JetBrains Mono (con `ui-monospace` de respaldo).

Ninguna de las dos se empaqueta: no hay `@font-face` ni webfont en el bundle, así que
resuelven contra lo que haya instalado en el sistema. Es deliberado en una app de
escritorio sin red garantizada, y obliga a que la jerarquía funcione con peso, tamaño y
color — nunca con la personalidad de la fuente.

**Carácter:** neutral de instrumento. La tipografía no tiene voz propia; el
protagonismo es de la cifra.

### Hierarchy

La escala vive en `tailwind.config.js` como pasos con nombre. **Ningún componente
escribe un tamaño literal**: si hace falta uno nuevo, se añade al `fontSize` del tema.

- **Marker / Marker-lg** (700, 2.25rem / 2.75rem, tabular): las tres lecturas del
  marcador en Resultados —aprobados, nota media, requieren atención—. Es el único
  escalón dimensionado explícitamente para leerse desde el fondo del aula. `marker-lg`
  entra a partir de `2xl`.
- **Figure** (700, 1.75rem, tabular): la nota de un alumno en el listado y en su
  detalle. La segunda cosa que se lee a distancia.
- **Name** (600, 1.0625rem): el nombre del alumno en el listado. Deliberadamente por
  encima del cuerpo: en el marcador, la persona y su nota son el contenido; todo lo
  demás es apoyo.
- **UI** (600, 0.9375rem, `-0.01em`): título de vista. Uno por pantalla, siempre dentro
  de la `ViewHeader`.
- **Title** (600, 0.875rem): títulos de sección (`SectionTitle`), filas destacadas,
  etiquetas de botón.
- **Body** (400, 0.875rem): el cuerpo real de la aplicación.
- **Dense** (400, 0.8125rem): avisos, celdas de la matriz, salida del CLI. Un escalón
  por debajo del cuerpo, para lo que se escanea y no se lee.
- **Label** (500, 0.75rem): metadatos y contexto en las cabeceras.
- **Micro** (600, 0.6875rem, `+0.09em`, mayúsculas): rótulo de una lectura del marcador
  y cabecera de tabla. **Las mayúsculas solo aparecen aquí.**
- **Glyph** (700, 0.625rem): el texto dentro de un chip de la matriz y de la leyenda.
- **Mono** (400, 0.75rem, tabular): identificadores de caso, rutas, IPs, salida del
  CLI. Nada más.

### Named Rules

**La Regla de la Cifra Tabular.** Todo número que pueda cambiar en vivo —notas,
porcentajes, contadores, cronómetro— lleva la utilidad `.tnum`
(`font-variant-numeric: tabular-nums lining-nums`). Un dígito que ensancha la columna
en mitad de un examen es un parpadeo que roba la mirada.

**La Regla de los 14px.** El cuerpo base es 0.875rem en toda la app. Subir a 1rem
«para que se lea mejor» rompe la densidad de tabla que hace que quepa una clase entera
en pantalla; la legibilidad de lejos se resuelve con `marker`, `figure` y `name`, no
subiendo el cuerpo.

**La Regla del Paso con Nombre.** `text-[1.0625rem]` es un error de sistema, no una
decisión local. La escala del marcador se decide una vez y se consume por nombre
(`text-name`, `text-figure`, `text-marker`).

## Layout

Dos zonas fijas: barra lateral de navegación de 240px (tinta, con el logo, el proyecto
activo, el estado del examen, el estado de Teutón y el conmutador de tema al pie) y un
área de contenido que ocupa el resto. `body` va con `overflow: hidden`; cada vista
gestiona su propio scroll interno, de modo que la navegación y las cabeceras nunca se
van de la pantalla.

**Todas las vistas tienen el mismo esqueleto**, sin excepción:

```
ViewHeader (mín. 56px, fija)  →  franjas de estado fijas  →  región con scroll (px-24 pt-20)
```

La `ViewHeader` lleva el título a la izquierda, el contexto justo detrás (clase activa,
recuento, hora) y los controles al final. Antes había dos especificaciones —las vistas
tranquilas titulaban a 30px con margen de página y las de operación a 18px dentro de
una barra—, de modo que el escalón grande le tocaba justo a la vista que menos lo
necesita. En 960px permite dos líneas y aumenta su altura; nunca recorta ni superpone
las acciones.

Ventana única de escritorio: **el sistema no es responsive por diseño**. Los pocos
saltos que quedan (`xl:` en el listado de alumnos, `lg:` en la rejilla de analíticas)
son adaptaciones a un monitor ancho, no puntos de ruptura móviles.

Ritmo de espaciado, sobre la escala de Tailwind: 4px para pares icono-texto, 8px entre
controles hermanos, 16px entre bloques hermanos, 24px de margen de página, 36px entre
secciones de una vista de lectura o de ajustes.

**La Regla del Marco Fijo.** El lateral, la `ViewHeader`, la franja de examen y la
banda del marcador no hacen scroll nunca. Durante un examen el profesor vuelve al
portátil sin contexto: lo que le orienta tiene que estar donde lo dejó.

**La Regla de la Columna Alineada.** Una vista con la medida limitada (Ajustes, Inicio,
Analíticas, el detalle de un alumno) alinea su columna al **margen izquierdo de la
página**, nunca centrada. Centrarla despega el contenido del título que lo encabeza y
deja un canalón vacío que no significa nada.

## Elevation & Depth

Sistema **plano con capas tonales**. La profundidad la hacen el tono y el filete de
1px, no la sombra: lienzo frío → tarjeta blanca → lateral de tinta son tres planos
distinguibles sin una sola sombra. La sombra está reservada para lo que literalmente
flota por encima del contenido y va a desaparecer.

### Shadow Vocabulary

Solo quedan dos sombras, y las dos van bajo algo que se cierra:

- **Desplegada** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`):
  menús de desbordamiento y popovers.
- **Modal** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`):
  el diálogo de confirmación, sobre un velo `bg-foreground/30` con `backdrop-blur-[2px]`.

Retiradas: la sombra «Asentada» bajo tarjetas, botones y campos —en un sistema de tono
más filete de 1px no describía ninguna profundidad y al proyectar solo ensuciaba el
borde— y el «Halo de marca» azul bajo el logo, que era una sombra coloreada sin
desplazamiento: decoración, no profundidad.

### Named Rules

**La Regla del Plano en Reposo.** Si un elemento no se puede cerrar, no lleva sombra.
Ninguna. Elevar una tarjeta al hacer hover sugiere que es descartable.

## Shapes

Radio único de sistema: `--radius: 0.5rem`, del que Tailwind deriva `lg` (8px), `md`
(6px) y `sm` (4px). Tarjetas y diálogos a 8px, botones y campos a 6px, controles
pequeños y elementos de menú a 4px. Bajó desde 0.75rem: a 12px las cajas empezaban a
leerse como tarjetas de producto en vez de como superficies de instrumento.

Dos excepciones deliberadas, y ambas significan algo:

- **Píldora completa** (`9999px`): badges, barras de progreso y el pulgar del scroll.
  La forma de píldora marca «esto es un estado, no un control».
- **Glifo cuadrado** (`0.25rem`): las celdas de la matriz de casos, de 20px. Casi
  cuadradas a propósito — se alinean en una retícula densa y el borde recto ayuda a
  leer la fila como una secuencia, no como una hilera de botones.

Bordes: siempre 1px, siempre `{colors.hairline}`. El estado seleccionado añade
`ring-1` del color de acento en lugar de engordar el borde, para que nada se mueva de
sitio al seleccionar.

## Components

Carácter general: **precisos y callados**. Solo transicionan el color, en ~150ms. Nada
escala, nada rebota, nada se hunde. El movimiento en esta interfaz está reservado a lo
que de verdad está ocurriendo: el spinner de una ejecución, la barra de progreso, la
entrada de una vista.

### Buttons

- **Shape:** esquinas suaves (10px, `rounded-md`); altura 36px por defecto, 32px en
  `sm`, 44px en `lg`, 36×36 en icono.
- **Primary:** azul señal lleno, texto blanco, `padding: 8px 16px`, sombra «Asentada».
- **Hover / Focus:** hover baja la opacidad del fondo al 90%; el foco es un anillo de
  2px del color de acento con 1px de separación del fondo. Solo `focus-visible`.
- **Secondary / Outline / Ghost:** gris callado lleno; contorno de 1px sobre
  transparente; y fantasma sin caja. Los tres cambian a lavado azul al pasar por
  encima. `outline` y `ghost` son el modo por defecto de una barra de herramientas:
  el azul lleno lo lleva una sola acción.
- **Destructive / Success:** mismas medidas, colores de estado. `destructive` solo en
  el diálogo de confirmación y en acciones que borran datos del alumnado.

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** blanco de tarjeta sobre lienzo frío.
- **Shadow Strategy:** «Asentada», y nada más (ver Elevation).
- **Border:** filete de 1px, siempre presente. Es el borde, no la sombra, lo que define
  la tarjeta.
- **Internal Padding:** 20px de contenido; 16px cuando la tarjeta es una estadística.

### Inputs / Fields

- **Style:** 1px de borde sobre fondo de lienzo, 10px de radio, 36px de alto, cuerpo de
  14px, sombra «Asentada».
- **Focus:** anillo de 2px del color de acento; el borde no cambia de grosor.
- **Disabled:** opacidad 50% y cursor `not-allowed`.

### Navigation

Lista vertical sobre tinta, ítems de 8px de radio y cuerpo de 14px semibold. En reposo,
texto al 70% de opacidad; hover lo lleva a blanco sobre un velo `white/5`. El ítem
activo lleva fondo `azul señal/20`, texto blanco y **una pestaña de 4×20px con la
esquina exterior redondeada pegada al borde izquierdo** — la marca de posición del
sistema. Los ítems que necesitan proyecto abierto se quedan al 30% de opacidad, sin
hover: la app dice qué falta desactivando, no escondiendo.

Los ítems cargan indicadores al final de la fila: punto ámbar de 6px (borrador sin
guardar en el editor), spinner azul (ejecución en curso).

### ViewHeader / SectionTitle / Segmented (el chasis)

Tres primitivas cubren el 90% del cromo, y son la razón de que dos vistas cualesquiera
se parezcan:

- **`ViewHeader`** — barra fija de al menos 56px: `h1` en `ui`, contexto detrás,
  acciones al final y wrap seguro en el ancho mínimo. Es el único sitio donde vive
  el título de una vista.
- **`SectionTitle`** — encabezado de bloque con filete inferior y una pista opcional a
  su lado. **Sustituye a la tarjeta como contenedor de sección**: en Ajustes y
  Analíticas, lo que agrupa es la regla de 1px y el aire, no una caja.
- **`Segmented` / `SegmentedItem`** — el único control segmentado. Antes había dos
  implementaciones casi idénticas (Lista/Matriz y las pestañas del Editor) y solo una
  anunciaba `aria-pressed`.

### El marcador (`Reading`)

Tres lecturas —aprobados, nota media, requieren atención— en una banda fija de tres
columnas separadas por filete, **sin tarjeta**: una caja alrededor de una cifra de
36-44px solo le roba contraste. Rótulo en `micro` mayúsculas, cifra en `marker` teñida
por su propio umbral, pista en `body` gris. La tercera lectura además filtra el
listado: entonces es un `<button>` con `aria-pressed` que toma fondo `azul señal/10`,
sin mover un píxel.

Son tres y no cinco a propósito. Los KPI que se cayeron —nota máxima, nota mínima,
errores de conexión sueltos— no cambian ninguna decisión del profesor durante el
examen; los hosts caídos viven ahora dentro de «requieren atención», que es donde se
actúa sobre ellos.

### Listado de la clase (`Roster`, componente firma)

Sustituye a la tabla de siete columnas a 14px, que no se leía desde el fondo del aula.
Una fila por alumno, a dos columnas en pantalla ancha para que una clase de treinta
entre sin scroll. Cada fila lleva, y solo lleva:

1. **Glifo de estado** de 28px — icono Lucide sobre color: `WifiOff` sobre rojo fuerte
   (host caído, gana siempre), `Check` sobre verde (aprobado), `X` sobre rojo tinte
   (suspenso).
2. **Nombre** en `name`, y debajo un **medidor** (`Meter`) de objetivos superados con
   su recuento. La barra se entiende antes que cualquier cifra y por eso acompaña al
   número; nunca lo sustituye.
3. **Nota** en `figure`, teñida con `passColor` (variantes `-strong`), y debajo la
   mejor nota alcanzada cuando existe récord.

El caso (`case-NN`) y los puntos crudos de Teutón salieron de aquí: solo importan al
depurar, y siguen estando en el detalle del alumno.

**La Regla de la Fila Legible.** Si un dato de esta fila no ayuda a decidir *a quién ir
a ver*, no está en la fila. Está en el detalle.

### Matriz de casos

La retícula que resume la clase entera. Una fila por comprobación, una celda de 24px
por alumno, y un glifo dentro de cada una: `OK` sobre verde, la cifra parcial sobre
ámbar, `✕` sobre rojo fuerte, `?` sobre gris cuando el informe no se pudo leer. El
glifo es obligatorio, no decorativo: la matriz se proyecta y tiene que seguir leyéndose
si el proyector aplasta los colores o si quien mira no distingue rojo de verde.

El peso del objetivo va en línea, al final de su etiqueta (`×2`), y no en una columna
fija: así ocupa lo que necesita y deja el ancho sobrante a los nombres de los alumnos.

**La Regla del Alumno Presente.** Un informe ilegible produce una celda `?`, jamás una
fila que desaparece. Ninguna celda de esta matriz puede quedar vacía.

### Gráficos (Analíticas)

Recharts, leído desde las variables CSS por `useChartColors` para que siga al tema. El
criterio es **quitar todo lo que no sea el dato**:

- **Sin rejilla y sin eje de valores**, ni en las barras horizontales ni en las
  verticales: la cifra va pegada al extremo o encima de la barra (`LabelList`), que es
  más directo que un eje que hay que recorrer con la vista. El eje Y de la distribución
  de notas se retiró por eso — repetía en el margen el recuento que cada barra ya lleva
  escrito encima, que es rejilla disfrazada.
- **Barra de 14px** y radio de 2px. Nada de degradados ni de esquinas de 8px.
- **Ejes sin línea ni marcas** (`axisLine={false} tickLine={false}`), etiquetas en gris
  a 11px.
- **Color por significado.** El rojo de «objetivos fallados» es estado de alumno
  agregado y está justificado. La distribución de notas se tiñe contra el `passScore`
  **configurado** —rojo por debajo, verde por encima, y ámbar **solo** en el tramo que
  el umbral parte por la mitad—; los cortes fijos en 50 y 90 que había antes
  contradecían el umbral del profesor, y pintar de ámbar un tramo que aprueba entero
  (aprobado en 70 → tramo 70-79) decía que esos alumnos estaban a medias. La tasa de
  éxito por grupo va en **azul**: compara bloques del test, no alumnos, así que no le
  toca robar un color de estado.
- **Sin tarjeta.** Cada gráfico es una `<section>` bajo su `SectionTitle`.

**La Regla de la Frontera Exacta.** Un umbral se dibuja donde está, no en el centro de
la barra más cercana. La `ReferenceLine` del aprobado va sobre un **eje numérico oculto
y paralelo** (`xAxisId="pos"`, dominio `[0,10]`, así que la posición es `passScore/10`),
porque sobre el eje de categorías Recharts la centraba en la barra y parecía partir en
dos un tramo entero. Rotulada con el valor (`aprobado ≥ 70`), no con la palabra sola.

**La Regla de la Vista que no es una Lista.** Analíticas resume; Resultados enumera.
Cualquier listado de alumnos aquí se recorta (ocho filas) y cede el resto a un enlace
que salta a Resultados **con el filtro ya puesto**. Sin el tope, una clase floja
empujaba los tres gráficos —el contenido propio de la vista— por debajo del pliegue.

### Confirm dialog

Sustituye a `window.confirm`. Tarjeta de 12px con sombra «Modal» sobre velo con desenfoque
de 2px, entrada con `fade-in` de 200ms. Título de 16px semibold, cuerpo en gris, y dos
botones abajo a la derecha: **Cancelar en `outline` y con el foco inicial**, la acción
destructiva a su derecha. La tecla obvia nunca es la que borra.

## Do's and Don'ts

### Do:

- **Do** poner un glifo o una etiqueta dentro de cualquier indicador de color. El color
  es refuerzo; el significado tiene que sobrevivir a un proyector y a un daltónico.
- **Do** usar la variante `-strong` para todo texto sobre una superficie teñida con su
  propio color (`text-warning-strong` sobre `bg-warning/10`) **y para toda cifra
  grande** sobre el lienzo: a 28-44px el rojo puro se queda en ~4:1 y el proyector se
  lo come.
- **Do** abrir cada vista con `ViewHeader` y agrupar con `SectionTitle`. Dos vistas
  cualesquiera tienen que empezar igual.
- **Do** consumir la tipografía por su paso con nombre (`text-name`, `text-figure`,
  `text-marker`, `text-micro`).
- **Do** dar `.tnum` a toda cifra que se actualice en vivo.
- **Do** dejar una sola acción en azul lleno por pantalla; el resto en `outline` o
  `ghost`.
- **Do** apoyar la profundidad en el tono y el filete de 1px antes que en una sombra.
- **Do** mandar las acciones raras o destructivas al menú de desbordamiento, lejos del
  botón que se pulsa cada minuto durante un examen.
- **Do** enrutar cualquier confirmación destructiva por `ConfirmDialog`, con el foco en
  Cancelar.
- **Do** leer los colores de gráficos desde las variables CSS (`useChartColors`), para
  que Recharts siga al tema.

### Don't:

- **Don't** usar verde, ámbar o rojo para nada que no sea estado de alumno o de sistema.
- **Don't** combinar color puro y tinte del mismo color (`text-success` sobre
  `bg-success/10`): ese es el fallo de contraste que los tokens `-strong` vinieron a
  arreglar.
- **Don't** subir el cuerpo base por encima de 0.875rem ni bajar la densidad de las
  tablas: la clase entera tiene que caber en una pantalla.
- **Don't** escribir un tamaño literal (`text-[1.0625rem]`, `text-[11px]`). Si falta un
  escalón, se añade al `fontSize` del tema y se le pone nombre.
- **Don't** usar una tarjeta para agrupar una sección de una vista de ajustes, de
  analíticas o de lectura. El filete de `SectionTitle` ya lo hace, y sin anidar cajas.
- **Don't** centrar una columna de contenido con `mx-auto`: se alinea al margen
  izquierdo de la página, bajo su propio título.
- **Don't** animar transformaciones en controles (escalar, hundir, rebotar). Solo color,
  y en ~150ms.
- **Don't** añadir sombra a nada que no se pueda cerrar: ni tarjetas, ni botones, ni
  campos, ni al hacer hover.
- **Don't** introducir una segunda familia tipográfica ni empaquetar un webfont; el
  sistema resuelve contra las fuentes del sistema a propósito.
- **Don't** usar `window.alert` / `window.confirm`: salen sin estilo, en el idioma del
  sistema, y se descartan por reflejo.
- **Don't** diseñar puntos de ruptura móviles. Es una única ventana de escritorio Linux.
- **Don't** escribir colores literales en los componentes; todo pasa por los tokens de
  `globals.css`, que es lo que hace que el tema oscuro exista.
