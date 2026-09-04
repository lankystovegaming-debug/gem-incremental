import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sql = read("supabase/migrations/20260904120000_bank_system_v1.sql");
const client = read("src/backend/cloudBank.js");
const page = read("bank/bank.js");
const html = read("bank/index.html");
const css = read("bank/bank.css");
const shell = read("src/ui/shell.js");
const history = read("supabase/migrations/20260904130000_bank_total_cash_history.sql");
const graph = read("global-cash-graph/graph.js");
const graphHtml = read("global-cash-graph/index.html");

// ── Schema & security ─────────────────────────────────────────────────
assert.match(sql, /create table if not exists public\.bank_accounts/);
assert.match(sql, /create table if not exists public\.bank_transactions/);
// player_id keys to auth.users so the migration applies without the game schema.
assert.match(sql, /player_id uuid primary key references auth\.users\(id\) on delete cascade/);
for (const table of ["bank_accounts", "bank_transactions"]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
}
// Credit is constrained to the FICO range at the database level.
assert.match(sql, /check \(credit_score between 300 and 850\)/);

// ── RPCs are SECURITY DEFINER, keyed to auth.uid(), search_path locked ─
const actions = ["bank_get_dashboard", "bank_deposit", "bank_withdraw", "bank_borrow", "bank_repay"];
for (const fn of actions) {
  assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`), `${fn} must be defined`);
  assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`), `${fn} must be granted to authenticated`);
}
for (const fn of ["bank_touch", "bank_dashboard_json"]) {
  assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`));
}
// The action functions must never trust a client-supplied player id.
assert.doesNotMatch(sql, /function public\.bank_(deposit|withdraw|borrow|repay)\(p_player_id/);
assert.equal((sql.match(/auth\.uid\(\)/g) || []).length >= actions.length, true, "each action resolves the player from auth.uid()");
assert.equal((sql.match(/set search_path = ''/g) || []).length >= 6, true, "definer functions must lock search_path");

// ── Economy is server-enforced ────────────────────────────────────────
// Savings 0.012%/day compounding.
assert.match(sql, /power\(1 \+ 0\.00012, v_days\)/);
// Loan APR 24%->6% by credit, borrow limit base + 2x savings collateral.
assert.match(sql, /0\.24 - public\.bank_credit_factor\(p_score\) \* 0\.18/);
assert.match(sql, /100000 \+ public\.bank_credit_factor\(p_score\) \* 9900000 \+ 2 \* greatest\(0, p_balance\)/);
// 7-day term on a fresh draw; overdue = 2% late fee + credit penalty.
assert.match(sql, /now\(\) \+ interval '7 days'/);
assert.match(sql, /v_late_fee := v_acct\.loan_principal \* 0\.02/);
assert.match(sql, /credit_score = greatest\(300, credit_score - 40\)/);
// Wallet debits are guarded so money can never go negative or be conjured.
assert.match(sql, /update public\.players set money = money - v_amount\s*\n\s*where id = v_uid and money >= v_amount/);
assert.match(sql, /where player_id = v_uid and balance >= v_amount/);
assert.match(sql, /if v_amount > v_available then raise exception 'bank_over_limit'/);
// Repayment clears interest before principal, credit stays clamped to 850.
assert.match(sql, /v_to_interest := least\(v_pay, v_acct\.loan_interest_accrued\)/);
assert.match(sql, /credit_score = least\(850, credit_score \+ v_credit_gain\)/);

// ── Default handling: offset, bankruptcy, borrow blocks ───────────────
// New account columns for the bankruptcy lockout.
assert.match(sql, /bankruptcies integer not null default 0/);
assert.match(sql, /borrow_frozen_until timestamptz/);
// Right of offset: overdue seizes savings toward the debt before penalties.
assert.match(sql, /v_seize := least\(v_acct\.balance, v_owed\)/);
assert.match(sql, /kind[\s\S]*'seizure'/);
// Borrowing is blocked while frozen (post-bankruptcy) or in default.
assert.match(sql, /raise exception 'bank_borrow_frozen'/);
assert.match(sql, /raise exception 'bank_in_default'/);
// Bankruptcy discharges the debt, resets credit to 300, freezes borrowing.
assert.match(sql, /create or replace function public\.bank_declare_bankruptcy\(\)/);
assert.match(sql, /grant execute on function public\.bank_declare_bankruptcy\(\) to authenticated/);
assert.match(sql, /raise exception 'bank_not_in_default'/);
assert.match(sql, /credit_score = 300,[\s\S]*borrow_frozen_until = now\(\) \+ interval '14 days'/);
// Dashboard surfaces the default/frozen state and zeroes available credit.
assert.match(sql, /'in_default', v_in_default/);
assert.match(sql, /when v_frozen or v_in_default then 0/);

// ── Feature flag ships OFF ────────────────────────────────────────────
assert.match(sql, /insert into public\.game_section_settings[\s\S]*'bank'[\s\S]*false, 320/);

// ── Client wrapper maps to the RPCs ───────────────────────────────────
assert.match(client, /loadBankDashboard = \(\) => rpc\("bank_get_dashboard"\)/);
assert.match(client, /bankDeposit = \(amount\) => rpc\("bank_deposit", \{ p_amount: amount \}\)/);
assert.match(client, /bankWithdraw = \(amount\) => rpc\("bank_withdraw", \{ p_amount: amount \}\)/);
assert.match(client, /bankBorrow = \(amount\) => rpc\("bank_borrow", \{ p_amount: amount \}\)/);
assert.match(client, /bankRepay = \(amount\) => rpc\("bank_repay", \{ p_amount: amount \}\)/);
assert.match(client, /bankDeclareBankruptcy = \(\) => rpc\("bank_declare_bankruptcy"\)/);

// ── Page wiring ───────────────────────────────────────────────────────
for (const action of ["deposit", "withdraw", "borrow", "repay"]) {
  assert.match(page, new RegExp(`data-action="${action}"`), `page must expose the ${action} control`);
}
// Borrowing and repaying confirm the terms first (real-bank interaction).
assert.match(page, /title: "Take out a loan\?"/);
assert.match(page, /title: "Repay your loan\?"/);
// Bankruptcy is offered (with confirmation) only when the loan is in default.
assert.match(page, /data-action="bankruptcy"/);
assert.match(page, /title: "Declare bankruptcy\?"/);
assert.match(page, /data\.in_default \? `<button/);
assert.equal((page.match(/await confirmDialog\(/g) || []).length, 3, "borrow, repay and bankruptcy must each confirm");
assert.match(html, /<link rel="stylesheet" href="\.\/bank\.css">/);
assert.match(html, /id="savings"[\s\S]*id="credit"[\s\S]*id="loan"[\s\S]*id="ledger"/);

// ── Nav gating ────────────────────────────────────────────────────────
assert.match(shell, /id: "bank", label: "Bank",[^\n]*sectionId: "bank"/);

// ── CSS is themed + reduced-motion safe ───────────────────────────────
assert.match(css, /\.bank-grid\b/);
assert.match(css, /\.credit-meter\s*>\s*i/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

// ── Total bank money graph series ─────────────────────────────────────
// A new migration (never editing the applied one) extends the economy
// snapshot with a bank-deposits total rather than adding a second cron.
assert.match(history, /alter table public\.global_cash_history\s*\n\s*add column if not exists bank double precision/);
assert.match(history, /coalesce\(\(select sum\(balance\) from public\.bank_accounts\), 0\)/);
assert.match(history, /select at, lifetime, money, bank/);
// The Cash Market graph gets a third metric tab wired to that series.
assert.match(graph, /METRIC_LABELS = \{[^}]*bank: "Bank deposits"/);
assert.match(graph, /bank: Number\(r\.bank\) \|\| 0/);
assert.match(graphHtml, /data-metric="bank"/);

console.log("bank-system-v1-test passed");
