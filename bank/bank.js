import { mountShell } from "../src/ui/shell.js";
import { loadBankDashboard, bankDeposit, bankWithdraw, bankBorrow, bankRepay } from "../src/backend/cloudBank.js";
import { formatMoney, escapeHtml, formatRelativeTime } from "../src/ui/format.js";
import { confirmDialog } from "../src/ui/dialog.js";
import { notify } from "../src/ui/toast.js";

mountShell({ page: "bank", base: "../" });

const $ = (id) => document.getElementById(id);
const money = (value) => formatMoney(Number(value || 0));
const percent = (rate) => `${(Number(rate || 0) * 100).toFixed(2)}%`;
// The daily savings rate is tiny (0.012%), so it needs finer precision than APR.
const rateFine = (rate) => `${(Number(rate || 0) * 100).toFixed(3)}%`;
const round = (value) => Math.max(0, Math.floor(Number(value) || 0));

let data = null;
let busy = false;

const KIND_LABEL = {
  deposit: "Deposit", withdraw: "Withdrawal", borrow: "Loan drawn", repay: "Repayment",
  interest: "Savings interest", loan_interest: "Loan interest", penalty: "Late penalty"
};
// Money leaving the wallet toward the bank reads as negative for the player.
const KIND_SIGN = { deposit: -1, withdraw: 1, borrow: 1, repay: -1, interest: 1, loan_interest: 0, penalty: 0 };

function render() {
  if (!data) return;
  const owed = Number(data.loan_total || 0);
  $("status").innerHTML = `
    <div><span>Wallet</span><strong>${money(data.money)}</strong></div>
    <div><span>In savings</span><strong>${money(data.balance)}</strong></div>
    <div><span>Owed</span><strong class="${owed > 0 ? "bank-owed" : ""}">${money(owed)}</strong></div>
    <div><span>Credit</span><strong>${data.credit_score} · ${escapeHtml(data.credit_band)}</strong></div>`;

  $("savings").innerHTML = `
    <p class="bank-figure">${money(data.balance)}<small>current balance</small></p>
    <p class="bank-note">Earns <strong>${rateFine(data.savings_daily_rate)}</strong> per day, compounding — about <strong>${percent(data.savings_apy)}</strong> APY. Interest is credited whenever you visit.</p>
    <div class="bank-field">
      <label for="savingsAmount">Amount</label>
      <input id="savingsAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="0">
    </div>
    <div class="bank-actions">
      <button class="btn btn--primary" data-action="deposit" data-input="savingsAmount" ${busy ? "disabled" : ""}>Deposit</button>
      <button class="btn" data-action="withdraw" data-input="savingsAmount" ${busy ? "disabled" : ""}>Withdraw</button>
    </div>`;

  const creditPercent = Math.max(0, Math.min(100, (data.credit_score - 300) / 550 * 100));
  $("credit").innerHTML = `
    <p class="bank-figure">${data.credit_score}<small>${escapeHtml(data.credit_band)} · 300–850</small></p>
    <div class="credit-meter"><i style="width:${creditPercent}%"></i></div>
    <p class="bank-note">On-time repayments raise your score and unlock a larger, cheaper line of credit. Missing a due date charges a late fee and drops it.</p>
    <ul class="bank-stats">
      <li><span>On-time payoffs</span><strong>${data.on_time_repayments}</strong></li>
      <li><span>Missed payments</span><strong>${data.missed_marks}</strong></li>
      <li><span>Your loan APR</span><strong>${percent(data.loan_apr)}</strong></li>
    </ul>`;

  const due = data.loan_due_at
    ? `<strong>${new Date(data.loan_due_at).toLocaleDateString()}</strong> (${escapeHtml(formatRelativeTime(data.loan_due_at))})`
    : "—";
  $("loan").innerHTML = `
    <div class="bank-loan-grid">
      <div><span>Outstanding principal</span><strong>${money(data.loan_principal)}</strong></div>
      <div><span>Accrued interest</span><strong>${money(data.loan_interest)}</strong></div>
      <div><span>Total owed</span><strong class="${owed > 0 ? "bank-owed" : ""}">${money(owed)}</strong></div>
      <div><span>Payment due</span><strong>${due}</strong></div>
      <div><span>Borrow limit</span><strong>${money(data.borrow_limit)}</strong></div>
      <div><span>Available credit</span><strong>${money(data.available_credit)}</strong></div>
    </div>
    <p class="bank-note">Loans draw on a 7-day term at <strong>${percent(data.loan_apr)}</strong> APR. Interest is paid before principal; savings count as collateral toward your limit.</p>
    <div class="bank-field">
      <label for="loanAmount">Amount</label>
      <input id="loanAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="0">
    </div>
    <div class="bank-actions">
      <button class="btn btn--primary" data-action="borrow" data-input="loanAmount" ${busy ? "disabled" : ""}>Borrow</button>
      <button class="btn" data-action="repay" data-input="loanAmount" ${busy || owed <= 0 ? "disabled" : ""}>Repay</button>
    </div>`;

  const rows = data.transactions || [];
  $("ledger").innerHTML = rows.length
    ? `<ul class="bank-ledger">${rows.map(ledgerRow).join("")}</ul>`
    : `<p class="bank-note">No activity yet. Make your first deposit to start earning interest.</p>`;
}

