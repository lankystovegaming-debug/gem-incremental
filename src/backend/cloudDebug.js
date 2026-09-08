import { equipmentTotals, luckLayers, prepareEquipmentRoll } from '../../supabase/functions/roll/equipmentRules.js';
import { getEquipmentPassive } from '../data/equipmentPassives.js';
import {
  supabase
} from "./supabase.js";
import { loadActiveAdminEvent } from "./cloudAdminEvents.js";
import { ENCHANTS, enchantDescription } from "../data/enchants.js";
import { MASTERWORK_ATTUNEMENTS, MASTERWORK_PASSIVES } from "../data/masterwork.js";

const RESEARCH_MISC_BUFFS = [
  ["legendary_luck_multiplier", "Legendary gem Luck", "multiplier"],
  ["extreme_luck_multiplier", "Extreme gem Luck", "multiplier"],
  ["window_luck_multiplier", "Time-window gem Luck", "multiplier"],
  ["gem_value_multiplier", "Gem value", "multiplier"],
  ["mutation_chance_multiplier", "Mutation chance", "multiplier"],
  ["mutated_value_multiplier", "Mutated gem value", "multiplier"],
  ["compound_value_per_mutation", "Value per additional mutation", "percent"],
  ["potion_duration_multiplier", "Potion duration", "multiplier"],
  ["potion_strength_multiplier", "Potion strength", "multiplier"],
  ["potion_duplicate_chance", "Potion duplication chance", "percent"],
  ["masterwork_discount", "Masterwork discount", "percent"],
  ["masterwork_effect_multiplier", "Masterwork effect strength", "multiplier"],
  ["inventory_bonus", "Inventory capacity", "integer"],
  ["season_xp_multiplier", "Season XP", "multiplier"],
  ["expedition_discount", "Expedition funding discount", "percent"]
];


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
        equipment_state,
        rarity_resonance,
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
        mutation_chance_bonus,
        masterwork_level,
        masterwork_passive,
        masterwork_passive_rank,
        masterwork_attunement,
        enchant_id,
        enchant_grade,
        enchant_state
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
    miscModifiersResult,
    adminEventResult,
    equipmentPreviewResult
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
        legendary_luck_multiplier,
        extreme_luck_multiplier,
        window_luck_multiplier,
        roll_speed_multiplier,
        weight_luck_multiplier,
        gem_value_multiplier,
        mutation_chance_multiplier,
        mutated_value_multiplier,
        compound_value_per_mutation,
        potion_duration_multiplier,
        potion_strength_multiplier,
        potion_duplicate_chance,
        masterwork_discount,
        masterwork_effect_multiplier,
        inventory_bonus,
        season_xp_multiplier,
        expedition_discount,
        statistical_breakthrough
      `)
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_current_roll_stat_modifiers"),
    supabase.rpc("get_current_misc_buff_modifiers"),
    loadActiveAdminEvent(),
    supabase.rpc("get_equipment_roll_preview")
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

  if (miscModifiersResult.error) {
    console.error("Failed to load miscellaneous artifact buffs:", miscModifiersResult.error);
  }

  const oneRollBoost = oneRollResult.data ?? null;
  const researchEffects = researchEffectsResult.data ?? {};
  const permanentModifiers = permanentModifiersResult.data?.[0] ?? {};
  const miscModifiers = miscModifiersResult.data ?? {};
  const authoritativePreview=equipmentPreviewResult.data??{};
  const worldSnapshot=authoritativePreview.world;
  const worldConfig=worldSnapshot&&Date.parse(worldSnapshot.endsAt)>Date.now()&&Date.parse(worldSnapshot.startsAt)<=Date.now()?worldSnapshot.config??{}:{};
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


  const equippedItems=(equipment??[]).filter(item=>item.equipped);
  const pickaxe=equippedItems.find(item=>item.category==='pickaxe');
  const nextEquipment=prepareEquipmentRoll(pickaxe?.equipment_id??'',player.equipment_state??{},()=>1);
  const equipmentStats=equipmentTotals(equippedItems,(boosts??[]).some(b=>b.family==='relic'),nextEquipment.stats);
  luck=equipmentStats.luck;rollSpeed=equipmentStats.rollSpeed;weightLuck=equipmentStats.weightLuck;weightMultiplier=equipmentStats.weightMultiplier;
  for(const key of ['luck','rollSpeed','weightLuck','weightMultiplier']) statBreakdown[key]=[{label:'Equipment total',operation:'base',value:equipmentStats[key]}];
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

  // Keep the displayed values in the same order as the authoritative roll
  // service: research scales permanent gear first, then scales potion power.
  const researchLuckMultiplier = positiveNumber(researchEffects.luck_multiplier);
  const researchRollSpeedMultiplier = positiveNumber(researchEffects.roll_speed_multiplier);
  const researchWeightLuckMultiplier = positiveNumber(researchEffects.weight_luck_multiplier);
  // Research participates in the additive personal Luck layer.
  rollSpeed *= researchRollSpeedMultiplier;
  weightLuck *= researchWeightLuckMultiplier;

  recordMultiplier("rollSpeed", "Research", researchRollSpeedMultiplier);
  recordMultiplier("weightLuck", "Research", researchWeightLuckMultiplier);

  const crystalLuckBonus = Number(authoritativePreview.crystal?.luckBonus ?? miscModifiers.crystalLuckBonus ?? 0);
  const hellLuckBonus = Number(authoritativePreview.expedition?.luckBonus ?? miscModifiers.hellLuckBonus ?? 0);
  const crystalWeightLuckMultiplier = positiveNumber(authoritativePreview.crystal?.weightLuckMultiplier ?? miscModifiers.crystalWeightLuckMultiplier);
  const crystalWeightMultiplierMultiplier = positiveNumber(authoritativePreview.crystal?.weightMultiplierMultiplier ?? miscModifiers.crystalWeightMultiplierMultiplier);
  luck += crystalLuckBonus;
  luck += hellLuckBonus;
  weightLuck *= crystalWeightLuckMultiplier;
  weightMultiplier *= crystalWeightMultiplierMultiplier;
  recordAddition("luck", "Crystal artifacts", crystalLuckBonus);
  recordAddition("luck", "Hell artifacts", hellLuckBonus);
  recordMultiplier("weightLuck", "Crystal artifacts", crystalWeightLuckMultiplier);
  recordMultiplier("weightMultiplier", "Crystal artifacts", crystalWeightMultiplierMultiplier);

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

  // Guild bonuses affect ordinary Luck only, before special one-roll potions.
  const guildLuckMultiplier = positiveNumber(permanentModifiers.guild_luck_multiplier);
  const guildRollSpeedMultiplier = positiveNumber(permanentModifiers.guild_roll_speed_multiplier);
  const guildWeightLuckMultiplier = positiveNumber(permanentModifiers.guild_weight_luck_multiplier);
  const guildWeightMultiplier = positiveNumber(permanentModifiers.guild_weight_multiplier);
  // Guild participates in the additive personal Luck layer.
  rollSpeed *= guildRollSpeedMultiplier;
  weightLuck *= guildWeightLuckMultiplier;
  weightMultiplier *= guildWeightMultiplier;

  recordMultiplier("rollSpeed", "Guild upgrade", guildRollSpeedMultiplier);
  recordMultiplier("weightLuck", "Guild upgrade", guildWeightLuckMultiplier);
  recordMultiplier("weightMultiplier", "Guild upgrade", guildWeightMultiplier);


  const flatLuck=luck-equipmentStats.luck;
  const enchantState=pickaxe?.enchant_state??{};
  const ancient=pickaxe?.enchant_grade==='ancient';
  let enchantComponent=1;
  if(pickaxe?.enchant_id==='deep_strike'&&Number(enchantState.rolls??0)+1>=(ancient?5:7)) enchantComponent=ancient?1.5:1.35;
  if(pickaxe?.enchant_id==='fortune_surge'&&Number(enchantState.remaining??0)>0) enchantComponent=ancient?1.5:1.35;
  if(pickaxe?.enchant_id==='prospectors_instinct'&&Number(enchantState.remaining??0)>0) enchantComponent=ancient?1.6:1.4;
  if(pickaxe?.enchant_id==='vein_hunter') enchantComponent=1+Math.min(30,Math.max(0,Number(enchantState.misses??0)))/100;
  const sharedEnchants=new Set(['deep_strike','lucky_break','fortune_surge','collectors_edge']);
  const attune=pickaxe?.masterwork_attunement;
  const attunementFactor=attune==='amplified'?1.03:attune==='resonant'&&sharedEnchants.has(pickaxe?.enchant_id)?1.05:attune==='specialized'&&!sharedEnchants.has(pickaxe?.enchant_id)?1.05:1;
  enchantComponent=1+(enchantComponent-1)*(pickaxe?.equipment_id==='transcendent-pickaxe'?1.1:1)*attunementFactor;
  if(nextEquipment.flags.ascension) enchantComponent+=50;
  let specialMultiplier=positiveNumber(authoritativePreview.crystal?.finalLuckMultiplier);
  if(pickaxe?.equipment_id==='celestial-pickaxe'&&Number(player.rarity_resonance??0)>=100) specialMultiplier*=3;
  if(researchEffects.statistical_breakthrough&&((Number(player.total_rolls??0)+1)%250===0))specialMultiplier*=1.2;
  const previewLayers=luckLayers({pickaxe:equipmentStats.pickaxe,clover:equipmentStats.clover,enchant:enchantComponent,guild:guildLuckMultiplier,research:researchLuckMultiplier,flat:flatLuck,special:specialMultiplier,oneRoll:Number(oneRollBoost?.effect_value??0),world:positiveNumber(worldConfig.luckMultiplier)});
  luck=previewLayers.final;
  statBreakdown.luck=[
    {label:'Pickaxe × Clover',operation:'base',value:previewLayers.base},
    {label:'Personal: additive enchant + guild + research + focused bonuses',operation:'multiply',value:previewLayers.personal},
    {label:'Museum + artifacts + timed potion',operation:'add',value:previewLayers.flat},
    {label:'Special mechanics',operation:'multiply',value:previewLayers.special},
    {label:'One-roll potion',operation:'add',value:previewLayers.oneRoll},
    {label:'World event (base phase)',operation:'multiply',value:previewLayers.world}
  ];

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

  // Non-core effects are kept separate from the four headline roll stats.
  // Only active values are returned, so the card stays useful rather than
  // becoming a list of neutral 1.00x modifiers.
  const miscBuffs = [];
  const addMiscBuff = (category, label, value, description = "", operation = null, amount = null) => {
    miscBuffs.push({ category, label, value, description, operation, amount });
  };
  const formatMultiplier = (value) => `${Number(value).toFixed(2)}×`;
  const formatPercent = (value) => `${(Number(value) * 100).toFixed(0)}%`;

  for (const [key, label, format] of RESEARCH_MISC_BUFFS) {
    const value = Number(researchEffects[key] ?? (format === "multiplier" ? 1 : 0));
    const active = format === "multiplier" ? value > 1.000001 : value > 0.000001;
    if (!Number.isFinite(value) || !active) continue;
    addMiscBuff(
      "Research",
      label,
      format === "multiplier"
        ? formatMultiplier(value)
        : format === "integer"
          ? `+${Math.trunc(value)}`
          : formatPercent(value),
      "",
      format === "multiplier" ? "multiply" : null,
      format === "multiplier" ? value : null
    );
  }

  if (researchEffects.statistical_breakthrough === true) {
    addMiscBuff("Research", "Statistical Breakthrough", "1.20× Luck", "Applies every 250th roll.");
  }

  for (const item of equipment ?? []) {
    if (!item.equipped) continue;
    const itemName = equipmentLabel(item);
    const intrinsic = getEquipmentPassive(item.equipment_id)?.description;
    if (intrinsic) addMiscBuff("Equipment", itemName, "Active", intrinsic);

    const passive = (item.category === "pickaxe" || item.equipment_id === "plastic-shopping-bag") ? MASTERWORK_PASSIVES[item.category]?.[item.masterwork_passive] : null;
    if (passive) {
      const rank = Number(item.masterwork_passive_rank ?? 0) >= 2 ? "Rank II" : "Rank I";
      addMiscBuff("Masterwork", passive.name, rank, passive.description);
    }

    const attunement = MASTERWORK_ATTUNEMENTS[item.masterwork_attunement];
    if (attunement) addMiscBuff("Attunement", attunement.name, "Active", attunement.description);

    const enchant = ENCHANTS[item.enchant_id];
    if (enchant) {
      const grade = item.enchant_grade === "ancient" ? "Ancient" : "Normal";
      addMiscBuff("Enchant", enchant.name, grade, enchantDescription(item.enchant_id, item.enchant_grade));
    }
  }

  const artifactBuffs = [
    ["normalMutationChanceMultiplier", "Mutation chance", "Abandoned Mine artifacts"],
    ["normalGemValueMultiplier", "Gem value", "Abandoned Mine artifacts"],
    ["crystalArtifactChanceMultiplier", "Crystal artifact chance", "Crystal artifacts"],
    ["crystalGemValueMultiplier", "Gem value", "Crystal artifacts"],
    ["crystalMutationChanceMultiplier", "Mutation chance", "Crystal artifacts"],
    ["crystalProgressMultiplier", "Crystal Caverns progress", "Crystal artifacts"],
    ["crystalHeavyGemValueMultiplier", "Heavy gem value", "Crystal artifacts"],
    ["hellProgressMultiplier", "Hell expedition progress", "Hell artifacts"],
    ["hellMutationChanceMultiplier", "Mutation chance", "Hell artifacts"],
    ["hellArtifactChanceMultiplier", "Hell artifact chance", "Hell artifacts"],
    ["hellGemValueMultiplier", "Gem value", "Hell artifacts"]
  ];
  for (const [key, label, category] of artifactBuffs) {
    const value = Number(miscModifiers[key] ?? 1);
    if (Number.isFinite(value) && value > 1.000001) {
      addMiscBuff(category, label, formatMultiplier(value), "", "multiply", value);
    }
  }
  const doomMultiplier = Number(miscModifiers.hellDoomGainMultiplier ?? 1);
  if (Number.isFinite(doomMultiplier) && doomMultiplier < 0.999999) {
    addMiscBuff("Hell artifacts", "Doom gained", formatMultiplier(doomMultiplier));
  }

  rollSpeed*=positiveNumber(worldConfig.rollSpeedMultiplier)*positiveNumber(authoritativePreview.expedition?.rollSpeedMultiplier);
  weightLuck*=positiveNumber(authoritativePreview.expedition?.weightLuckMultiplier)*positiveNumber(worldConfig.weightLuckMultiplier);
  weightMultiplier*=positiveNumber(authoritativePreview.expedition?.weightMultiplierMultiplier);
  const adminMutationBonus = Number(activeAdminEvent?.mutation_luck_bonus ?? 0);
  const adminMutationMultiplier = Number(activeAdminEvent?.mutation_luck_multiplier ?? 1);
  if (adminMutationBonus > 0) {
    addMiscBuff("Admin Event", "Mutation chance", `+${adminMutationBonus.toFixed(2)}×`, "", "add", adminMutationBonus);
  }
  if (adminMutationMultiplier > 1.000001) {
    addMiscBuff("Admin Event", "Mutation chance", formatMultiplier(adminMutationMultiplier), "", "multiply", adminMutationMultiplier);
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

  const { data: savedPreferences, error: preferencesError } = await supabase
    .from('player_settings').select('settings').eq('player_id', user.id).maybeSingle();
  const buffsEnabled = savedPreferences?.settings?.enableBuffs !== false;

  return {
    stats: {
      buffsEnabled,
      luck: buffsEnabled ? luck : 1,
      rollSpeed: buffsEnabled ? rollSpeed : 1,
      weightLuck: buffsEnabled ? weightLuck : 1,
      weightMultiplier: buffsEnabled ? weightMultiplier : 1,
      breakdown: statBreakdown,
      luckLayers: previewLayers,
      mutationChance: equipmentStats.mutation,
      previewNote: preferencesError ? "Preferences unavailable; showing an unverified build preview." : !buffsEnabled ? "Buffs disabled — all four core stats are 1×. The build breakdown below is inactive." : "Preview; random enchant and world-event outcomes are determined by the server. Each roll returns its exact Luck layers.",
      miscellaneousBuffs: miscBuffs
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
