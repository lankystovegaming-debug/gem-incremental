# Gem Filter, Enable Buffs and Equipment Loadouts

Implemented against repository base `c5283e53d3d3847ddd37c9f9efe0861158c37cef` and the deployed backend of Supabase project `igrddscmrdrrwtvyspbf`, inspected on 8 September 2026. Nothing has been deployed.

## Backend source and deployment order

The roll source was retrieved directly from deployed **`roll` version 145**, SHA-256 `d290e1d82eccfc5e46de17b5f83b3e294b28ef6e0cea110bff46ab47d800b0f5`. The delivered function preserves its concurrent artifact reads and post-commit work; it does not replace it with the older repository implementation. The live `bundle_route_roll`, `claim_equipment_roll`, and `set_overhaul_equipment_equipped` definitions and the relevant table indexes/permissions were also inspected.

Deploy in this order:

1. Apply **`supabase/migrations/20260908124328_qol_gem_filter_buffs_loadouts.sql`** to the existing project. It depends on the already-deployed equipment overhaul, `player_settings`, discovery catalog, and roll lease systems. It adds the loadout table, preference/catalog/loadout RPCs and a settings compatibility trigger. It does not replace any game formula or sale function.
2. Deploy **only the `roll` Edge Function** from `supabase/functions/roll/index.ts`. This is a self-contained single-file source suitable for the dashboard workflow. Retain the live function's **Verify JWT = OFF** setting; the existing `withSupabase` user authentication remains in the handler. No new loadout Edge Function is needed: equipping calls the database RPC directly.
3. Publish the frontend changes together and have existing sessions refresh. New clients no longer issue automatic `sell-gem` calls. An already-open old client still contains its old automatic-sale code until refreshed; manual selling remains available by design.

The new roll deliberately fails closed if `qol_roll_context` cannot be read. Deploy the migration before the function. For rollback, restore the previous roll function and frontend together; leave the additive migration/data in place to preserve preferences and loadouts.

## Behavior and compatibility

- Each discovered catalog gem has **DEFAULT / KEEP / SELL**, with search, rule filters, 50-row pages, selection across all matching pages, bulk changes and clear-selection controls. Catalog loading paginates past the API row cap. Undiscovered gems are excluded and the write RPC rejects rules for them.
- **Auto Keep** retains its existing effective-rarity threshold. The backend uses the deployed roll's mutation-odds calculation, not client value multipliers.
- **New Discovery Keep** defaults to enabled at **1 in 10,000**, using **raw/base rarity ≥ threshold**. It applies only to the first base-gem discovery; Index recording continues even if a specimen is sold. Discovery lookup reads every distinct gem name without truncating mutation-combination rows.
- Relics, qualifying Auto Keep/discoveries and explicit KEEP retain the primary specimen before Collection/crafting routing. Otherwise existing Collection routing runs first, including Crown protection and ambiguous-match retention; crafting runs next; SELL applies only to the specimen still available for sale. Conservation-retained crafting specimens are not sold. The sale uses the existing `sell_inventory_gem` transaction and economy accounting. Failed sales leave the specimen retained.
- DEFAULT has no special retention/sale action. Existing Auto Sell tier settings are snapshotted as an **inherited SELL rule** for unconfigured gems, including later discoveries, preserving the original tier behavior. Explicit DEFAULT clears inheritance for that gem. **Clear imported Auto Sell rule** removes the inherited rule globally without changing explicit gem rules. Device-only Auto Sell and Auto Keep preferences are imported when the cloud has no corresponding preference. Existing cloud values take precedence.
- Preference writes merge patches under a database row lock. Older clients saving whole documents do not erase new settings or independent gem rules. Failed frontend saves report an error and do not claim success.
- **Enable Buffs** defaults ON. OFF clamps final Luck, cooldown Roll Speed, Weight Luck and the final equipment/bonus Weight Multiplier to **exactly 1×**. It also neutralizes per-gem Luck and weight-distribution modifiers that otherwise occur after the ordinary stat calculation. Base cooldown is **2,500 ms**. Gear remains equipped, timed buffs keep their normal expiration times, and pending one-roll Luck potion charges are retained. The scope is the four requested core stats; mutation chance and currency/value systems retain their existing behavior. The Roll page shows an indicator and the Stats preview shows 1× totals with its build breakdown marked inactive.
- **Equipment Loadouts** are on Inventory's **Equipment tab**. Five named slots save row IDs for pickaxe, boots, bag, clover and lantern, including deliberately empty slots. Save/update records current selections, never derived stats. Equip runs in one transaction under the existing player/roll lock and equipment triggers. Missing or consumed items leave that category unchanged and produce feedback; empty saved slots unequip that category. Ownership, slot/name limits and active-roll rejection are enforced by the database. Enchants, gear and permanent mastery are not copied or deleted.
- Existing bonus-specimen generation/storage behavior is retained. The primary roll is routed through Gem Filter; generated duplicate/bonus specimens continue through their existing bonus inventory path.
- A full inventory pauses Auto Roll. The old browser fallback that could sell an unrelated stored specimen to make room was removed.

