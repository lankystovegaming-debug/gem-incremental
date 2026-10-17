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
3. Apply seasonal and ordinary event effects together in the roll path. The
   approved shared scheduler is implemented and locally tested; cards alone
   still do not apply gameplay buffs until the roll integration is complete.
4. Complete all five Story chapter quest chains and replay controls. Daily and
   weekly quests, claims and primary genuine-roll/acquisition bookkeeping are
   now implemented. Additional gem sources still require their native reward
   integration to feed the trusted acquisition counter.
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
8. Project the approved cosmetic/collectible/bundle rewards into the native
   systems. Golden duplicate protection, its 5,000 CS exhausted-pool fallback,
   the utility bundle and Peppermint Polish alias are implemented in the server
   resolver. Real Wish/Singularity specimens remain unfinished.
9. Complete an Open All resolver for stacks above 10,000 items. The current
   bounded resolver rejects larger stacks instead of silently opening only part.
10. Add integration tests for actual roll/reward/quest/cutscene flows and event
    boundaries, including one-roll Bottle use in partial batches and concurrent
    native inventory operations. Existing tests cover the implemented foundation.

## Approved follow-up values — 14 October 2026

The preceding Design Limited Events proposal was retrieved, and the user
explicitly approved its scheduling, Story, cosmetics, consumables and Emergency
Supply values. Their newer daily/weekly targets supersede that proposal's older
quest targets. No outstanding values in that proposal are treated as blockers.

- Rush: 3/day, 20 minutes, minimum 3-hour end-to-start gap.
- Aurora: 2/day from Dec 15, 20 minutes, minimum 4-hour gap.
- Storm: 6 during Dec 24 08:00–Dec 25 08:00 SGT, 20 minutes, minimum 90-minute gap.
  Rush/Aurora pause during the Storm period. A private seeded server scheduler
  generates 128 shared occurrences, including the final 16-hour event day;
  spacing is enforced across daily boundaries as well as within each day.
- Daily: 300 genuine rolls (150 CS + Small), 20 Christmas gem acquisitions
  (200 CS + Small), and 3 Present openings OR 15 PP OR 300 genuine rolls
  (250 CS + Small). All three: 500 CS + Festive.
- Weekly: 2,000 genuine rolls, 125 Christmas gem acquisitions, 20 ordinary
  Presents opened, 7,500 gross CS earned, and 12 daily quests completed. Any
  four: 2,500 CS + Large; all five additionally: 1,000 CS + Festive.
- Daily reset: 08:00 SGT. Weekly reset: Tuesday 08:00 SGT. Fixed quests; no
  streaks, rerolls, unique-gem substitution or displayed-batch counting.
- Story II: 50 PP, at least one Wave II discovery and three daily completions
  after unlock. Story III: 500 genuine rolls after unlock as the Aurora fallback.
  Story IV: 5,000 CS from gem exchanges after unlock. Story V bundle: 2,500 CS,
  two Festive and one Large, plus the Christmas Day collectible. These values
  are in the server manifest; Story chapter gameplay remains unfinished.
- Polish is the existing Peppermint effect: 1.35× Mutation Luck for 150 genuine
  rolls. Utility bundle: two Cocoa, two Cookies and two Rations.
- Golden-only pool: Golden Snowfall, Gilded Holly, Golden Workshop and Present
  of Gold; uniformly select an unowned item, then 5,000 CS after all four.
- Emergency Supply: 10,000 CS, three purchases total, from Dec 24 08:00;
  each grants 1,000 SF, 40 Ornaments, 8 Lights, five Small and two Festive.
  No random exclusive rewards. It becomes purchasable only when the overall
  event release gate is eventually enabled.

The migration extends the audited `record_server_roll` and `commit_jackpot_loss`
functions locally. Successful primary rolls and genuine House Edge losses feed
quest progress in their existing transactions; duplicate loss commits do not
count twice. The Edge Function stays byte-for-byte unchanged, and no per-subroll
RPC was added. Lifetime numbering uses `total_rolls`, not equipment counts.

Balance check: the extra interval adds one daily set, one boosted hour and 40
Aurora minutes. Approved Aurora exposure is 10h40m total versus the original
profile's 20h. Final partial week has only nine available daily quests, so its
12-daily objective/all-five bonus cannot finish; the approved any-four bonus
remains reachable. Fixed targets were not silently prorated.

## Validation completed

- Full existing `npm test` suite passed.
- `npm run test:christmas`: 23 rule/envelope/quest tests plus authenticated handler
  and both PGlite migration/permission/transaction suites passed. SQL/JS progress
  parity, repeated acquisitions, House Edge losses, rollback, reset boundaries
  and multiple randomized schedule seeds are covered.
- Existing cutscene reliability, global random-event, optimized roll-handler,
  Phase 5 hot-path, navigation Phase 2 and responsive foundation checks passed.
- Hub browser fixtures at 390, 768 and 1440 pixels: six tabs, keyboard navigation,
  no page overflow, committed-response-loss retry without duplicate upgrade,
  and archive action disabling passed. These use fixtures, not deployed Christmas.
- `tools/christmas-2026-sensitivity.mjs` reads the backend cooldown/batch formulas.
  Its report includes the approved schedule and supplied aggregate attendance
  profiles. It does not reproduce simulation #2 completion rates without the
  original loadouts, exact attendance timestamps, RNG seeds and simulation code.

## Deployment

No Supabase deployment was performed. The user retains migration/Edge Function
deployment. This foundation migration and `christmas-2026` function are **not a
complete deployment package**. Finish the remaining implementation before
deploying or enabling the Christmas backend. Frontend concurrency has an
explicit fallback when the new collection RPC is not yet installed.
