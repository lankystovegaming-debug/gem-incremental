# Season 1 — The Interlude

Prepared against live Supabase `igrddscmrdrrwtvyspbf` on 15 October 2026. Nothing has been deployed.

## Schedule and progression

- Start: **17 October 2026 08:00 SGT** (`2026-10-17T00:00:00Z`).
- XP and premium purchases end: **16 November 2026 08:00 SGT** (`2026-11-16T00:00:00Z`), exclusive end boundary.
- Existing unlocked claims end: **23 November 2026 08:00 SGT** (`2026-11-23T00:00:00Z`), exclusive deadline.
- 50 tiers, tier 1 at zero XP, tier 50 at 25,000 XP. Each threshold is `50 * round(SeasonZeroXP * 25000 / 59500 / 50)`. Live Season Zero's full curve matches the checked-in original. All 50 scaled thresholds are unique and strictly increasing.
- Rolling XP: maximum 1,500 per UTC day. Retains the live base rarity bands, +2 XP per mutation and research season-XP multiplier. Mission XP is separate from the daily rolling cap but respects the season's final XP threshold.
- Two daily and three weekly mission chains. Daily awards 50/100/150 XP (300 total); weekly awards 100/150/250/350 XP (850 total). Thresholds match the requested proposal exactly.
- Ordinary UTC midnight daily resets and Monday 00:00 UTC weekly resets. No catch-up or prestige. The final partial week ends with the season; no prorating.
- Premium costs **$10,000,000 in-game cash**. Previously unlocked premium tiers become claimable after purchase. No purchase during grace.

## Reward assumptions and validated totals

The previous discussion did not provide 100 complete reward slots. This implementation creates that missing table; it does not claim to reproduce an unseen approved distribution.

| Track | Cash | Enchant Relics | Ancient Relics | Legendary Potions | Mythic Potions | Ordinary potions |
|---|---:|---:|---:|---:|---:|---:|
| Free | $945,000 | 20 | 2 | 5 | 0 | 19 |
| Premium | $940,000 | 22 | 4 | 9 | 1 | 18 |

**There are no differences from any specified cash/relic/Legendary/Mythic total.** The discretionary choices are their tier placement and the 37 ordinary potions: one item per remaining supply slot, using supported Season Zero Lucky/Speed/Fortune/Mass I–III types. Cash roughly follows Season Zero cash-slot pacing, scaled down to the requested totals and rounded to $5,000; the final cash slot balances each lane exactly. Premium's one Mythic Potion is at tier 50.

A cosmetic is added to its specified tier's supply reward. There are exactly 100 nonempty free/premium slots, rather than 100 individual items. The JSON manifest is also checked against the migration in the database test.

Existing mission-completion items are retained as an explicit assumption: one random Lucky/Speed/Fortune/Mass II potion per completed daily chain and one III potion per weekly chain. These are separate from the track totals. Existing one-unused-daily-mission reroll per UTC day remains available; it awards no catch-up XP. No new reward type or gameplay stat buff is introduced.

## Exclusive cosmetics

| Tier | Lane | Cosmetic | Catalog ID | Equip slot |
|---|---|---|---|---|
| 15 | Premium | Between the Lights | `between-the-lights` | `title` |
| 25 | Free | Quiet Miner | `quiet-miner` | `title` |
| 30 | Free | Silver Horizon | `silver-horizon` | `frame` |
| 40 | Premium | Crystal Reverie | `crystal-reverie` | `background` |
| 50 | Free | The Interlude | `the-interlude` | `title` |
| 50 | Premium | Season 1 | `season-one` | `badge` |

These are new catalog IDs, not IDs recovered from an existing Season 1 catalog. The migration checks slot/source collisions and extends the existing season-grant constraint to support frames/backgrounds. The existing ownership bridge grants them into `player_cosmetics`; equip validation uses the real profile system. Crystal Reverie never grants a roll card. Silver Horizon and Crystal Reverie have dedicated allowlisted profile visuals. All six become Legacy at the claim deadline; no store/voucher or future season reward entry is added for them. Earned ownership remains permanent. Season Zero definitions, progress, claims and rewards are untouched.

