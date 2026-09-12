# Handoff

## Objective

Tanda de endurecimiento sobre la 1.0.0: robustez, seguridad y una UAT hostil.
Terminada. Lo siguiente debe salir de usar la app en un examen real.

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
- Verificado: `npm run typecheck`, `npm test` (113), `npm run test:e2e` (19) y
  `./scripts/instalar.sh --forzar`. El escenario 15 prueba el AppImage ya
  empaquetado: arranca con ventana y la CSP bloquea un script inline.
- Comprobado de paso: el `files` de electron-builder no mete dependencias de
  desarrollo (los recursos empaquetados pesan 7,5 MB).

## In progress

Nada.

## Next

Usarla en un examen real. Comprobaciones manuales que quedan (`docs/UAT.md`):
disco lleno, suspender a mano con el modo examen activo, y el proyector a tres
metros con 30 alumnos. Las de cerrar ventana y cerrar sesión ya están
automatizadas (escenarios 16-18); la del USB queda aparcada porque el profesor
no usa USB.

Sigue pendiente de decidir en clase: si 16rem de ancho mínimo en la columna de
preguntas es el bueno, y si con 30 alumnos el nombre de pila basta.

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
