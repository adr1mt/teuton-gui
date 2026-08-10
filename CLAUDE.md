# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Teutón GUI is an Electron + React + TypeScript desktop app (Linux) that wraps the **Teutón** CLI
(`teuton-software/teuton`, a Ruby gem for infrastructure-testing) with a visual interface for teachers:
project/test editing, execution, and a live evaluation dashboard for the classroom.

**Core principle: this app never reimplements Teutón's scoring or evaluation logic.** It only spawns the
`teuton` CLI, edits `start.rb`/`config.yaml`, and parses the JSON reports Teutón already produces
(`var/<test>/case-NN.json`, `resume.json`, `moodle.csv`). If a feature seems to require duplicating how
Teutón computes a grade or runs a check, the correct fix is almost always to shell out to `teuton` (`run`,
`check`) and parse its output, not to hand-roll the logic in TypeScript.

## Commands

```bash
npm install              # install deps
npm run dev               # electron-vite dev server with HMR
npm run typecheck         # tsc --noEmit for main/preload, renderer AND tests (run before considering a change done)
npm test                   # vitest run — unit tests in tests/
npm run build              # electron-vite build -> out/
npm run dist:linux         # build + electron-builder (AppImage + deb) -> dist/
./launch.sh                 # builds if needed, kills stale instances, launches with --no-sandbox
npm run icon               # regenerates build/icon.png + build/icons/*.png (pure-Python, no deps)
./scripts/instalar.sh      # builds the AppImage, installs it to /mnt/datos + the desktop menu
```

**Always finish a code change by running `./scripts/instalar.sh`, and say so in the summary.** The user
opens the app from the desktop menu, never from a terminal, so an un-reinstalled change is invisible to
them — they'd be testing the previous build without knowing it. The menu entry
(`~/.local/share/applications/teuton-gui.desktop`) points at
`/mnt/datos/Aplicaciones/TeutonGUI/TeutonGUI.AppImage`, not at `launch.sh`. `launch.sh` still exists for
quick dev runs from source, but it is not what the user launches.

