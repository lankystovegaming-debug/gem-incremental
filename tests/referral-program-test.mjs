import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const migration = await read("../supabase/migrations/20260831000002_referral_program.sql");
const rebalance = await read("../supabase/migrations/20260831030943_rebalance_referral_rewards.sql");
const potionGates = await read("../supabase/migrations/20260831024407_enforce_one_roll_potion_roll_requirements.sql");
const cloud = await read("../src/backend/cloudReferral.js");
const bootstrap = await read("../src/ui/referralBootstrap.js");
const main = await read("../main.js");
const shell = await read("../src/ui/shell.js");
const pageHtml = await read("../referral/index.html");
const pageJs = await read("../referral/referral.js");

// --- Migration: tables keyed on auth.users so attribution works pre-players.
assert.match(migration, /create table if not exists public\.player_referral_codes/);
assert.match(migration, /create table if not exists public\.player_referrals/);
assert.match(migration, /referred_id uuid primary key references auth\.users\(id\)/);
assert.match(migration, /referrer_id uuid not null references auth\.users\(id\)/);
assert.match(migration, /constraint player_referrals_no_self check \(referred_id <> referrer_id\)/);

// --- Migration: the four server-authoritative RPCs.
assert.match(migration, /create or replace function public\.get_or_create_referral_code\(\)/);
assert.match(migration, /create or replace function public\.claim_referral\(p_code text\)/);
assert.match(migration, /create or replace function public\.settle_my_referral\(\)/);
assert.match(migration, /create or replace function public\.get_referral_summary\(\)/);

// --- Migration: claim guards and the qualification milestone / rewards.
assert.match(migration, /raise exception 'referral_self'/);
assert.match(migration, /raise exception 'referral_already_claimed'/);
assert.match(migration, /raise exception 'referral_not_eligible'/);
assert.match(migration, /v_qualify_rolls integer := 200/);
assert.match(migration, /v_referrer_reward numeric := 5000000/);
assert.match(migration, /v_referred_reward numeric := 1000000/);
// Settlement pays once: only pending rows are picked up and flipped.
assert.match(migration, /and status = 'pending'\s+for update/);
assert.match(migration, /set status = 'qualified'/);

// --- Rebalance: exact cash and consumable bundles use established IDs.
assert.match(rebalance, /v_qualify_rolls integer := 200/);
assert.match(rebalance, /v_referrer_reward numeric := 500000/);
assert.match(rebalance, /v_referred_reward numeric := 100000/);
for (const grant of [
  /\('lucky-potion-3', 2\)/,
  /\('speed-potion-3', 2\)/,
  /\('fortune-potion-2', 1\)/,
  /\('mass-potion-2', 1\)/,
  /\('legendary-potion', 3\)/,
  /\('lucky-potion-2', 2\)/,
  /\('speed-potion-2', 2\)/,
  /\('fortune-potion-1', 2\)/,
  /\('mass-potion-1', 1\)/,
  /\('legendary-potion', 1\)/
]) assert.match(rebalance, grant);
assert.equal((rebalance.match(/\('mythic-potion', 1\)/g) ?? []).length, 2);

// Duplicate settlement calls serialize on the pending row. The status flips
// only after both inventory grants, and existing stacks are incremented.
assert.match(rebalance, /status = 'pending'\s+for update/);
assert.equal((rebalance.match(/on conflict \(player_id, consumable_id\) do update/g) ?? []).length, 2);
assert.equal((rebalance.match(/quantity = public\.player_consumables\.quantity \+ excluded\.quantity/g) ?? []).length, 2);
assert.ok(rebalance.lastIndexOf("set status = 'qualified'") > rebalance.lastIndexOf("insert into public.player_consumables"));

// High-tier activation is gated before inventory can be consumed.
assert.match(potionGates, /when 'legendary-potion' then[\s\S]*?v_required_rolls := 1000/);
assert.match(potionGates, /when 'mythic-potion' then[\s\S]*?v_required_rolls := 2500/);
assert.ok(potionGates.indexOf("raise exception 'lifetime_rolls_required:%'") < potionGates.indexOf("update public.player_consumables"));

// --- Client backend wraps every RPC and builds the share link.
for (const fn of [
  "loadReferralCode",
  "loadReferralSummary",
  "claimReferral",
  "settleReferral",
  "buildReferralLink"
]) {
  assert.match(cloud, new RegExp(`export function ${fn}|export async function ${fn}`));
}
assert.match(cloud, /get_or_create_referral_code/);
assert.match(cloud, /settle_my_referral/);

// --- Bootstrap captures ?ref, claims once, and settles.
assert.match(bootstrap, /export async function initReferral/);
assert.match(bootstrap, /claimReferral/);
assert.match(bootstrap, /settleReferral/);

// --- Roll page invokes the bootstrap; More menu links the page.
assert.match(main, /import \{ initReferral \} from "\.\/src\/ui\/referralBootstrap\.js"/);
assert.match(main, /initReferral\(\)/);
assert.match(shell, /href="\$\{base\}referral\/"/);

// --- Page wires its DOM hooks and copy button.
assert.match(pageHtml, /id="referralLinkInput"/);
assert.match(pageHtml, /id="referralCopyButton"/);
assert.match(pageJs, /mountShell\(\{ page: "referral"/);
assert.match(pageJs, /buildReferralLink/);
assert.match(pageHtml, /\$500,000/);
assert.match(pageHtml, /\$100,000/);
assert.match(pageHtml, /Legendary Potion ×3/);
assert.match(pageHtml, /Mythic Potion ×1/);
assert.match(pageHtml, /1,000 lifetime rolls/);
assert.match(pageHtml, /2,500 lifetime rolls/);

console.log("Referral program tests passed.");
