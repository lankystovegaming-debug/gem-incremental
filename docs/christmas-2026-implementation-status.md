# Christmas 2026 implementation status

**Incomplete; not ready for event release or backend deployment.** The migration
sets `christmas_2026_private.configuration.release_enabled` to `false`. Leave it
off until the remaining implementation and release checks below are complete.
Nothing was deployed to Supabase.

## Audited baseline

- Repository: `lankystovegaming-debug/gem-incremental`, existing weekly branch
  `weekly-update-5-2026-10-17`, PR #514.
- Supabase: `igrddscmrdrrwtvyspbf`; connected GitHub identity was verified as the
  repository owner before reading backend definitions.
- Deployed `roll` version **178** retrieved on 14 October 2026. Its entrypoint
  matches the repository after normalizing trailing whitespace. Normalized
  SHA-256: `66edac23fbe4cd8d9df9677c56e903f601cdd00ffa0cd8fd7077833ccef85ddc`.
- `supabase/functions/roll/index.ts` remains unchanged. Its 2.5-second base
  cooldown, batch cooldown, Luck layers, mutation passes, weight sampling,
  final specimen value, context reuse and atomic finalize path were inspected.
- Live `roll_prepare_context_v2`, `roll_begin_batch_subroll_v2`, Deep Sea and
  global-event function definitions were inspected read-only. No live schema,
  configuration, player data or deployed functions were changed.
- Player lifetime totals continue to be sourced from `total_rolls`. The new
  code does not substitute an equipment counter for lifetime rolls.

## Implemented foundation

- Server-only manifest for the 28 gems, cumulative waves, frozen Tree costs
  and rewards, Advent rewards, specified Workshop stock, consumable/equipment
  definitions and exact event boundaries.
- Pure server action resolver for Tree upgrades, bulk ordinary Present
  opening, single Christmas Present opening, combining, purchases, complete
  Workshop Packages, material exchange, Advent claims and preferences.
- Present PP on acquisition; no PP on combining. Santa Sack unlock state at
  1,000 PP. Independent natural Present checks with additive bonuses.
- Mysterious Present conversion on authoritative snapshots/actions, without
  re-awarding PP. The conversion is derived consistently; standalone persisted
  conversion still needs its release integration.
- Bottled Christmas acquisition stores an inventory item without consuming
  it, arming an effect or running a Singularity check. A separately tested
  pure use check requires both explicit activation and a genuine roll.
- Private RLS-protected state/configuration/receipt/occurrence tables. The
  authenticated Edge Function derives identity from verified user claims;
  service-only RPCs serialize state updates, compare versions, record immutable
  request results and reject new spending at midnight. Exact successful retries
  remain replayable after closure. Cutscene acknowledgements cannot grant rewards.
- `/limited-events/christmas-2026/` with the existing shell, six accessible tabs,
  Tree artwork, progressively appearing decorations, resources, inventory,
  Workshop, Advent, Story shell and discovery-filtered Collection. The hub
  remains in preview while the backend release gate is off.
- Multiple independently timed event cards, approaching states, and a new
  collection API. The old ordinary-event API remains as a deployment fallback.
  The ordinary scheduler is unchanged.
- Nine Christmas gem scene definitions and theme visuals in the existing
  cinematic framework. Special-source probability labels are omitted. Christmas
  scenes do not leak into Reminiscite's pre-event memory montage.
- Immutable source-aware envelope helpers, ordering of primary and Aurora
  results from one operation, and stored-snapshot replay support. These helpers
  are not yet connected to authoritative Christmas reward production.
- Backend-derived +16-hour analytical sensitivity report. The window changes
  from 720 to 736 hours (+2.2222%). No economy values were rebalanced.

## Remaining implementation — do not treat as completed

1. Integrate Christmas into the optimized leased roll context and atomic commit
   path without adding independent per-roll requests. This includes ordinary gem
   eligibility, genuine participation/counters, Present drops, Evergreen/Spirit,
   first-discovery Keep, Exchange/Keep/Sell, CS based on the actual final specimen,
   additional Celestine drops, real Wish/Singularity specimens and provenance.
