# UAT hostil

Pruebas de aceptación hechas para **romper la app a propósito**, no para
confirmar que funciona. Lo que aquí se automatiza son las situaciones que en
clase aparecen una vez y no se pueden reproducir a voluntad: una máquina que no
responde, dos ciclos que se pisan, un informe a medio escribir.

```bash
npm run test:e2e          # los 36 escenarios sobre la app real
npm test                  # 180 tests unitarios
npm run verify:parsing -- <proyecto ya ejecutado>
```

## Cómo funciona

- **`scripts/fake-teuton.mjs`** hace de Teutón. Responde a `version`, `check` y
  `run --export=json`, escribe informes con el formato real y tiene modos de
  fallo (`FAKE_TEUTON_MODE`): `hang` (no termina nunca), `crash` (muere a
  mitad), `truncate` (informe válido + cola de otro proceso), `noresume`,
  `huge` (40 MB por stdout), `slow`, `notargets`, `badgrades`, `offline`
  (el primer alumno con la máquina apagada), `noreports` (sale con 0 sin
  escribir: `start.rb` sin `play`), `syntaxerror` (sale con 1 sin tocar
  `var/`), `emptyresume` (`cases: []` y los informes anteriores intactos) y
  `staleresume` (casos nuevos, resumen viejo). `FAKE_TEUTON_MODEFILE` permite
  cambiar de modo entre pasadas (`setFakeMode` en el harness).
- **Es fiel a Teutón 2.10.6**: con `--case` escribe las filas `skip` del real,
  respeta `tt_testname` y `tt_outdir` como el real, y nunca borra `var/`.
  `tests/fake-teuton.test.ts` lo compara con los informes reales de
  `tests/fixtures/teuton-2.10.6/`.
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
| 19 | Modo examen activo | Bloquea la suspensión del equipo, y la suelta al detenerlo |
| 20 | «Reiniciar historial» por error tras corregir | La copia de seguridad existe fuera del proyecto y «Restaurar notas» devuelve las notas |
| 21 | «¿Todo listo?» con el examen en orden | Dice que se puede empezar, cuenta alumnos y comprobaciones; la falta de IP avisa pero no bloquea |
| 22 | «¿Todo listo?» con el `config.yaml` roto | Bloquea y nombra el fichero, en vez de dejarlo para el primer ciclo |
| 23 | «¿Todo listo?» con un alumno sin nombre | Bloquea: sin nombre su nota no se puede guardar ni exportar |
| 24 | Un alumno con la máquina apagada | Su columna de la matriz sale como «máquina no responde», no como un examen todo en rojo |
| 25 | Modo proyector encendido | La interfaz pasa a 20px de raíz y ni la IP ni la contraseña quedan visibles (tabla, consola ni orden ejecutada) |
| 26-29 | Grupo A bien y luego grupo B con `crash`, `noreports`, `syntaxerror` o `staleresume` | «No ha producido informes nuevos»; ni historial, ni CSV, ni meta del grupo B (S-02) |
| 30 | Vaciar la tabla (`emptyresume`) y «Cargar últimos resultados» | Los alumnos del grupo anterior no entran en el historial del nuevo (S-03) |
| 31-32 | `tt_testname` o `tt_outdir` añadidos con un `var/` antiguo | La pasada nueva se lee de donde la escribe Teutón (S-04) |
| 33 | Reevaluar a un alumno con el formato real de `--case` | El CSV de la clase no cambia, no hay filas «-» y la exportación queda bloqueada (S-01) |
| 34 | `.teuton-gui-meta.json` con `chmod 000` | Las notas se guardan igual (S-06) |
| 35 | Historial con `chmod 000` y una pasada peor | El CSV conserva las mejores notas (S-05) |
| 36 | `teuton` colgado en modo examen (reloj simulado) | A los 15 min se cancela con aviso y llega el ciclo siguiente (S-07) |
| 37 | Un alumno con la máquina apagada y una clase activa | No sale en el CSV como 0.00; la lista lo marca «sin evaluar» (S-11) |
| 38 | Cerrar la ventana entre dos ciclos del modo examen | No se cierra: el aviso la retiene (S-17) |
| 39 | Detener el modo examen y cerrar | Se cierra sin preguntar |
| 40 | Cerrar la sesión (SIGTERM) con el modo examen activo | La app termina; ningún diálogo bloquea el apagado |
| 41-42 | Abrir la app dos veces (desarrollo y **empaquetada**) con la primera minimizada | La segunda sale con 0; la primera sigue sola y vuelve al frente (S-21) |

El 17 deja un Electron bloqueado en un diálogo nativo que hay que matar a lo
bruto. Un SIGKILL al proceso principal **no** se lleva a sus hijos: quedaban
vivos el `teuton` que estaba corriendo y los tres procesos internos de Electron
(gpu, red, renderer), y como heredaron la tubería por la que habla Playwright,
esta no se cerraba nunca y la suite terminaba con «Worker teardown timeout of
90000ms exceeded» — 90 s de espera y seis procesos huérfanos por pasada
(~300 MB cada trío). `kill()` los remata ahora: los de Electron por su
`--user-data-dir`, que es único por sesión, y el `teuton` por los ficheros de
pid. La suite pasó de 2,2 min a 38 s y no deja nada vivo.

Y en los tests unitarios: restaurar una copia para una clase sin tocar otra
reiniciada y sin sustituir un historial que no se puede leer (S-08, S-09),
`classes.json` sin permisos de lectura (las clases no
pueden desaparecer ni sobreescribirse), 300 alumnos, dos guardados a la vez,
historial de notas dañado, informe que es un array, y claves de alumno que solo
se diferencian en espacios.

## Lo que encontró

- **Dos pasadas en el mismo segundo** (escenarios 26-29): la primera versión de
  la guarda de frescura redondeaba al segundo y aceptaba el resumen de la
  pasada anterior. Ahora compara exacto (salvo en sistemas de ficheros de
  segundos).
- **Cancelar procesaba el `exit` del proceso cancelado** (escenario 36): main lo
  emite antes de resolver la cancelación. `cancelRun` anula el turno antes.
- **Con `tt_outdir`, Teutón real sale con 1** si `var/<tt_testname>` no existe.
- **Carrera del propio test 11**: leía `informes/` cuando solo existía el
  temporal `.tmp` del guardado atómico.
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
3. **Suspender el ordenador a mano 10 minutos con el modo examen activo.** Al
   despertar, el vigilante reanuda el ciclo en menos de 30 s en vez de quedarse
   en `0:00`. (La suspensión *por inactividad* ya no puede ocurrir durante el
   modo examen: la app la bloquea — escenario 19.)
El escenario 15 es el único donde `app.isPackaged` es cierto, así que es el único
que prueba de verdad el preload CommonJS y la CSP incrustada. Necesita haber
empaquetado antes (`npm run dist:linux` o `./scripts/instalar.sh --forzar`); si no
hay build, se salta.

4. **Proyector:** con la clase entera y el **modo proyector encendido**,
   comprobar a tres metros que se distinguen los estados y que el nombre de pila
   basta para reconocer a cada uno.
