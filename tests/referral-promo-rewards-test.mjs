import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

const migration = await read("../supabase/migrations/20260831000003_referral_promo_rewards.sql");
const pageHtml = await read("../referral/index.html");

// Promo reward tier.
assert.match(migration, /v_referrer_cash numeric := 2000000/);
assert.match(migration, /v_referred_cash numeric := 250000/);
assert.match(migration, /v_referrer_mythic integer := 10/);
assert.match(migration, /v_referred_legendary integer := 5/);

// Limited-time window: settlement after the cutoff no longer pays.
assert.match(migration, /v_promo_ends timestamptz := '2026-09-06 00:00:00\+00'/);
assert.match(migration, /if now\(\) >= v_promo_ends then\s+return jsonb_build_object\('settled', false, 'promoEnded', true\)/);

// Potions are granted via player_consumables upserts of the right ids.
assert.match(migration, /values \(v_referrer, 'mythic-potion', v_referrer_mythic, now\(\)\)/);
assert.match(migration, /values \(v_uid, 'legendary-potion', v_referred_legendary, now\(\)\)/);
assert.match(migration, /on conflict \(player_id, consumable_id\) do update/);
// Referrer potion grant is guarded on the players-row FK.
assert.match(migration, /if exists \(select 1 from public\.players where id = v_referrer\) then/);

// Still gated on the 200-roll milestone and paid once.
assert.match(migration, /v_qualify_rolls integer := 200/);
assert.match(migration, /set status = 'qualified'/);

// Page advertises the promo and its deadline.
assert.match(pageHtml, /Launch offer — ends Sept 5/);
assert.match(pageHtml, /\$2,000,000 \+ 10 Mythic Potions/);
assert.match(pageHtml, /\$250,000 \+ 5 Legendary Potions/);

console.log("Referral promo rewards tests passed.");
