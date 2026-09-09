# Economy Breakdown: audit and deployment

Prepared against **Supabase `igrddscmrdrrwtvyspbf` on 2026-09-09**, repository base `1b8f03f`. Nothing has been deployed. Deployed database definitions and all 34 Edge deployments were inspected, including the optimized `roll` v151 and admin v46. The backend, not old repository migrations, supplied the flow/formula audit. `economy-backend-audit.json` inventories the database definitions reviewed.

## Deployment order

1. Apply `supabase/migrations/20260909104511_economy_cash_ledger.sql` yourself. It is one transaction and briefly locks cash/fee tables against concurrent writes. Its five-second lock timeout aborts the whole migration on contention; retry in a quieter period.
2. Deploy `supabase/functions/admin/index.ts` yourself. Only its money adjustment changes: a row-locked RPC replaces read/overwrite/write, and commits the existing audit entry with the balance and ledger.
3. Release the root `admin/` frontend using the game's normal workflow. If it arrives first, the panel says tracking is not deployed yet and offers Refresh.
4. As an admin, verify a normal sale, bank deposit/withdrawal and purchase in Economy. Existing specialized histories should still contain those operations. No artificial production transactions are needed to populate the dashboard.

Three guarded hooks expose the actual computed fees in `buy_shares(numeric)`, `sell_shares(numeric)` and `war_resolve_due()`. If their exact deployed definitions changed since this audit, the migration aborts and names the function. Re-audit that newer function and update the hook; do not bypass the guard to overwrite new formulas. Other gameplay functions are not replaced. **No roll redeployment is required**: its cash changes already use tracked database RPCs. The nested legacy `gem-incremental-admin-panel/` snapshot is not the root game's active admin UI.

## Accounting contract

The ledger contains signed numeric amount, source/sink/transfer, category, operation subcategory/reference, wallet/bank/clearing account, player UUID, timestamp, transaction ID and before/after metadata. AFTER triggers record actual balance changes in the same transaction. Zero changes and roll bookkeeping add no rows. The ledger preserves player IDs after account deletion.

The first recognized writer in PostgreSQL's call stack determines attribution. Thus nested `bank_touch` interest remains a source even inside a deposit. Ordinary references identify the database function; fee references additionally identify the specialized history row or war UUID. Generic rewards are labeled system rewards at the verified operation level, without inventing a particular quest ID. No user-controlled request header determines attribution. No raw SQL, secrets, request headers or full player profiles are copied to the ledger.

Unrecognized updates are recorded under `unattributed`, shown as a warning with a separate net, and excluded from claimed source/sink totals. New cash writers need a reviewed entry in `economy_private.cash_paths`; nested sources/sinks inside transfer operations need their own classified helper. Inserts/deletes record nonzero initialization/removal explicitly.

- Cash created = signed source sum. Cash destroyed = negative signed sink sum. Net creation = created − destroyed.
- Refunds are positive sink reversals. Masterwork token reimbursements reduce Masterwork destruction rather than becoming sources; a refund-only period can have negative destruction.
- Both bank transfer legs are stored; top-level transfer statistics count the wallet leg once. Market and war stakes, payouts and refunds are transfers. Escrow can enter and leave in different periods.
- A withheld fee uses two clearing entries: positive reclassification in the original flow and negative fee sink. They sum to zero and do not charge a wallet again. Share buy fees reclassify part of the share sink; share sale fees expose gross proceeds and the withheld fee. The hooks use the live implementation's variables.
- Total Money Supply = **current wallet cash + bank deposits for every player**, independent of the period. It excludes escrow, shares, gem values and uncredited interest and does not subtract debt. Older analytics exclude one test username; the UI explicitly labels the new all-player scope. Buying shares consumes cash for a noncash asset; selling shares creates cash.
- Reconciliation: **wallet+bank recorded change = net creation + transfer net + unattributed net**. Clearing entries cancel. This does not fabricate a historical opening balance.
- All means since deployment. No existing balances or specialized transaction rows are backfilled. Savings interest is recognized when credited, even if its accrual began earlier.

## Cash-path audit

Every writer below is captured by balance triggers. Existing `bank_transactions`, `market_fee_transactions`, `museum_purchases`, `guild_point_cash_contributions`, `mining_cache_opens`, redemption histories and other specialized tables remain intact. A fee-table insert trigger adds the market fee reclassification; share/war fee hooks cover fees without that specialized history.

