import { supabase } from "./supabase.js";


// =========================================================
// EDGE FUNCTION CALLS
//
// supabase.functions.invoke() reports every non-2xx as the
// same opaque FunctionsHttpError, with the useful payload
// hidden behind an unread Response body. Everything goes
// through here so callers get a normalised
// { code, message } they can show the player.
// =========================================================


const FRIENDLY_MESSAGES = {
  cooldown: "That roll is still on cooldown.",
  roll_session_active: "This account is already rolling in another tab.",
  roll_session_required: "This tab is not the active rolling tab.",
  inventory_full: "Your inventory is full. Sell or craft something first.",
  gem_locked: "That gem is locked. Unlock it before selling.",
  not_found: "That item no longer exists.",
  not_enough_money: "You cannot afford that yet.",
  insufficient_funds: "You cannot afford that yet.",
  max_capacity: "Your inventory is already at maximum capacity.",
  requirements_not_met: "The requirements for that recipe are not complete.",
  already_owned: "You already own that equipment.",
  equipment_not_found: "That equipment no longer exists.",
  unequip_failed: "That equipment could not be unequipped.",
  equipment_update_failed: "That equipment could not be updated.",
  upgrade_failed: "The storage upgrade could not be completed."
};


export async function invokeFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (!error) {
    return { data, error: null };
  }

  const details = await readErrorBody(error);

  const code = details?.error ?? details?.code ?? null;

  const message =
    FRIENDLY_MESSAGES[code] ??
    details?.message ??
    (typeof code === "string" ? humanise(code) : null) ??
    "Something went wrong talking to the server.";

  console.error(`Edge function "${name}" failed:`, {
    code,
    details,
    error
  });

  return {
    data: null,
    error: { code, message, details }
  };
}


async function readErrorBody(error) {
  try {
    if (typeof error?.context?.json === "function") {
      return await error.context.json();
    }
  } catch {
    // Body was not JSON — fall through to the plain message.
  }

  return error?.message ? { message: error.message } : null;
}


// The functions mix machine codes ("inventory_full") with
// ready-made sentences ("Gem not found."). Only the codes need
// reshaping.
function humanise(code) {
  const trimmed = code.trim();

  if (!trimmed) {
    return null;
  }

  if (/\s/.test(trimmed)) {
    return trimmed;
  }

  const text = trimmed.replace(/[_-]+/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
