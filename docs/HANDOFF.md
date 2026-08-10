# Handoff — estado del proyecto

Última actualización: **2026-08-09**. Rama `main`.

## Dónde estamos

La app está completa de punta a punta: preparar el proyecto, importar la clase,
ejecutar el examen, ver los resultados en vivo y exportar a Moodle. El trabajo de los
últimos días no ha sido añadir funciones, sino **afinar cómo se lee la pantalla** —
sobre todo la de Resultados, que es la que se proyecta en clase.

`npm run typecheck` y `npm test` (70 tests) pasan.

## Lo último que se ha tocado

**Resultados · vista Matriz.** La fila del final ya no muestra los puntos crudos de
Teutón (0-100) sino la **nota en la escala del profesor** (con `passScore = 70`,
70 puntos → 5,00), en verde o rojo según apruebe. Los puntos siguen accesibles pasando
el ratón por encima. Antes convivían dos escalas en la misma pantalla: el resumen de
arriba y la vista Lista daban la nota sobre 10, y la matriz daba puntos.

**Ventana estrecha.** La columna de las preguntas se encogía hasta desaparecer y su
título se montaba encima del primer alumno. Ahora tiene un ancho mínimo (16rem) y
aparece la barra de desplazamiento lateral.

**El marcador de arriba pasa de tres bloques altos a una sola franja.** La cifra
grande queda a la izquierda y el rótulo a su lado, en vez de apilados: de ~170px de
alto a ~80px, sin encoger el número, que se lee desde el fondo del aula. Ese alto se
lo queda la tabla.

**«Requieren atención» ya parece pulsable.** Lleva un embudo junto al rótulo, cursor
de mano y subrayado al pasar por encima; el texto dice qué pasa al pulsar («Pulsa para
ver solo estos» / «Pulsa para quitar el filtro»). Filtrar ya funcionaba, pero no había
forma de adivinarlo.

**Cabeceras de la matriz con el nombre de pila.** El apellido duplicaba el ancho de
cada columna y con una clase entera obligaba a arrastrar de lado sin parar. Si dos
alumnos comparten nombre, ambos pasan a «Marc O.» / «Marc G.»; si tampoco así se
distinguen, se quedan con el nombre completo. El nombre entero sigue apareciendo al
pasar el ratón y en el detalle. La lógica vive en `lib/names.ts` con sus tests.

**Leyenda.** El cuadro amarillo lleva los puntos logrados en esa pregunta, no un
símbolo fijo; el rótulo lo dice ahora («parcial (puntos logrados)»), porque un «5»
suelto no se entendía.

**`./launch.sh`.** Solo compilaba la primera vez, así que después de cambiar el código
arrancaba la versión antigua sin avisar. Ahora detecta si hay cambios y recompila.

**Analíticas.** Se recortó la lista de alumnos con incidencias a ocho filas, con un
enlace que salta a Resultados con el filtro «requieren atención» ya puesto. La línea
del aprobado se dibuja en su posición exacta, no centrada en la barra más cercana. Y se
corrigió un parpadeo: los gráficos pintaban un instante con los colores del tema
anterior al cambiar de claro a oscuro.

## Proyecto de demostración

Para ver la pantalla con datos realistas sin montar máquinas virtuales:

```bash
./launch.sh
```

En Inicio, abre la carpeta `sandbox/examen-demo/` (toda `sandbox/` está fuera de git). Es un
cuestionario de 10 preguntas de redes con 15 alumnos inventados. No usa SSH: cada
comprobación compara en local la respuesta que el alumno lleva en su ficha. La clase
**DEMO-15** ya está guardada en Clases y el proyecto la tiene como clase activa.

Las notas están repartidas a propósito para ver la pantalla en todos sus estados
(escala del profesor, con el aprobado en 70 puntos): cuatro **10,00**, tres **8,33**,
dos **6,67**, dos justo en el **5,00** y cuatro suspensos (**3,57**, **3,57**, **2,14**
y **0,71**). Salen **11 aprobados de 15**, media **5,67**.

Para rehacerla desde cero (o cambiar las notas: se editan en la tabla `ROSTER`):

```bash
node scripts/make-demo-project.mjs
```

## Pendiente

La lista de mejoras de Resultados que había aquí está **cerrada**. Dos de sus puntos
—«qué pregunta falla más gente» y «ordenar por dificultad»— se descartaron porque
Analíticas ya los resuelve mejor: «Objetivos fallados con más frecuencia» sale ordenado
por número de alumnos que lo fallan, con la cifra al final de cada barra. No hay que
duplicarlo en la matriz.

Queda solo por confirmar, mirándolo en clase:

- Si el ancho mínimo de la columna de preguntas (16rem) es el bueno o conviene
  reducirlo para que quepan más alumnos a la vez.
- Si con una clase real de 30 el nombre de pila basta para reconocer a cada alumno de
  un vistazo en el proyector.

No hay ninguna funcionalidad pendiente conocida. La próxima tanda de trabajo debería
salir de usar la app en un examen de verdad, no de esta lista.

## Documentos hermanos

- `CLAUDE.md` — cómo está construido y qué **no** se debe tocar sin entender por qué.
- `docs/DESIGN.md` — las reglas visuales y el porqué de cada una.
- `docs/PRODUCT.md` — para quién es y qué cuenta como éxito.
