# Handoff

## Objective

La app está completa y publicada como 1.0.0. No hay tarea abierta: la próxima
tanda debe salir de usar la app en un examen real, no de una lista.

## Completed

- 1.0.0 publicada con `.deb` y `.AppImage`:
  <https://github.com/adr1mt/teuton-gui/releases/tag/v1.0.0>
- Última tanda (2026-08-23): integridad de identidad de clase, fronteras IPC
  endurecidas, accesibilidad AA, CI en GitHub Actions, 0 vulnerabilidades tras
  actualizar Electron 43 / Vite 7, y el preload empaquetado como CommonJS para
  que el AppImage instalado no arranque en blanco.
- `npm run typecheck` y `npm test` (81 tests) pasaban en esa tanda.

## In progress

Nada.

## Next

Usar la app en un examen real y apuntar qué se buscó y no se encontró. Dos
decisiones que sólo se pueden tomar mirando el proyector en clase:

- si el ancho mínimo de la columna de preguntas (16rem) es el bueno;
- si con una clase de 30 el nombre de pila basta para reconocer a cada alumno.

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
