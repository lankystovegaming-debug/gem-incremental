import { supabase } from "./supabase.js";
import { invokeFunction } from "./invoke.js";

const DEFAULT_PLAYER_STATE = {
  inventory_capacity: 15,
  money: 0,
  next_roll_at: null
};

const INVENTORY_PAGE_SIZE = 500;
const INVENTORY_GEM_COLUMNS = `
  id,
  serial_number,
  event_properties,
  gem_name,
  rarity,
  base_weight,
  value_per_gram,
  rolled_weight_multiplier,
  rolled_weight,
  final_weight,
  value,
  mutation_id,
  mutation_multiplier,
  mutation_ids,
  mutation_multipliers,
  roll_number,
  luck_at_roll,
  locked,
  created_at
`;


export async function loadCloudGems() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (sessionError || !user) {
    console.error("Failed to load current session:", sessionError);
    return null;
  }

  const gems = [];

  for (let offset = 0; ; offset += INVENTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventory_gems")
      .select(INVENTORY_GEM_COLUMNS)
      .eq("player_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + INVENTORY_PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load cloud gems:", error);
      return null;
    }

    const page = data ?? [];
    gems.push(...page);

    if (page.length < INVENTORY_PAGE_SIZE) {
      break;
    }
  }

  return gems;
}

// A player who has just signed in may not have a row yet, so a
// missing one is the starting state rather than a failure.
export async function loadCloudPlayerState() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (sessionError || !user) {
    console.error("Failed to load current session:", sessionError);
    return null;
  }

  let { data, error } = await supabase
    .from("players")
    .select(`
      inventory_capacity,
      money,
      total_rolls,
      best_rare_natural_weight_100k,
      best_rare_natural_weight_1m,
      next_roll_at
    `)
    .eq("id", user.id)
    .maybeSingle();

  // Keep mixed-version deployments usable while the database migration is
  // rolling out. Postgres 42703 means the new milestone columns do not exist
  // yet; older columns remain safe to read and the gates display as unmet.
  if (error?.code === "42703") {
    const legacyResult = await supabase
      .from("players")
      .select("inventory_capacity, money, total_rolls, next_roll_at")
      .eq("id", user.id)
      .maybeSingle();
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    console.error("Failed to load cloud player state:", error);
    return null;
  }

  // Ban status is kept in its own table (own-row read is allowed by RLS).
  const { data: ban } = await supabase
    .from("user_roll_luck_rarity_mult")
    .select("active_until, note")
    .eq("player_id", user.id)
    .maybeSingle();
  const ban_until = ban?.active_until ?? null;
  const ban_reason = ban?.note ?? null;

  if (!data) {
    return { ...DEFAULT_PLAYER_STATE, total_rolls: 0, ban_until, ban_reason };
  }

  return {
    inventory_capacity: Number(
      data.inventory_capacity ?? DEFAULT_PLAYER_STATE.inventory_capacity
    ),
    money: Number(data.money ?? 0),
    total_rolls: Number(data.total_rolls ?? 0),
    best_rare_natural_weight_100k: Number(data.best_rare_natural_weight_100k ?? 0),
    best_rare_natural_weight_1m: Number(data.best_rare_natural_weight_1m ?? 0),
    next_roll_at: data.next_roll_at ?? null,
    ban_until,
    ban_reason
  };
}


export function toggleCloudGemLock(specimenId) {
  return invokeFunction("toggle-gem-lock", { specimenId });
}


export function sellCloudGem(specimenId) {
  return invokeFunction("sell-gem", { specimenId });
}

export function deleteCloudGem(specimenId) {
  return invokeFunction("delete-gem", { specimenId });
}


export function upgradeCloudInventory() {
  return invokeFunction("upgrade-inventory", {});
}