## Complete reward table

| Tier | Cumulative XP | Free | Premium |
|---:|---:|---|---|
| 1 | 0 | $5,000 | Lucky Potion I |
| 2 | 200 | Speed Potion I | Mass Potion I |
| 3 | 400 | Fortune Potion I | Lucky Potion Ii |
| 4 | 650 | $5,000 | $15,000 |
| 5 | 850 | Lucky Potion I | Enchant Relic |
| 6 | 1,050 | Mass Potion I | Speed Potion Ii |
| 7 | 1,250 | $15,000 | Fortune Potion Ii |
| 8 | 1,450 | Speed Potion I | Lucky Potion Ii |
| 9 | 1,700 | Fortune Potion Ii | $25,000 |
| 10 | 1,900 | Enchant Relic | Enchant Relic ×2 |
| 11 | 2,200 | $15,000 | Mass Potion Ii |
| 12 | 2,500 | Lucky Potion Ii | Speed Potion Iii |
| 13 | 2,850 | Mass Potion Ii | $25,000 |
| 14 | 3,150 | Fortune Potion Ii | Lucky Potion Iii |
| 15 | 3,450 | $20,000 | Mass Potion I + Between the Lights (title) |
| 16 | 3,800 | Speed Potion Ii | Mass Potion Iii |
| 17 | 4,100 | Lucky Potion Ii | $35,000 |
| 18 | 4,400 | $30,000 | Fortune Potion Iii |
| 19 | 4,750 | Mass Potion Ii | Enchant Relic ×2 |
| 20 | 5,050 | Enchant Relic ×2 | Legendary Potion |
| 21 | 5,450 | $30,000 | Speed Potion Iii |
| 22 | 5,900 | Fortune Potion Iii | $50,000 |
| 23 | 6,300 | Lucky Potion Iii | Enchant Relic ×2 |
| 24 | 6,700 | $35,000 | Legendary Potion |
| 25 | 7,150 | Legendary Potion + Quiet Miner (title) | Ancient Relic ×2 |
| 26 | 7,550 | $40,000 | Mass Potion Iii |
| 27 | 8,000 | Enchant Relic ×2 | $65,000 |
| 28 | 8,400 | Speed Potion Iii | Lucky Potion Iii |
| 29 | 8,800 | $50,000 | Enchant Relic ×2 |
| 30 | 9,250 | Enchant Relic ×3 + Silver Horizon (frame) | Legendary Potion |
| 31 | 9,850 | Fortune Potion Iii | $80,000 |
| 32 | 10,500 | $55,000 | Speed Potion Iii |
| 33 | 11,150 | Lucky Potion Iii | Enchant Relic ×2 |
| 34 | 11,750 | $65,000 | Legendary Potion |
| 35 | 12,400 | Legendary Potion | Legendary Potion ×2 |
| 36 | 13,050 | Enchant Relic ×2 | $100,000 |
| 37 | 13,650 | $70,000 | Mass Potion Iii |
| 38 | 14,300 | Speed Potion Iii | Enchant Relic ×2 |
| 39 | 14,900 | $85,000 | Legendary Potion |
| 40 | 15,550 | Legendary Potion + Ancient Relic | Ancient Relic ×2 + Crystal Reverie (background) |
| 41 | 16,400 | $85,000 | Fortune Potion Iii |
| 42 | 17,250 | Enchant Relic ×3 | $130,000 |
| 43 | 18,050 | Legendary Potion | Enchant Relic ×3 |
| 44 | 18,900 | $95,000 | Legendary Potion |
| 45 | 19,750 | Enchant Relic ×4 | Enchant Relic ×3 |
| 46 | 20,800 | Fortune Potion Iii | $165,000 |
| 47 | 21,850 | $110,000 | Legendary Potion |
| 48 | 22,900 | Legendary Potion | Enchant Relic ×3 |
| 49 | 23,950 | $135,000 | $250,000 |
| 50 | 25,000 | Enchant Relic ×3 + Ancient Relic + The Interlude (title) | Mythic Potion + Season 1 (badge) |