**Nothing large goes on `/`** — that partition is ~96% full (a few GB free). The executable lives under
`/mnt/datos`, and any bulky file the app generates must default there too (Teutón's reports already land
next to the teacher's project). `userData` under `~/.config/teuton-gui` is fine: it only holds small JSON.

Repo layout beyond `src/`: `docs/` (DESIGN, PRODUCT, HANDOFF), `build/` (packaging icons — the
committed PNGs come from `scripts/make-icon.py`; electron-builder derives the installed icon sizes from
the `NxN.png` filenames, so don't rename them), `sandbox/` (the teacher's local Teutón projects, gitignored;
`scripts/make-demo-project.mjs` writes `sandbox/examen-demo/`).

`tests/` holds Vitest unit tests (node environment, no jsdom) over the pure domain logic plus
`main/results.ts`, which doesn't import electron. `tests/helpers.ts` has the fixture factories;
`tests/setup.ts` only stubs `localStorage`, which `stores/app.ts` touches at module scope. Anything that
imports `electron` or renders React is out of scope for these tests — use the two scripts below instead.

```bash
# Validates the JSON parser + analytics against REAL teuton output (requires `teuton` installed):
npm run verify:parsing -- <path/to/a/project/already/run>
```

`scripts/screenshot.ts` is a smoke test that boots the real app in Electron and captures a PNG — the
standard way to visually verify a change end-to-end when there's no display driving tool available. Bundle
it the same way with esbuild (`--external:electron`) and run with `node_modules/electron/dist/electron
/tmp/out.mjs --no-sandbox` under a real `DISPLAY`.

To unit-exercise `main/store.ts` (records/CSV logic) outside Electron, bundle a throwaway script with
`--alias:electron=<stub>.ts` where the stub exports `app = { getPath: () => '/tmp' }` — plain `node` can
then run it against a temp directory.

## Architecture

Three-process Electron layout under `src/`:

- `src/main/` — Node process. `teuton.ts` resolves and invokes the CLI; `projects.ts` handles project
  files + recents; `results.ts` parses Teutón's JSON reports into typed structures; `store.ts` persists
  app-level settings (grading scale, saved classes) in `userData` and per-project grade records next to the
  project; `ipc.ts` registers every `ipcMain.handle`.
- `src/preload/` — `contextBridge`-exposed `window.teuton` API (`contextIsolation: true`,
  `nodeIntegration: false`). This is the only bridge between renderer and Node.
- `src/renderer/src/` — React UI. `routes/` are the top-level views (Home, Editor, Run, Dashboard,
  Analytics, Classes, Settings), `stores/app.ts` is a single Zustand store holding all cross-view state,
  `lib/` holds the domain logic (see below), `components/ui/` is a small local shadcn-style primitive set.
- `src/shared/` — `types.ts` (the `TeutonApi` interface — the full IPC contract), `ipc.ts` (channel name
  constants), and small process-agnostic helpers like `sanitize.ts` (`sanitizeFileName`). Both main and
  renderer import from here; when adding an IPC call, update both files plus the handler in `main/ipc.ts`
  and the binding in `preload/index.ts`. **The `IPC` map's property name doesn't have to match the exposed
  `window.teuton` method name** — `runStart` is exposed as `run()`, `runCancel` as `cancelRun()` — so don't
  "fix" that naming difference; it's intentional for API ergonomics. If you add a helper that needs to run
  identically on both sides of the process boundary (main can't import from `renderer/` or vice versa),
  put it in `src/shared/` rather than duplicating it — that's what happened with the filename sanitizer
  used by both `main/store.ts` (Moodle CSV paths) and `Dashboard.tsx` (save-dialog default name) before it
  moved here.

### Non-obvious mechanisms worth knowing before touching them

**Config file colon-symbol format** (`lib/config.ts`). Teutón's config YAML is read by Ruby's `YAML.load`,
which accepts both `tt_members: x` and the legacy Ruby-symbol style `:tt_members: x` (keys/values prefixed
with `:`). `js-yaml` (used in the renderer) does *not* auto-strip that prefix — it would parse `:global` as
a literal string key, silently breaking the visual table for anyone with an older-style config file.
`parseConfig`/`stringifyConfig` normalize prefixed keys on read and always write back in modern (no-colon)
style, while any *other* top-level section the UI doesn't edit (`alias`, `macros`, `tt_include`, …) is kept
in `TeutonConfig.extra` and passed through byte-for-byte on save so it's never silently dropped.

**Background execution & the "modo examen" loop** (`lib/run.ts`). Run state lives in the global Zustand
store (`useApp.getState().run`), not component state, specifically so navigating away from the Run tab
never interrupts or loses the child process output — `useRunManager()` (mounted once in `App.tsx`) is the
single subscriber to `window.teuton.onRunEvent`. Each run freezes its context (`projectDir`, `classId`,
`className`) in the run state at start, and `loadAfterExit` uses that frozen context — never the current
store values — so switching project or class mid-run can't attribute results to the wrong group. Events
whose `runId` doesn't match the active one are dropped (that's how a cancelled process's `close` event is
ignored). "Modo examen" (`startMonitor`/`stopMonitor`) re-invokes `startRun` on a `setTimeout` chain (not
`setInterval`) so cycles never overlap. The chain's invariant is *monitor.active ⇒ a next cycle is
scheduled*: every path that ends a cycle — normal exit (`loadAfterExit`), cancellation (`cancelRun`), and
both startup-failure branches in `startRun` — must call `scheduleNextCycle`, or the monitor silently dies
while still showing "active".

**Live progress bar** (`lib/progress.ts`). Teutón doesn't report machine-readable progress. It prints one
character per check to stdout between the `Started at` and `Finished in` lines: `.` (pass), `F` (fail), `S`
(entire case skipped). The expected total is obtained by running `teuton check` first and parsing the
`Targets` row of its "DSL Stats" table, multiplied by the number of cases being run (skipped cases count as
1, not `targetsPerCase`). `computeLiveProgress` scopes its regex match strictly to the region between those
two markers — matching `.`/`F`/`S` anywhere in the full buffer would false-positive on grade values like
"100.0" or on the word "Finished" itself.

**Grading conversion** (`lib/grading.ts`). Teutón's native score is always 0–100. The GUI overlays a
configurable piecewise-linear mapping — `(0,0)`, `(passScore, maxGrade/2)`, `(100, maxGrade)` — so a
teacher's "70 points = passing (5/10)" convention is representable. This conversion is purely a display/
export concern; `main/store.ts` and the JSON parser always operate on Teutón's raw 0–100 score. The same
configurable threshold drives every "passed" computation (`isPass`, `computeKpis`,
`studentsNeedingAttention`) — never hardcode 50.

**App-level default globals** (`get/setDefaultGlobals` in `main/store.ts`, `default-globals.json` in
`userData`). Credentials that repeat across every class (typically the students' machine login,
`host1_username`/`host1_password` = `usuario`) live as an app-wide setting, seeded to `usuario`/`usuario`
on first use and edited in Settings. `ConfigTable.importClass` merges them into the project's `global:`
section with `{ ...defaults, ...config.global }` — existing project globals always win, so importing never
clobbers a value the teacher set by hand. An empty saved object is respected (not re-seeded); `readJson`'s
fallback only applies when the file is missing.

**Best-grade record, not last-run grade — scoped per class**. `getRecords`/`updateRecords`/`resetRecords`
(`main/store.ts`) persist per-student max scores in `<project>/.teuton-gui-records.json`, merged with
`Math.max` on every run. This exists so a student who finishes with a 10 and shuts down their machine
(causing later exam cycles to see a connection failure / 0) doesn't lose that grade — Moodle CSV export
always uses `max(currentRunGrade, record)`, not the latest run in isolation. The file is format v2: a
`classes` map keyed by `class:<rosterId>` (or `manual` for hand-added cases), so two groups sharing a
student name never cross-contaminate. A pre-v2 flat map is kept under `legacy` and only feeds the `manual`
scope, never a class. Which class a run belongs to is stamped in `.teuton-gui-meta.json` as
`lastRunClassId` (`null` = manual, absent = pre-v2 project) when results load; `reloadLatestResults()`
(`lib/run.ts`) uses that — not the currently active class — when "load last results" merges records. The
dashboard's "Reiniciar historial" button (`records:reset` IPC) clears one class's records, e.g. after a
practice pass before the real exam.

**Per-class Moodle CSVs**. The teacher runs the *same* exam project with several class groups. When a class
is imported into a project (ConfigTable), its name and roster id are remembered in
`<project>/.teuton-gui-meta.json` (`activeClass`/`activeClassId`, reloaded by an effect in `App.tsx`
whenever the project object changes) and, after every completed run, `lib/run.ts` auto-writes
`<project>/informes/moodle-<clase>-<id8>.csv` via `buildMoodleCsv` (`lib/moodleCsv.ts`) using best-record
grades. The 8-char roster-id suffix keeps two classes with the same display name apart; when writing,
`writeClassCsv` also deletes the old un-suffixed `moodle-<clase>.csv` so a teacher can't upload a stale
file to Moodle. Re-importing the *same* class merges with existing cases by `tt_members` (keeps
exam-specific fields like service/port); importing a *different* class starts from its own data only, so a
same-named student can't inherit the previous group's IPs or credentials.

**Draft-vs-disk consistency**. `teuton run` reads files from disk, but the editor holds drafts in the
store. `startRun` therefore always calls `saveDraftsIfDirty()` first — without it, importing a class and
running would evaluate the *old* students while the UI lists the new ones. Similarly, `results.ts` filters
`case-*.json` files against the ids declared in the current `resume.json`, because Teutón overwrites but
never deletes case files from earlier runs with more students.

**Corrupt `case-NN.json` must never silently drop a student** (`main/results.ts`, `lib/analytics.ts`).
Teutón writes each report with `File.open(f, "w")`, so two overlapping `teuton run` on the same
`var/<test>/` leave the shorter process's JSON followed by the longer one's tail: a *valid* JSON object
plus trailing garbage. `JSON.parse` throws on that. `readJson` therefore falls back to
`parseFirstJsonValue` (a brace-balanced `raw_decode`, string-aware) and records the incident in
`LoadedResults.warnings`, which the dashboard shows as a banner — the old silent `catch { return null }`
made the student vanish from the matrix, the analytics and the student detail while the list (fed by
`resume.json`) still showed them, with no clue why. `startRun` also refuses to launch while another run is
active, which is what produced the interleaved write in the first place. For the same reason `buildMatrix`
takes `StudentRow[]`, not `LoadedResults`: matrix columns come from the *same* rows as the list view, so a
missing or unreadable case report shows a `?` column instead of removing the student.

**PATH discovery for `teuton`** (`main/teuton.ts`). Desktop apps often start with a minimal `PATH` that
excludes Ruby gem bin directories. `teutonEnv()` resolves a login shell's `PATH` once and additionally
scans `~/.local/share/gem/ruby/*/bin` and `~/.gem/ruby/*/bin`, so `teuton` is found even if the user never
added it to their shell profile.

### Security posture

`contextIsolation: true`, `nodeIntegration: false`, a restrictive CSP (no `unsafe-eval`; Monaco runs fine
without it), `will-navigate`/`setWindowOpenHandler` block in-app navigation to anything outside the loaded
renderer, and `shell.openExternal` is only reachable through the `openExternal` IPC channel which
allow-lists `https?:`/`mailto:` schemes. CLI invocations always use `spawn`/`execFile` with an args array
(never a shell string), so config values (student names, IPs, etc.) can't inject shell commands.
