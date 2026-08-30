import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const migration = await read("../supabase/migrations/20260831000002_referral_program.sql");
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

console.log("Referral program tests passed.");
