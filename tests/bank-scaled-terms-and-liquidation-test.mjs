import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sql = read("supabase/migrations/20260911000000_bank_scaled_terms_and_default_liquidation.sql");
const page = read("bank/bank.js");

// ── Scaled loan term helper ───────────────────────────────────────────
// A size-based term function shared by the borrow logic and the client.
assert.match(sql, /create or replace function public\.bank_loan_term_days\(p_amount double precision\)/);
assert.match(sql, /language sql immutable set search_path = ''/);
// The exact tier boundaries (must match the client mirror below).
assert.match(sql, /when coalesce\(p_amount, 0\) < 250000 then 7/);
assert.match(sql, /when p_amount < 1000000 then 10/);
assert.match(sql, /when p_amount < 2500000 then 14/);
assert.match(sql, /when p_amount < 5000000 then 21/);
assert.match(sql, /else 30/);
assert.match(sql, /grant execute on function public\.bank_loan_term_days\(double precision\) to authenticated/);

// ── Borrow uses the scaled term, anchored to the loan's open time ─────
assert.match(sql, /create or replace function public\.bank_borrow\(p_amount double precision\)/);
// Fresh draw: now + term(new balance). Top-up: opened_at + term(new balance),
// so it lengthens the term without resetting the clock to now().
assert.match(sql, /now\(\) \+ make_interval\(days => public\.bank_loan_term_days\(loan_principal \+ v_amount\)\)/);
assert.match(sql, /coalesce\(loan_opened_at, now\(\)\)\s*\n\s*\+ make_interval\(days => public\.bank_loan_term_days\(loan_principal \+ v_amount\)\)/);
// The old flat 7-day term must be gone from the new borrow function.
assert.doesNotMatch(sql, /now\(\) \+ interval '7 days'/);

// ── Bankruptcy liquidates assets before discharging ───────────────────
assert.match(sql, /create or replace function public\.bank_declare_bankruptcy\(\)/);
// Reachable for a genuine default: past due now, or a missed payment on record.
assert.match(sql, /if v_acct\.missed_marks <= 0\s*\n\s*and \(v_acct\.loan_due_at is null or now\(\) <= v_acct\.loan_due_at\) then/);
assert.match(sql, /raise exception 'bank_not_in_default'/);
// Order: savings -> wallet cash -> gems.
assert.match(sql, /v_seize := least\(v_acct\.balance, v_owed\)/);              // savings
assert.match(sql, /select money into v_money from public\.players where id = v_uid for update/); // wallet
assert.match(sql, /update public\.players set money = money - v_take where id = v_uid/);
// Gems: most valuable first, locked included, only until the debt is covered.
assert.match(sql, /select id, value from public\.inventory_gems\s*\n\s*where player_id = v_uid\s*\n\s*order by value desc, id asc/);
assert.match(sql, /exit when v_owed <= 0\.0001/);
assert.match(sql, /delete from public\.inventory_gems where id = v_gem\.id and player_id = v_uid/);
// The locked flag is deliberately NOT checked in this seizure path.
const bankruptcyFn = sql.match(/create or replace function public\.bank_declare_bankruptcy[\s\S]*?\n\$\$;/)?.[0] ?? "";
assert.ok(bankruptcyFn, "bank_declare_bankruptcy function must be present");
// Ignore SQL line comments (which explain the design) and assert the executable
// code never checks the locked flag or refuses a locked gem.
const bankruptcyCode = bankruptcyFn.replace(/--.*$/gm, "");
assert.doesNotMatch(bankruptcyCode, /\blocked\b/, "default liquidation must not gate on the locked flag");
assert.doesNotMatch(bankruptcyCode, /gem_locked/, "default liquidation must not refuse locked gems");
// Over-collection returns to the wallet as change.
assert.match(sql, /v_excess := coalesce\(v_gem\.value, 0\) - v_pay/);
assert.match(sql, /if v_excess > 0 then\s*\n\s*update public\.players set money = money \+ v_excess/);
// Cleared by seizure -> loan settles, credit untouched (no reset in that branch).
assert.match(sql, /if v_owed <= 0\.0001 then[\s\S]*?loan_due_at = null,\s*\n\s*loan_opened_at = null,\s*\n\s*updated_at = now\(\)/);
// Shortfall -> true bankruptcy (credit reset + freeze), same as before.
assert.match(sql, /credit_score = 300,[\s\S]*bankruptcies = bankruptcies \+ 1,[\s\S]*borrow_frozen_until = now\(\) \+ interval '14 days'/);
// Outcome is surfaced back to the client alongside the dashboard.
assert.match(sql, /'liquidation_outcome', case when v_discharged then 'discharged' else 'cleared' end/);
assert.match(sql, /'gems_sold', v_gems_sold/);

// ── Client mirror + copy ──────────────────────────────────────────────
// The JS term mirror must define the identical tier boundaries.
assert.match(page, /function loanTermDays\(amount\)/);
assert.match(page, /if \(value < 250000\) return 7;/);
assert.match(page, /if \(value < 1000000\) return 10;/);
assert.match(page, /if \(value < 2500000\) return 14;/);
assert.match(page, /if \(value < 5000000\) return 21;/);
assert.match(page, /return 30;/);
// The borrow dialog previews the size-scaled term.
assert.match(page, /const term = loanTermDays\(Number\(data\.loan_principal \|\| 0\) \+ amount\)/);
assert.match(page, /due within <strong>\$\{term\} days<\/strong>/);
// Bankruptcy is reachable once defaulted (past due OR a missed payment).
assert.match(page, /const defaulted = owed > 0 && \(data\.in_default \|\| Number\(data\.missed_marks\) > 0\)/);
// The confirmation explains the seizure order and the credit-intact case.
assert.match(page, /savings, then wallet cash, then your gems/);
assert.match(page, /confirmLabel: "Seize assets & settle"/);
// The success toast distinguishes cleared-by-seizure from a real discharge.
assert.match(page, /outcome\.data\.liquidation_outcome === "discharged"/);
assert.match(page, /credit intact/);
// New ledger kind for gem liquidation.
assert.match(page, /liquidation: "Gems liquidated"/);
assert.match(page, /liquidation: -1/);

console.log("bank-scaled-terms-and-liquidation-test passed");
