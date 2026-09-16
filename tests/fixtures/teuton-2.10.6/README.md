# Informes reales de Teutón 2.10.6

Capturados el 2026-09-16 ejecutando `teuton run --export=json .` (gema 2.10.6)
sobre `start.rb` + `config.yaml` de esta carpeta. Solo comprobaciones locales;
`tt_pwd` se ha sustituido por `/proyecto/proj`. Los nombres son ficticios.

| Carpeta | Orden | Qué contiene |
|---|---|---|
| `full/` | `teuton run` | 3 casos: Ana 100, Luis 100, Eva 50 |
| `case2/` | `teuton run --case=2` tras `full` | `resume.json` con 3 filas: `-`/skip, `02` Luis, `-`/skip. `case-01` y `case-03` son los de `full`: Teutón **no** los reescribe (mtime anterior) |
| `emptycases/` | `teuton run` con `cases: []` | `resume.json` con `cases: []`; los `case-NN.json` anteriores siguen en disco |

Comportamientos observados que la app y `scripts/fake-teuton.mjs` deben
respetar:

1. Nunca borra `var/<test>/`.
2. Con `--case=N`, las filas no elegidas salen como
   `{skip: true, id: "-", members: "-", grade: 0.0, letter: "S", moodle_id: ""}`.
   `--case=1,3` deja una sola fila skip en la posición 2.
3. `start.rb` con error de sintaxis: código 1, no toca `var/`.
4. `start.rb` sin bloque `play`: código 0, no escribe nada.
5. `config.yaml` sin casos (`cases: []` o sin clave): código 0, escribe
   `resume.json` y `moodle.csv` nuevos; no toca los `case-NN.json`.
6. `global.tt_testname: X` → todo va a `var/X/`.
7. `global.tt_outdir: D` → `resume.json`, `resume.txt` y `moodle.csv` van a
   `D/` (relativo al cwd, que la app fija en el proyecto), pero los
   `case-NN.json` siguen yendo a `var/<tt_testname>/` (`case/case.rb:37`).
8. Con `tt_outdir`, Teutón solo crea `D/`: si `var/<tt_testname>/` no existe,
   los hilos de exportación mueren con `Errno::ENOENT` y sale con código 1.
