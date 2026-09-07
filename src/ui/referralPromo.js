import { ensurePlayerAuth } from "../backend/auth.js";
import { icons } from "./icons.js";

// =========================================================
// REFERRAL PROMO POPUP
//
// While the limited-time referral promo is live, show a one-per-day popup
// on login/first visit telling players about the deal and linking them to
// the Invite Friends page. Purely informational; the rewards themselves are
// granted server-side (settle_my_referral). Auto-prompts at most once per
// device per day, and never after the promo closes.
// =========================================================

const SHOWN_KEY = "gemIncremental.referralPromoDate";
// Matches the server cutoff in settle_my_referral (end of Sept 13, 2026 UTC).
const PROMO_ENDS = Date.parse("2026-09-14T00:00:00Z");

function buildModal(base) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay daily-overlay";
  overlay.innerHTML = `
    <div class="dialog daily-modal" role="dialog" aria-modal="true" aria-labelledby="referralPromoTitle">
      <div class="daily-modal__spark">${icons.users || icons.gift || "🎉"}</div>
      <h2 class="dialog__title" id="referralPromoTitle">Invite friends — bonus ends Sept 13</h2>
      <p class="daily-modal__reward">Refer a friend and you <strong>both</strong> win, for a limited time:</p>
      <ul class="referral-promo__deals">
        <li>You get <strong>$2,000,000 + 10 Mythic Potions</strong> for every friend who joins and reaches 200 rolls.</li>
        <li>Your friend starts with <strong>$250,000 + 5 Legendary Potions</strong>.</li>
      </ul>
      <p class="daily-modal__streak">Offer ends <strong>Sept 13</strong>. Invite as many friends as you like.</p>
      <div class="dialog__actions daily-modal__actions">
        <button class="btn" data-action="later" type="button">Maybe later</button>
        <a class="btn btn--primary" href="${base}referral/" data-action="invite">Invite friends</a>
      </div>
    </div>`;

  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest('[data-action="later"]')) {
      close();
    }
    // The Invite button is a real link; let it navigate.
  });

  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
}

export async function mountReferralPromo(base = "./") {
  // Promo is over — never show it again.
  if (!Number.isNaN(PROMO_ENDS) && Date.now() >= PROMO_ENDS) return;

  const user = await ensurePlayerAuth().catch(() => null);
  if (!user) return;

  // At most once per device per day.
  let already = "";
  try { already = localStorage.getItem(SHOWN_KEY) || ""; } catch { already = ""; }
  const today = new Date().toISOString().slice(0, 10);
  if (already === today) return;

  try { localStorage.setItem(SHOWN_KEY, today); } catch { /* ignore */ }
  // Delay slightly so it doesn't collide with the daily-login modal.
  setTimeout(() => buildModal(base), 1600);
}
