# UAT hostil

Pruebas de aceptación hechas para **romper la app a propósito**, no para
confirmar que funciona. Lo que aquí se automatiza son las situaciones que en
clase aparecen una vez y no se pueden reproducir a voluntad: una máquina que no
responde, dos ciclos que se pisan, un informe a medio escribir.

```bash
npm run test:e2e          # los 18 escenarios sobre la app real
npm test                  # 112 tests unitarios
npm run verify:parsing -- <proyecto ya ejecutado>
```

## Cómo funciona

- **`scripts/fake-teuton.mjs`** hace de Teutón. Responde a `version`, `check` y
  `run --export=json`, escribe informes con el formato real y tiene modos de
  fallo (`FAKE_TEUTON_MODE`): `hang` (no termina nunca), `crash` (muere a
  mitad), `truncate` (informe válido + cola de otro proceso), `noresume`,
  `huge` (40 MB por stdout), `slow`, `notargets`, `badgrades`.
- **`tests/e2e/harness.ts`** arranca la app de verdad con Playwright, cada
  escenario con su propio `userData` temporal y su proyecto temporal. **La UAT
  nunca toca las clases, los ajustes ni los proyectos reales del profesor.**
- El teuton falso deja un fichero de PID por proceso, y así se comprueba si
  algo sobrevive al cierre de la app. (`pgrep -f` no vale: el patrón coincide
  también con la línea de órdenes de quien busca.)

## Escenarios automatizados

| # | Ataque | Qué tiene que pasar |
|---|---|---|
| 1 | Arranque con binario configurado a mano | Lo detecta y abre un proyecto reciente |
| 2 | Dos arranques de evaluación en el mismo instante | Un solo proceso, sin error y con sus notas |
| 3 | Cancelar y relanzar al instante | Ningún solape; el hijo muere antes de devolver el control |
| 4 | `teuton` colgado + cerrar la app | Cero procesos huérfanos |
| 5 | `teuton` que muere a mitad | «Error en la ejecución», nada colgado |
| 6 | Reevaluar a un alumno justo en un ciclo del modo examen | El modo examen sigue con su próximo ciclo |
| 7 | Abrir otro proyecto con una corrección en marcha | Pide confirmación y detiene el proceso anterior |
| 8 | YAML roto + «Añadir alumno» en la tabla | Tabla bloqueada; el `config.yaml` no se vacía |
| 9 | Notas negativas, infinitas y de 150 | Analíticas se pinta; nadie ve pantalla de error |
| 10 | `case-NN.json` con cola de otro proceso | Los cuatro alumnos siguen en la lista, con aviso |
| 11 | Nombres con `=fórmula`, comas, comillas, acentos y espacios | CSV con una fila por alumno y ninguna celda ejecutable |
| 12 | CSP en el HTML empaquetado | `<meta>` presente y un `<script>` inline no se ejecuta |
| 13 | Rutas fuera del proyecto por el puente IPC | Rechazadas (`loadResults`, `saveProject`, `openPath`, `..`) |
| 14 | Fijar `/bin/ls` como Teutón | Rechazado: «no responde como Teutón» |
| 15 | La app **empaquetada** (`dist/linux-unpacked`) | Arranca con ventana y con `window.teuton`; la CSP bloquea un script inline |
| 16 | Cerrar la ventana sin nada en marcha | Se cierra sin preguntar (referencia del 17) |
| 17 | Cerrar la ventana con una corrección en marcha | No se cierra: el aviso la retiene |
| 18 | Cerrar la sesión del escritorio (SIGTERM) a mitad | Cero procesos vivos después |

El 17 deja un Electron bloqueado en un diálogo nativo que hay que matar, así que
la suite termina con un aviso de «worker teardown» aunque los 18 pasen y el
código de salida sea 0. Es ruido, no un fallo.

Y en los tests unitarios: `classes.json` sin permisos de lectura (las clases no
pueden desaparecer ni sobreescribirse), 300 alumnos, dos guardados a la vez,
historial de notas dañado, informe que es un array, y claves de alumno que solo
se diferencian en espacios.

## Lo que encontró

- **Dos arranques en el mismo tick dejaban un proceso huérfano.** Guardar los
  borradores cede el control antes de marcar el estado como «ejecutando», así
  que dos llamadas seguidas pasaban las dos el guardián; la segunda pisaba el
  identificador de la primera y el proceso ya lanzado quedaba sin dueño: su
  salida se descartaba, sus notas no se guardaban y la pantalla mostraba un
  error. La reserva del turno ahora es síncrona (`lib/run.ts`).
- **El botón «Ejecutar test» se deshabilita mientras corre**, así que un doble
  clic humano no llega a provocarlo; la vía real son dos arranques a la vez (un
  ciclo del modo examen justo cuando se pulsa, o reevaluar a un alumno).

## Comprobaciones manuales

No se automatizan porque necesitan hardware o permisos de administrador. Hay que
hacerlas sobre el **AppImage instalado**, no sobre el build de desarrollo.

1. **Proyecto en un USB y desconectarlo a mitad de ciclo.** El aviso debe
   explicar que no se pudo guardar; las notas siguen en pantalla. *(El profesor
   no usa USB: aparcada.)*
2. **Disco lleno** (imagen loop de 1 MB montada como directorio del proyecto):
   guardar proyecto, récords y CSV deben avisar, no fallar en silencio.
3. **Suspender el ordenador 10 minutos con el modo examen activo.** Al despertar,
   el vigilante reanuda el ciclo en menos de 30 s en vez de quedarse en `0:00`.
   Ojo: la app **no impide** que el escritorio suspenda por inactividad, y aquí
   está configurado a 2 h con corriente — justo lo que dura un examen.
El escenario 15 es el único donde `app.isPackaged` es cierto, así que es el único
que prueba de verdad el preload CommonJS y la CSP incrustada. Necesita haber
empaquetado antes (`npm run dist:linux` o `./scripts/instalar.sh --forzar`); si no
hay build, se salta.

4. **Proyector:** con 30 alumnos, comprobar a tres metros que se distinguen los
   estados y que el nombre de pila basta para reconocer a cada uno.
