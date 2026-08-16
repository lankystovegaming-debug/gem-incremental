import {
  supabase
} from "./supabase.js";
import { loadActiveAdminEvent } from "./cloudAdminEvents.js";


// =========================================================
// LOAD CLOUD DEBUG STATE
// =========================================================

export async function loadCloudDebugState() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  if (authError || !user) {
    console.error("Failed to identify current player for debug state:", authError);
    return null;
  }

  // -------------------------------------------------------
  // PLAYER
  // -------------------------------------------------------

  const {
    data: playerRow,
    error: playerError
  } =
    await supabase
      .from("players")
      .select(`
        money,
        inventory_capacity,
        next_roll_at,
        total_rolls,
        rarest_gem_name,
        rarest_gem_rarity
      `)
      .eq("id", user.id)
      .maybeSingle();


  if (playerError) {
    console.error(
      "Failed to load cloud player debug state:",
      playerError
    );

    return null;
  }


  // A player who has only just signed in has no row yet; that
  // is the starting state, not a failure.
  const player =
    playerRow ?? {
      money: 0,
      inventory_capacity: 15,
      next_roll_at: null,
      total_rolls: 0,
      rarest_gem_name: null,
      rarest_gem_rarity: null
    };


  // -------------------------------------------------------
  // INVENTORY COUNT
  // -------------------------------------------------------

  const {
    count: gemCount,
    error: gemError
  } =
    await supabase
      .from(
        "inventory_gems"
      )
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      );


  if (gemError) {
    console.error(
      "Failed to load cloud gem count:",
      gemError
    );

    return null;
  }


  // -------------------------------------------------------
  // EQUIPMENT
  // -------------------------------------------------------

  const {
    data: equipment,
    error: equipmentError
  } =
    await supabase
      .from(
        "player_equipment"
      )
      .select(`
        equipment_id,
        equipped,
        luck_bonus,
        roll_speed_bonus,
        weight_luck_bonus,
        weight_multiplier_bonus
      `);


  if (equipmentError) {
    console.error(
      "Failed to load cloud equipment debug state:",
      equipmentError
    );

    return null;
  }


  // -------------------------------------------------------
  // ACTIVE BOOSTS
  // -------------------------------------------------------

  const {
    data: boosts,
    error: boostsError
  } =
    await supabase
      .from(
        "player_boosts"
      )
      .select(
        "family, effect_value"
      )
      .gt(
        "expires_at",
        new Date().toISOString()
      );


  if (boostsError) {
    console.error(
      "Failed to load active boosts:",
      boostsError
    );

    return null;
  }


  // -------------------------------------------------------
  // PENDING ONE-ROLL BOOST + GLOBAL ADMIN EVENT
  // -------------------------------------------------------

  const [oneRollResult, adminEventResult] = await Promise.all([
    supabase
      .from("player_one_roll_boosts")
      .select("effect_value")
      .eq("player_id", user.id)
      .maybeSingle(),
    loadActiveAdminEvent()
  ]);

  if (oneRollResult.error) {
    console.error("Failed to load pending one-roll boost:", oneRollResult.error);
  }

  const oneRollBoost = oneRollResult.data ?? null;
  const activeAdminEvent = Array.isArray(adminEventResult.data)
    ? adminEventResult.data[0] ?? null
    : adminEventResult.data ?? null;


  // -------------------------------------------------------
  // CRAFTING
  // -------------------------------------------------------

  const {
    data: crafting,
    error: craftingError
  } =
    await supabase
      .from(
        "player_crafting"
      )
      .select(
        "active_auto_craft"
      )
      .eq("player_id", user.id)
      .maybeSingle();


  if (craftingError) {
    console.error(
      "Failed to load cloud crafting debug state:",
      craftingError
    );

    return null;
  }

  // -------------------------------------------------------
  // CALCULATE STATS
  // -------------------------------------------------------

  let luck =
    1;

  let rollSpeed =
    1;

  let weightLuck =
    1;

  let weightMultiplier =
    1;


  for (
    const item
    of equipment ?? []
  ) {
    if (
      !item.equipped
    ) {
      continue;
    }


    luck +=
      Number(
        item.luck_bonus ??
        0
      );

    rollSpeed +=
      Number(
        item.roll_speed_bonus ??
        0
      );

    weightLuck +=
      Number(
        item.weight_luck_bonus ??
        0
      );

    weightMultiplier +=
      Number(
        item.weight_multiplier_bonus ??
        0
      );
  }


  for (
    const boost
    of boosts ??
    []
  ) {
    const effectValue =
      Number(
        boost.effect_value ??
        0
      );


    if (
      !Number.isFinite(
        effectValue
      ) ||
      effectValue <=
      0
    ) {
      continue;
    }


    switch (
      boost.family
    ) {
      case "luck":
        luck += effectValue;
        break;

      case "rollSpeed":
        rollSpeed += effectValue;
        break;

      case "weightLuck":
        weightLuck += effectValue;
        break;

      case "weightMultiplier":
        weightMultiplier += effectValue;
        break;
    }
  }


  if (oneRollBoost) {
    luck += Number(oneRollBoost.effect_value ?? 0);
  }


  if (activeAdminEvent) {
    luck =
      (luck + Number(activeAdminEvent.luck_bonus ?? 0)) *
      Number(activeAdminEvent.luck_multiplier ?? 1);

    rollSpeed =
      (rollSpeed + Number(activeAdminEvent.roll_speed_bonus ?? 0)) *
      Number(activeAdminEvent.roll_speed_multiplier ?? 1);

    weightLuck =
      (weightLuck + Number(activeAdminEvent.weight_luck_bonus ?? 0)) *
      Number(activeAdminEvent.weight_luck_multiplier ?? 1);

    weightMultiplier =
      (weightMultiplier + Number(activeAdminEvent.weight_multiplier_bonus ?? 0)) *
      Number(activeAdminEvent.weight_multiplier_multiplier ?? 1);
  }


  // -------------------------------------------------------
  // COOLDOWN
  // -------------------------------------------------------

  let cooldownRemaining =
    0;


  if (
    player.next_roll_at
  ) {
    const remainingMs =
      new Date(
        player.next_roll_at
      ).getTime() -
      Date.now();


    cooldownRemaining =
      Math.max(
        0,
        remainingMs /
        1000
      );
  }


  // -------------------------------------------------------
  // RETURN
  // -------------------------------------------------------

  return {
    stats: {
      luck,
      rollSpeed,
      weightLuck,
      weightMultiplier
    },


    player: {
      money:
        Number(
          player.money ??
          0
        ),

      gemCount:
        gemCount ??
        0,

      inventoryCapacity:
        Number(
          player.inventory_capacity ??
          15
        ),

      equipmentCount:
        equipment?.length ??
        0
    },


    crafting: {
      activeAutoCraftRecipeId:
        crafting
          ?.active_auto_craft ??
        null
    },


    rolling: {
      cooldownRemaining
    },


    lifetime: {
      totalRolls:
        Number(
          player.total_rolls ??
          0
        ),

      rarestGemName:
        player.rarest_gem_name ??
        null,

      rarestGemRarity:
        player.rarest_gem_rarity != null
          ? Number(
              player.rarest_gem_rarity
            )
          : null
    }
  };
}
