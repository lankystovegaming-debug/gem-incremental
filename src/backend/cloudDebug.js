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
        category,
        equipped,
        luck_bonus,
        roll_speed_bonus,
        weight_luck_bonus,
        weight_multiplier_bonus,
        masterwork_level,
        masterwork_passive,
        masterwork_passive_rank
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
  // PENDING ONE-ROLL BOOST + PERMANENT MODIFIERS + GLOBAL ADMIN EVENT
  // -------------------------------------------------------

  const [
    oneRollResult,
    researchEffectsResult,
    permanentModifiersResult,
    adminEventResult
  ] = await Promise.all([
    supabase
      .from("player_one_roll_boosts")
      .select("effect_value")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("player_research_effects")
      .select(`
        luck_multiplier,
        roll_speed_multiplier,
        weight_luck_multiplier,
        potion_strength_multiplier
      `)
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_current_roll_stat_modifiers"),
    loadActiveAdminEvent()
  ]);

  if (oneRollResult.error) {
    console.error("Failed to load pending one-roll boost:", oneRollResult.error);
  }

  if (researchEffectsResult.error) {
    console.error("Failed to load research effects for stats:", researchEffectsResult.error);
  }

  if (permanentModifiersResult.error) {
    console.error(
      "Failed to load guild and artifact modifiers for stats:",
      permanentModifiersResult.error
    );
  }

  const oneRollBoost = oneRollResult.data ?? null;
  const researchEffects = researchEffectsResult.data ?? {};
  const permanentModifiers = permanentModifiersResult.data?.[0] ?? {};
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

  const statBreakdown = {
    luck: [{ label: "Base", operation: "base", value: 1 }],
    rollSpeed: [{ label: "Base", operation: "base", value: 1 }],
    weightLuck: [{ label: "Base", operation: "base", value: 1 }],
    weightMultiplier: [{ label: "Base", operation: "base", value: 1 }]
  };

  const recordAddition = (stat, label, value) => {
    const amount = Number(value ?? 0);
    if (Number.isFinite(amount) && Math.abs(amount) > 0.000001) {
      statBreakdown[stat].push({ label, operation: "add", value: amount });
    }
  };

  const recordMultiplier = (stat, label, value) => {
    const multiplier = Number(value ?? 1);
    if (Number.isFinite(multiplier) && Math.abs(multiplier - 1) > 0.000001) {
      statBreakdown[stat].push({ label, operation: "multiply", value: multiplier });
    }
  };

  const equipmentLabel = (item) => String(item.equipment_id ?? item.category ?? "Equipment")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const positiveNumber = (value, fallback = 1) => {
    const number = Number(value ?? fallback);

    return Number.isFinite(number) && number > 0
      ? number
      : fallback;
  };


  for (
    const item
    of equipment ?? []
  ) {
    if (
      !item.equipped
    ) {
      continue;
    }


    const masterworkFactor = 1 + Math.min(5, Math.max(0, Number(item.masterwork_level ?? 0))) / 100;

    const itemLuck = Number(item.luck_bonus ?? 0) * masterworkFactor;
    const itemRollSpeed = Number(item.roll_speed_bonus ?? 0) * masterworkFactor;
    const itemWeightLuck = Number(item.weight_luck_bonus ?? 0) * masterworkFactor;
    const itemWeightMultiplier = Number(item.weight_multiplier_bonus ?? 0) * masterworkFactor;
    const label = equipmentLabel(item);

    luck +=
      itemLuck;

    rollSpeed +=
      itemRollSpeed;

    weightLuck +=
      itemWeightLuck;

    weightMultiplier +=
      itemWeightMultiplier;

    recordAddition("luck", label, itemLuck);
    recordAddition("rollSpeed", label, itemRollSpeed);
    recordAddition("weightLuck", label, itemWeightLuck);
    recordAddition("weightMultiplier", label, itemWeightMultiplier);
  }

  // Permanent Museum artifacts are applied in the same phase as equipment
  // before research, events, and guild multipliers.
  luck += Number(permanentModifiers.artifact_luck_bonus ?? 0);
  rollSpeed += Number(permanentModifiers.artifact_roll_speed_bonus ?? 0);
  weightLuck += Number(permanentModifiers.artifact_weight_luck_bonus ?? 0);
  weightMultiplier += Number(permanentModifiers.artifact_weight_multiplier_bonus ?? 0);

  recordAddition("luck", "Museum artifacts", permanentModifiers.artifact_luck_bonus);
  recordAddition("rollSpeed", "Museum artifacts", permanentModifiers.artifact_roll_speed_bonus);
  recordAddition("weightLuck", "Museum artifacts", permanentModifiers.artifact_weight_luck_bonus);
  recordAddition("weightMultiplier", "Museum artifacts", permanentModifiers.artifact_weight_multiplier_bonus);

  const equippedLantern = (equipment ?? []).find(item => item.equipped && item.category === "lantern");
  const lanternPassiveRank = Number(equippedLantern?.masterwork_passive_rank ?? 0);
  if (equippedLantern?.masterwork_passive === "focused_beam") {
    const focusedBeamMultiplier = lanternPassiveRank >= 2 ? 1.05 : 1.03;
    luck *= focusedBeamMultiplier;
    recordMultiplier("luck", "Focused Beam", focusedBeamMultiplier);
  }

  // Keep the displayed values in the same order as the authoritative roll
  // service: research scales permanent gear first, then scales potion power.
  const researchLuckMultiplier = positiveNumber(researchEffects.luck_multiplier);
  const researchRollSpeedMultiplier = positiveNumber(researchEffects.roll_speed_multiplier);
  const researchWeightLuckMultiplier = positiveNumber(researchEffects.weight_luck_multiplier);
  luck *= positiveNumber(researchEffects.luck_multiplier);
  rollSpeed *= researchRollSpeedMultiplier;
  weightLuck *= researchWeightLuckMultiplier;
  recordMultiplier("luck", "Research", researchLuckMultiplier);
  recordMultiplier("rollSpeed", "Research", researchRollSpeedMultiplier);
  recordMultiplier("weightLuck", "Research", researchWeightLuckMultiplier);

  const researchPotionStrength = positiveNumber(
    researchEffects.potion_strength_multiplier
  );


  for (
    const boost
    of boosts ??
    []
  ) {
    let effectValue =
      Number(
        boost.effect_value ??
        0
      ) * researchPotionStrength;

    if (boost.family === "rollSpeed" && equippedLantern?.masterwork_passive === "potion_afterglow") {
      effectValue *= lanternPassiveRank >= 2 ? 1.15 : 1.10;
    }


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
        recordAddition("luck", "Active potion", effectValue);
        break;

      case "rollSpeed":
        rollSpeed += effectValue;
        recordAddition("rollSpeed", "Active potion", effectValue);
        break;

      case "weightLuck":
        weightLuck += effectValue;
        recordAddition("weightLuck", "Active potion", effectValue);
        break;

      case "weightMultiplier":
        weightMultiplier += effectValue;
        recordAddition("weightMultiplier", "Active potion", effectValue);
        break;
    }
  }

  if (equippedLantern?.masterwork_passive === "overclocked_flame") {
    const overclockedMultiplier = lanternPassiveRank >= 2 ? 1.08 : 1.05;
    rollSpeed *= overclockedMultiplier;
    recordMultiplier("rollSpeed", "Overclocked Flame", overclockedMultiplier);
  }

  if (
    equippedLantern?.masterwork_passive === "flashpoint" &&
    (Number(player.total_rolls ?? 0) + 1) % 250 === 0
  ) {
    const flashpointMultiplier = lanternPassiveRank >= 2 ? 1.4 : 1.25;
    rollSpeed *= flashpointMultiplier;
    recordMultiplier("rollSpeed", "Flashpoint (next roll)", flashpointMultiplier);
  }

  const equippedBoots = (equipment ?? []).find(item => item.equipped && item.category === "boots");
  const bootsPassiveRank = Number(equippedBoots?.masterwork_passive_rank ?? 0);
  if (equippedBoots?.masterwork_passive === "fortune_walker") {
    const fortuneWalkerMultiplier = bootsPassiveRank >= 2 ? 1.08 : 1.05;
    weightLuck *= fortuneWalkerMultiplier;
    recordMultiplier("weightLuck", "Fortune Walker", fortuneWalkerMultiplier);
  }


  // Guild bonuses affect ordinary Luck only, before special one-roll potions.
  const guildLuckMultiplier = positiveNumber(permanentModifiers.guild_luck_multiplier);
  const guildRollSpeedMultiplier = positiveNumber(permanentModifiers.guild_roll_speed_multiplier);
  const guildWeightLuckMultiplier = positiveNumber(permanentModifiers.guild_weight_luck_multiplier);
  const guildWeightMultiplier = positiveNumber(permanentModifiers.guild_weight_multiplier);
  luck *= guildLuckMultiplier;
  rollSpeed *= guildRollSpeedMultiplier;
  weightLuck *= guildWeightLuckMultiplier;
  weightMultiplier *= guildWeightMultiplier;
  recordMultiplier("luck", "Guild upgrade", guildLuckMultiplier);
  recordMultiplier("rollSpeed", "Guild upgrade", guildRollSpeedMultiplier);
  recordMultiplier("weightLuck", "Guild upgrade", guildWeightLuckMultiplier);
  recordMultiplier("weightMultiplier", "Guild upgrade", guildWeightMultiplier);


  if (oneRollBoost) {
    const oneRollLuck = Number(oneRollBoost.effect_value ?? 0);
    luck += oneRollLuck;
    recordAddition("luck", "Special one-roll potion (after ordinary modifiers)", oneRollLuck);
  }


  if (activeAdminEvent) {
    const adminEventLabel = activeAdminEvent.name
      ? `Admin Event: ${activeAdminEvent.name}`
      : "Admin Event";
    const adminLuckBonus = Number(activeAdminEvent.luck_bonus ?? 0);
    const adminRollSpeedBonus = Number(activeAdminEvent.roll_speed_bonus ?? 0);
    const adminWeightLuckBonus = Number(activeAdminEvent.weight_luck_bonus ?? 0);
    const adminWeightMultiplierBonus = Number(activeAdminEvent.weight_multiplier_bonus ?? 0);
    const adminLuckMultiplier = Number(activeAdminEvent.luck_multiplier ?? 1);
    const adminRollSpeedMultiplier = Number(activeAdminEvent.roll_speed_multiplier ?? 1);
    const adminWeightLuckMultiplier = Number(activeAdminEvent.weight_luck_multiplier ?? 1);
    const adminWeightMultiplierMultiplier = Number(activeAdminEvent.weight_multiplier_multiplier ?? 1);

    luck =
      (luck + adminLuckBonus) *
      adminLuckMultiplier;

    rollSpeed =
      (rollSpeed + adminRollSpeedBonus) *
      adminRollSpeedMultiplier;

    weightLuck =
      (weightLuck + adminWeightLuckBonus) *
      adminWeightLuckMultiplier;

    weightMultiplier =
      (weightMultiplier + adminWeightMultiplierBonus) *
      adminWeightMultiplierMultiplier;

    recordAddition("luck", adminEventLabel, adminLuckBonus);
    recordMultiplier("luck", adminEventLabel, adminLuckMultiplier);
    recordAddition("rollSpeed", adminEventLabel, adminRollSpeedBonus);
    recordMultiplier("rollSpeed", adminEventLabel, adminRollSpeedMultiplier);
    recordAddition("weightLuck", adminEventLabel, adminWeightLuckBonus);
    recordMultiplier("weightLuck", adminEventLabel, adminWeightLuckMultiplier);
    recordAddition("weightMultiplier", adminEventLabel, adminWeightMultiplierBonus);
    recordMultiplier("weightMultiplier", adminEventLabel, adminWeightMultiplierMultiplier);
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
      weightMultiplier,
      breakdown: statBreakdown
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
