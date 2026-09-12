# Handoff

## Objective

Red de seguridad para las notas antes del próximo examen real. Hecho lo de no
perder datos; lo siguiente debe salir de usar la app en clase.

## Completed

- 1.0.0 publicada con `.deb` y `.AppImage`:
  <https://github.com/adr1mt/teuton-gui/releases/tag/v1.0.0>
- **Ciclo de vida del examen**: el modo examen ya no puede morir en silencio
  mostrando «activo» (reserva síncrona del turno + vigilante de 30 s que reanuda
  el bucle tras un `ssh` colgado o una suspensión); cambiar de proyecto cancela
  de verdad la ejecución anterior, con confirmación; sin procesos huérfanos
  (reserva antes de lanzar, cancelación que espera la muerte real del hijo,
  hijos de `check`/`export` registrados, señales del sistema atendidas); aviso
  modal al cerrar la ventana con una corrección en curso; red de seguridad
  `uncaughtException`/`unhandledRejection`.
- **Datos**: un fichero ilegible ya no pasa por «no hay datos» (antes un
  `classes.json` sin permisos se reescribía vacío y se llevaba todos los
  grupos); `fsync` y cola de escrituras; error boundary en toda la app; CSV a
  prueba de fórmulas y `\r`; nombres normalizados sin espacios sobrantes; tabla
  de configuración bloqueada si el YAML está roto; `tt_moodle_id: 0012345`
  sobrevive a editar la tabla; notas imposibles no tiran Analíticas.
- **Seguridad**: rutas IPC confinadas a los proyectos abiertos de verdad; CSP
  incrustada en el HTML al compilar (la cabecera nunca llegaba al AppImage, que
  carga con `file://`); `isTrustedSender` por ruta exacta; `..` y ficheros
  ocultos rechazados; la ruta manual de Teutón se comprueba antes de fijarla.
- **UAT hostil**: `scripts/fake-teuton.mjs` (modos `hang`, `crash`, `truncate`,
  `noresume`, `huge`, `slow`, `notargets`, `badgrades`) + Playwright sobre la app
  real, con `userData` y proyecto temporales. Encontró un fallo real: dos
  arranques en el mismo tick dejaban huérfano el proceso del primero.
- **El modo examen impide que el ordenador se suspenda** mientras está activo
  (`prevent-display-sleep`, porque el panel está proyectado) y lo suelta al
  pararlo o al salir. Sin esto el escritorio daba el equipo por inactivo —nadie
  toca el teclado durante un examen— y lo suspendía a las 2 h, justo al final.
- Verificado: `npm run typecheck`, `npm test` (113), `npm run test:e2e` (20) y
  `./scripts/instalar.sh --forzar`. El escenario 15 prueba el AppImage ya
  empaquetado: arranca con ventana y la CSP bloquea un script inline.
- Comprobado de paso: el `files` de electron-builder no mete dependencias de
  desarrollo (los recursos empaquetados pesan 7,5 MB).
- **Copia de seguridad de las notas, fuera de la carpeta del examen**. El
  historial de mejores notas vivía solo dentro del proyecto: borrar la carpeta o
  pulsar «Reiniciar historial» por error lo perdía sin vuelta atrás. Ahora cada
  corrección deja una copia por hora en `~/.config/teuton-gui/copias-notas/`
  (unos KB de JSON) y «Restaurar notas de una copia» está en el menú «…» de
  Resultados y también en la pantalla vacía, que es donde acaba quien ha perdido
  la carpeta. Restaurar fusiona por máximo: nunca baja una nota ya guardada.
  Escenario 20 de la UAT.
- **Ajustes avisa si no puede leer las credenciales guardadas**. Si el llavero
  del escritorio no responde, la app usaba usuario/usuario y eso solo se veía en
  el log: la tabla parecía correcta. Ahora lo dice en pantalla, y también avisa
  cuando se guardan sin cifrar por no haber llavero.
- `test-results/` (salida de Playwright) ya no se versiona: ensuciaba cada
  pasada de tests con cambios falsos. Ignorada junto a `playwright-report/`.
- **Tres mejoras del panel**, las que quedaban propuestas y ahora están hechas:
  - **Máquina apagada ≠ examen mal hecho.** En la matriz, el alumno cuyo equipo
    no responde ya no pinta su columna del mismo rojo que quien lo ha hecho
    todo mal: sus celdas llevan el icono de «sin conexión» en gris y su nombre
    también. Escenario `maquina-apagada` de la UAT (modo `offline` del teuton
    falso).
  - **Botón «¿Todo listo?»** en Ejecutar: comprueba de una vez Teutón, el
    config.yaml, los alumnos y `teuton check` antes de empezar. Los fallos
    bloquean, los avisos (p.ej. un alumno sin IP) no. Guarda los borradores
    antes, porque `teuton check` lee el disco. Tres escenarios de UAT.
  - **Alumno estancado**, sin cartel: quien lleva 3 vueltas sin mejorar nada y
    sigue suspenso sube al principio de «Requieren atención» y lleva una marca
    pequeña en su fila y en Analíticas. Quien ya aprueba y deja de subir no
    cuenta: ha terminado.

## In progress

Nada.

## Next

Usarla en un examen real. Comprobaciones manuales que quedan (`docs/UAT.md`):
disco lleno, suspender a mano con el modo examen activo, y el proyector a tres
metros. Las de cerrar ventana y cerrar sesión ya están automatizadas
(escenarios 16-18); la del USB queda aparcada porque el profesor no usa USB.

Dimensión real confirmada: **15 alumnos por clase como máximo**, no 30. Eso
cierra las dos dudas de diseño que quedaban abiertas: 15 columnas caben en el
panel y `shortNameMap` ya desambigua con la inicial del apellido cuando dos
comparten nombre de pila. No hay nada que decidir ahí.

Mejoras propuestas y aún no hechas: un «modo proyector» que agrande el texto y
oculte IPs y contraseñas. Las otras tres ya están hechas (ver arriba).

Pendiente de calibrar en clase: el umbral de «sin avanzar» son 3 vueltas
(`STALL_CYCLES` en `lib/stall.ts`). Con un intervalo de 5 min son 15 minutos
parado; si en el examen real salta demasiado pronto o demasiado tarde, es el
único número que hay que tocar.

Ojo al ejecutar la UAT: `npm run test:e2e` **no** compila. Hay que pasar por
`npm run build` (o `./scripts/instalar.sh --forzar` para el escenario 15) o se
prueba el build anterior.

La UAT termina con «Worker teardown timeout of 90000ms exceeded» además del
«24 passed». Está comprobado que es anterior a estos cambios (sale igual con el
árbol limpio): un proceso que Playwright no cierra al acabar el worker, no un
test que falle. Sin diagnosticar.

## References

- `CLAUDE.md` — reglas de trabajo y mecanismos no evidentes.
- `docs/UAT.md` — ataques automatizados y comprobaciones manuales.
- `docs/DESIGN.md` — reglas visuales.
- `docs/PRODUCT.md` — para quién es y qué cuenta como éxito.
- `README.md` — instalación, primer arranque y proyecto de demostración.
- Historial de cambios: `git log` y las releases de GitHub.

## Constraints

- Tras tocar código hay que reinstalar (`./scripts/instalar.sh`) o se prueba la
  versión anterior.
- `npm run test:e2e` necesita un `DISPLAY` real y, para el escenario 15, haber
  empaquetado antes.
- En este repo los comentarios van en español.
