import { ensurePlayerAuth } from "../backend/auth.js";
import {
  REFERRAL_PARAM,
  claimReferral,
  settleReferral,
  rememberPendingReferralCode,
  readPendingReferralCode,
  clearPendingReferralCode
} from "../backend/cloudReferral.js";


// Pull a ?ref=CODE off the current URL, stash it, and tidy the address bar so
// the code is not re-shared or repeatedly re-read on refresh.
function captureCodeFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get(REFERRAL_PARAM);

    if (!code) {
      return;
    }

    rememberPendingReferralCode(code);

    params.delete(REFERRAL_PARAM);
    const query = params.toString();
    const cleanUrl = location.pathname + (query ? `?${query}` : "") + location.hash;
    history.replaceState(null, "", cleanUrl);
  } catch (error) {
    // A malformed URL just means no attribution this visit.
  }
}


// Capture any incoming referral code, attribute a fresh account to it, and
// pay out a pending referral once its milestone is met. Fire-and-forget: it
// never blocks page rendering and swallows the expected "not eligible / already
// claimed" outcomes silently.
export async function initReferral() {
  captureCodeFromUrl();

  const user = await ensurePlayerAuth();

  if (!user) {
    return;
  }

  const pendingCode = readPendingReferralCode();

  if (pendingCode) {
    const { error } = await claimReferral(pendingCode);

    // Whatever the outcome (claimed, self, already-referred, too old), the
    // code has served its purpose and should not be retried on every load.
    if (
      !error ||
      [
        "referral_self",
        "referral_already_claimed",
        "referral_not_eligible",
        "referral_code_invalid"
      ].includes(error.code)
    ) {
      clearPendingReferralCode();
    }
  }

  await settleReferral();
}
