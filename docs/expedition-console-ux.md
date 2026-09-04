# Expedition console UX cleanup

Implemented from repository main `dc047b34a248bd788c7ad591c377d9a87a293eed`.

## Behavior and scope

- Mine Normal: compact objective, route/camp strip, contextual crew orders, cargo status, and separate ordinary cargo and artifact panels. Funding, routes, camps, incidents, extraction and Overdepth calls are unchanged.
- Mine Hell: distinct red crew console with Doom, objective, card/event decisions, hidden Danger bands, protected/at-risk holdings and immediately awarded duplicate rewards. No changes to card effects, recovery, Doom, or cache calculations.
- Volcanic: Activity is the centerpiece. The displayed scale is explicitly **not** an eruption percentage; only the server-provided state and Monitoring range are shown. Normal cargo and artifact events are separated; the incident/equipment log excludes both find categories.
- Crystal: existing console rendering, actions, intensity, layout and mechanics are unchanged. Only receipt integration and an artifact-history metadata field are added.
- All five implemented destination/mode combinations use the same completion receipt. The existing extraction → settlement flow is retained: the receipt opens only after successful settlement, when actual extracted cash and Museum registrations are confirmed. A failed or canceled action cannot produce a success receipt. Hell cache, weekly Mythic and duplicate consumables are identified as already awarded; they are not added to cash totals.
- The Hell confirmation uses Cancel / Descend, warns about **ENTIRE unsecured cargo**, explains Doom, and explicitly says voluntary extraction returns after clearing the next OD stage. Current main's Doom Breaks impose penalties rather than directly ending the run, so they appear as endured conditions, not fabricated extraction reasons.

## Manual Supabase deployment required

Apply `supabase/migrations/20260904120000_expedition_console_metadata.sql` yourself to project `igrddscmrdrrwtvyspbf`. Nothing has been deployed.

The migration:

1. Records the existing Volcanic cargo award as a `cargo` event and adds structured artifact name/depth/duplicate metadata. The roll function has exactly the same random draws, reward calculations, incident ordering, and writes apart from the additional metadata.
2. Preserves Volcanic's extraction reason before `pending` is cleared.
3. Adds the authenticated, owner-scoped `get_mine_hell_artifact_finds` read-only RPC over existing Hell telemetry. No hidden cards or Danger values are returned.
4. Records Crystal artifact additions using a multiset difference between old/new holdings. Securing an artifact does not create another discovery. Existing held artifacts are backfilled; historical losses before migration cannot be reconstructed.

No Edge Function deployment is needed. The optimized roll edge-function path and dispatch are untouched. The migration has not been executed against a database in this task; verify it in staging before applying it to the live project.

The frontend degrades safely before migration: existing totals and artifacts still display, older Volcanic artifact log messages are supported, and missing ordinary depth values are never inferred from balance changes. Hell shows a clear notice when the full duplicate history RPC is unavailable. For complete new-run history, deploy the migration before using the new frontend.

## Reusable patterns

`src/ui/expeditionConsole.js` provides presentation-only progress, status, discovery-list and settlement-receipt functions. `src/styles/expedition-console.css` scopes every rule to `exp-*` classes, except explicit light-theme overrides of those same classes. It is imported by the existing expedition stylesheet.

Ancient Ruins and Lost Jungle can reuse these primitives but should supply their own primary mechanic visual, action area, and truthful settlement adapter. Never use the wallet delta, original find values, or a client-estimated retention percentage as the receipt total. Keep discovery categories separate from economic storage/settlement rules.

## Files changed

- `abandoned-mine/index.html`, new `abandoned-mine/mine-console.css`: collapsed manual and Mine-specific responsive styling.
- `expeditions/expeditions.js`, `expeditions/expeditions.css`: Mine consoles, fixed confirmation, shared style import and receipt integration.
- `volcanic-depths/index.html`, `volcanic-depths/volcanic-depths.js`, `volcanic-depths/volcanic-depths.css`: monitor, compact statuses, discovery separation, polling and receipts.
- `crystal-caverns/crystal-caverns.js`: import and successful-settlement receipt hook only.
- New `src/ui/expeditionConsole.js`, new `src/styles/expedition-console.css`: reusable primitives and receipt framework.
- `src/backend/cloudExpeditions.js`: read-only Hell find-history RPC client.
- New metadata migration described above.
- `package.json`: `test:expedition-ui` script.
- New `tests/expedition-console-harness.mjs`, `tests/expedition-console-ux-test.mjs`, `tests/expedition-console-preview.mjs`: real-renderer fixture harness, regressions, and local-only browser preview.
- This document.

## Verification

- `npm test`: passed, including all existing pretest and test scripts.
- `npm run test:expedition-ui`: passed. Covers all five receipt modes, settlement-only totals, no duplicate double-counting, already-awarded Hell rewards, unrecovered Crystal artifacts, zero fields, escaped names, Mine phases, hidden cards/Danger, all Activity states, forecast/no-forecast, and confirmation defaults.
- Additional Hell Mode, Hell artifact passives, Doom overload, Normal Mine rebalance, Normal Mine Overdepth, Crystal Hell and free-Overdepth checks were run.
- Changed JavaScript syntax checks and `git diff --check` passed.
- Safe fixture browser checks: Volcanic default-width monitor; 390px viewport Mine, Hell and Volcanic with no horizontal document overflow; completion dialog shows actual retained cash, identifies protected/duplicate artifacts, focuses Close and restores focus on dismissal.
- A subsequent larger desktop browser check was interrupted by permission review. No authenticated live run, paid action, production migration or edge deployment was tested or performed.

For repeatable visual QA: `node tests/expedition-console-preview.mjs`, then open `http://127.0.0.1:5587`. Fixtures use real rendering functions with inert backend calls, not a live account. This is a developer test surface, not a production route.

Before release, test one fresh run of each mode in staging, including voluntary settlement, Critical recovery, Volcanic overwhelming eruption, and Crystal lost-artifact history. Check Cooling/suppression, Monitoring upgrades, camps/routes, and Hell OD return-to-extraction with the deployed metadata migration.