## Changed files

| Files | Change |
| --- | --- |
| `supabase/functions/roll/index.ts` | Live optimized source, authoritative preference/discovery read, retention/sale routing, four-stat clamp and response metadata |
| `supabase/migrations/20260908124328_qol_gem_filter_buffs_loadouts.sql` | Additive schema, validated settings patches, discovered catalog, five-slot loadout transaction, old-client compatibility |
| `src/ui/settings.js` | Cloud hydration/import, serialized patch saves, authoritative sale behavior |
| `settings/index.html`, `settings/settings.js`, `settings/settings.css`, `settings/qol.js` | Categories, dedicated Gem Filter, discovery threshold, buffs and chat layout |
| `index.html`, `main.js` | Retired Auto Sell controls, server outcomes and disabled-buffs indicator |
| `src/ui/globalAutomation.js`, `src/ui/autoRoll.js` | Server-owned automatic selling and safe inventory-full pause |
| `inventory/index.html`, `inventory/inventory.js`, `src/ui/equipmentLoadouts.js` | Equipment-tab preset UI and atomic RPC calls |
| `src/backend/cloudDebug.js`, `chat-ui.js` | Disabled stat preview and live chat-layout updates |
| `tests/qol-*.mjs`, `tests/equipment-overhaul-handler-test.mjs`, `tests/chat-auto-keep-hotfix-test.mjs`, `package.json` | New tests and updates for the asynchronous settings/roll contract |

## Verification

- **`npm run test:qol` passes:** actual optimized handler across all nine pickaxes; four 1× stats; 2,500 ms cooldown; potion-charge retention; KEEP/SELL/DEFAULT and threshold boundaries; raw versus effective rarity; Collection protections; crafting and Conservation; failed-sale retention; local preference import and failed-save recovery.
- **PGlite executes the actual migration:** validates ownership/RLS/function grants, five-slot limits, missing-item preservation, empty-slot unequip, one-transaction loadout behavior, active-roll rejection, settings merging, imported preferences and older-client writes. These are local integration tests, not production multi-connection/load tests.
- **`npm run test:qol-ui` passes** with Playwright and Chrome: 1,105 catalog rows, bulk editing 100 matches across pages, controls, mobile width, escaped preset names, save/update/equip/delete and unavailable-item feedback. API responses are mocked; no production player data is mutated. Set `QOL_PLAYWRIGHT_MODULE` if Playwright is installed outside the repository. Screenshots are generated under ignored `artifacts/qol/`.
- The repository pretest suite and the remaining regression tests were run. Two unrelated existing tests fail in unchanged files: `gem-builder-code-serials-test.mjs` expects the removed `mutation-tab__custom` marker; `live-mutation-chance-test.mjs` expects `1 in 3,500` while the existing chance formatter returns `1 in 35`. Their test and implementation files were not modified by this update. Relevant stats, chat, session, equipment and Collection tests pass.
- JavaScript syntax checks and `git diff --check` pass.

Production latency cannot be verified before deployment. The optimized flow is preserved, but this update adds one compact preference/discovery RPC per accepted attempt and uses the existing sale RPC when SELL applies. No live rolls, migrations, or Edge Functions were executed/deployed during verification.
