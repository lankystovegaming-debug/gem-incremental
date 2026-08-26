import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { notify } from "../src/ui/toast.js";
import { formatMoney, escapeHtml } from "../src/ui/format.js";

// =========================================================
// PLAYER WARS — challenge another player to out-gain them on a metric.
// All state changes go through SECURITY DEFINER RPCs (war_challenge /
// war_respond / war_cancel / get_my_wars); the client only displays.
// =========================================================

mountShell({ page: "wars", base: "../" });
const $ = (id) => document.getElementById(id);

const METRIC = {
  rolls:  { label: "Most rolls", unit: "rolls", fmt: (n) => Math.round(n).toLocaleString("en-US") },
  money:  { label: "Most money earned", unit: "", fmt: (n) => formatMoney(n) },
  rare:   { label: "Rare gems (score)", unit: "pts", fmt: (n) => Math.round(n).toLocaleString("en-US") },
  rarest: { label: "Rarest gem", unit: "", fmt: (n) => n > 0 ? "1 in " + Math.round(n).toLocaleString("en-US") : "—" },
  heavy:  { label: "Heaviest gem", unit: "g", fmt: (n) => Math.round(n).toLocaleString("en-US") + " g" }
};

let wars = [];
let pollTimer = null;

function friendly(err) {
  const m = String(err?.message ?? "");
  if (m.includes("opponent_not_found")) return "No player with that username.";
  if (m.includes("cannot_challenge_self")) return "You can't challenge yourself.";
  if (m.includes("war_already_active")) return "You already have a live war with that player.";
  if (m.includes("insufficient_funds")) return "You don't have enough money for that wager.";
  if (m.includes("not_your_challenge")) return "That challenge isn't yours to answer.";
  if (m.includes("not_pending")) return "That challenge was already answered.";
  if (m.includes("invalid_metric") || m.includes("invalid_duration")) return "Pick a valid metric and duration.";
  return "Something went wrong. Try again.";
}

