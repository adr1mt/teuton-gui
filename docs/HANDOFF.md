# Handoff

## Objective

Dejar la app lista para un examen real según el gate de
`docs/audits/SUMMARY.md` («Gate antes de usar en examen»).

## Completed

- Auditoría A1-A5 hecha (`docs/audits/`): 30 findings.
- **Fase de corrección de Critical y High terminada: S-01 a S-09 RESOLVED**,
  cada uno con test que fallaba antes, en su propio commit (S-05/S-06 juntos).
  Detalle, causa y verificación de cada uno en `SUMMARY.md`.
- Infraestructura: informes reales de Teutón 2.10.6 en
  `tests/fixtures/teuton-2.10.6/` y teuton falso fiel a ellos (filas `skip` de
  `--case`, `tt_testname`/`tt_outdir`, modos `noreports`, `syntaxerror`,
  `emptyresume`, `staleresume`; modo cambiable en caliente).
- Verificado el 2026-09-16: `npm run typecheck`, `npm test` (180),
  `npm run build`, `npm run test:e2e` (36), `npm run verify:parsing` sobre un
  proyecto ejecutado con Teutón 2.10.6 (completo y `--case=2`),
  `./scripts/instalar.sh --forzar` y escenario 15 con ese build.

## In progress

Nada.

## Next

Puntos 2, 7 y 8 del gate de `SUMMARY.md`:

1. Medium que pueden acabar en nota equivocada: S-11, S-14, S-17, S-21.
   Corregirlos o aceptarlos por escrito aquí. No empezados.
2. Ensayo de aula: 30 min de modo examen con máquinas reales, reevaluando a un
   alumno a mitad, y revisar a mano el CSV de `informes/` contra el panel.
   Tras una reevaluación el CSV no se reescribe hasta la siguiente pasada
   completa (riesgo aceptado en S-01; el aviso lo dice).
3. Comprobaciones manuales de `docs/UAT.md`: disco lleno y suspender con el
   modo examen activo.

Umbral por calibrar en clase: una pasada del modo examen se cancela tras
10 min o 3 intervalos (`cycleLimitMs` en `lib/run.ts`). `STALL_CYCLES` (3)
sigue igual.

## References

- `docs/audits/SUMMARY.md` — findings, estado y gate.
- `CLAUDE.md` — reglas de trabajo y mecanismos no evidentes.
- `docs/UAT.md` — ataques automatizados y comprobaciones manuales.
- `tests/fixtures/teuton-2.10.6/README.md` — comportamiento real de Teutón.
- Historial: `git log` y las releases de GitHub.

## Constraints

- Tras tocar código: `./scripts/instalar.sh` o se prueba la versión anterior.
- `npm run test:e2e` no compila (antes `npm run build`), necesita `DISPLAY` y,
  para el escenario 15, haber empaquetado.
- En este repo los comentarios van en español.
