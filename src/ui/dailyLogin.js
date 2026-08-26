import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { icons } from "./icons.js";

// =========================================================
// DAILY LOGIN STREAK
//
// Once per day, when the player can claim, a modal offers their streak reward.
// A rolling 7-day cycle escalates to a day-7 jackpot. State + granting is
// server-authoritative (get_login_streak / claim_daily_login); the client only
// shows it. We auto-prompt at most once per device per day.
// =========================================================

const SHOWN_KEY = "gemIncremental.loginPromptDate";

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function rewardText(list) {
  if (!Array.isArray(list) || !list.length) return "A daily reward";
  return list.map((r) => r.label || (r.type === "money" ? "Cash" : r.type)).join(" · ");
}

function dayTrack(nextDay) {
  const day = ((Number(nextDay || 1) - 1) % 7) + 1;
  let dots = "";
  for (let i = 1; i <= 7; i++) {
    const cls = i < day ? "is-done" : i === day ? "is-today" : "";
    dots += `<div class="daily-day ${cls}"><span>${i === 7 ? "★" : i}</span></div>`;
  }
  return `<div class="daily-track">${dots}</div>`;
}

function buildModal(state) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay daily-overlay";
  overlay.innerHTML = `
    <div class="dialog daily-modal" role="dialog" aria-modal="true" aria-labelledby="dailyTitle">
      <div class="daily-modal__spark">${icons.gift || icons.sparkle || "🎁"}</div>
      <h2 class="dialog__title" id="dailyTitle">Daily reward</h2>
      <p class="daily-modal__streak">Current streak: <strong>${Number(state.current || 0)} day${Number(state.current) === 1 ? "" : "s"}</strong></p>
      ${dayTrack(state.nextDay)}
      <p class="daily-modal__reward">Today: <strong>${esc(rewardText(state.todayReward))}</strong></p>
      <div class="dialog__actions daily-modal__actions">
        <button class="btn" data-action="later" type="button">Later</button>
        <button class="btn btn--primary" data-action="claim" type="button">Claim reward</button>
      </div>
      <p class="daily-modal__status" id="dailyStatus"></p>
    </div>`;

  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };

  overlay.addEventListener("click", async (event) => {
    if (event.target === overlay || event.target.closest('[data-action="later"]')) { close(); return; }
    if (event.target.closest('[data-action="claim"]')) {
      const btn = overlay.querySelector('[data-action="claim"]');
      btn.disabled = true;
      const { data, error } = await supabase.rpc("claim_daily_login");
      if (error) {
        overlay.querySelector("#dailyStatus").textContent =
          String(error.message).includes("already_claimed") ? "Already claimed today — see you tomorrow!" : "Couldn't claim. Try again.";
        setTimeout(close, 1400);
        return;
      }
      const granted = Array.isArray(data?.granted) ? data.granted : [];
      overlay.querySelector(".daily-modal__reward").innerHTML =
        `You received: <strong>${esc(rewardText(granted))}</strong>`;
      overlay.querySelector(".daily-modal__streak").innerHTML =
        `🔥 <strong>${Number(data?.streak || 0)}-day streak!</strong> Come back tomorrow to keep it going.`;
      overlay.querySelector(".daily-modal__actions").innerHTML =
        '<button class="btn btn--primary" data-action="later" type="button">Awesome</button>';
    }
  });

  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
}

export async function mountDailyLogin() {
  const user = await ensurePlayerAuth().catch(() => null);
  if (!user) return;

  // Auto-prompt at most once per device per day.
  let already = "";
  try { already = localStorage.getItem(SHOWN_KEY) || ""; } catch { already = ""; }
  const today = new Date().toISOString().slice(0, 10);
  if (already === today) return;

  const { data, error } = await supabase.rpc("get_login_streak");
  if (error || !data || !data.claimable) return;

  try { localStorage.setItem(SHOWN_KEY, today); } catch { /* ignore */ }
  setTimeout(() => buildModal(data), 900);
}
