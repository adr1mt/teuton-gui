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
- `npm run typecheck` y `npm test` (95 tests) en verde.

## In progress

Fase 2 — que no se pierda nada ni se quede en blanco: `readJson` distinguiendo
EACCES de ENOENT (hoy un `classes.json` ilegible borra todos los grupos),
`fsync` y cola de escrituras en `store.ts`, error boundary completo, CSV de
Moodle a prueba de fórmulas y `\r`, claves de récord sin espacios sobrantes,
tabla de configuración en solo lectura si el YAML está roto, y `tt_moodle_id`
con ceros a la izquierda que no se destroce al editar.

## Next

- Fase 3 — seguridad: confinar las rutas IPC a los proyectos abiertos de verdad,
  CSP real en el AppImage (hoy se entrega como cabecera y el renderer se carga
  con `file://`, donde no se aplica), `isTrustedSender` por ruta exacta.
- Fase 4 — UAT hostil: `teuton` falso con modos de fallo, Playwright sobre el
  Electron real, proyectos deliberadamente corruptos y `docs/UAT.md`.
- Fase 5 — reinstalar, verificar en la app instalada y cerrar.

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
