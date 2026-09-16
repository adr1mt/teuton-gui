# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Teutón GUI is an Electron + React + TypeScript desktop app (Linux) that wraps the **Teutón** CLI
(`teuton-software/teuton`, a Ruby gem for infrastructure-testing) with a visual interface for teachers:
project/test editing, execution, and a live evaluation dashboard for the classroom.

**Core principle: this app never reimplements Teutón's scoring or evaluation logic.** It only spawns the
`teuton` CLI, edits `start.rb`/`config.yaml`, and parses the JSON reports Teutón already produces
(`var/<test>/case-NN.json`, `resume.json`, `moodle.csv`). If a feature seems to require duplicating how
Teutón computes a grade or runs a check, the correct fix is almost always to shell out to `teuton` (`run`,
`check`) and parse its output, not to hand-roll the logic in TypeScript.

**The user is a teacher, not a programmer.** He opens the app from the desktop menu and judges it by what
he sees on screen during an exam. Explain in those terms, not in code terms.

## Finish every change with these three

1. **`npm run typecheck && npm test`** — before considering any change done. If the change touches the
   run lifecycle, the exam loop, the trust boundary or the packaging, `npm run test:e2e` too (it drives
   the real app, so it needs a `DISPLAY`; `dist/linux-unpacked` must exist for the packaged scenario).
2. **`./scripts/instalar.sh`**, and say so in the summary. He opens the app from the desktop menu, never
   from a terminal, so an un-reinstalled change is invisible: he would be testing the previous build
   without knowing it. The menu entry (`~/.local/share/applications/teuton-gui.desktop`) points at
   `/mnt/datos/Aplicaciones/TeutonGUI/TeutonGUI.AppImage`, not at `launch.sh`.
3. **Update `docs/HANDOFF.md`** in the *same* commit if the change moves the current state — objective,
   what is in progress, what is next. It holds 30-60 lines of live state, not history: drop whatever is
   no longer needed to resume work. History lives in `git log` and the GitHub releases.

**Nothing large goes on `/`** — that partition is ~96 % full. The executable lives under `/mnt/datos`, and
any bulky file the app generates must default there too (Teutón's reports already land next to the
teacher's project). `userData` under `~/.config/teuton-gui` is fine: it only holds small JSON.

## Commands

```bash
npm install                # install deps
npm run dev                # electron-vite dev server with HMR
npm run typecheck          # tsc --noEmit for main/preload, renderer AND tests
npm test                   # vitest run — unit tests in tests/
npm run test:e2e           # playwright — UAT hostil sobre la app real (needs a DISPLAY)
npm run screenshot         # captura la app real en /tmp/teuton-shot.png
npm run build              # electron-vite build -> out/
npm run dist:linux         # build + electron-builder (AppImage + deb) -> dist/
npm run icon               # regenerates build/icon.png + build/icons/*.png (pure-Python, no deps)
./launch.sh                # builds if needed, kills stale instances, launches with --no-sandbox
./scripts/instalar.sh      # builds the AppImage, installs it to /mnt/datos + the desktop menu
                           #   --forzar rebuilds unconditionally; --desinstalar removes everything
```

## Repo layout

Beyond `src/` (see Architecture):

- `docs/` — DESIGN, PRODUCT, HANDOFF (see the table at the end).
- `build/` — packaging icons. The committed PNGs come from `scripts/make-icon.py`; electron-builder
  derives the installed icon sizes from the `NxN.png` filenames, so **don't rename them**.
- `sandbox/` — the teacher's local Teutón projects, gitignored. `scripts/make-demo-project.mjs` writes
  `sandbox/examen-demo/`.

## Testing

`tests/` holds Vitest unit tests (node environment, no jsdom) over the pure domain logic plus
`main/results.ts`, which doesn't import electron. `tests/helpers.ts` has the fixture factories;
`tests/setup.ts` only stubs `localStorage`, which `stores/app.ts` touches at module scope. **Anything that
imports `electron` or renders React is out of scope for these tests** — use the three routes below.

```bash
# Validates the JSON parser + analytics against REAL teuton output (requires `teuton` installed):
npm run verify:parsing -- <path/to/a/project/already/run>
```

**Hostile UAT** (`tests/e2e/`, `npm run test:e2e`). Playwright drives the real app; `scripts/fake-teuton.mjs`
stands in for the CLI with failure modes real machines can't be asked to reproduce (`FAKE_TEUTON_MODE`:
`hang`, `crash`, `truncate`, `noresume`, `huge`, `slow`, `notargets`, `badgrades`, `offline`). Every scenario gets its
own temporary `userData` and project, so **the UAT never touches the teacher's real classes or settings**.
Orphan processes are detected through the pidfiles the fake binary writes, not `pgrep -f`, whose pattern
also matches the command line of whoever is searching. See `docs/UAT.md` for the list of attacks and the
six checks that still need a human.

