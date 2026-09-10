# Info page: backend verification and maintenance

Verified read-only on 2026-09-10 against Supabase project `igrddscmrdrrwtvyspbf`, before authoring mechanic copy. Frontend baseline: `f550a95` (origin/main). This change does not modify or deploy any database or Edge Function code.

## Sources

- Deployed optimized `roll`, version 151, SHA-256 `054e379e63e793dd4a58a06a9994d73a0403da1dc2bfa8aa6a8185046acf6870`. Retrieved with Supabase `get_edge_function`.
- Read-only SQL catalog inspection of `global_event_definitions`: all 25 enabled names and tiers match the requested catalog (8 Common, 8 Uncommon, 6 Rare, 3 Legendary). Event descriptions cross-checked against configuration and the deployed event-rule functions. No scheduler selection weights or spawn probabilities are included in the page.
- Live definitions of `get_raw_rare_roll_leaderboard`, `get_rarest_gem_leaderboard`, `get_best_roll_leaderboard`, `record_roll_leaderboard_entry`, and `get_mutation_chance_product`.
- Live definitions of `record_gem_mutation_combination`, `museum_register_specimen`, `museum_place_exhibit`, `museum_remove_exhibit`, `bundle_contribute`, `get_research_tree_v014`, and `sync_research_sources_v014`.
- Deployed `features` v22 achievement/claim endpoints; deployed `minigames` v3 handler, engine and catalog for modes and supported games.
- Current UI checked only for navigation, labels and presentation: Enable Buffs, Raw Rare Roll, inventory chance display, Gem Index and Mutation Index. Mutation Index reads persistent `player_gem_mutation_combinations`, not the legacy mutation-index table.

## Wording decisions

| Topic | Verified behavior reflected in the page |
| --- | --- |
| Luck | `luckLayers`: Pickaxe × Clover forms Base Luck; personal bonuses, flat additions, special multiplier, one-roll addition, then world/admin adjustment. Random Events can affect the final stage and individual gem checks. The page exposes the broad requested order, not production internals. |
| Selection | `rollGemWithPickaxePassives`: eligible gems sorted rarest first; independent checks stop on success; Luck-based rarity floor; commonest eligible fallback. No normalization. |
| Maximum Luck | `sanitizeMaxLuck` / `capGemLuck`: cap selection Luck and each Luck-affected gem check, not other stats. |
| Flat / Special | `affectedByLuck` and `specialGem` are distinct flags. Explicit All-In and Resonator effects can improve flat checks; ordinary Luck does not. |
| Weight | `rollWeightMultiplier`: diminishing returns; ordinary 1-in-3 continuation after reaching the 2×+ tail. Specific events/passives override continuation. Tail-entry formula and tables intentionally omitted. |
| Value | `rolledWeight`, `finalWeight`, and `value`: natural result, then final-weight multipliers, then value-per-gram and applicable value effects. |
| Mutations | Independent eligible checks; ordinary chance bonuses capped at guaranteed success; Shifted/Balanced equipment requirements; Charged restricted to Mutation Storm. |
| Actual Chance | Leaderboard RPCs compute Base Rarity × listed catalog mutation denominators. The roll response also contains a legacy `effectiveRarity` adjusted by mutation buffs, distinct from its exact base rarity field. Do not conflate that internal name with standardized Actual Chance. |
| Raw Rare Roll | Base Rarity divided by recorded `raw_luck`, clamped to at least 1; mutations ignored. This score does not reconstruct per-gem exceptions. |
| Disable All Buffs | The current switch resets Luck, Roll Speed, Weight Luck and Weight Multiplier and suppresses one-roll spending. It does not universally bypass mutation, equipment or value effects. The article states this limitation rather than promising completely unbuffed gameplay. |
| Museum | Permanent registration consumes a specimen; exhibition locks it and can be reversed. Avoid describing all Museum actions as donations. |
| Collections | Bundle contributions consume specimens. Combination discovery records persist separately from Inventory. |

## Maintenance

`info/content.js` is curated player-facing copy, not a new backend catalog or runtime formula calculator. Recheck the live backend when mechanics/events change, then update this file and this verification note. It deliberately contains no full weight formula, hidden event selection data, or future Mastery/Magnum Opus documentation.

No new API request is needed to render the reference. The shared shell retains its existing account and event loading. Backend deployment is neither required nor performed.

## Validation

- `npm run test:info`: 4 passing tests covering unique/deep-linkable anchors, resolved page links, normalized search, complete event tiers, hidden-data exclusions, and actual banner expiry/inactive behavior.
- `node tests/topbar-v0121-test.mjs`: passed.
- `node tests/ui-responsiveness-test.mjs`: passed.
- `node --check` on all new JavaScript modules and the modified shell: passed.
- Browser checks: six groups collapsed by default; search and empty state; case/apostrophe event search; state restoration after clearing; direct hash loads; contextual links; keyboard expansion; same-hash keyboard reopening; More-menu placement; 390px and 320px narrow-screen layouts without horizontal overflow; `/info#random-events` directory redirect preserving the fragment.
- Existing `tests/global-random-events-test.mjs` fails at its source-text assertion expecting `eventGemIsEligible(eventContext, entry)`. The current roll source uses `availabilityEventContext`. Both that test and the backend file are unchanged from the baseline; do not rewrite gameplay to satisfy this stale assertion.
- No lint or build scripts exist in this static-site repository. Syntax checks and local serving are the relevant build verification.
- The local preview's shared account initialization reports an anonymous sign-in failure, so authenticated live-banner loading was not exercised. Banner lifecycle is covered with the isolated runtime test. The manual remains usable when account initialization fails.
