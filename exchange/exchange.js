import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { notify } from "../src/ui/toast.js";
import { formatMoney } from "../src/ui/format.js";

// =========================================================
// EXCHANGE
//
// Buy shares of the whole economy. Price = total liquid player wealth
// (wallets + invested principal) / 1,000,000, computed server-side. Real
// market: it rises and falls with the economy, so holdings gain or lose. A 1%
// commission applies to each trade. All money movement happens in the
// buy_shares / sell_shares SECURITY DEFINER RPCs.
// =========================================================

const shell = mountShell({ page: "exchange", base: "../" });
const $ = (id) => document.getElementById(id);

const FEE = 0.01;
let market = null;   // { price, shares, invested, value, money, feePct }
let pollTimer = null;

function money(value) { return formatMoney(Number(value ?? 0)); }
function shares(value) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function render() {
  if (!market) return;
  const price = Number(market.price);
  $("sharePrice").textContent = money(price);
  $("playerCash").textContent = money(market.money);
  $("posShares").textContent = shares(market.shares);
  $("posValue").textContent = money(market.value);
  $("posInvested").textContent = money(market.invested);

  const abs = Number(market.value) - Number(market.invested);
  const pct = Number(market.invested) > 0 ? (abs / Number(market.invested)) * 100 : 0;
  const up = abs >= 0;
  const pnlEl = $("posPnl");
  pnlEl.textContent = Number(market.shares) > 0
    ? `${up ? "+" : "−"}${money(Math.abs(abs))}  (${up ? "+" : "−"}${Math.abs(pct).toFixed(2)}%)`
    : "—";
  pnlEl.classList.toggle("is-up", Number(market.shares) > 0 && up);
  pnlEl.classList.toggle("is-down", Number(market.shares) > 0 && !up);

  updateEstimates();
}

function updateEstimates() {
  if (!market) return;
  const price = Number(market.price);
  const amount = Number($("buyAmount").value);
  $("buyEst").textContent = amount > 0 ? `≈ ${shares(amount / (price * (1 + FEE)))} shares` : "";
  const sh = Number($("sellShares").value);
  $("sellEst").textContent = sh > 0 ? `≈ ${money(sh * price * (1 - FEE))}` : "";
}

function friendly(error) {
  const message = String(error?.message ?? "");
  if (message.includes("insufficient_funds")) return "You don't have that much cash.";
  if (message.includes("no_shares")) return "You have no shares to sell.";
  if (message.includes("invalid_amount")) return "Enter a valid amount.";
  if (message.includes("not_authenticated")) return "Sign in first.";
  return "Something went wrong. Try again.";
}

async function loadMarket() {
  const { data, error } = await supabase.rpc("get_share_market");
  if (error || !data) {
    $("exchangeStatus").textContent = "Sign in to trade shares of the economy.";
    console.error("get_share_market failed:", error);
    return;
  }
  market = data;
  shell.setWallet(Number(market.money));
  $("exchangeStatus").textContent = "";
  render();
}

$("buyBtn").addEventListener("click", async () => {
  const amount = Math.floor(Number($("buyAmount").value));
  if (!(amount > 0)) { notify.error("Enter an amount", "How much do you want to invest?"); return; }
  if (market && amount > Number(market.money)) { notify.error("Not enough cash", "You can't invest more than you have."); return; }
  $("buyBtn").disabled = true;
  const { data, error } = await supabase.rpc("buy_shares", { p_amount: amount });
  $("buyBtn").disabled = false;
  if (error || !data) { notify.error("Buy failed", friendly(error)); return; }
  market = data;
  shell.setWallet(Number(market.money));
  $("buyAmount").value = "";
  notify.success("Shares bought", `You now hold ${shares(market.shares)} shares.`);
  render();
});

$("buyMax").addEventListener("click", () => {
  if (!market) return;
  $("buyAmount").value = String(Math.floor(Number(market.money)));
  updateEstimates();
});

$("sellBtn").addEventListener("click", async () => {
  const sh = Number($("sellShares").value);
  if (!(sh > 0)) { notify.error("Enter shares", "How many shares do you want to sell?"); return; }
  $("sellBtn").disabled = true;
  const { data, error } = await supabase.rpc("sell_shares", { p_shares: sh });
  $("sellBtn").disabled = false;
  if (error || !data) { notify.error("Sell failed", friendly(error)); return; }
  market = data;
  shell.setWallet(Number(market.money));
  $("sellShares").value = "";
  notify.success("Shares sold", `Cash is now ${money(market.money)}.`);
  render();
});

$("sellAll").addEventListener("click", () => {
  if (!market) return;
  $("sellShares").value = String(market.shares);
  updateEstimates();
});

$("buyAmount").addEventListener("input", updateEstimates);
$("sellShares").addEventListener("input", updateEstimates);

async function boot() {
  await ensurePlayerAuth();
  await loadMarket();
  pollTimer = setInterval(loadMarket, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } else if (!pollTimer) {
      loadMarket();
      pollTimer = setInterval(loadMarket, 15000);
    }
  });
}

boot();