`npm run screenshot` boots the real app in Electron and captures a PNG (`/tmp/teuton-shot.png`, or
`SHOT_OUT`) — useful to eyeball a visual change. It needs a real `DISPLAY`, like the e2e suite.

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
  constants), and small process-agnostic helpers like `sanitize.ts` (`sanitizeFileName`).

Two rules for `src/shared/`:

- **Adding an IPC call means four files**: `shared/types.ts`, `shared/ipc.ts`, the handler in
  `main/ipc.ts` and the binding in `preload/index.ts`.
- **The `IPC` map's property name doesn't have to match the exposed `window.teuton` method name** —
  `runStart` is exposed as `run()`, `runCancel` as `cancelRun()`. Don't "fix" that difference; it is
  intentional for API ergonomics.
- A helper that must run identically on both sides of the process boundary goes in `src/shared/`, not
  duplicated (main can't import from `renderer/` or vice versa). That is what happened with the filename
  sanitizer used by both `main/store.ts` (Moodle CSV paths) and `Dashboard.tsx` (save-dialog default name).

## Non-obvious mechanisms worth knowing before touching them

Each of these has a bug behind it. Read the one that covers what you are about to change.

| If you touch… | Read |
|---|---|
| `config.yaml` parsing or the visual config table | Config file colon-symbol format |
| the Run tab, «modo examen», cancelling a run | Background execution & the monitor loop |
| the progress bar or stdout parsing | Live progress bar |
| grades, passing thresholds, KPIs | Grading conversion |
| the attention list, the stalled-student badge | Stalled students |
| the «¿Todo listo?» button in Run | Pre-flight checks |
| Settings, shared credentials, class import | App-level default globals |
| Moodle export, grade history, «Reiniciar historial», «Restaurar notas» | Best-grade record / Hourly grade backups / Per-class Moodle CSVs |
| the editor, drafts, launching a run | Draft-vs-disk consistency |
| the dashboard matrix, analytics, report loading | Corrupt `case-NN.json` · Machine off vs. exam failed |
| invoking the `teuton` binary | PATH discovery |
| any IPC handler that takes a path | Confined project paths |
| the CSP, `index.html`, the vite config | CSP lives in two places |
| the e2e suite, `scripts/fake-teuton.mjs` | Hostile UAT |

**Config file colon-symbol format** (`lib/config.ts`). Teutón's config YAML is read by Ruby's `YAML.load`,
which accepts both `tt_members: x` and the legacy Ruby-symbol style `:tt_members: x` (keys/values prefixed
with `:`). `js-yaml` (used in the renderer) does *not* auto-strip that prefix — it would parse `:global` as
a literal string key, silently breaking the visual table for anyone with an older-style config file.
`parseConfig`/`stringifyConfig` normalize prefixed keys on read and always write back in modern (no-colon)
style, while any *other* top-level section the UI doesn't edit (`alias`, `macros`, `tt_include`, …) is kept
in `TeutonConfig.extra` and passed through byte-for-byte on save so it's never silently dropped.
`preserveScalarText` additionally re-reads the document with `FAILSAFE_SCHEMA` and restores the literal
text of any scalar `yaml.load` turned into a *lossy* number: `tt_moodle_id: 0012345` parses as 12345, and
the next table keystroke rewrote the file with the identifier destroyed (same for `007`, `1.50` and
anything past 2^53). Only mismatching values are replaced, so `host1_port: 22` stays a number and the file
doesn't fill up with quotes, and booleans/nulls come from the normal parse because Teutón distinguishes
them (`tt_skip`, `tt_sequence`). The table itself refuses to `emit()` while the YAML is unparseable —
`parseConfig` returns an *empty* config on error, so one click on "add student" used to write `cases: []`
over the whole class.

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
while still showing "active". Two things guard that invariant: `startRun` **claims the slot
synchronously** (setting `run.status` before the `await` of `saveDraftsIfDirty`, because two starts in the
same tick otherwise both passed the guard and the second orphaned the first process), and
`checkMonitorHealth` — a 30 s watchdog mounted in `useRunManager` — restarts a cycle that never got
scheduled. The watchdog exists for what code alone can't fix: an `ssh` that hangs and never emits `exit`
(Teutón only times out the SSH *connection*, not the commands), and a suspended laptop, where the timer
doesn't run and the countdown freezes at `0:00`. A run still `running` after `cycleLimitMs` (10 min or three
intervals, whichever is longer, measured from `run.startedAt`) is cancelled with a visible notice, and the
cancellation chains the next cycle. `cancelRun` clears `runId` *before* awaiting main, because main
broadcasts the killed process's `exit` before the cancel call resolves. Leaving the
project goes through `leaveProject()` (cancels the child, stops the timer); the store resetting `run` on
its own only forgot the process, which kept evaluating the previous class and blocked the next run.
While the monitor is active the app holds a `prevent-display-sleep` power blocker (`keepAwake` IPC): the
teacher doesn't touch the keyboard during an exam, so the desktop counts the machine as idle and suspends
it — GNOME defaults to 2 h on AC, exactly the length of an exam — and the screen is being projected, which
is why it's display-sleep and not just app-suspension. Every exit path releases it (`releaseKeepAwake`).

