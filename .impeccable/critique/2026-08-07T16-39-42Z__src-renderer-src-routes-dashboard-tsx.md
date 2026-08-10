---
target: src/renderer/src/routes/Dashboard.tsx
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-07T16-39-42Z
slug: src-renderer-src-routes-dashboard-tsx
---
Method: dual-agent (A: a3df57d000457fe6e · B: a03b6c11d8dfe3e96) · Mode: Operate

## Design Health Score — 25/40 (Aceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | MonitorBanner (Dashboard.tsx:184) renders after the `selected` early return (:126) — monitor UI vanishes in StudentDetail. |
| 2 | Match System / Real World | 3 | Three grade-like columns (Puntos/Récord/Nota) with no cue which reaches Moodle; "Nota máxima" means two different things in Dashboard vs Settings. |
| 3 | User Control and Freedom | 2 | "Reiniciar historial" (:71) destroys best-grade history behind window.confirm, no undo. |
| 4 | Consistency and Standards | 3 | Spanish strings bypass i18n/es.ts (:201, :605); segmented ModeBtn next to a bare pill toggle. |
| 5 | Error Prevention | 2 | staleResults (:57) detects wrong-roster results but doesn't block exportMoodle (:77). |
| 6 | Recognition Rather Than Recall | 2 | CSV exports max(grade, record) (moodleCsv.ts:25); table shows both operands, never the result. |
| 7 | Flexibility and Efficiency | 3 | No keyboard path into rows; sort state local to ListView (:296), lost on view switch. |
| 8 | Aesthetic and Minimalist | 2 | 5 KPIs + up to 3 banners + 8 columns; the "who needs help" view is absent. |
| 9 | Error Recovery | 3 | Corrupt-report banner (:185) is exemplary but dumps raw strings with no recovery action. |
| 10 | Help and Documentation | 2 | Matrix legend explains 4 colors; `?` = unreadable report (:559) labelled "sin dato"; no Trophy legend. |
| **Total** | | **25/40** | **Aceptable** |

## Design Specificity Verdict
Authored domain logic (stale-results guard :57, Récord column :384, per-student re-evaluate :411) wearing a generic admin-table body: title → 5 KPIs → search → 8-col table. Nothing in the layout knows it is projected during a timed exam (text-xs everywhere, text-[10px] matrix cells, 90px name truncation). `studentsNeedingAttention()` (analytics.ts:103) — the most operationally relevant computation — is never called by the Dashboard.

Deterministic scan: detect.mjs clean (exit 0, `[]`) on the file and on components/+routes/. Zero findings, zero false positives — every real problem here is semantic. Grep: inline style maxHeight calc (:479), window.confirm (:72), `<tr onClick>` with no tabIndex/role (:366).

Visual overlays: none. Electron renderer route, no servable URL; injection not attempted.

## Cognitive load: 5 of 8 failed (critical)
Fail: single focus, grouping, visual hierarchy, ≤4 options, working memory. Pass: chunking, one-thing-at-a-time, progressive disclosure.

## What's Working
1. :57-63 stale-results detection — diffs rows against parseConfig cases.
2. :185-197 + buildMatrix(rows) — corrupt case JSON yields `?` cell, never drops a student.
3. :411-424 inline per-student re-evaluate — matches the real classroom gesture.

## Priority Issues
- **[P0] On-screen grade ≠ exported grade.** Chip at :399-407 shows convertGrade(r.grade); moodleCsv.ts:25 exports max(r.grade, records[members]). Fix: prominent chip = effective grade, last-run demoted, Trophy marker when record wins; rename finalGrade to "Nota final (a Moodle)". → clarify
- **[P0] Destructive reset is an unlabeled icon two positions from Reload** (:163-173 vs :160). Fix: move out of live header or label + text-destructive + separator + in-app dialog naming class and student count. → harden
- **[P1] Live view doesn't show who needs help.** studentsNeedingAttention unused; Nota máxima/mínima occupy prime projected space (:217-226). Fix: replace with a clickable "Requieren atención" tile. → layout
- **[P1] StudentDetail is a black hole during modo examen.** :126-128 returns before MonitorBanner; `selected` (:46) is a never-refreshed snapshot. Fix: hoist banner, store selectedId only. → harden
- **[P1] Keyboard + contrast exclude a whole user class.** `<tr onClick>` without tabIndex/role (:366); opacity-0 re-evaluate with no focus-visible (:420); no focus rings on ModeBtn/SortableTh/failOnly/matrix headers; text-warning hsl(38 92% 50%) on bg-warning/10 ≈ 2:1 (globals.css:25). → audit
- **[P2] Export has no guard and no receipt** (:77-86). Fix: pre-flight on stale/warnings, toast after save. → clarify

## Persona Red Flags
**Alex**: no keyboard into rows; sort lost on view switch (:296); filter/mode/failOnly local state (:47-49) reset on navigation; no shortcuts; tri-state sort undiscoverable.
**Sam**: clickable `<tr>` announced as plain table; opacity-0 button in tab order; matrix lacks scope/caption — 2400 cells without context; `·` vs `?` indistinguishable at 10px and to screen readers; warning banners ~2:1.
**Riley**: duplicate tt_members collapse into one record (records[r.members] :363, moodleCsv.ts:25); 2400 unvirtualized cells re-rendered per cycle; hardcoded maxHeight calc (:479) overflows with 3 stacked banners; header has no flex-wrap; hand-maintained colSpan (:357); tt_members '-' counted in "N alumnos" but skipped in CSV.

## Minor Observations
- `<th className="w-16" />` (:351) needs sr-only label.
- Vestigial fragment around a single Card (:336).
- Empty state copy promises "Ejecuta un test" with no corresponding control.
- Warnings rendered with two different markups (:110 vs :186).
- `filtered` (:53) is the only uncached derivation, and it changes per keystroke.
- passRate is the only KPI tile without accent.

## Questions to Consider
1. If the teacher can only see one screen for the whole exam, is this it?
2. Who else is reading this screen? (User answered: public grades are intentional — projector mode declined.)
3. Why does the app compute the final grade twice and only trust the second one?
