# Handoff

## Objective

Dejar la app lista para un examen real según el gate de
`docs/audits/SUMMARY.md` («Gate antes de usar en examen»).

## Completed

- Auditoría A1-A5 hecha (`docs/audits/`): 30 findings.
- Critical y High: S-01 a S-09 RESOLVED.
- Medium del gate: S-11, S-14, S-17 y S-21 RESOLVED, ninguno aceptado como
  riesgo. Causa, arreglo, tests y riesgo residual de cada uno en `SUMMARY.md`.
- Verificado el 2026-09-19 con la actualización automática: `npm run typecheck`,
  `npm test` (192), `npm run test:e2e` (40/42; los 2 de `instancia-unica.spec.ts`
  fallan también sin estos cambios: el escritorio no restaura la ventana
  minimizada en esta sesión X, no es regresión) y `./scripts/instalar.sh
  --forzar`.
- Verificado el 2026-09-16: `npm run typecheck`, `npm test` (192),
  `npm run build`, `npm run test:e2e` (42, empaquetada incluida),
  `./scripts/instalar.sh --forzar` y dos arranques del AppImage instalado.

## In progress

Nada. La v1.1.0 ya está publicada:
<https://github.com/adr1mt/teuton-gui/releases/tag/v1.1.0>

Cada app instalada se actualiza sola (`src/main/updater.ts`): comprueba 30 s
después de abrir, nunca en modo examen, e instala al cerrar. Solo el AppImage,
no el `.deb`.

Publicar una versión nueva: subir `version` en `package.json`, commitear y
empujar el tag `v<esa versión>`. El resto lo hace
`.github/workflows/release.yml`.

El README es ahora la portada pública: qué es, créditos a Teutón, instalación
en Ubuntu, uso en cuatro pasos y capturas de `docs/img/` (se regeneran con
`node scripts/capturas.mjs`, con alumnado inventado).

## Next

Solo quedan las pruebas con personas y máquinas reales:

1. Ensayo de aula: 30 min de modo examen con máquinas reales, reevaluando a un
   alumno a mitad, y revisar a mano el CSV de `informes/` contra el panel
   (incluido un alumno con la máquina apagada: «—» y fuera del CSV).
2. Prueba manual de disco lleno (`docs/UAT.md`).
3. Prueba manual de suspensión con el modo examen activo (`docs/UAT.md`).
4. Comprobar la actualización de punta a punta: bajar el AppImage de la v1.1.0
   a otro ordenador y publicar una v1.1.1 para ver si se actualiza solo.

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
- Publicar una versión = subir `version` en `package.json` y empujar el tag
  `v<misma versión>`; el workflow falla si no coinciden.
- `npm run test:e2e` no compila (antes `npm run build`), necesita `DISPLAY` y,
  para el escenario 15, haber empaquetado.
- En este repo los comentarios van en español.