function timeLeft(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "resolving…";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function scoreLine(w) {
  const f = METRIC[w.metric]?.fmt ?? ((n) => n);
  const meLead = Number(w.myScore) >= Number(w.theirScore);
  return `<div class="war-score">
    <div class="war-score__side ${meLead ? "is-lead" : ""}"><span>You</span><strong>${f(Number(w.myScore ?? 0))}</strong></div>
    <div class="war-score__vs">vs</div>
    <div class="war-score__side ${!meLead ? "is-lead" : ""}"><span>${escapeHtml(w.iAmChallenger ? w.opponent : w.challenger)}</span><strong>${f(Number(w.theirScore ?? 0))}</strong></div>
  </div>`;
}

function stakeTag(w) {
  return w.stake > 0
    ? `<span class="war-tag war-tag--wager">Wager ${formatMoney(w.stake)} · pot ${formatMoney(w.pot)}</span>`
    : `<span class="war-tag war-tag--friendly">Friendly</span>`;
}

function card(w, body) {
  const other = w.iAmChallenger ? w.opponent : w.challenger;
  return `<article class="war-card" data-id="${w.id}">
    <header class="war-card__head">
      <div><strong>vs ${escapeHtml(other)}</strong><span class="war-card__meta">${METRIC[w.metric]?.label ?? w.metric} · ${w.durationHours}h</span></div>
      ${stakeTag(w)}
    </header>
    ${body}
  </article>`;
}

function render() {
  const incoming = wars.filter((w) => w.status === "pending" && !w.iAmChallenger);
  const sent = wars.filter((w) => w.status === "pending" && w.iAmChallenger);
  const active = wars.filter((w) => w.status === "active");
  const history = wars.filter((w) => ["finished", "declined", "expired", "cancelled"].includes(w.status));

  $("incomingList").innerHTML = incoming.length ? incoming.map((w) => card(w,
    `<div class="war-card__actions"><button class="btn btn--primary" data-accept="${w.id}">Accept${w.stake > 0 ? ` (ante ${formatMoney(w.stake)})` : ""}</button><button class="btn" data-decline="${w.id}">Decline</button></div>`
  )).join("") : '<p class="wars-empty">No incoming challenges.</p>';

  $("activeList").innerHTML = active.length ? active.map((w) => card(w,
    `${scoreLine(w)}<p class="war-card__timer">${timeLeft(w.endsAt)}</p>`
  )).join("") : '<p class="wars-empty">No active wars. Start one above!</p>';

  $("sentList").innerHTML = sent.length ? sent.map((w) => card(w,
    `<div class="war-card__actions"><span class="war-pending">Waiting for ${escapeHtml(w.opponent)} to respond…</span><button class="btn" data-cancel="${w.id}">Cancel</button></div>`
  )).join("") : '<p class="wars-empty">No pending challenges sent.</p>';

  $("historyList").innerHTML = history.length ? history.map((w) => {
    let outcome;
    if (w.status === "finished") {
      outcome = w.winner
        ? `<span class="war-result ${w.winnerIsMe ? "is-win" : "is-loss"}">${w.winnerIsMe ? "You won" : escapeHtml(w.winner) + " won"}</span>`
        : `<span class="war-result is-tie">Tie</span>`;
    } else {
      outcome = `<span class="war-result is-tie">${w.status}</span>`;
    }
    const s = w.status === "finished" ? scoreLine(w) : "";
    return card(w, `${s}<p class="war-card__timer">${outcome}</p>`);
  }).join("") : '<p class="wars-empty">No finished wars yet.</p>';

  $("incomingCount").textContent = incoming.length;
  $("activeCount").textContent = active.length;
  $("sentCount").textContent = sent.length;
  $("historyCount").textContent = history.length;
}

async function load() {
  const { data, error } = await supabase.rpc("get_my_wars");
  if (error) {
    $("warsStatus").textContent = "Sign in to start player wars.";
    return;
  }
  wars = Array.isArray(data) ? data : [];
  $("warsStatus").textContent = "";
  render();
}

$("warChallengeBtn").addEventListener("click", async () => {
  const opponent = $("warOpponent").value.trim();
  const metric = $("warMetric").value;
  const duration = Number($("warDuration").value);
  const stake = Math.max(0, Math.floor(Number($("warStake").value) || 0));
  if (!opponent) { notify.error("Who?", "Enter an opponent's username."); return; }
  $("warChallengeBtn").disabled = true;
  const { error } = await supabase.rpc("war_challenge", { p_opponent: opponent, p_metric: metric, p_duration: duration, p_stake: stake });
  $("warChallengeBtn").disabled = false;
  if (error) { notify.error("Challenge failed", friendly(error)); return; }
  $("warOpponent").value = "";
  notify.success("Challenge sent", `${opponent} has been challenged.`);
  load();
});

$("warStake").addEventListener("input", () => {
  const stake = Math.max(0, Math.floor(Number($("warStake").value) || 0));
  $("warStakeNote").textContent = stake > 0
    ? `Wager: both players ante ${formatMoney(stake)}. Winner takes ${formatMoney(stake * 2 * 0.95)} (5% rake).`
    : "Friendly: winner gets a prize from the game. No money at risk.";
});

document.addEventListener("click", async (event) => {
  const accept = event.target.closest("[data-accept]");
  const decline = event.target.closest("[data-decline]");
  const cancel = event.target.closest("[data-cancel]");
  if (accept) {
    accept.disabled = true;
    const { error } = await supabase.rpc("war_respond", { p_war: accept.dataset.accept, p_accept: true });
    if (error) { notify.error("Couldn't accept", friendly(error)); accept.disabled = false; return; }
    notify.success("War on!", "The clock is running.");
    load();
  } else if (decline) {
    const { error } = await supabase.rpc("war_respond", { p_war: decline.dataset.decline, p_accept: false });
    if (error) { notify.error("Couldn't decline", friendly(error)); return; }
    load();
  } else if (cancel) {
    const { error } = await supabase.rpc("war_cancel", { p_war: cancel.dataset.cancel });
    if (error) { notify.error("Couldn't cancel", friendly(error)); return; }
    load();
  }
});

async function boot() {
  await ensurePlayerAuth();
  await load();
  pollTimer = setInterval(load, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
    else if (!pollTimer) { load(); pollTimer = setInterval(load, 15000); }
  });
}
boot();