| Category | Deployed writer(s) | Classification |
|---|---|---|
| Gem sales | `sell_inventory_gem` (sell-gem and optimized roll auto-sale) | Credited value source |
| Admin/system rewards | `apply_private_feature_currency_reward`, `apply_reward_object`, `dependency_improvement`; admin action now `admin_adjust_economy_cash` | Actual grants/removals |
| Achievements | `grant_achievement_rewards_v013` | Cash rewards only |
| Codes/referrals | `redeem_code_single_reward`, `settle_my_referral` | Credits, including both referral recipients |
| Seasons | `season_grant_reward`, `purchase_season_premium` | Reward source / premium sink |
| Guild rewards | `finalize_guild_competitions` | Each member's cash reward |
| Bank | `bank_touch`, `bank_borrow`, `bank_repay`, `bank_deposit`, `bank_withdraw` | Credited interest and loan issuance sources; repayment/seizure sinks; deposit/withdrawal transfers |
| Equipment | Both `craft_equipment_recipe` overloads | Actual crafting sink |
| Masterwork | `masterwork_equipment_beta`, `masterwork_equipment_with_cache_tokens` | Cost / token refund reversal |
| Consumables | `buy_consumable`, `buy_consumables_bulk`, `craft_consumable_recipe` | Actual money paid |
| Daily/gem shops | `buy_daily_shop_offer`, `refresh_daily_shop`, `buy_gem` | Offer, refresh and gem costs |
| Shares | `buy_shares`, `sell_shares` | Cash purchase sink / redemption source; fees split |
| Guild spending | `create_guild_v2`, `guild_purchase_points_with_cash` | Creation/contribution sinks |
| Museum/caches | `museum_expand`, `purchase_mining_cache` | Expansion and cash-funded cache costs only |
| Research/inventory | `reset_research_tree_v014`, `upgrade_inventory_capacity`, `upgrade_inventory_infinite` | Reset/capacity sinks |
| Burn/import | `burn_player_money`, `migrate_legacy_save` | Actual burn / labeled import delta |
| Expedition entry/services | `enter_expedition`, `reroll_expedition_quest`, `choose_abandoned_mine_camp_service`, `fund_abandoned_mine`, `fund_abandoned_mine_hell`, `fund_crystal_depth`, `fund_crystal_hell_depth`, `fund_volcanic_depth`, `buy_volcanic_cooling`, `buy_volcanic_monitoring`, `resolve_abandoned_mine_hell_event`, `resolve_crystal_decision`, `resolve_crystal_hell_decision`, `reveal_abandoned_mine_hell_card`, `sample_volcanic_magma` | Actual entry/funding/service debits |
| Expedition settlement | `settle_abandoned_mine`, `settle_abandoned_mine_hell`, `settle_crystal_caverns`, `settle_volcanic_depths` | Credited cargo and duplicate-artifact rewards |
| Market escrow | `buy_auction`, `create_gem_order`, `cancel_gem_order`, `expire_stale_gem_orders`, `fulfill_gem_order`, `place_bid`, `settle_due_auctions` | Transfers; listing/order fees separated |
| Wars | `war_challenge`, `war_respond`, `war_cancel`, `war_resolve_due` | Stakes/refunds/payout transfers; rake sink; friendly reward source through `apply_reward_object` |
| Lifecycle | `handle_new_user`, `ensure_player_record`, direct insert/delete, cascaded bank deletion | Nonzero initialization/removal |

Noncash paths checked: research-node purchases spend RP, enchanting consumes relics/materials, debt interest/penalties increase liabilities only, and bankruptcy discharges debt (preceding savings seizure is captured separately). Free overdepth, noncash grants, rolls, bundles, crafting deposits, leaderboard and progression updates do not generate cash until a sale/reward credits a wallet. Reward callers are captured at their shared cash helper.

The old deployed `dungeons` function attempts `increment_player_money`, but that RPC **does not exist in the live database**. The failed call creates no cash. This pre-existing reward-delivery issue was not changed under the accounting task. Experimental endpoints storing reward/result JSON without applying cash likewise generate no ledger entry. Dynamic SQL and player writers without money/balance expressions were also inspected; these cover noncash bookkeeping, initialization, maintenance and storage operations.

## Security, performance and validation

The ledger has RLS and no direct client/service-role table privileges. Private helpers have fixed empty search paths and no client execute grants. The summary RPC checks the authenticated admin/owner; the adjustment RPC is service-role-only and checks the admin ID supplied by the authenticated Edge action. Ordinary players cannot choose attribution or write telemetry.

The time index supports bounded periods; player/time supports investigation. One database aggregation avoids browser row caps. All grows with retained ledger history; monitor storage/query time before introducing rollups. No pruning policy is silently introduced. Existing global cash analytics remain unchanged.

Tests:

- `npm run test:economy`: local PostgreSQL/PGlite with audited live bank/share/war functions; empty history, authorization, atomic admin audit, transfers, nested interest, loans/repayment, rollback, no-op writes, unknown writes, token refunds, fee clearing, all filters, exact cutoff, account deletion and reconciliation; existing admin tab/bank regressions.
- `ECONOMY_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:economy-ui`: local Chrome fixture UI, all filters, expandable rows, stale requests, empty/missing deployment/error/retry states, escaping and desktop/mobile layout. Requires Chrome and Playwright; never contacts production.

The migration is executed locally in tests. **No production schema/function deployment or cash mutation was performed.** Live security advisors were inspected as baseline only; the new privileges were checked locally because the new schema is not deployed.
