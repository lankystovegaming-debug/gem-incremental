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
  inventory_full: "Your inventory is full. Sell or craft something first.",
  gem_locked: "That gem is locked. Unlock it before selling.",
  relic_not_sellable: "Relics cannot be sold; use one to enchant a pickaxe.",
  not_found: "That item no longer exists.",
  not_enough_money: "You cannot afford that yet.",
  insufficient_funds: "You cannot afford that yet.",
  max_capacity: "Your inventory is already at maximum capacity.",
  requirements_not_met: "The requirements for that recipe are not complete.",
  already_owned: "You already own that equipment.",
  equipment_not_found: "That equipment no longer exists.",
  unequip_failed: "That equipment could not be unequipped.",
  equipment_update_failed: "That equipment could not be updated.",
  invalid_equipment: "Only an equipped pickaxe can be enchanted.",
  invalid_relic: "That unlocked relic is no longer available.",
  enchant_failed: "The pickaxe could not be enchanted.",
  upgrade_failed: "The storage upgrade could not be completed."
};


// supabase-js throws a FunctionsFetchError / FunctionsRelayError when the
// request never reaches the function (network blip, cold edge, a firewall
// dropping the connection). Those are transient, so retry them a couple of
// times with a short backoff. A real HTTP response (cooldown, inventory
// full, …) is a FunctionsHttpError and is NEVER retried — repeating it would
// be wrong. Retrying a roll is safe: the server cooldown de-dupes, so a
// retry of one that actually landed just gets a harmless cooldown reply.
function isTransient(error) {
  return (
    error?.name === "FunctionsFetchError" ||
    error?.name === "FunctionsRelayError" ||
    /failed to (send|fetch)|network|load failed/i.test(error?.message ?? "")
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function invokeFunction(name, body = {}, { retries = 2 } = {}) {
  let error = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await supabase.functions.invoke(name, { body });
    if (!result.error) {
      return { data: result.data, error: null };
    }

    error = result.error;

    if (!isTransient(error) || attempt === retries) {
      break;
    }
    // 300ms, then 600ms.
    await sleep(300 * (attempt + 1));
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
