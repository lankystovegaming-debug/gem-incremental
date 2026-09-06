import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { gemIconHtml } from "../src/ui/gemStyle.js";
import { number, odds, mutationNames, shareText, escapeHtml as esc } from "./format.js";
mountShell({
  page: location.pathname.includes("/minigames/gemdle") ? "minigames" : "gemdle",
  base: new URL("../", import.meta.url).pathname
});
const $ = id => document.getElementById(id);
let today = null, past = null, nextCursor = null, busy = false, historyBusy = false;
let resetAt = 0, serverOffset = 0, accountGeneration = 0, refreshAfter = 0;
const historyRows = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke("gemdle", { body: { action, ...extra } });
  if (error || data?.error) {
    let code = data?.error;
    if (!code && error?.context) { try { code = (await error.context.json()).error; } catch {} }
    throw new Error(code === "not_authenticated" ? "Sign in with your account to play Gemdle." :
      code === "banned" ? "Gemdle is unavailable while your account is suspended." :
      code === "player_profile_missing" ? "Your player profile isn't ready. Open Roll, then try again." :
      "Gemdle couldn't load. Try again; any saved result will be restored.");
  }
  return data;
}
function card(row) {
  const s = row.specimen;
  return `<div data-step><div class="specimen-art">${gemIconHtml(s.gem_name)}</div><div class="eyebrow">${esc(row.gemdle_date)} · Singapore</div><h2 class="specimen-name">${esc(s.gem_name)}</h2><p>Normal rarity · 1 in ${odds(s.normal_rarity)}</p></div>
    <div class="result-stat" data-step><small>Weight</small><strong>${number(s.final_weight)} g · ${number(s.weight_multiplier)}×</strong></div>
    <div class="result-stat" data-step><small>Mutations</small><strong>${esc(mutationNames(s))}</strong></div>
    <div data-step><div class="result-stat overall"><small>Overall Rarity</small><strong>1 in ${odds(s.overall_rarity)}</strong></div><div class="badges">${s.badges.map(b => `<span class="badge">${esc(b)}</span>`).join("")}</div>
    <details><summary>Rarity breakdown</summary><p>Gem ×${odds(s.contributions.gem)} · Weight ×${odds(s.contributions.weight)} · Mutations ×${odds(s.contributions.mutations)}</p></details></div>`;
}
async function showResult(row, animate, generation) {
  $("result").innerHTML = card(row);
  $("result").hidden = false;
  $("unrolled").hidden = true;
  $("roll").hidden = true;
  const steps = [...$("result").querySelectorAll("[data-step]")];
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    steps.forEach(step => step.hidden = true);
    for (const step of steps) {
      if (generation !== accountGeneration) return;
      step.hidden = false;
      step.classList.add("reveal-step");
      await pause(650);
    }
  }
  if (generation === accountGeneration) $("share").hidden = false;
}
function renderBoard(data) {
  const board = data.board;
  $("own-rank").textContent = data.leaderboard_hidden ? "Your leaderboard visibility is hidden." :
    board?.own_rank ? `Your position: #${board.own_rank} of ${board.participants}` :
    today ? "Your rank is currently unavailable." : "Roll today to join the leaderboard.";
  $("result-rank").textContent = $("own-rank").textContent;
  $("result-rank").hidden = !today;
  $("leaderboard").innerHTML = !board ? "Leaderboard temporarily unavailable. Your result is safe." :
    !board.entries.length ? "No discoveries yet today. Be the first." : board.entries.map(entry => {
      const s = entry.specimen;
      return `<div class="gemdle-row ${entry.is_you ? "is-you" : ""}"><span class="rank">#${entry.rank}</span><span class="row-main"><strong>${esc(entry.username)}${entry.is_you ? " (you)" : ""}</strong><small>${esc(s.gem_name)} · ${number(s.weight_multiplier)}× · ${esc(mutationNames(s))}</small></span><strong class="row-score">1 in ${odds(s.overall_rarity)}</strong></div>`;
    }).join("");
}
async function load(action = "state") {
  if (busy) return;
  busy = true;
  const generation = accountGeneration;
  $("roll").disabled = true; $("refresh").hidden = true; $("refresh-board").disabled = true;
  $("status").textContent = action === "roll" ? "Discovering your specimen…" : "Loading today's Gemdle…";
  try {
    const data = await api(action);
    if (generation !== accountGeneration) return;
    serverOffset = Date.parse(data.server_now) - Date.now(); resetAt = Date.parse(data.resets_at);
    today = data.result;
    if (today) await showResult(today, action === "roll" && data.created, generation);
    else { $("result").hidden = true; $("share").hidden = true; $("unrolled").hidden = false; $("roll").hidden = false; }
    if (generation !== accountGeneration) return;
    renderBoard(data);
    $("status").textContent = today ? "Today's discovery is saved. Come back tomorrow." : "Your daily discovery is ready.";
    if (action === "roll") await loadHistory(true);
  } catch (error) {
    if (generation !== accountGeneration) return;
    $("status").textContent = error.message; $("refresh").hidden = false;
  } finally {
    if (generation === accountGeneration) {
      busy = false; $("roll").disabled = false; $("roll").textContent = "Roll today's Gemdle"; $("refresh-board").disabled = false;
    }
  }
}
async function loadHistory(reset = false) {
  if (historyBusy) return;
  historyBusy = true; $("more").disabled = true;
  const generation = accountGeneration;
  try {
    const data = await api("history", reset ? {} : { before: nextCursor });
    if (generation !== accountGeneration) return;
    if (reset) historyRows.length = 0;
    historyRows.push(...data.history);
    nextCursor = data.next_cursor;
    $("history").innerHTML = historyRows.length ? historyRows.map((row, i) => `<button class="gemdle-row" data-history="${i}"><span class="row-main"><small>${esc(row.gemdle_date)}</small><strong>${esc(row.specimen.gem_name)}</strong><small>${number(row.specimen.final_weight)} g · ${number(row.specimen.weight_multiplier)}× · ${esc(mutationNames(row.specimen))}</small></span><span class="row-score">1 in ${odds(row.specimen.overall_rarity)}</span></button>`).join("") : "Your first discovery starts your collection.";
    $("more").hidden = !nextCursor;
  } catch (error) {
    if (generation === accountGeneration) { $("history").textContent = error.message; $("more").hidden = false; }
  } finally { if (generation === accountGeneration) { historyBusy = false; $("more").disabled = false; } }
}
async function share(row) {
  if (!row) return;
  const text = shareText(row);
  try { await navigator.clipboard.writeText(text); $("status").textContent = "Result copied. Ready to share."; }
  catch { $("past").close(); $("share-text").value = text; $("share-text").hidden = false; $("share-text").focus(); $("share-text").select(); }
}
$("roll").onclick = () => load("roll");
$("refresh").onclick = () => { load(); loadHistory(true); };
$("refresh-board").onclick = () => load();
$("more").onclick = () => loadHistory();
$("share").onclick = () => share(today);
$("share-past").onclick = () => share(past);
$("close-past").onclick = () => $("past").close();
$("history").onclick = event => {
  const button = event.target.closest("[data-history]");
  if (!button) return;
  past = historyRows[Number(button.dataset.history)];
  $("past-result").innerHTML = card(past); $("past").showModal();
};
setInterval(() => {
  if (!resetAt) return;
  const seconds = Math.max(0, Math.ceil((resetAt - Date.now() - serverOffset) / 1000));
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(v => String(v).padStart(2, "0")).join(":");
  $("countdown").textContent = `Resets in ${time} · Midnight Singapore`;
  if (!seconds && !busy && Date.now() > refreshAfter) { refreshAfter = Date.now() + 15000; load(); }
}, 1000);
let userId;
supabase.auth.onAuthStateChange((_event, session) => {
  const id = session?.user?.id ?? null;
  if (id === userId) return;
  userId = id; accountGeneration++; busy = false; historyBusy = false;
  today = null; past = null; nextCursor = null; historyRows.length = 0; resetAt = 0;
  $("past").close(); $("result").hidden = true; $("share").hidden = true; $("share-text").hidden = true;
  $("unrolled").hidden = false; $("roll").hidden = false;
  $("leaderboard").textContent = "Loading leaderboard…"; $("history").textContent = "Loading history…";
  $("own-rank").textContent = ""; $("result-rank").hidden = true;
  // Avoid making Auth calls synchronously inside the Auth callback.
  setTimeout(() => { load(); loadHistory(true); }, 0);
});
