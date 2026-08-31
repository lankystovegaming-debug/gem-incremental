import { supabase } from "./supabase.js";


// The URL parameter and localStorage key used to carry a referral code from
// the shared link through to the first authenticated session.
export const REFERRAL_PARAM = "ref";
const PENDING_CODE_KEY = "gemIncremental.referral.pendingCode";


// Returns the caller's shareable referral code, minting one on first use.
export async function loadReferralCode() {
  const { data, error } = await supabase.rpc("get_or_create_referral_code");

  if (error) {
    console.error("Failed to load referral code:", error);
    return null;
  }

  return data ?? null;
}


// Full referrer dashboard: code, counts, and earnings.
export async function loadReferralSummary() {
  const { data, error } = await supabase.rpc("get_referral_summary");

  if (error) {
    console.error("Failed to load referral summary:", error);
    return null;
  }

  return data ?? null;
}


// Attribute the current account to the owner of `code`.
export async function claimReferral(code) {
  const { data, error } = await supabase.rpc("claim_referral", { p_code: code });

  if (!error) {
    return { data, error: null };
  }

  const knownCode = error.message?.match(
    /(referral_code_invalid|referral_self|referral_already_claimed|referral_not_eligible)/
  )?.[1];

  const messages = {
    referral_code_invalid: "That referral code is not valid.",
    referral_self: "You cannot use your own referral code.",
    referral_already_claimed: "This account has already used a referral code.",
    referral_not_eligible: "Referral codes can only be used on a brand-new account."
  };

  return {
    data: null,
    error: {
      code: knownCode ?? error.code,
      message: messages[knownCode] ?? "The referral code could not be applied."
    }
  };
}


// Pays out the caller's pending referral once the rolls milestone is met.
// Safe and cheap to call on any page load — it no-ops when nothing is pending.
export async function settleReferral() {
  const { data, error } = await supabase.rpc("settle_my_referral");

  if (error) {
    console.error("Failed to settle referral:", error);
    return null;
  }

  return data ?? null;
}


// Build the shareable link for a code against the current site origin.
export function buildReferralLink(code) {
  const origin =
    typeof location !== "undefined" && location.origin
      ? location.origin
      : "https://gemincremental.com";

  return `${origin}/?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;
}


// Remember a code that arrived on the URL, so it can be claimed once the
// anonymous session exists. Reads and clears via localStorage.
export function rememberPendingReferralCode(code) {
  const normalized = String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (normalized.length < 4) {
    return;
  }

  try {
    localStorage.setItem(PENDING_CODE_KEY, normalized);
  } catch (error) {
    // Private-mode or blocked storage — attribution just won't persist.
  }
}


export function readPendingReferralCode() {
  try {
    return localStorage.getItem(PENDING_CODE_KEY);
  } catch (error) {
    return null;
  }
}


export function clearPendingReferralCode() {
  try {
    localStorage.removeItem(PENDING_CODE_KEY);
  } catch (error) {
    // Nothing to clear.
  }
}
