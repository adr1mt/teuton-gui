# Handoff

## Objective

Tanda de endurecimiento sobre la 1.0.0: robustez, seguridad y una UAT hostil que
intente romper la app. No entran funciones nuevas. Plan en 5 fases; se puede
parar al final de cualquiera.

## Completed

- 1.0.0 publicada con `.deb` y `.AppImage`:
  <https://github.com/adr1mt/teuton-gui/releases/tag/v1.0.0>
- **Fase 1 — ciclo de vida del examen**:
  - La invariante «modo examen activo ⇒ hay ciclo programado» ya no se pierde:
    ceder el turno a una ejecución en vuelo reprograma (antes el monitor moría
    en silencio mostrando «activo»), y un vigilante de 30 s reanuda el bucle si
    se quedó parado (`ssh` colgado que nunca termina, portátil suspendido).
  - `leaveProject()`: abrir o crear otro proyecto cancela de verdad la ejecución
    anterior y para el temporizador, con confirmación si hay examen en marcha.
    Antes el proceso seguía vivo, sus resultados se perdían y main rechazaba la
    siguiente ejecución sobre ese directorio.
  - Sin procesos huérfanos: reserva del directorio *antes* de lanzar (cierra el
    doble clic en «Ejecutar»), cancelación que espera a la muerte real del hijo,
    los hijos de `check`/`export` registrados para morir al salir, grupo propio
    en `runTeutonSync`, y `SIGTERM`/`SIGINT`/`SIGHUP` atendidas.
  - Aviso modal al cerrar la ventana con una corrección en curso.
  - Red de seguridad `uncaughtException`/`unhandledRejection` en main.
- **Fase 2 — que no se pierda nada ni se quede en blanco**:
  - Un fichero ilegible o dañado ya no pasa por «no hay datos»: antes, un
    `classes.json` que no se podía abrir parecía «no hay clases» y el siguiente
    guardado lo reescribía vacío (todos los grupos del centro), y un historial
    de notas corrupto se sustituía por las notas de una sola pasada.
  - `writeAtomic` hace `fsync` del fichero y del directorio, y las escrituras
    sobre un mismo fichero van en cola: dos ciclos solapados ya no se pisan la
    mejor nota ni el `lastRunClassId` del que depende el CSV.
  - El error boundary envuelve toda la app (antes solo la vista: un fallo en la
    barra lateral dejaba pantalla blanca) y «Reintentar» vuelve a Inicio en vez
    de re-lanzar el mismo error.
  - CSV de Moodle a prueba de fórmulas (`=`, `+`, `-`, `@`) y de `\r`; el fichero
    exportado a mano se escribe atómico y 0600 como el resto.
  - Los nombres se normalizan sin espacios sobrantes en `studentRows`, la fuente
    única: «Ana García » ya no parte el historial en dos.
  - La tabla de configuración se bloquea si el YAML está roto — un clic en
    «añadir alumno» vaciaba la clase entera — y los identificadores con ceros a
    la izquierda (`tt_moodle_id: 0012345`) sobreviven a editar cualquier celda.
  - Notas negativas o no finitas ya no tiran la vista de Analíticas.
- `npm run typecheck` y `npm test` (106 tests) en verde.

- **Fase 3 — seguridad** (defensa en profundidad: no hay `innerHTML` ni `eval`
  en el renderer, que solo carga contenido propio):
  - Las rutas están confinadas a los proyectos que el profesor ha abierto de
    verdad (selector del sistema o lista de recientes). Antes, los 14 handlers
    con directorio aceptaban cualquier ruta del disco: `saveProject` era una
    escritura arbitraria y `openPath` un `xdg-open` de lo que fuera.
  - CSP de verdad en la app instalada: se incrusta como `<meta>` al compilar
    (`inlineCsp`). La cabecera HTTP del proceso main no llegaba nunca al AppImage
    porque el renderer se carga con `file://`, donde `webRequest` no interviene.
    Añadidas `base-uri`, `form-action` y `object-src`, que no heredan.
  - `isTrustedSender` compara la ruta real del renderer, no el final de la URL.
  - `fileName` rechaza `..` y ficheros ocultos; la ruta manual de Teutón en
    Ajustes se comprueba (`teuton version`) antes de quedar fijada.
- `npm run typecheck` y `npm test` (107 tests) en verde.

## In progress

Fase 4 — UAT hostil: `teuton` falso con modos de fallo (colgado, corrupto, sin
resume, 40 MB por stdout), Playwright sobre el Electron real, proyectos
deliberadamente corruptos y `docs/UAT.md` con la lista de ataques.

## Next

- Fase 5 — reinstalar (`./scripts/instalar.sh --forzar`), verificar en la app
  instalada que la CSP está activa y que un ciclo de modo examen entero funciona.
- Revisar si el `files` de electron-builder (`node_modules/**/*`) mete
  dependencias de desarrollo en el AppImage.

Sigue pendiente de mirar en clase: si 16rem de ancho mínimo en la columna de
preguntas es el bueno, y si con 30 alumnos el nombre de pila basta.

## References

- `CLAUDE.md` — reglas de trabajo y mecanismos no evidentes.
- `docs/DESIGN.md` — reglas visuales.
- `docs/PRODUCT.md` — para quién es y qué cuenta como éxito.
- `README.md` — instalación, primer arranque y proyecto de demostración.
- Historial de cambios: `git log` y las releases de GitHub.

## Constraints

- Tras tocar código hay que reinstalar (`./scripts/instalar.sh`) o se prueba la
  versión anterior.
- En este repo los comentarios van en español.