2. Project event rewards into the existing native consumable, equipment,
   cosmetic, collectible, title and gem systems. Current rewards are event-state
   inventory/unlocks only. Real equipping, permanent stats, active consumable
   counters and voluntary Bottle activation/subsequent one-roll resolution are
   **not wired**. The pure Bottle check is not a playable consumable flow.
3. Implement authoritative scheduling once the settings below are confirmed;
   there are no seeded Christmas occurrences. Apply seasonal and ordinary event
   effects together in the roll path. The cards alone do not apply gameplay buffs.
4. Implement daily/weekly quests, all five Story quest chains and exact reward
   claims. The Story tab currently displays chapter availability, not playable
   quests or chapter replay controls.
5. Persist authoritative cutscene envelopes with committed rewards and connect
   them to the live queue, reload recovery, cross-device receipts, batch/partial
   batch handling and source-aware featured-result selection. Finish cinematic
   choreography and visual review; scene registration is not the complete
   cinematic acceptance pass.
6. Implement the complete 30–35-second One Last Snowfall sequence, actual saved
   Tree state, automatic online/returning-player delivery, cutoff enforcement in
   that delivery path, acknowledgement and Chapter VI replay. Eligibility and
   receipt primitives exist, but the finale itself and automatic delivery do not.
7. Complete the four Collection categories, native cosmetic previews, historical
   statistics and archive replay. Read-only resource/inventory views exist;
   absent roll/reward integration means they do not yet form the final archive.
8. Replace symbolic random cosmetic/collectible/bundle rewards with approved
   native definitions and duplicate protection. Resolve Polish and utility
   bundle definitions. No symbolic token should ship as a substitute for a gem,
   native item or bespoke reward.
9. Complete an Open All resolver for stacks above 10,000 items. The current
   bounded resolver rejects larger stacks instead of silently opening only part.
10. Add integration tests for actual roll/reward/quest/cutscene flows and event
    boundaries, including one-roll Bottle use in partial batches and concurrent
    native inventory operations. Existing tests cover the implemented foundation.

## Parameters requiring confirmation

The user's supplement explicitly says not to invent these values. They are not
present in the audited existing Christmas implementation/configuration.

- Ordinary Present Rush frequency, duration and minimum spacing.
- Numeric minimum spacing for the two daily 20-minute Auroras and the six
  20-minute Storms. The Storm period remains 24 Dec 08:00–25 Dec 08:00 SGT.
- Exact daily/weekly quest pools, Story II PP target, Story IV exchange threshold,
  Aurora fallback, quest reward bundles and all-five weekly bonus.
- Emergency Supply contents, exact price and purchase limit. Its listing stays
  disabled; it is not an extra source of Bottles, Stashes or Anomalous gems.
- Any outstanding native reward definitions (including Polish and utility
  bundles) must be settled before random Present rewards can be finalized.

## Validation completed

- Full existing `npm test` suite passed.
- `npm run test:christmas`: 14 rule/envelope tests plus authenticated handler and
  PGlite migration/permission/transaction tests passed.
- Existing cutscene reliability, global random-event, optimized roll-handler,
  Phase 5 hot-path, navigation Phase 2 and responsive foundation checks passed.
- Hub browser fixtures at 390, 768 and 1440 pixels: six tabs, keyboard navigation,
  no page overflow, committed-response-loss retry without duplicate upgrade,
  and archive action disabling passed. These use fixtures, not deployed Christmas.
- `tools/christmas-2026-sensitivity.mjs` reads the backend cooldown/batch formulas.
  Its report does not reproduce simulation #2 completion probabilities: original
  attendance profiles and confirmed seasonal schedules are unavailable.

## Deployment

No Supabase deployment was performed. The user retains migration/Edge Function
deployment. This foundation migration and `christmas-2026` function are **not a
complete deployment package**. Finish the remaining implementation before
deploying or enabling the Christmas backend. Frontend concurrency has an
explicit fallback when the new collection RPC is not yet installed.
