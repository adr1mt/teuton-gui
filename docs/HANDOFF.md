# Handoff

## Objective

Dejar la app lista para un examen real según el gate de
`docs/audits/SUMMARY.md` («Gate antes de usar en examen»).

## Completed

- Auditoría A1-A5 hecha (`docs/audits/`): 30 findings.
- Critical y High: S-01 a S-09 RESOLVED.
- Medium del gate: S-11, S-14, S-17 y S-21 RESOLVED, ninguno aceptado como
  riesgo. Causa, arreglo, tests y riesgo residual de cada uno en `SUMMARY.md`.
- Verificado el 2026-09-16: `npm run typecheck`, `npm test` (192),
  `npm run build`, `npm run test:e2e` (42, empaquetada incluida),
  `./scripts/instalar.sh --forzar` y dos arranques del AppImage instalado.

## In progress

Nada.

## Next

Solo quedan las pruebas con personas y máquinas reales:

1. Ensayo de aula: 30 min de modo examen con máquinas reales, reevaluando a un
   alumno a mitad, y revisar a mano el CSV de `informes/` contra el panel
   (incluido un alumno con la máquina apagada: «—» y fuera del CSV).
2. Prueba manual de disco lleno (`docs/UAT.md`).
3. Prueba manual de suspensión con el modo examen activo (`docs/UAT.md`).

No tocar el resto de Medium (S-10, S-12, S-13, S-15, S-16, S-18-S-20) ni los
Low hasta después del ensayo.

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
