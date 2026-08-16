# Handoff — estado del proyecto

Última actualización: **2026-08-10**. Rama `main`. Versión **1.0.0**.

## Dónde estamos

La app está completa de punta a punta: preparar el proyecto, importar la clase,
ejecutar el examen, ver los resultados en vivo y exportar a Moodle. Ya no es un
proyecto en curso: hoy se ha publicado como **1.0.0**, con instalador y con el
repositorio empezado de cero.

`npm run typecheck` y `npm test` (70 tests) pasan.

Este documento cuenta **el estado**: dónde estamos, qué se decidió y qué queda. Las
reglas de trabajo (reinstalar tras cada cambio, dónde van los ficheros pesados, qué no
tocar) viven en `CLAUDE.md` y no se repiten aquí.

## Lo último que se ha tocado (2026-08-10)

**Release 1.0.0 publicada.** <https://github.com/adr1mt/teuton-gui/releases/tag/v1.0.0>,
con el `.deb` y el `.AppImage` colgados. El `.deb` deja la app en el menú de cualquier
Linux, con su icono, sin tocar nada más.

**Historial de GitHub borrado.** Los 28 commits anteriores y la release v0.2.0 ya no
están: el repositorio arranca en un único commit con el estado actual. No hay copia
remota de lo anterior; sí queda el reflog local del repositorio de trabajo por si
alguna vez hiciera falta rescatar algo.

**Icono propio.** La T de Teutón sobre fondo azul con la marca de «corregido». Se
genera con `npm run icon` (`scripts/make-icon.py`, sin dependencias: dibuja los PNG a
mano en siete tamaños). Los PNG están commiteados, así que compilar no necesita Python.
Si se retoca el logo, hay que volver a ejecutar ese comando y reinstalar.

**`scripts/instalar.sh`**, el instalador descrito arriba. El AppImage se copia con
nombre fijo, sin versión, para que al subir a la 1.1 la entrada del menú siga valiendo
sin tocar nada. `--desinstalar` lee la ruta real de la línea `Exec=` de la ficha, así
que borra el ejecutable correcto aunque esté en otro disco. Es el mismo montaje que
usa ErasmusDocs.

**Carpeta ordenada.** La raíz tenía doce ficheros sueltos. Ahora: `docs/` (este
documento, DESIGN y PRODUCT), `build/` (los iconos de empaquetado), `scripts/` y
`sandbox/`, que es donde viven los proyectos de prueba (`prueba/` y `examen-demo/`) y
está fuera de git.

## Antes de esto (2026-08-09)

Una tanda de afinado de **Resultados**, la pantalla que se proyecta en clase: la matriz
muestra la nota en la escala del profesor en vez de los puntos crudos de Teutón; el
marcador de arriba pasó de tres bloques altos a una sola franja para dejarle sitio a la
tabla; «Requieren atención» ahora parece pulsable (filtrar ya funcionaba, pero no había
manera de adivinarlo); las cabeceras de la matriz usan el nombre de pila, desambiguado
solo cuando hace falta (`lib/names.ts`, con tests); y la columna de preguntas tiene un
ancho mínimo para que no desaparezca en ventana estrecha. En Analíticas, la lista de
incidencias se recortó a ocho filas con un enlace al filtro de Resultados, y se corrigió
un parpadeo de colores al cambiar de tema.

## Proyecto de demostración

Para ver la pantalla con datos realistas sin montar máquinas virtuales, abre en Inicio
la carpeta `sandbox/examen-demo/`. Es un cuestionario de 10 preguntas de redes con 15
alumnos inventados. No usa SSH: cada comprobación compara en local la respuesta que el
alumno lleva en su ficha. La clase **DEMO-15** ya está guardada en Clases y el proyecto
la tiene como clase activa.

Las notas están repartidas a propósito para ver la pantalla en todos sus estados
(escala del profesor, con el aprobado en 70 puntos): cuatro **10,00**, tres **8,33**,
dos **6,67**, dos justo en el **5,00** y cuatro suspensos (**3,57**, **3,57**, **2,14**
y **0,71**). Salen **11 aprobados de 15**, media **5,67**.

Para rehacerla desde cero (o cambiar las notas: se editan en la tabla `ROSTER`):

```bash
node scripts/make-demo-project.mjs
```

## Pendiente

No hay ninguna funcionalidad pendiente conocida, y la lista de mejoras de Resultados
está cerrada. Lo único que queda son dos cosas que **solo se pueden decidir mirándolas
en clase**, con alumnos de verdad delante:

- Si el ancho mínimo de la columna de preguntas (16rem) es el bueno, o conviene
  reducirlo para que quepan más alumnos a la vez en el proyector.
- Si con una clase real de 30 el nombre de pila basta para reconocer a cada alumno de
  un vistazo.

La próxima tanda de trabajo debería salir de **usar la app en un examen de verdad**, no
de esta lista. Cuando eso pase, lo que interesa apuntar es qué se buscó y no se
encontró, y en qué momento hubo que mirar dos veces la pantalla.

## Último cambio de documentación (2026-08-16)

`CLAUDE.md` se reordenó sin perder nada. Las tres reglas que hay que cumplir al
terminar un cambio (typecheck+tests, `./scripts/instalar.sh`, actualizar este
handoff) estaban enterradas dentro de la sección de comandos, donde se leían como
comentarios de un bloque de shell; ahora son la sección **«Finish every change with
these three»**, justo detrás del principio rector.

Los nueve mecanismos no evidentes siguen íntegros y ahora los precede una tabla de
enrutado («si tocas X, lee Y»), para no depender de que alguien lea 240 líneas
enteras antes de tocar `lib/run.ts`.

Queda escrito algo que no lo estaba: en este repo **los comentarios van en español**,
al revés que en el resto de proyectos. Se documenta el hecho, no se cambia el código.

## Documentos hermanos

- `CLAUDE.md` — cómo está construido y qué **no** se debe tocar sin entender por qué.
- `docs/DESIGN.md` — las reglas visuales y el porqué de cada una.
- `docs/PRODUCT.md` — para quién es y qué cuenta como éxito.