function ledgerRow(row) {
  const sign = KIND_SIGN[row.kind] ?? 0;
  const cls = sign > 0 ? "is-in" : sign < 0 ? "is-out" : "is-neutral";
  const prefix = sign > 0 ? "+" : sign < 0 ? "−" : "";
  return `<li class="${cls}">
    <div><strong>${escapeHtml(KIND_LABEL[row.kind] || row.kind)}</strong><small>${escapeHtml(row.memo || "")}</small></div>
    <div class="bank-ledger__amount">${prefix}${money(row.amount)}<small>${escapeHtml(formatRelativeTime(row.created_at))}</small></div>
  </li>`;
}

function readAmount(inputId) {
  const input = $(inputId);
  return round(input?.value);
}

async function act(action, amount) {
  if (amount <= 0) {
    notify.error("Enter an amount", "Type a whole number greater than zero.");
    return;
  }

  if (action === "borrow") {
    if (amount > Number(data.available_credit || 0)) {
      notify.error("Over your limit", `You can borrow up to ${money(data.available_credit)} right now.`);
      return;
    }
    const ok = await confirmDialog({
      title: "Take out a loan?",
      body: `<p>Borrow <strong>${money(amount)}</strong> at <strong>${percent(data.loan_apr)}</strong> APR.</p>
             <p>Interest accrues daily and the balance is due within 7 days. Missing the due date charges a late fee and lowers your credit score.</p>`,
      confirmLabel: `Borrow ${money(amount)}`,
      defaultAction: "cancel",
      preventEnter: true
    });
    if (ok !== "confirm") return;
    return bankBorrow(amount);
  }

  if (action === "repay") {
    const pay = Math.min(amount, Number(data.loan_total || 0));
    const ok = await confirmDialog({
      title: "Repay your loan?",
      body: `<p>Pay <strong>${money(pay)}</strong> from your wallet toward the ${money(data.loan_total)} owed.</p>
             <p>Interest is cleared first, then principal. Paying it off on time boosts your credit score.</p>`,
      confirmLabel: `Repay ${money(pay)}`,
      defaultAction: "cancel",
      preventEnter: true
    });
    if (ok !== "confirm") return;
    return bankRepay(amount);
  }

  if (action === "deposit") return bankDeposit(amount);
  if (action === "withdraw") return bankWithdraw(amount);
}

async function refresh() {
  const { data: result, error } = await loadBankDashboard();
  if (error) {
    $("status").textContent = error.message;
    return;
  }
  data = result;
  render();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;
  const action = button.dataset.action;
  const amount = readAmount(button.dataset.input);
  busy = true;
  render();
  try {
    const outcome = await act(action, amount);
    if (outcome === undefined) return; // validation stopped or user cancelled
    if (outcome.error) {
      notify.error("Bank", outcome.error.message);
    } else {
      data = outcome.data;
      const done = { deposit: "Deposited", withdraw: "Withdrew", borrow: "Borrowed", repay: "Repaid" }[action];
      notify.success("Bank", `${done} ${money(amount)}`);
    }
  } finally {
    busy = false;
    await refresh();
  }
});

refresh();
