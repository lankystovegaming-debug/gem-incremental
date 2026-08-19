import { supabase } from "./supabase.js";

const MESSAGES = {
  insufficient_funds: "You cannot afford that expedition.",
  expedition_already_active: "Finish or abandon your active expedition first.",
  expedition_limit_reached: "You have used every entry for this reset period.",
  daily_void_used: "You have already used today's Void entry.",
  expedition_entry_closed: "Entries are closed because the reset is too close.",
  reroll_limit_reached: "You have no quest rerolls remaining.",
  quest_not_rerollable: "That quest cannot be rerolled.",
  no_alternative_quest: "There is no fair alternative for that quest.",
  expedition_not_active: "That expedition is no longer active.",
  invalid_reward_choice: "Choose one of the available guaranteed reward packages."
};

function normalise(error) {
  if (!error) return null;
  const code = Object.keys(MESSAGES).find((value) => error.message?.includes(value)) ?? error.code;
  return { code, message: MESSAGES[code] ?? "The expedition request could not be completed." };
}

export async function loadExpeditionDashboard() {
  const { data, error } = await supabase.rpc("get_expedition_dashboard_v2");
  return { data, error: normalise(error) };
}

export async function enterExpedition(cadence, difficulty, rewardChoice) {
  const { data, error } = await supabase.rpc("enter_expedition_v2", { p_cadence: cadence, p_difficulty: difficulty, p_reward_choice: rewardChoice });
  return { data, error: normalise(error) };
}

export async function abandonExpedition(id) {
  const { error } = await supabase.rpc("abandon_expedition", { p_expedition_id: id });
  return { error: normalise(error) };
}

export async function rerollExpeditionQuest(id) {
  const { data, error } = await supabase.rpc("reroll_expedition_quest", { p_quest_id: id });
  return { data, error: normalise(error) };
}