## Implementation and validation

Active-season selection is date-driven; historical seasons remain selectable. There is no Season Zero name filter or 59,500-XP cap in the new active progression code. XP limits come from the selected season's tiers. Internal progression/grant functions remain unavailable to anonymous/authenticated callers; purchase/claim/reroll RPCs use `auth.uid()`. Grants and cash deduction stay transactional, with row locking and duplicate-claim protection. Season-end checks use wall-clock time and recheck after player locks. Completed mission rewards are issued only on the first completion. No client progress-credit endpoint exists.

The deployed optimized roll v178 matches repository code after trimming trailing whitespace. Its Edge Function, batch behavior, bookkeeping entrypoints, base cooldown and lifetime roll counters are unchanged. The season update uses the existing server-side bookkeeping integration; no per-subroll network call is added.

Passed:
- `npm test` (full existing repository suite).
- `npm run test:season-one`: actual migration executed in isolated PGlite with real existing season logic and profile ownership bridge; all slots/totals/XP thresholds, all mission specs, before/start/end/grace boundaries, premium affordability/retries, claims, unauthorized calls, daily caps and research formula, UTC daily/Monday resets, mission milestone XP/items, rerolls, idempotency, reapplying migration, past ownership and profile equip.
- `npm run test:roll-hot-path` and `npm run test:cosmetics`.
- `npm run test:season-one-browser`: production Seasons page with isolated responses at 320/360/390/768/1440px; all 100 slots, purchasing, claiming, archives, upcoming/end/expiry controls, 44px targets, no page overflow or browser exceptions. Screenshots visually inspected. Backend behavior is tested separately; fixtures do not imply deployed Season 1.
- `node --check seasons/seasons.js` and `git diff --check`.

## Manual deployment — user only

1. Review/apply **only** `supabase/migrations/20261015024142_season_one_interlude.sql` to project `igrddscmrdrrwtvyspbf` using your migration workflow or Supabase SQL editor. It depends on the already-deployed Season Zero and unified profile cosmetics schema. This creates scheduled Season 1, the full reward manifest and six cosmetics, and replaces the necessary database functions. It does not start early or modify old progress.
2. Deploy **only the `seasons` Edge Function** from this branch, preserving the current `verify_jwt=false` deployment setting; `withSupabase({auth:'user'})` validates user authentication in the handler:

   ```sh
   supabase functions deploy seasons --project-ref igrddscmrdrrwtvyspbf --no-verify-jwt --use-api
   ```

3. Publish the frontend files with the usual website workflow after the updated function is available. Changed frontend paths: `seasons/index.html`, `seasons/seasons.js`, `seasons/seasons.css`, `src/ui/cosmetics.js`, `src/styles/app.css`, `user/profile.css`.
4. Confirm the existing `game_section_settings` row for `seasons` remains enabled. The season then opens automatically at the scheduled start. No scheduler, manual start RPC, new secret, roll deployment, or premium-sale reactivation during grace is needed.
5. Smoke-check with the dedicated test account: upcoming before start; correct $10M price and empty separate progress at start; tier-one claim once; old archive retained; purchased premium persists on reload; profile cosmetics equip after unlocking. Do not grant test XP or spend player funds in production as part of automated tests.

### Other pending backend work in weekly PR #514

The same PR already contains **unfinished, release-disabled Christmas work** from earlier commits:
- `supabase/migrations/20261014052101_christmas_2026_foundation.sql`
- `supabase/migrations/20261014060812_christmas_2026_approved_quests_and_schedule.sql`
- `supabase/functions/christmas-2026/index.ts` and its shared files

These are unrelated to Season 1 and are not prerequisites. **Do not bulk-push all pending migrations/functions to ship Season 1, or enable Christmas as a completed event package.** Keep that work separate and follow its existing implementation-status document when it is finished. No merge, migration, function deployment or live configuration write was performed for this task.
