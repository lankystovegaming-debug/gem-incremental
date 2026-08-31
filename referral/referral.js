import { ensurePlayerAuth } from "../src/backend/auth.js";
import {
  loadReferralSummary,
  claimReferral,
  buildReferralLink
} from "../src/backend/cloudReferral.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { formatMoney, formatCount } from "../src/ui/format.js";
import { notify } from "../src/ui/toast.js";

mountShell({ page: "referral", base: "../" });

const linkInput = document.getElementById("referralLinkInput");
const copyButton = document.getElementById("referralCopyButton");
const statsList = document.getElementById("referralStats");
const totalEl = document.getElementById("referralTotal");
const qualifiedEl = document.getElementById("referralQualified");
const pendingEl = document.getElementById("referralPending");
const earnedEl = document.getElementById("referralEarned");
const redeemBlock = document.getElementById("referralRedeem");
const redeemForm = document.getElementById("referralRedeemForm");
const codeInput = document.getElementById("referralCodeInput");
const redeemButton = document.getElementById("referralRedeemButton");
const statusEl = document.getElementById("referralReferredStatus");

document.getElementById("referralIcon").innerHTML = icons.users;

const user = await ensurePlayerAuth();

if (user) {
  await refreshSummary();
}

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

copyButton.addEventListener("click", async () => {
  const link = linkInput.value;
  if (!link) return;

  try {
    await navigator.clipboard.writeText(link);
  } catch (error) {
    // Fall back to selecting the field so the player can copy manually.
    linkInput.focus();
    linkInput.select();
  }

  copyButton.textContent = "Copied!";
  notify.success("Link copied", "Share it with a friend to earn rewards.");
  setTimeout(() => {
    copyButton.textContent = "Copy link";
  }, 1800);
});

redeemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;

  redeemButton.disabled = true;
  redeemButton.textContent = "Applying…";

  const { error } = await claimReferral(code);

  redeemButton.disabled = false;
  redeemButton.textContent = "Apply code";

  if (error) {
    notify.error("Code not applied", error.message);
    return;
  }

  notify.success("Code applied", "Reach 200 rolls before Sept 5 to unlock $250K + 5 Legendary Potions for you, and the reward for your friend.");
  codeInput.value = "";
  await refreshSummary();
});

async function refreshSummary() {
  const summary = await loadReferralSummary();

  if (!summary) {
    notify.error("Referral unavailable", "Could not load your referral details.");
    return;
  }

  linkInput.value = summary.code ? buildReferralLink(summary.code) : "";

  totalEl.textContent = formatCount(summary.total ?? 0);
  qualifiedEl.textContent = formatCount(summary.qualified ?? 0);
  pendingEl.textContent = formatCount(summary.pending ?? 0);
  earnedEl.textContent = formatMoney(summary.earned ?? 0);
  statsList.hidden = false;

  // Players who have already been referred cannot apply another code, so swap
  // the redeem form for a short status line instead.
  if (summary.referredStatus) {
    redeemBlock.hidden = true;
    statusEl.textContent =
      summary.referredStatus === "qualified"
        ? "You joined through a friend's code — reward delivered. Thanks for playing!"
        : "You joined through a friend's code. Reach 200 rolls before Sept 5 to unlock your $250K + 5 Legendary Potions.";
    statusEl.hidden = false;
  } else {
    redeemBlock.hidden = false;
    statusEl.hidden = true;
  }
}