**Live progress bar** (`lib/progress.ts`). Teutón doesn't report machine-readable progress. It prints one
character per check to stdout between the `Started at` and `Finished in` lines: `.` (pass), `F` (fail), `S`
(entire case skipped). The expected total is obtained by running `teuton check` first and parsing the
`Targets` row of its "DSL Stats" table, multiplied by the number of cases being run (skipped cases count as
1, not `targetsPerCase`). `computeLiveProgress` scopes its regex match strictly to the region between those
two markers — matching `.`/`F`/`S` anywhere in the full buffer would false-positive on grade values like
"100.0" or on the word "Finished" itself.

**Stalled students** (`lib/stall.ts`). During the exam the teacher sees low grades every few minutes
but cannot remember which ones are the *same* low grades as half an hour ago — a student who is stuck
(doesn't understand the wording, machine half-booted) looks identical to one who is merely slow, and only
the first one needs someone to walk over. `updateStalls` keeps each student's last passed-target count and
grade; a cycle where neither rises increments their counter, and `stalledCycles` reports it from
`STALL_CYCLES` (3) on, but **only while they are still below the pass threshold** — someone who has passed
and stopped improving has finished, not stalled. Students absent from the current pass (a single-student
re-evaluation) keep their counter untouched: they haven't been looked at again. The map lives in the store
and is reset by `setProject`/`closeProject` and by `setActiveClass` when the *class id* changes, because a
name shared between two groups would otherwise inherit the other group's cycles. It is deliberately not a
banner: the count rides in the roster row next to the connection badge, and its only other effect is
sorting the student to the top of `studentsNeedingAttention` (after downed hosts, ahead of a worse grade
that is still climbing).

**Pre-flight checks** (`lib/preflight.ts`). Every failure «¿Todo listo?» reports was already discoverable —
Settings says whether Teutón is installed, the config table locks on broken YAML, `teuton check` runs
behind the progress bar — but one at a time and in the middle of a run, with the class already in the room.
It answers them together beforehand. Two things matter: it calls `saveDraftsIfDirty()` first for the same
reason `startRun` does (`teuton check` reads the *disk*, so an unsaved class import would be checked
against the previous exam), and it skips `teuton check` when the binary is missing or the YAML is broken,
whose error would otherwise be counted twice. `fail` blocks, `warn` doesn't: a missing `host1_ip` may be
intentional, and refusing to launch an exam that would work is how a check gets ignored. `evaluateTeuton`,
`evaluateConfig` and `evaluateCheck` are pure and unit-tested; only `runPreflight` touches IPC.

**Machine off vs. exam failed** (`MatrixStudent.unreachable`, `lib/analytics.ts`). Teutón reports
unreachable hosts in `resume.json`'s `conn_status`, which the list view already used for the `WifiOff`
badge — but the matrix painted that student's whole column the same red as a student who genuinely got
everything wrong. `buildMatrix` now carries `unreachable` per student and `MatrixCellView` renders their
failing cells as a neutral offline glyph, keeping the red ✕ for real failures. Passing cells stay green
(some targets don't need the connection) and a missing case report still wins with `?`.
A zero with a connection error is *unevaluated*, not a grade (`isUnevaluated`): it is not stored in the
record, the list shows `—`, and without a stored grade the student is left out of the Moodle CSV (an empty
Moodle cell instead of a 0 nobody gave). A grade above zero is kept even with a host down.

**Grading conversion** (`lib/grading.ts`). Teutón's native score is always 0–100. The GUI overlays a
configurable piecewise-linear mapping — `(0,0)`, `(passScore, maxGrade/2)`, `(100, maxGrade)` — so a
teacher's "70 points = passing (5/10)" convention is representable. This conversion is purely a display/
export concern; `main/store.ts` and the JSON parser always operate on Teutón's raw 0–100 score. The same
configurable threshold drives every "passed" computation (`isPass`, `computeKpis`,
`studentsNeedingAttention`) — **never hardcode 50**.

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

**Hourly grade backups** (`writeBackup`/`listRecordBackups`/`restoreRecordBackup` in `main/store.ts`,
`copias-notas/` in `userData`). Because the record lives *inside* the project, deleting or moving the exam
folder took the grades with it, and one mistaken «Reiniciar historial» was unrecoverable. Every successful
`updateRecords` therefore drops a copy of the whole records file outside the project, under
`userData/copias-notas/<project>-<8-char path hash>/<YYYY-MM-DD-HH>.json` (a few KB of JSON, so it doesn't
violate the "nothing large on `/`" rule), keeping the last 48. **One copy per hour, and that copy is merged
with `Math.max` into whatever the same hour already held** — the exam loop writes dozens of times an hour
(one file per write is unusable), yet a reset followed by another run within the same hour must not
overwrite the copy with the now-empty history, which is the only thing left to recover from. Restoring also
merges by max, so recovering old grades can never lower one already stored, and a restore proceeds even
when the project's own records file is unparseable — that is precisely the case it exists to fix. The
dashboard offers it in the «…» menu *and* in the empty state, because a teacher who lost the project folder
lands on the empty view.

**Notices don't overwrite each other** (`notices` in `stores/app.ts`). One slot meant the next cycle's
notice erased «no se han guardado las notas» before anyone read it. Errors stay until dismissed one by one;
`setOperationalError(msg, { info: true })` marks the informative ones (partial re-evaluation, watchdog),
which only replace each other. A repeated message bumps a counter instead of stacking, the list is capped
at 5, and switching project keeps the errors.

**Credential store status surfaced in Settings** (`getCredentialsStatus`). When the desktop keyring is down,
`getDefaultGlobals` returns `usuario`/`usuario` with the real credentials still encrypted on disk. That used
to live only in a `console.error`, so the teacher saw plausible-looking defaults in the table and no hint
that saving was refused; Settings now says it. The status is computed by *attempting* a read (the failure is
only knowable that way) and `lastDecryptError` caches the last attempt's outcome.

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

**Confined project paths** (`main/ipc.ts`). `validatedPath` normalizes but does not confine — `resolve()`
collapses `..`, it doesn't forbid it — so every handler taking a directory used to accept any absolute
path on disk. `allowedRoots` holds the directories the teacher actually chose: whatever `pickDirectory`
returned, and every entry handed out by `recentProjects` (which the Home view calls before anything is
clickable, so the list is authorized in time). `projectDir()` requires the path to be inside one of them.
It is defence in depth, not a live hole — there is no `innerHTML`, `eval` or `new Function` anywhere in
`src/` — but `saveProject` was otherwise an arbitrary 10 MB write with a caller-chosen filename, and
`openPath` fed `xdg-open`, which *executes* a `.desktop` file.

**CSP lives in two places, and they must agree** (`main/index.ts`, `electron.vite.config.ts`). In
development it is an HTTP header from main, because Vite's React preamble is an inline `<script>` that
needs `'unsafe-inline'` in `script-src`. In the packaged app the renderer loads over `file://`, where
`webRequest.onHeadersReceived` never fires — the strict policy simply wasn't applied in the build the
teacher runs — so `inlineCsp` injects it as a `<meta>` at build time. `base-uri`, `form-action` and
`object-src` are spelled out because they do not inherit from `default-src`. The packaged case is covered
by `tests/e2e/empaquetada.spec.ts`, the only test where `app.isPackaged` is true.

**Writes are queued and durable** (`main/store.ts`). `writeAtomic` fsyncs the temp file *and* its
directory before/after the rename: without that the rename can be durable while the data is not, and the
grade record comes back truncated with the good copy already gone. Every read-modify-write
(`updateRecords`, `resetRecords`, `setProjectMeta`, `saveClass`, `deleteClass`, `writeClassCsv`) goes
through `serialized()`, a per-file promise chain — the renderer fires these in parallel and two
overlapping cycles used to lose one class's best grade, or the `lastRunClassId` the CSV depends on.
Related: **only ENOENT counts as "no data"**. `readJson` and `readRecords` propagate every other failure,
because swallowing EACCES made an unreadable `classes.json` look like "no classes" and the next save
rewrote it empty, taking every roster in the school with it.

**PATH discovery for `teuton`** (`main/teuton.ts`). Desktop apps often start with a minimal `PATH` that
excludes Ruby gem bin directories. `teutonEnv()` resolves a login shell's `PATH` once and additionally
scans `~/.local/share/gem/ruby/*/bin` and `~/.gem/ruby/*/bin`, so `teuton` is found even if the user never
added it to their shell profile.

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, a restrictive CSP (no `unsafe-eval`; Monaco runs fine
without it), `will-navigate`/`setWindowOpenHandler` block in-app navigation to anything outside the loaded
renderer, and `shell.openExternal` is only reachable through the `openExternal` IPC channel which
allow-lists `https?:`/`mailto:` schemes. CLI invocations always use `spawn`/`execFile` with an args array
(never a shell string), so config values (student names, IPs, etc.) can't inject shell commands.

**Exam data is real student data.** Names, grades and machine credentials pass through the app. Don't add
telemetry, don't log config values, and keep anything bulky or personal out of `/`.

## Conventions

- **Spanish** with the user, in the app's UI **and in code comments** — that is this repo's style, unlike
  the global default. **English** for identifiers, commit messages (conventional commits) and this file.
- Comments explain *why*, not *what*. The mechanisms above exist because someone paid for them.
- Don't hand-roll what the Teutón CLI already answers (see the core principle).

## Other documents

| File | Holds |
|---|---|
| `docs/HANDOFF.md` | **Current state**: objective, in progress, next step. 30-60 lines, no history. |
| `docs/DESIGN.md` | UI/UX decisions and the visual system |
| `docs/PRODUCT.md` | What the app is for, and for whom |
| `README.md` | Install and first run, for anyone who is not Claude |
