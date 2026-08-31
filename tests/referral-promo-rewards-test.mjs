import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

// The launch promo is a later-dated migration than the standing rebalance
// (20260831030943), so it wins as the effective settle_my_referral.
const promo = await read("../supabase/migrations/20260831040000_referral_launch_promo.sql");
const rebalance = await read("../supabase/migrations/20260831030943_rebalance_referral_rewards.sql");
const pageHtml = await read("../referral/index.html");

// The promo migration must sort after the standing rebalance.
assert.ok("20260831040000" > "20260831030943", "promo migration must apply after the rebalance");

// Promo reward tier.
assert.match(promo, /v_referrer_reward numeric := 2000000/);
assert.match(promo, /v_referred_reward numeric := 250000/);
assert.match(promo, /v_referrer_mythic integer := 10/);
assert.match(promo, /v_referred_legendary integer := 5/);

// Limited-time window: settlement after the cutoff no longer pays.
assert.match(promo, /v_promo_ends timestamptz := '2026-09-06 00:00:00\+00'/);
assert.match(promo, /if now\(\) >= v_promo_ends then\s+return jsonb_build_object\('settled', false, 'promoEnded', true\)/);

// Potions granted via player_consumables upserts of the right ids.
assert.match(promo, /values \(v_referrer, 'mythic-potion', v_referrer_mythic, now\(\)\)/);
assert.match(promo, /values \(v_uid, 'legendary-potion', v_referred_legendary, now\(\)\)/);
assert.equal((promo.match(/on conflict \(player_id, consumable_id\) do update/g) ?? []).length, 2);

// Keeps the rebalance's safety shape: row-count checks and pay-once ordering.
assert.match(promo, /get diagnostics v_updated_rows = row_count/);
assert.match(promo, /raise exception 'referrer_player_not_found'/);
assert.match(promo, /raise exception 'referred_player_not_found'/);
assert.ok(promo.lastIndexOf("set status = 'qualified'") > promo.lastIndexOf("insert into public.player_consumables"));
assert.match(promo, /v_qualify_rolls integer := 200/);
assert.match(promo, /revoke execute on function public\.settle_my_referral\(\) from public, anon/);

// The standing rebalance still exists in history (superseded, not deleted).
assert.match(rebalance, /v_referrer_reward numeric := 500000/);

// Page advertises the promo, its deadline, and the exact bundle.
assert.match(pageHtml, /Launch offer — ends Sept 5/);
assert.match(pageHtml, /\$2,000,000/);
assert.match(pageHtml, /Mythic Potion ×10/);
assert.match(pageHtml, /\$250,000/);
assert.match(pageHtml, /Legendary Potion ×5/);

console.log("Referral promo rewards tests passed.");
