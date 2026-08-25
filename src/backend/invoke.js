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
  ,masterwork_failed: "The Forge could not complete that action."
  ,masterwork_tier_locked: "Only Tier 10 or higher equipment can be Masterworked."
  ,masterwork_maxed: "That equipment is already Perfected."
  ,not_enough_enchant_relics: "You do not have enough unlocked Enchant Relics."
  ,not_enough_ancient_relics: "You do not have enough unlocked Ancient Relics."
  ,username_required: "Enter the exact username of the player you want to invite."
  ,player_not_found: "No player with that username could be found."
  ,player_already_in_guild: "That player is already in a guild."
  ,management_only: "Only the guild Owner or an Officer can do that."
  ,owner_only: "Only the guild Owner can do that."
  ,invite_not_found: "That invitation is no longer pending. Refresh the guild page to see current invitations."
  ,already_in_guild: "You are already in a guild and cannot accept another invitation."
  ,guild_join_cooldown: "You must wait 24 hours after leaving or being removed from a guild before joining another."
  ,guild_full: "That guild is full. Its Owner must purchase another member slot first."
  ,guild_not_found: "That guild no longer exists."
  ,insufficient_guild_points: "Your guild does not have enough Guild Points for that upgrade."
  ,guild_level_required: "Your guild level is too low for that upgrade."
  ,max_upgrade: "That guild upgrade is already at its maximum tier."
  ,invalid_upgrade: "That guild upgrade is not valid."
  ,member_not_found: "That player is no longer a member of your guild."
  ,cannot_kick_role: "Officers can only remove ordinary Members."
  ,officer_limit: "This guild already has the maximum number of Officers."
  ,invalid_role_change: "That role change is not allowed."
  ,not_in_guild: "You are not currently in a guild."
  ,owner_cannot_leave: "The Owner must transfer ownership or disband the guild before leaving."
  ,guild_identity_taken: "That guild name or tag is already in use."
  ,invalid_name: "Guild names must contain 3–24 permitted characters."
  ,invalid_tag: "Guild tags must contain 2–5 letters or numbers."
  ,invalid_description: "Guild descriptions must contain 1–200 characters."
  ,invalid_join_mode: "That guild join setting is invalid."
  ,name_change_cooldown: "The guild name can only be changed once every seven days."
  ,tag_change_cooldown: "The guild tag can only be changed once every seven days."
  ,confirmation_mismatch: "The guild name confirmation did not match."
  ,insufficient_money: "You do not have enough money for that guild action."
  ,guild_point_purchase_limit: "Your guild has already made all five cash contributions for today."
  ,museum_closed: "The Gem Museum is currently closed."
  ,specimen_not_found: "That specimen is no longer in your inventory."
  ,specimen_already_exhibited: "That specimen is already on display."
  ,specimen_is_exhibited: "Remove that specimen from its exhibit before registering it."
  ,museum_slot_occupied: "That exhibit slot is already occupied."
  ,museum_slot_empty: "That exhibit slot is already empty."
  ,museum_capacity_maxed: "Your museum already has all ten exhibit slots."
  ,invalid_museum_slot: "That exhibit slot is not available."
  ,museum_action_failed: "The Museum could not complete that action."
  ,museum_load_failed: "The Museum could not load your collection."
  ,museum_specimen_protected: "Remove this specimen from its Museum exhibit before changing it."
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
