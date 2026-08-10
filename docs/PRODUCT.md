# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Electron desktop (Linux), renderer is a web UI: React + TypeScript + Tailwind. -->

## Users

Un único usuario: Adrià Muñoz, profesor de informática (servicios en red, ciclos SMX)
en el Institut El Puig. No es una herramienta para otros profesores ni hay releases
pensadas para terceros: quien la usa conoce Teutón, conoce sus propios exámenes y
conoce el flujo. La interfaz no tiene que enseñar el dominio, tiene que no estorbar.

Los alumnos no usan la app, pero sí la ven: es la misma pantalla que se proyecta en
clase.

## Product Purpose

Envolver el CLI de Teutón (gema Ruby de testing de infraestructura) en una interfaz de
escritorio que cubra el ciclo completo de un examen práctico: preparar el proyecto y el
test, importar la clase, ejecutar la corrección contra las máquinas de los alumnos,
seguir los resultados en vivo y exportar las notas a Moodle.

Éxito = durante un examen de dos horas con 20-30 alumnos, el profesor sabe en todo
momento quién va bien y quién está atascado sin dejar de atender la clase, y al acabar
las notas salen correctas al primer intento, sin repasarlas a mano.

## Positioning

Teutón corrige; esta app convierte esa corrección en una sesión de aula. Lo que ningún
envoltorio genérico del CLI daría: el modo examen (ciclos de corrección encadenados sin
solaparse), el récord de mejor nota por alumno y por clase (un alumno que saca un 10 y
apaga la máquina no pierde la nota en el siguiente ciclo), y el CSV de Moodle por grupo
generado solo con notas de récord.

La nota nunca se recalcula aquí. Siempre sale del CLI y de sus JSON.

## Operating Context

- **Antes**: en casa o en el despacho, con calma — editar `start.rb` y `config.yaml`,
  pegar la clase desde Excel, lanzar `teuton check` de prueba.
- **Durante (la escena crítica)**: examen en directo. Modo examen corriendo en bucle,
  el profesor mirando el dashboard de reojo mientras atiende dudas, se mueve por el
  aula y vuelve al portátil. La lectura tiene que resolverse de un vistazo y a
  distancia; nada que exija leer con detenimiento para saber si algo va mal.
- **Durante, proyectado**: esa misma pantalla se ve en el proyector delante de los
  alumnos. Implica legibilidad a tamaño de proyector (contraste, cuerpo de texto,
  colores que sobreviven a un proyector malo) y conciencia de que lo que se muestra
  es visible para toda la clase, incluidas notas y credenciales.
- **Después**: revisar resultados y analíticas, y exportar el CSV de Moodle del grupo
  correcto — el mismo proyecto de examen se pasa a varias clases.

Vocabulario del dominio, tal cual lo usa el profesor: proyecto, test, caso, alumno,
clase, récord, modo examen, nota.

## Capabilities and Constraints

- Ocho vistas: Inicio, Editor, Ejecutar, Dashboard, Analíticas, Clases, Ajustes, Ayuda.
- **La lógica de puntuación jamás se reimplementa**: la app invoca el CLI (`run`,
  `check`) y parsea sus JSON (`case-NN.json`, `resume.json`, `moodle.csv`). Cualquier
  cálculo propio divergiría de la nota oficial.
- La nota nativa de Teutón es 0-100; la conversión a la escala del profesor
  (`passScore`, `maxGrade`) es puramente de presentación y exportación.
- Récord de mejor nota por alumno, con ámbito por clase; el CSV de Moodle usa
  `max(nota actual, récord)`.
- Linux escritorio, Electron con `contextIsolation` y CSP restrictiva: todo el
  contacto con Node pasa por el bridge `window.teuton`.
- Depende de que `teuton` esté instalado en el sistema (gema Ruby); la app lo detecta
  y lo refleja en la UI.

**Idioma**: la UI es en español y se queda en español. Existe `i18n/es.ts` pero no hay
plan de segundo idioma; no hace falta diseñar para longitudes de texto alternativas.

## Brand Commitments

Nombre: **Teutón GUI**. Sin identidad gráfica heredada más allá de lo ya implementado
(tema claro/oscuro, iconografía Lucide, primitivas estilo shadcn). Nada de esto se
declaró intocable durante el init.

## Evidence on Hand

- Proyectos y salidas reales de Teutón para verificar el parser:
  `npm run verify:parsing -- <proyecto ya ejecutado>`.
- Manual de uso propio, escrito y actualizado, en `src/renderer/src/routes/Help.tsx`
  (13 secciones, español).
- Suite de tests sobre la lógica de dominio en `tests/`.
- No hay usuarios externos, testimonios, métricas de uso, ni datos de adopción. No se
  deben inventar.

## Product Principles

1. **La nota es del CLI.** Nada en la interfaz puede sugerir que la app calcula o
   ajusta una nota; solo la muestra y la convierte de escala.
2. **Un alumno nunca desaparece.** Un informe corrupto, una máquina apagada o un ciclo
   solapado se muestran como estado explícito, jamás como una fila que falta.
3. **Legible de lejos.** El estado de la clase durante un examen se lee a metros de
   distancia y a través de un proyector, o no sirve.
4. **La clase correcta, siempre.** Récords, CSV y resultados van sellados con su grupo;
   el diseño debe hacer imposible confundirse de clase al exportar.
5. **Un solo usuario experto.** Se optimiza para el uso repetido de quien ya sabe, no
   para el primer arranque de un desconocido.

## Accessibility & Inclusion

Sin requisito formal establecido. La restricción real es la escena proyectada: el
contraste y el tamaño de texto tienen que aguantar un proyector de aula, y el estado
(bien / atascado / error) no puede depender únicamente del color.
