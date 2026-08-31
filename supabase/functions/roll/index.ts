import {
  withSupabase
} from "npm:@supabase/server";


// =========================================================
// PROGRESSION / ACHIEVEMENT ENGINE (INLINE FOR SUPABASE DASHBOARD DEPLOY)
// =========================================================

// Mutation denominators used by the roll system and progression requirements.
export const MUTATION_DENOMINATORS: Record<string, number> = {
  polished: 100,
  gilded: 500,
  prismatic: 2500,
  celestial: 10000,
  corrupted: 50000
};

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function processProgressEvent(
  supabaseAdmin: any,
  playerId: string,
  eventType: string,
  payload: Record<string, unknown>,
  rollNumber: number | null = null
) {
  const { data, error } = await supabaseAdmin.rpc(
    "process_private_feature_progress_event_incremental",
    {
      p_player_id: playerId,
      p_event_type: eventType,
      p_roll_number: rollNumber,
      p_payload: payload
    }
  );
  if (error) throw error;
  // AP is awarded by the completion trigger; item rewards remain claimable.
  return { completed: arr(data?.completed) };
}

async function grantRewards(supabaseAdmin: any, playerId: string, rewards: any[]) {
  for (const reward of arr(rewards)) {
    const amount = num(reward.amount, 0);
    if (reward.type === "money" && amount !== 0) {
      await supabaseAdmin.rpc("apply_private_feature_currency_reward", { p_player_id: playerId, p_money: amount, p_coins: 0, p_capacity: 0 });
      continue;
    }
    if (reward.type === "coins" && amount !== 0) {
      await supabaseAdmin.rpc("apply_private_feature_currency_reward", { p_player_id: playerId, p_money: 0, p_coins: Math.trunc(amount), p_capacity: 0 });
      continue;
    }
    if (reward.type === "capacity" && amount !== 0) {
      await supabaseAdmin.rpc("apply_private_feature_currency_reward", { p_player_id: playerId, p_money: 0, p_coins: 0, p_capacity: Math.trunc(amount) });
      continue;
    }
    if (reward.type === "potion" && reward.consumableId && amount > 0) {
      const { data: existingPotion } = await supabaseAdmin
        .from("player_consumables")
        .select("quantity")
        .eq("player_id", playerId)
        .eq("consumable_id", String(reward.consumableId))
        .maybeSingle();
      await supabaseAdmin.from("player_consumables").upsert({
        player_id: playerId,
        consumable_id: String(reward.consumableId),
        quantity: num(existingPotion?.quantity) + amount,
        updated_at: new Date().toISOString()
      }, { onConflict: "player_id,consumable_id" });
      continue;
    }
    if (reward.type === "gem" && reward.gemName) {
      await supabaseAdmin.from("inventory_gems").insert({
        player_id: playerId,
        gem_name: String(reward.gemName),
        rarity: num(reward.rarity),
        base_weight: num(reward.baseWeight),
        value_per_gram: num(reward.valuePerGram),
        rolled_weight_multiplier: num(reward.weightMultiplier, 1),
        rolled_weight: num(reward.baseWeight) * num(reward.weightMultiplier, 1),
        final_weight: num(reward.baseWeight) * num(reward.weightMultiplier, 1),
        mutation_id: arr(reward.mutationIds)[0] ?? null,
        mutation_ids: arr(reward.mutationIds),
        mutation_multiplier: num(reward.mutationMultiplier, 1),
        mutation_multipliers: reward.mutationMultipliers ?? {},
        mutation_chance_multiplier: 1,
        value: num(reward.value, 0),
        locked: false,
        luck_at_roll: 1
      });
    }
  }
}


// =========================================================
// CORS
// =========================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers ?? {})
    }
  });
}


// =========================================================
// GEM DATA
// =========================================================

let gems = [
  {
    name: "Quartz",
    rarity: 2,
    baseWeight: 100,
    valuePerGram: 0.0575
  },

  {
    name: "Calcite",
    rarity: 3,
    baseWeight: 110,
    valuePerGram: 0.0736
  },

  {
    name: "Feldspar",
    rarity: 5,
    baseWeight: 125,
    valuePerGram: 0.092
  },

  {
    name: "Fluorite",
    rarity: 8,
    baseWeight: 140,
    valuePerGram: 0.115
  },

  {
    name: "Hematite",
    rarity: 12,
    baseWeight: 160,
    valuePerGram: 0.13685
  },

  {
    name: "Obsidian",
    rarity: 18,
    baseWeight: 180,
    valuePerGram: 0.15985
  },

  {
    name: "Agate",
    rarity: 25,
    baseWeight: 200,
    valuePerGram: 0.184
  },

  {
    name: "Jasper",
    rarity: 35,
    baseWeight: 225,
    valuePerGram: 0.2093
  },

  {
    name: "Amethyst",
    rarity: 50,
    baseWeight: 250,
    valuePerGram: 0.253
  },

  {
    name: "Garnet",
    rarity: 70,
    baseWeight: 275,
    valuePerGram: 0.3013
  },

  {
    name: "Peridot",
    rarity: 100,
    baseWeight: 300,
    valuePerGram: 0.36455
  },

  {
    name: "Topaz",
    rarity: 150,
    baseWeight: 325,
    valuePerGram: 0.47725
  },

  {
    name: "Aquamarine",
    rarity: 225,
    baseWeight: 350,
    valuePerGram: 0.60835
  },

  {
    name: "Tourmaline",
    rarity: 325,
    baseWeight: 375,
    valuePerGram: 0.76705
  },

  {
    name: "Opal",
    rarity: 475,
    baseWeight: 400,
    valuePerGram: 1.035
  },

  {
    name: "Zircon",
    rarity: 650,
    baseWeight: 425,
    valuePerGram: 1.2719
  },

  {
    name: "Spinel",
    rarity: 850,
    baseWeight: 450,
    valuePerGram: 1.59735
  },

  {
    name: "Sapphire",
    rarity: 1100,
    baseWeight: 475,
    valuePerGram: 1.7487475
  },

  {
    name: "Ruby",
    rarity: 1400,
    baseWeight: 500,
    valuePerGram: 2.1505
  },

  {
    name: "Emerald",
    rarity: 1800,
    baseWeight: 525,
    valuePerGram: 2.6069925
  },

  {
    name: "Diamond",
    rarity: 2300,
    baseWeight: 550,
    valuePerGram: 3.28831
  },

  {
    name: "Tanzanite",
    rarity: 2900,
    baseWeight: 575,
    valuePerGram: 3.4847875
  },

  {
    name: "Alexandrite",
    rarity: 3600,
    baseWeight: 600,
    valuePerGram: 4.3176175
  },

  {
    name: "Benitoite",
    rarity: 4400,
    baseWeight: 625,
    valuePerGram: 4.692
  },

  {
    name: "Red Beryl",
    rarity: 5300,
    baseWeight: 650,
    valuePerGram: 5.413395
  },

  {
    name: "Black Opal",
    rarity: 6300,
    baseWeight: 675,
    valuePerGram: 6.226675
  },

  {
    name: "Grandidierite",
    rarity: 7400,
    baseWeight: 700,
    valuePerGram: 6.7027175
  },

  {
    name: "Taaffeite",
    rarity: 8500,
    baseWeight: 725,
    valuePerGram: 7.415315
  },

  {
    name: "Musgravite",
    rarity: 9300,
    baseWeight: 750,
    valuePerGram: 7.82
  },

  {
    name: "Painite",
    rarity: 10000,
    baseWeight: 800,
    valuePerGram: 7.5
  },

  {
    name: "Dark Matter",
    rarity: 1000000,
    baseWeight: 2500,
    valuePerGram: 160
  },

  {
    name: "Citrine",
    rarity: 90,
    baseWeight: 290,
    valuePerGram: 0.34
  },

  {
    name: "Moonstone",
    rarity: 750,
    baseWeight: 440,
    valuePerGram: 1.43
  },

  {
    name: "Demantoid",
    rarity: 6800,
    baseWeight: 690,
    valuePerGram: 6.46
  },

  {
    name: "Jeremejevite",
    rarity: 14000,
    baseWeight: 850,
    valuePerGram: 9
  },

  {
    name: "Poudretteite",
    rarity: 22000,
    baseWeight: 925,
    valuePerGram: 12
  },

  {
    name: "Serendibite",
    rarity: 35000,
    baseWeight: 1000,
    valuePerGram: 16.5
  },

  {
    name: "Blue Garnet",
    rarity: 55000,
    baseWeight: 1100,
    valuePerGram: 22.5
  },

  {
    name: "Kyawthuite",
    rarity: 85000,
    baseWeight: 1200,
    valuePerGram: 31.5
  },

  {
    name: "Aether Quartz",
    rarity: 140000,
    baseWeight: 1350,
    valuePerGram: 43.2
  },

  {
    name: "Void Opal",
    rarity: 250000,
    baseWeight: 1550,
    valuePerGram: 61.2
  },

  {
    name: "Chronite",
    rarity: 480000,
    baseWeight: 1800,
    valuePerGram: 90
  },

  {
    name: "Neutron Crystal",
    rarity: 800000,
    baseWeight: 2200,
    valuePerGram: 126
  },

  {
    name: "Antimatter Crystal",
    rarity: 1800000,
    baseWeight: 2900,
    valuePerGram: 216
  },

  {
    name: "Singularity Shard",
    rarity: 4000000,
    baseWeight: 3600,
    valuePerGram: 378
  },

  { name: "Pezzottaite", rarity: 12000, baseWeight: 825, valuePerGram: 8.5 },
  { name: "Clinohumite", rarity: 18000, baseWeight: 875, valuePerGram: 10 },
  { name: "Tsavorite", rarity: 28000, baseWeight: 960, valuePerGram: 14 },
  { name: "Paraíba Tourmaline", rarity: 45000, baseWeight: 1050, valuePerGram: 19 },
  { name: "Red Diamond", rarity: 70000, baseWeight: 1150, valuePerGram: 27 },
  { name: "Natural Moissanite", rarity: 110000, baseWeight: 1275, valuePerGram: 36 },
  { name: "Black Diamond", rarity: 190000, baseWeight: 1450, valuePerGram: 51 },
  { name: "Tugtupite", rarity: 350000, baseWeight: 1650, valuePerGram: 74 },
  { name: "Meteorite Peridot", rarity: 620000, baseWeight: 1950, valuePerGram: 105 },
  { name: "Ringwoodite", rarity: 900000, baseWeight: 2350, valuePerGram: 145 },
  { name: "Pallasite Crystal", rarity: 1300000, baseWeight: 2700, valuePerGram: 185 },
  { name: "Lunar Diamond", rarity: 2500000, baseWeight: 3100, valuePerGram: 270 },
  { name: "Martian Opal", rarity: 6000000, baseWeight: 4000, valuePerGram: 420 },
  { name: "Ja-ore", rarity: 6242026, baseWeight: 90000, valuePerGram: 20 },
  { name: "Presolar Moissanite", rarity: 8000000, baseWeight: 4800, valuePerGram: 560 },
  { name: "Lanky Gem", rarity: 10000000, baseWeight: 40500, valuePerGram: 111.1111 },
  { name: "Heart of Xy", rarity: 100000000, baseWeight: 6500, valuePerGram: 2000 },
  { name: "Carmeltazite", rarity: 50000000, baseWeight: 6000, valuePerGram: 1250 }
];

// =========================================================
// SECURE RANDOM NUMBER
// =========================================================

function random01() {
  const values =
    new Uint32Array(1);

  crypto.getRandomValues(
    values
  );

  return (
    values[0] /
    4294967296
  );
}


function randomBetween(
  min: number,
  max: number
) {
  return (
    min +
    random01() *
    (max - min)
  );
}


// =========================================================
// GEM RNG
// =========================================================

function rollGem(
  luck = 1
) {
  const safeLuck =
    Math.max(
      1,
      luck
    );

  const maximumRarity =
    Math.max(
      ...gems.map(
        (gem) =>
          gem.rarity
      )
    );

  // Luck also acts as a rarity floor. At 4x Luck, gems with a listed
  // rarity of 1 in 4 or more common are excluded from the pool.
  const rarityFloor =
    Math.min(
      safeLuck,
      maximumRarity
    );

  const rollableGems =
    gems
      .filter(
        (gem) =>
          gem.affectedByLuck === false ||
          gem.rarity >= rarityFloor
      )
      .sort(
        (a, b) =>
          b.rarity -
          a.rarity
      );

  const fallbackPool = rollableGems.filter((gem) => gem.affectedByLuck !== false);
  const fallbackGem = (fallbackPool.length ? fallbackPool : rollableGems)[
    (fallbackPool.length ? fallbackPool : rollableGems).length - 1
  ];


  for (
    const gem
    of rollableGems
  ) {
    const chance =
      Math.min(
        gem.affectedByLuck === false
          ? 1 / gem.rarity
          : safeLuck / gem.rarity,
        1
      );


    if (
      random01() <
      chance
    ) {
      return gem;
    }
  }


  return fallbackGem;
}

const relics = {
  enchant: { name: "Enchant Relic", rarity: 250, baseWeight: 0, valuePerGram: 0 },
  ancient: { name: "Ancient Relic", rarity: 1500, baseWeight: 0, valuePerGram: 0 }
};

// One draw gives both mutually-exclusive relics their exact marginal odds.
// Neither player Luck nor any other modifier is involved.
function rollRelic() {
  const roll = random01();
  if (roll < 1 / 1500) return relics.ancient;
  if (roll < 1 / 1500 + 1 / 250) return relics.enchant;
  return null;
}

function isRelic(gem: { name?: string }) {
  return gem.name === "Enchant Relic" || gem.name === "Ancient Relic";
}

function rollGemWithPickaxePassives(
  luck: number,
  discovered: Set<string>,
  geologistMultiplier = 1,
  extremeGemMultiplier = 1,
  legendaryGemMultiplier = 1,
  timeWindowMultiplier = 1
) {
  const safeLuck = Math.max(1, luck);
  const maximumRarity = Math.max(...gems.map((gem) => gem.rarity));
  const rarityFloor = Math.min(safeLuck, maximumRarity);
  const rollable = gems
    .filter((gem) => gem.affectedByLuck === false || gem.rarity >= rarityFloor)
    .sort((a, b) => b.rarity - a.rarity);

  for (const gem of rollable) {
    if (gem.affectedByLuck === false) {
      if (random01() < Math.min(1 / gem.rarity, 1)) return gem;
      continue;
    }
    let gemLuck = safeLuck;
    if (!discovered.has(gem.name)) gemLuck *= geologistMultiplier;
    if (gem.rarity >= 2300) gemLuck *= legendaryGemMultiplier;
    if (gem.rarity >= 100000) gemLuck *= extremeGemMultiplier;
    if ((gem as any).timeWindow === true) gemLuck *= timeWindowMultiplier;
    if (random01() < Math.min(gemLuck / gem.rarity, 1)) return gem;
  }
  const fallbackPool = rollable.filter((gem) => gem.affectedByLuck !== false);
  const pool = fallbackPool.length ? fallbackPool : rollable;
  return pool[pool.length - 1];
}


// =========================================================
// MUTATION RNG
// =========================================================

let gemMutations = [
  { id: "polished", name: "Polished", chance: 1 / 100, multiplier: 1.5 },
  { id: "gilded", name: "Gilded", chance: 1 / 500, multiplier: 2.5 },
  { id: "prismatic", name: "Prismatic", chance: 1 / 2500, multiplier: 5 },
  { id: "celestial", name: "Celestial", chance: 1 / 10000, multiplier: 12 },
  { id: "corrupted", name: "Corrupted", chance: 1 / 50000, multiplier: 30 }
];

// Restore the hardcoded mutation-luck player.
const MUTATION_LUCK_PLAYER_ID =
  "38d5e8ce-18af-46d3-aa9e-6e601e75dd78";

function getMutationChanceMultiplier(playerId: string) {
  return playerId === MUTATION_LUCK_PLAYER_ID ? 1000000 : 1;
}

// Every mutation is rolled independently. Multiple mutations can stack.
function rollGemMutations(chanceMultiplier = 1) {
  const safeMultiplier = Math.max(1, Number(chanceMultiplier) || 1);

  return gemMutations.filter((mutation) => {
    const chance = Math.min(mutation.chance * safeMultiplier, 1);
    return random01() < chance;
  });
}


function getMutationCombinationKey(mutationIds: string[]) {
  const order = new Map(
    gemMutations.map((mutation, index) => [mutation.id, index])
  );

  const sortedIds = Array.from(
    new Set(mutationIds.map((id) => String(id)))
  ).sort(
    (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)
  );

  return sortedIds.length ? sortedIds.join("+") : "none";
}


// =========================================================
// WEIGHT RNG
// =========================================================

export function rollWeightMultiplier(
  weightLuck = 1,
  continuationChance = 1 / 3,
  maximumMultiplier: number | null = null
) {
  const safeWeightLuck =
    Math.max(
      0,
      weightLuck
    );

  // Weight Luck has diminishing returns:
  // 1x = 25% high-region chance, approaching 85% at high values.
  const highChance =
    0.25 +
    0.6 *
      (
        1 -
        Math.exp(
          -0.35 *
          Math.max(
            0,
            safeWeightLuck - 1
          )
        )
      );

  const lowChance =
    1 - highChance;

  const roll =
    random01();


  // ---------------------------------------------------------
  // LOW REGION
  // ---------------------------------------------------------

  if (
    roll <
    lowChance
  ) {
    const lowRoll =
      random01();


    if (
      lowRoll < 0.2
    ) {
      return randomBetween(
        0.5,
        0.85
      );
    }


    return randomBetween(
      0.85,
      1.1
    );
  }


  // ---------------------------------------------------------
  // HIGH REGION
  // ---------------------------------------------------------

  const highRoll =
    random01();


  if (
    highRoll < 0.6
  ) {
    return randomBetween(
      1.1,
      1.5
    );
  }


  if (
    highRoll < 0.75
  ) {
    return randomBetween(
      1.5,
      2
    );
  }


  // ---------------------------------------------------------
  // 2x+ TAIL
  // ---------------------------------------------------------

  let wholeMultiplier =
    2;

  // Production baseline: each additional whole multiplier is a 1-in-3 roll.
  while (
    (maximumMultiplier == null || wholeMultiplier < maximumMultiplier) &&
    random01() < continuationChance
  ) {
    wholeMultiplier++;
  }

  if (maximumMultiplier != null && wholeMultiplier >= maximumMultiplier) {
    return maximumMultiplier;
  }


  return randomBetween(
    wholeMultiplier,
    wholeMultiplier + 1
  );
}

export function getLateGameFinalWeightFactor(
  equipmentId: string | null,
  naturalWeight: number,
  baseRarity: number,
  compressionRoll = false
) {
  switch (equipmentId) {
    case "riftwoven-bag": return naturalWeight >= 3 ? 1.10 : 1;
    case "vault-of-plenty": return baseRarity >= 100000 ? 1.125 : 1;
    case "dimensional-vault": return naturalWeight >= 0.90 && naturalWeight <= 1.10 ? 1.20 : 1;
    case "singularity-vault": return compressionRoll ? 1.25 : 1;
    case "bottomless-singularity": return naturalWeight >= 5 ? 1.25 : 1;
    default: return 1;
  }
}


// =========================================================
// =========================================================
// AUTO CRAFT HELPERS
// =========================================================

function getRequirementKey(
  requirement: any,
  index: number
) {
  if (
    requirement.id
  ) {
    return requirement.id;
  }


  if (
    requirement.type ===
    "gem-count"
  ) {
    return requirement.gem;
  }


  return (
    `${requirement.type}-${index}`
  );
}


function getRarityPoints(
  specimen: any
) {
  const rarity =
    Number(
      specimen.rarity
    );


  if (
    rarity >= 500
  ) {
    return 100;
  }


  if (
    rarity >= 250
  ) {
    return 50;
  }


  if (
    rarity >= 100
  ) {
    return 20;
  }


  if (
    rarity >= 50
  ) {
    return 8;
  }


  if (
    rarity >= 10
  ) {
    return 3;
  }


  return 1;
}


function specimenMatches(
  requirement: any,
  specimen: any
) {
  const baseWeight = Number(specimen.base_weight);
  const finalWeight = Number(specimen.final_weight);
  const weightMultiplier =
    Number.isFinite(baseWeight) && baseWeight > 0 && Number.isFinite(finalWeight)
      ? finalWeight / baseWeight
      : Number(specimen.rolled_weight_multiplier);

  if (
    requirement.gem &&
    specimen.gem_name !==
      requirement.gem
  ) {
    return false;
  }


  if (
    requirement.minimumWeightMultiplier !=
      null &&
    weightMultiplier <
      requirement.minimumWeightMultiplier
  ) {
    return false;
  }


  if (
    requirement.maximumWeightMultiplier !=
      null &&
    weightMultiplier >
      requirement.maximumWeightMultiplier
  ) {
    return false;
  }


  if (
    requirement.minimumRarity !=
      null &&
    specimen.rarity <
      requirement.minimumRarity
  ) {
    return false;
  }


  if (
    requirement.maximumRarity !=
      null &&
    specimen.rarity >
      requirement.maximumRarity
  ) {
    return false;
  }


  return true;
}


function ensureProgressValue(
  progress: Record<
    string,
    any
  >,
  requirement: any,
  index: number
) {
  const key =
    getRequirementKey(
      requirement,
      index
    );


  if (
    progress[key] !==
    undefined
  ) {
    return key;
  }


  if (
    requirement.type ===
    "rarity-points"
  ) {
    progress[key] = {
      points: 0,
      gemTypes: []
    };

    return key;
  }


  if (
    requirement.type ===
    "gem-range"
  ) {
    progress[key] = {};

    return key;
  }


  progress[key] =
    0;


  return key;
}


function isCraftingRequirementComplete(
  progress: Record<
    string,
    any
  >,
  requirement: any,
  index: number
) {
  const key =
    ensureProgressValue(
      progress,
      requirement,
      index
    );


  if (
    requirement.type ===
    "gem-count"
  ) {
    return (
      Number(
        progress[key] ??
        0
      ) >=
      requirement.amount
    );
  }


  if (
    requirement.type ===
    "gem-total-weight"
  ) {
    return (
      Number(
        progress[key] ??
        0
      ) >=
      requirement.totalWeight
    );
  }


  if (
    requirement.type ===
    "specimen-value-total"
  ) {
    return (
      Number(
        progress[key] ??
        0
      ) >=
      requirement.totalValue
    );
  }


  if (
    requirement.type ===
      "gem-min-weight-multiplier" ||
    requirement.type ===
      "gem-max-weight-multiplier" ||
    requirement.type ===
      "specimen-condition"
  ) {
    return (
      Number(
        progress[key] ??
        0
      ) >=
      (
        requirement.amount ??
        1
      )
    );
  }


  if (
    requirement.type ===
    "rarity-points"
  ) {
    const current =
      progress[key] ?? {
        points: 0,
        gemTypes: []
      };


    const gemTypes =
      Array.isArray(
        current.gemTypes
      )
        ? current.gemTypes
        : [];


    return (
      Number(
        current.points ??
        0
      ) >=
        requirement.points &&
      gemTypes.length >=
        (
          requirement
            .minimumUniqueGemTypes ??
          0
        )
    );
  }


  if (
    requirement.type ===
    "gem-range"
  ) {
    const current =
      progress[key] ??
      {};


    return requirement.gems.every(
      (
        gemName: string
      ) =>
        Number(
          current[
            gemName
          ] ??
          0
        ) >=
        (
          requirement.amountEach ??
          1
        )
    );
  }


  return false;
}


function depositIntoProgress(
  progress: Record<
    string,
    any
  >,
  requirement: any,
  index: number,
  specimen: any
) {
  const key =
    ensureProgressValue(
      progress,
      requirement,
      index
    );


  // ---------------------------------------------------------
  // GEM COUNT
  // ---------------------------------------------------------

  if (
    requirement.type ===
    "gem-count"
  ) {
    const current =
      Number(
        progress[key] ??
        0
      );


    if (
      current >=
      requirement.amount
    ) {
      return false;
    }


    progress[key] =
      current + 1;


    return true;
  }


  // ---------------------------------------------------------
  // TOTAL WEIGHT
  // ---------------------------------------------------------

  if (
    requirement.type ===
    "gem-total-weight"
  ) {
    progress[key] =
      Number(
        progress[key] ??
        0
      ) +
      Number(
        specimen.final_weight
      );


    return true;
  }


  // ---------------------------------------------------------
  // VALUE TOTAL
  // ---------------------------------------------------------

  if (
    requirement.type ===
    "specimen-value-total"
  ) {
    progress[key] =
      Number(
        progress[key] ??
        0
      ) +
      Number(
        specimen.value
      );


    return true;
  }


  // ---------------------------------------------------------
  // SPECIAL SPECIMEN
  // ---------------------------------------------------------

  if (
    requirement.type ===
      "gem-min-weight-multiplier" ||
    requirement.type ===
      "gem-max-weight-multiplier" ||
    requirement.type ===
      "specimen-condition"
  ) {
    const current =
      Number(
        progress[key] ??
        0
      );


    const target =
      requirement.amount ??
      1;


    if (
      current >=
      target
    ) {
      return false;
    }


    progress[key] =
      current + 1;


    return true;
  }


  // ---------------------------------------------------------
  // RARITY POINTS
  // ---------------------------------------------------------

  if (
    requirement.type ===
    "rarity-points"
  ) {
    const current =
      progress[key];


    current.points =
      Number(
        current.points ??
        0
      ) +
      getRarityPoints(
        specimen
      );


    if (
      !Array.isArray(
        current.gemTypes
      )
    ) {
      current.gemTypes =
        [];
    }


    if (
      !current.gemTypes.includes(
        specimen.gem_name
      )
    ) {
      current.gemTypes.push(
        specimen.gem_name
      );
    }


    return true;
  }


  // ---------------------------------------------------------
  // GEM RANGE
  // ---------------------------------------------------------

  if (
    requirement.type ===
    "gem-range"
  ) {
    if (
      !requirement.gems.includes(
        specimen.gem_name
      )
    ) {
      return false;
    }


    const target =
      requirement.amountEach ??
      1;


    const current =
      Number(
        progress[key][
          specimen.gem_name
        ] ??
        0
      );


    if (
      current >=
      target
    ) {
      return false;
    }


    progress[key][
      specimen.gem_name
    ] =
      current + 1;


    return true;
  }


  return false;
}


// =========================================================
// EDGE FUNCTION
// =========================================================

export default {
  fetch: withSupabase(
    {
      auth: "user"
    },

    async (
      req,
      ctx
    ) => {
      if (req.method === "OPTIONS") {
        return new Response("ok", {
          status: 200,
          headers: corsHeaders
        });
      }

      // =====================================================
      // IDENTIFY PLAYER
      // =====================================================

      const playerId =
        ctx.userClaims?.id;


      if (!playerId) {
        return jsonResponse(
          {
            error:
              "Could not identify player."
          },
          {
            status: 401
          }
        );
      }


      // =====================================================
      // LOAD PLAYER
      // =====================================================

      const {
        data:
          player,
        error:
          playerError
      } =
        await ctx.supabase
          .from(
            "players"
          )
          .select(`
            id,
            username,
            next_roll_at,
            inventory_capacity,
            total_rolls,
            mutation_luck,
            rarity_resonance,
            gravitational_surge_progress,
            gravitational_surge_ready,
            bag_compression_progress,
            best_rare_natural_weight_100k,
            best_rare_natural_weight_1m,
            player_research_effects(
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
              potion_strength_multiplier,
              inventory_bonus,
              statistical_breakthrough
            )
          `)
          .eq(
            "id",
            playerId
          )
          .single();


      if (
        playerError ||
        !player
      ) {
        console.error(
          "Player load failed:",
          playerError
        );


        return jsonResponse(
          {
            error:
              "Player record not found."
          },
          {
            status: 400
          }
        );
      }

      // =====================================================
      // BAN / SUSPENSION CHECK
      //
      // A banned player is blocked at the door. The client also shows a ban
      // screen; enforcing here means removing that overlay buys nothing. Ban
      // state lives in its own table (user_roll_luck_rarity_mult).
      // =====================================================

      const { data: banRow } = await ctx.supabaseAdmin
        .from("user_roll_luck_rarity_mult")
        .select("active_until, note")
        .eq("player_id", playerId)
        .maybeSingle();

      if (
        banRow?.active_until &&
        new Date(banRow.active_until) > new Date()
      ) {
        return jsonResponse(
          {
            error: "banned",
            bannedUntil: banRow.active_until,
            reason: banRow.note ?? null
          },
          { status: 403 }
        );
      }


      // =====================================================
      // LOAD LIVE MUTATION CATALOG
      // =====================================================
      // Admin-created mutations live in game_mutations. Keep the historical
      // fallback above for old deployments, but prefer the live catalog so
      // newly-created mutations actually participate in rolls.
      try {
        const { data: liveMutations, error: liveMutationError } =
          await ctx.supabaseAdmin
            .from("game_mutations")
            .select("id,name,chance,multiplier")
            .eq("enabled", true)
            .order("sort_order", { ascending: true });

        if (!liveMutationError && Array.isArray(liveMutations) && liveMutations.length) {
          gemMutations = liveMutations
            .map((mutation: any) => ({
              id: String(mutation.id),
              name: String(mutation.name),
              // game_mutations stores mutation odds as a denominator
              // (100 = 1 in 100), while the RNG expects a probability.
              chance: 1 / Number(mutation.chance),
              multiplier: Number(mutation.multiplier)
            }))
            .filter((mutation: any) =>
              mutation.id &&
              Number.isFinite(mutation.chance) &&
              mutation.chance > 0 &&
              Number.isFinite(mutation.multiplier) &&
              mutation.multiplier > 0
            );
        } else if (liveMutationError) {
          console.warn("[ROLL] Live mutation catalog unavailable; using bundled mutations:", liveMutationError.message);
        }
      } catch (mutationCatalogError) {
        console.warn("[ROLL] Live mutation catalog lookup failed; using bundled mutations:", mutationCatalogError);
      }


      // =====================================================
      // CHECK COOLDOWN
      // =====================================================

      const now =
        new Date();


      if (
        player.next_roll_at
      ) {
        const currentNextRoll =
          new Date(
            player.next_roll_at
          );


        if (
          currentNextRoll >
          now
        ) {
          const remainingMs =
            currentNextRoll
              .getTime() -
            now.getTime();


          return jsonResponse(
            {
              error:
                "cooldown",

              remainingMs,

              nextRollAt:
                currentNextRoll
                  .toISOString()
            },
            {
              status: 429
            }
          );
        }
      }


      // =====================================================
      // CHECK INVENTORY CAPACITY
      // =====================================================

      const {
        count:
          inventoryCount,
        error:
          inventoryCountError
      } =
        await ctx.supabase
          .from(
            "inventory_gems"
          )
          .select(
            "id",
            {
              count:
                "exact",

              head:
                true
            }
          )
          .eq(
            "player_id",
            playerId
          )
          .neq(
            "gem_name",
            "Enchant Relic"
          )
          .neq(
            "gem_name",
            "Ancient Relic"
          );


      if (
        inventoryCountError
      ) {
        console.error(
          "Inventory count failed:",
          inventoryCountError
        );


        return jsonResponse(
          {
            error:
              "Failed to check inventory."
          },
          {
            status: 500
          }
        );
      }


      const currentInventoryCount =
        inventoryCount ??
        0;

      const researchEffectsAtCapacityRaw = (player as any).player_research_effects;
      const researchEffectsAtCapacity = Array.isArray(researchEffectsAtCapacityRaw)
        ? researchEffectsAtCapacityRaw[0] ?? {}
        : researchEffectsAtCapacityRaw ?? {};
      const researchInventoryBonus = Math.max(
        0,
        Math.trunc(Number(researchEffectsAtCapacity.inventory_bonus ?? 0)) || 0
      );
      const effectiveInventoryCapacity =
        Number(player.inventory_capacity ?? 0) + researchInventoryBonus;


      if (
        currentInventoryCount >=
        effectiveInventoryCapacity
      ) {
        return jsonResponse(
          {
            error:
              "inventory_full",

            inventoryCount:
              currentInventoryCount,

            capacity:
              effectiveInventoryCapacity
          },
          {
            status: 409
          }
        );
      }


      // =====================================================
      // LOAD EQUIPPED CLOUD EQUIPMENT
      // =====================================================

      const {
        data:
          equippedEquipment,
        error:
          equipmentError
      } =
        await ctx.supabase
          .from(
            "player_equipment"
          )
          .select(`
            id,
            equipment_id,
            category,
            luck_bonus,
            roll_speed_bonus,
            weight_luck_bonus,
            weight_multiplier_bonus,
            enchant_id,
            enchant_grade,
            enchant_state,
            masterwork_level,
            masterwork_passive,
            masterwork_passive_rank,
            masterwork_attunement
          `)
          .eq(
            "player_id",
            playerId
          )
          .eq(
            "equipped",
            true
          );


      if (
        equipmentError
      ) {
        console.error(
          "Failed to load equipment stats:",
          equipmentError
        );


        return jsonResponse(
          {
            error:
              "Failed to load equipment stats."
          },
          {
            status: 500
          }
        );
      }

      const { data: mineArtifactRows, error: mineArtifactError } = await ctx.supabaseAdmin
        .from("museum_artifact_registrations")
        .select("artifact_key")
        .eq("player_id", playerId);
      if (mineArtifactError) {
        console.error("Failed to load Museum artifact passives:", mineArtifactError);
        return jsonResponse({ error: "Failed to load Museum artifact passives." }, { status: 500 });
      }
      const mineArtifacts = new Set((mineArtifactRows ?? []).map((row: any) => String(row.artifact_key)));

      const equippedPickaxe = (equippedEquipment ?? []).find(
        (item) => item.category === "pickaxe"
      ) ?? null;
      const enchantedPickaxe = (equippedEquipment ?? []).find(
        (item) => item.category === "pickaxe" && item.enchant_id
      ) ?? null;
      const hasMutationResonance = equippedPickaxe?.equipment_id === "eclipse-pickaxe";
      const hasEventHorizon = equippedPickaxe?.equipment_id === "singularity-pickaxe";
      const hasEnchantConduit = equippedPickaxe?.equipment_id === "transcendent-pickaxe";
      const hasVeinHunter = equippedPickaxe?.equipment_id === "astral-pickaxe";
      const hasRarityResonance = equippedPickaxe?.equipment_id === "celestial-pickaxe";
      const masterworkPickaxe = equippedPickaxe?.masterwork_passive ?? null;
      const masterworkPickaxeRank = Number(equippedPickaxe?.masterwork_passive_rank ?? 0);
      const equippedLantern = (equippedEquipment ?? []).find((item) => item.category === "lantern") ?? null;
      const equippedBoots = (equippedEquipment ?? []).find((item) => item.category === "boots") ?? null;
      const equippedBag = (equippedEquipment ?? []).find((item) => item.category === "bag") ?? null;
      const hasHeavyFooting = equippedBoots?.equipment_id === "event-horizon-boots";
      const hasGravitationalSurge = equippedBoots?.equipment_id === "gravitational-boots";
      const masterworkLantern = equippedLantern?.masterwork_passive ?? null;
      const masterworkLanternRank = Number(equippedLantern?.masterwork_passive_rank ?? 0);
      const masterworkBoots = equippedBoots?.masterwork_passive ?? null;
      const masterworkBootsRank = Number(equippedBoots?.masterwork_passive_rank ?? 0);
      const currentEnchantId = enchantedPickaxe?.enchant_id ?? null;
      const sharedEnchants = new Set(["deep_strike","lucky_break","fortune_surge","collectors_edge"]);
      const attunement = equippedPickaxe?.masterwork_attunement ?? null;
      const attunementFactor = attunement === "amplified" ? 1.03
        : attunement === "resonant" && sharedEnchants.has(currentEnchantId) ? 1.05
        : attunement === "specialized" && currentEnchantId && !sharedEnchants.has(currentEnchantId) ? 1.05 : 1;
      const strengthenEnchantMultiplier = (multiplier: number) =>
        1 + (multiplier - 1) * (hasEnchantConduit ? 1.1 : 1) * attunementFactor;

      let enchantState: Record<string, number> =
        enchantedPickaxe?.enchant_state && typeof enchantedPickaxe.enchant_state === "object"
          ? { ...enchantedPickaxe.enchant_state }
          : {};
      let enchantStateChanged = false;
      let slowStarterCooldownMultiplier = 1;

      // The base-gem names are enough for both Index-completion enchants.
      let discoveredGemNames = new Set<string>();
      if (["geologist", "collectors_edge"].includes(enchantedPickaxe?.enchant_id) || masterworkBoots === "trailblazer") {
        const { data: discoveries, error: discoveryError } = await ctx.supabaseAdmin
          .from("player_gem_mutation_combinations")
          .select("gem_name")
          .eq("player_id", playerId);
        if (discoveryError) {
          console.error("Failed to load enchant Index progress:", discoveryError);
        } else {
          discoveredGemNames = new Set((discoveries ?? []).map((row) => row.gem_name));
        }
      }


      // =====================================================
      // LOAD ACTIVE PLAYER BOOSTS
      // =====================================================

      const {
        data:
          activeBoosts,
        error:
          boostError
      } =
        await ctx.supabase
          .from(
            "player_boosts"
          )
          .select(
            "family, tier, effect_value"
          )
          .eq(
            "player_id",
            playerId
          )
          .gt(
            "expires_at",
            now.toISOString()
          );


      if (
        boostError
      ) {
        console.error(
          "Failed to load active boosts:",
          boostError
        );


        return jsonResponse(
          {
            error:
              "Failed to load active boosts."
          },
          {
            status: 500
          }
        );
      }


      // =====================================================
      // LOAD PENDING ONE-ROLL BOOST (Legendary / Mythic potion)
      //
      // Each charge adds the potion's Luck to one successful roll. The row
      // remains until its final charge is spent.
      // =====================================================

      const {
        data:
          oneRollBoost,
        error:
          oneRollBoostError
      } =
        await ctx.supabaseAdmin
          .from(
            "player_one_roll_boosts"
          )
          .select(
            "effect_value, consumable_id, charges"
          )
          .eq(
            "player_id",
            playerId
          )
          .maybeSingle();

      if (oneRollBoostError) {
        console.error(
          "Failed to load one-roll boost:",
          oneRollBoostError
        );
      }


      // =====================================================
      // LOAD ACTIVE ADMIN EVENT
      // =====================================================

      const {
        data:
          activeAdminEvent,
        error:
          adminEventError
      } =
        await ctx.supabaseAdmin
          .from(
            "admin_events"
          )
          .select(`
            id,
            name,
            luck_bonus,
            roll_speed_bonus,
            weight_luck_bonus,
            weight_multiplier_bonus,
            luck_multiplier,
            roll_speed_multiplier,
            weight_luck_multiplier,
            weight_multiplier_multiplier,
            mutation_luck_bonus,
            mutation_luck_multiplier,
            ends_at
          `)
          .eq(
            "active",
            true
          )
          .lte(
            "starts_at",
            now.toISOString()
          )
          .gt(
            "ends_at",
            now.toISOString()
          )
          .order(
            "starts_at",
            { ascending: false }
          )
          .limit(1)
          .maybeSingle();


      if (adminEventError) {
        // A temporary event-loading problem should not prevent normal rolls.
        console.error(
          "Failed to load active admin event:",
          adminEventError
        );
      }


      // =====================================================
      // CALCULATE PLAYER STATS
      // =====================================================

      // The saved specimen records the same effective Luck used by the RNG,
      // including equipment, potions, and the active admin event.
      let luck =
        1;

      // Base Luck is the player's permanent/equipment Luck only.
      // It intentionally excludes active boosts, one-roll potions, and
      // admin-event modifiers so the Base Luck leaderboard cannot be
      // inflated by temporary effects.
      let baseLuck =
        1;

      let rollSpeed =
        1;

      let weightLuck =
        1;

      let weightMultiplier =
        1;


      for (
        const equipment
        of equippedEquipment ??
        []
      ) {
        const masterworkFactor = 1 + Math.min(5, Math.max(0, Number(equipment.masterwork_level ?? 0))) / 100;
        const equipmentLuck =
          Number(
            equipment
              .luck_bonus ??
            0
          ) * masterworkFactor;

        luck +=
          equipmentLuck;

        rollSpeed +=
          Number(
            equipment
              .roll_speed_bonus ??
            0
          ) * masterworkFactor;

        weightLuck +=
          Number(
            equipment
              .weight_luck_bonus ??
            0
          ) * masterworkFactor;

        weightMultiplier +=
          Number(
            equipment
              .weight_multiplier_bonus ??
            0
          ) * masterworkFactor;
      }

      // Normal Abandoned Mine Museum passives are permanent collection bonuses.
      if (mineArtifacts.has("miners-lamp")) rollSpeed += 0.02;
      if (mineArtifacts.has("clockwork-drill")) rollSpeed += 0.05;
      if (mineArtifacts.has("surveyors-compass")) weightLuck += 0.03;
      if (mineArtifacts.has("silver-pick")) weightMultiplier += 0.05;
      if (mineArtifacts.has("vein-prism")) luck += 0.05;

      if (masterworkLantern === "focused_beam") luck *= masterworkLanternRank >= 2 ? 1.05 : 1.03;

      const researchEffectsRaw = (player as any).player_research_effects;
      const researchEffects = Array.isArray(researchEffectsRaw)
        ? researchEffectsRaw[0] ?? {}
        : researchEffectsRaw ?? {};
      const researchNumber = (key: string, fallback = 1) => {
        const value = Number(researchEffects[key] ?? fallback);
        return Number.isFinite(value) && value > 0 ? value : fallback;
      };

      const { data: crystalEffectsData, error: crystalEffectsError } = await ctx.supabaseAdmin
        .rpc("crystal_player_effects", { p_uid: playerId });
      if (crystalEffectsError) console.warn("Crystal artifact passives unavailable:", crystalEffectsError);
      const crystalEffects = crystalEffectsData ?? {};
      const crystalLuckBonus = Math.max(0, Number(crystalEffects.luckBonus ?? 0));
      const crystalWeightLuckMultiplier = Math.max(1, Number(crystalEffects.weightLuckMultiplier ?? 1));
      const crystalWeightMultiplierMultiplier = Math.max(1, Number(crystalEffects.weightMultiplierMultiplier ?? 1));
      const crystalMutationMultiplier = Math.max(1, Number(crystalEffects.mutationChanceMultiplier ?? 1));
      const crystalGemValueMultiplier = Math.max(1, Number(crystalEffects.gemValueMultiplier ?? 1));
      const crystalHeavyGemValueMultiplier = Math.max(1, Number(crystalEffects.heavyGemValueMultiplier ?? 1));

      const { data: expeditionArtifactEffectsData, error: expeditionArtifactEffectsError } =
        await ctx.supabaseAdmin.rpc("player_expedition_artifact_effects", { p_player_id: playerId });
      if (expeditionArtifactEffectsError) {
        console.warn("Expedition artifact passives unavailable:", expeditionArtifactEffectsError);
      }
      const expeditionArtifactEffects = expeditionArtifactEffectsData ?? {};
      const expeditionArtifactLuckBonus = Math.max(0, Number(expeditionArtifactEffects.luckBonus ?? 0));
      const expeditionArtifactMutationMultiplier = Math.max(1, Number(expeditionArtifactEffects.mutationChanceMultiplier ?? 1));
      const expeditionArtifactGemValueMultiplier = Math.max(1, Number(expeditionArtifactEffects.gemValueMultiplier ?? 1));

      luck *= researchNumber("luck_multiplier");
      luck += crystalLuckBonus;
      luck += expeditionArtifactLuckBonus;
      rollSpeed *= researchNumber("roll_speed_multiplier");
      weightLuck *= researchNumber("weight_luck_multiplier");
      weightLuck *= crystalWeightLuckMultiplier;
      weightMultiplier *= crystalWeightMultiplierMultiplier;
      const researchPotionStrength = researchNumber("potion_strength_multiplier");


      baseLuck =
        luck;

      for (
        const boost
        of activeBoosts ??
        []
      ) {
        let effectValue =
          Number(
            boost.effect_value ??
            0
          ) * researchPotionStrength;

        if (boost.family === "rollSpeed" && masterworkLantern === "potion_afterglow") {
          effectValue *= masterworkLanternRank >= 2 ? 1.15 : 1.10;
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
            luck +=
              effectValue;
            break;

          case "rollSpeed":
            rollSpeed +=
              effectValue;
            break;

          case "weightLuck":
            weightLuck +=
              effectValue;
            break;

          case "weightMultiplier":
            weightMultiplier +=
              effectValue;
            break;
        }
      }

      if (masterworkLantern === "overclocked_flame") rollSpeed *= masterworkLanternRank >= 2 ? 1.08 : 1.05;
      if (masterworkLantern === "flashpoint" && (Number(player.total_rolls ?? 0) + 1) % 250 === 0) rollSpeed *= masterworkLanternRank >= 2 ? 1.4 : 1.25;
      if (masterworkBoots === "fortune_walker") weightLuck *= masterworkBootsRank >= 2 ? 1.08 : 1.05;


      // A one-roll potion (Legendary / Mythic) adds its luck to this
      // roll only. Consumed after the roll commits (below).
      const oneRollLuck =
        Number(
          oneRollBoost
            ?.effect_value ??
          0
        ) * researchPotionStrength;

      if (
        Number.isFinite(
          oneRollLuck
        ) &&
        oneRollLuck > 0
      ) {
        luck +=
          oneRollLuck;
      }


      // Rare-roll chat should report the effective player Luck that actually
      // contributed to the roll, including temporary and one-roll potions.
      // Keep the admin-event portion separate so private event modifiers are
      // not presented as part of the player's own build.
      const luckBeforeAdminEvent = luck;
      let adminLuckFactor = 1;


      if (activeAdminEvent) {
        const applyEventModifier = (
          currentValue: number,
          rawBonus: unknown,
          rawMultiplier: unknown
        ) => {
          const parsedBonus =
            Number(rawBonus ?? 0);

          const parsedMultiplier =
            Number(rawMultiplier ?? 1);

          const bonus =
            Number.isFinite(parsedBonus)
              ? parsedBonus
              : 0;

          const multiplier =
            Number.isFinite(parsedMultiplier) &&
            parsedMultiplier > 0
              ? parsedMultiplier
              : 1;

          return (
            currentValue + bonus
          ) * multiplier;
        };

        luck =
          applyEventModifier(
            luck,
            activeAdminEvent.luck_bonus,
            activeAdminEvent.luck_multiplier
          );

        if (luckBeforeAdminEvent > 0 && Number.isFinite(luck)) {
          adminLuckFactor = luck / luckBeforeAdminEvent;
        }

        rollSpeed =
          applyEventModifier(
            rollSpeed,
            activeAdminEvent.roll_speed_bonus,
            activeAdminEvent.roll_speed_multiplier
          );

        weightLuck =
          applyEventModifier(
            weightLuck,
            activeAdminEvent.weight_luck_bonus,
            activeAdminEvent.weight_luck_multiplier
          );

        weightMultiplier =
          applyEventModifier(
            weightMultiplier,
            activeAdminEvent.weight_multiplier_bonus,
            activeAdminEvent.weight_multiplier_multiplier
          );
      }

      // Enchants multiply the final effective Luck. Only the equipped
      // pickaxe owns and advances its state.
      const enchantId = enchantedPickaxe?.enchant_id ?? null;
      const enchantGrade = enchantedPickaxe?.enchant_grade === "ancient" ? "ancient" : "normal";

      if (enchantId === "deep_strike") {
        const every = enchantGrade === "ancient" ? 5 : 7;
        const counter = Number(enchantState.rolls ?? 0) + 1;
        if (counter >= every) {
          luck *= strengthenEnchantMultiplier(enchantGrade === "ancient" ? 1.5 : 1.35);
          enchantState.rolls = 0;
        } else enchantState.rolls = counter;
        enchantStateChanged = true;
      }

      if (enchantId === "fortune_surge") {
        const remaining = Math.max(0, Number(enchantState.remaining ?? 0));
        if (remaining > 0) {
          luck *= strengthenEnchantMultiplier(enchantGrade === "ancient" ? 1.5 : 1.35);
          enchantState.remaining = remaining - 1;
          enchantStateChanged = true;
        } else if (random01() < (enchantGrade === "ancient" ? 0.08 : 0.05)) {
          // The proc affects the next rolls, not the trigger roll.
          enchantState.remaining = 3;
          enchantStateChanged = true;
        }
      }

      if (enchantId === "collectors_edge") {
        const catalogSize = gems.length;
        const completion = Math.min(1, discoveredGemNames.size / catalogSize);
        const baseMultiplier = 1 + completion * (enchantGrade === "ancient" ? 0.25 : 0.12);
        luck *= strengthenEnchantMultiplier(baseMultiplier);
      }

      if (enchantId === "prospectors_instinct") {
        const remaining = Math.max(0, Number(enchantState.remaining ?? 0));
        if (remaining > 0) {
          luck *= strengthenEnchantMultiplier(enchantGrade === "ancient" ? 1.6 : 1.4);
          enchantState.remaining = remaining - 1;
          enchantStateChanged = true;
        }
      }

      if (enchantId === "vein_hunter") {
        const misses = Math.min(30, Math.max(0, Number(enchantState.misses ?? 0)));
        luck *= strengthenEnchantMultiplier(1 + misses / 100);
      }

      if (enchantId === "jackpot_mining") {
        const outcome = random01();
        if (outcome < 0.08) {
          luck *= strengthenEnchantMultiplier(enchantGrade === "ancient" ? 2.5 : 1.75);
        } else if (outcome < 0.12) {
          luck *= 0.5;
        }
      }

      if (enchantId === "blitz_vein") {
        const stacks = Math.min(10, Math.max(0, Number(enchantState.stacks ?? 0)));
        const progress = stacks / 10;
        const weightLuckMaximum = enchantGrade === "ancient" ? 1.3 : 1.2;
        const rollSpeedMaximum = enchantGrade === "ancient" ? 1.25 : 1.15;
        const multiplierMaximum = enchantGrade === "ancient" ? 1.1 : 1.05;
        weightLuck *= strengthenEnchantMultiplier(1 + (weightLuckMaximum - 1) * progress);
        rollSpeed *= strengthenEnchantMultiplier(1 + (rollSpeedMaximum - 1) * progress);
        weightMultiplier *= strengthenEnchantMultiplier(1 + (multiplierMaximum - 1) * progress);
      }

      if (enchantId === "slow_starter" && enchantGrade === "ancient") {
        const rolls = Math.min(99, Math.max(0, Number(enchantState.rolls ?? 0)));
        slowStarterCooldownMultiplier = Math.max(0.5, 1.75 - rolls * 0.025);
      }

      let guildShopBuffIds: string[] = [];

      // Eligible guild members receive small permanent multiplicative
      // enhancements. The 24-hour delay prevents join-hopping for bonuses.
      try {
        const { data: guildMembership, error: guildBonusError } = await ctx.supabaseAdmin
          .from("guild_members")
          .select("guild_id,eligible_at,guilds(luck_tier,speed_tier,weight_luck_tier)")
          .eq("player_id", playerId)
          .maybeSingle();
        if (guildBonusError) throw guildBonusError;
        if (guildMembership && Date.parse(guildMembership.eligible_at) <= now.getTime()) {
          const guild = Array.isArray(guildMembership.guilds)
            ? guildMembership.guilds[0]
            : guildMembership.guilds;
          luck *= 1 + Math.min(10, Math.max(0, Number(guild?.luck_tier ?? 0))) / 100;
          rollSpeed *= 1 + Math.min(10, Math.max(0, Number(guild?.speed_tier ?? 0))) / 100;
          weightLuck *= 1 + Math.min(10, Math.max(0, Number(guild?.weight_luck_tier ?? 0))) / 100;
        }
        if (guildMembership) {
          const { data: guildShopBuffs, error: guildShopError } = await ctx.supabaseAdmin
            .from("guild_shop_buffs")
            .select("potion_id")
            .eq("guild_id", guildMembership.guild_id)
            .gt("expires_at", now.toISOString());
          if (guildShopError) throw guildShopError;
          guildShopBuffIds = (guildShopBuffs ?? []).map((row: any) => String(row.potion_id));
          for (const potionId of guildShopBuffIds) {
            if (potionId === "lucky_brew") luck *= 1.05;
            if (potionId === "haste_brew") rollSpeed *= 1.05;
            if (potionId === "heavy_brew") weightLuck *= 1.10;
            if (potionId === "prosperity_brew") weightMultiplier *= 1.10;
            if (potionId === "greater_lucky") luck *= 1.10;
            if (potionId === "greater_haste") rollSpeed *= 1.10;
            if (potionId === "legendary") {
              luck *= 1.10; rollSpeed *= 1.10; weightLuck *= 1.15; weightMultiplier *= 1.10;
            }
            if (potionId === "mythic") {
              luck *= 1.15; rollSpeed *= 1.15; weightLuck *= 1.20; weightMultiplier *= 1.15;
            }
          }
        }
      } catch (guildBonusError) {
        // Guild progression is best-effort and must never prevent a roll.
        console.error("Guild bonus lookup failed:", guildBonusError);
      }


      // =====================================================
      // CALCULATE + CLAIM COOLDOWN
      // =====================================================

      const baseCooldownSeconds =
        2.5;


      const cooldownMs =
        (
          baseCooldownSeconds /
          rollSpeed
        ) * slowStarterCooldownMultiplier *
        1000;


      // Browser visibility is not a security boundary. Claim a database
      // lease using the database clock so multiple tabs, direct requests,
      // and userscripts all serialize through one authoritative gate.
      const {
        data:
          rollClaim,
        error:
          rollClaimError
      } =
        await ctx.supabaseAdmin
          .rpc("claim_server_roll", {
            p_player_id: playerId,
            p_cooldown_ms: cooldownMs
          });


      if (
        rollClaimError
      ) {
        console.error(
          "Roll lease claim failed:",
          rollClaimError
        );


        return jsonResponse(
          {
            error:
              "Failed to claim roll lease."
          },
          {
            status: 500
          }
        );
      }


      if (
        rollClaim?.status !== "claimed"
      ) {
        const blockedUntil =
          rollClaim?.retryAt
            ? new Date(
                rollClaim.retryAt
              )
            : new Date(
                Date.now() +
                cooldownMs
              );


        return jsonResponse(
          {
            error:
              "cooldown",

            remainingMs:
              Math.max(
                0,
                blockedUntil.getTime() -
                Date.now()
              ),

            nextRollAt:
              blockedUntil.toISOString()
          },
          {
            status: 429
          }
        );
      }


      const claimedNextRollAt =
        new Date(
          rollClaim.nextRollAt
        );

      const rollLeaseId =
        String(
          rollClaim.leaseId
        );

      // Advance Mythic Surge only after the authoritative lease accepts this
      // request as a genuine roll. The RPC serializes the shared guild counter.
      let mythicSurge: any = null;
      try {
        const { data: surgeResult, error: surgeError } = await ctx.supabaseAdmin.rpc(
          "claim_guild_mythic_surge",
          { p_player_id: playerId }
        );
        if (surgeError) throw surgeError;
        mythicSurge = surgeResult ?? null;
        if (mythicSurge?.boosted === true) luck *= 2;
      } catch (surgeError) {
        // A shop deployment mismatch must not strand an already-claimed roll.
        console.error("Guild Mythic Surge claim failed:", surgeError);
      }



      // =====================================================
      // LOAD ADMIN-MANAGED GEM CATALOG
      //
      // The database catalog is the authoritative editable catalog.
      // If the migration has not been installed yet, retain the bundled
      // catalog so ordinary rolling continues to work during deployment.
      // =====================================================
      try {
        const { data: configuredGems, error: configuredGemError } =
          await ctx.supabaseAdmin
            .from("private_feature_gems")
            .select("name, rarity, base_weight, value_per_gram, affected_by_luck, availability_mode, daily_start_time, daily_end_time, availability_timezone")
            .eq("enabled", true)
            .or(`starts_at.is.null,starts_at.lte.${now.toISOString()}`)
            .or(`ends_at.is.null,ends_at.gt.${now.toISOString()}`)
            .order("sort_order")
            .order("rarity", { ascending: false });

        if (!configuredGemError && configuredGems) {
          // An installed-but-empty catalog means the admin deliberately
          // removed/disabled every gem. Do not silently resurrect deleted
          // gems from the bundled source.
          if (configuredGems.length === 0) {
            return jsonResponse(
              { error: "no_gems_available", message: "No enabled gems are currently available." },
              { status: 503 }
            );
          }

          const dailyAvailable = (entry: any) => {
            if (!["daily", "date_range_daily"].includes(String(entry.availability_mode))) return true;
            if (!entry.daily_start_time || !entry.daily_end_time) return false;
            try {
              const parts = new Intl.DateTimeFormat("en-GB", { timeZone: String(entry.availability_timezone || "Asia/Singapore"), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
              const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
              const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
              const parse = (value: string) => { const [h, m] = String(value).split(":").map(Number); return h * 60 + m; };
              const current = hour * 60 + minute, start = parse(entry.daily_start_time), end = parse(entry.daily_end_time);
              return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
            } catch { return false; }
          };
          gems = configuredGems.filter(dailyAvailable).map((entry: any) => ({
            name: String(entry.name),
            rarity: Number(entry.rarity),
            baseWeight: Number(entry.base_weight),
            valuePerGram: Number(entry.value_per_gram),
            affectedByLuck: entry.affected_by_luck !== false,
            timeWindow: ["daily", "date_range_daily"].includes(String(entry.availability_mode))
          }));
        } else if (configuredGemError && configuredGemError.code !== "42P01") {
          console.error("Configured gem catalog load failed; using bundled catalog:", configuredGemError);
        }
      } catch (catalogError) {
        console.error("Configured gem catalog unavailable; using bundled catalog:", catalogError);
      }

      // =====================================================
      // GENERATE ROLL
      // =====================================================

      const geologistMultiplier = enchantId === "geologist"
        ? strengthenEnchantMultiplier(1.5)
        : 1;
      const extremeGemMultiplier = (hasEventHorizon ? 1.1 : 1) *
        (masterworkPickaxe === "deep_survey" ? (masterworkPickaxeRank >= 2 ? 1.08 : 1.05) : 1) *
        researchNumber("extreme_luck_multiplier");
      const legendaryGemMultiplier = researchNumber("legendary_luck_multiplier");
      const timeWindowMultiplier = researchNumber("window_luck_multiplier");
      if (researchEffects.statistical_breakthrough === true && (Number(player.total_rolls ?? 0) + 1) % 250 === 0) {
        luck *= 1.2;
      }
      const resonanceBeforeRoll = Math.min(100, Math.max(0, Number(player.rarity_resonance ?? 0)));
      const resonanceEmpowered = hasRarityResonance && resonanceBeforeRoll >= 100;
      if (resonanceEmpowered) luck *= 3;
      const announcedLuck = Number.isFinite(adminLuckFactor) && adminLuckFactor > 0
        ? luck / adminLuckFactor
        : luck;
      const rollEquipmentGem = () =>
        geologistMultiplier !== 1 || extremeGemMultiplier !== 1 || legendaryGemMultiplier !== 1 || timeWindowMultiplier !== 1
          ? rollGemWithPickaxePassives(
              luck,
              discoveredGemNames,
              geologistMultiplier,
              extremeGemMultiplier,
              legendaryGemMultiplier,
              timeWindowMultiplier
            )
          : rollGem(luck);

      let gem = rollRelic() ?? rollEquipmentGem();
      const relicDrop = isRelic(gem);
      const luckBasedGem = !relicDrop && gem.affectedByLuck !== false;

      // Lucky Break keeps the rarer result.
      if (
        !relicDrop && enchantId === "lucky_break" &&
        random01() < (enchantGrade === "ancient" ? 0.10 : 0.05)
      ) {
        const candidate = rollEquipmentGem();
        if (candidate.rarity > gem.rarity) gem = candidate;
      }

      if (
        !relicDrop && enchantId === "prospectors_instinct" &&
        gem.rarity >= (enchantGrade === "ancient" ? 10000 : 5000)
      ) {
        enchantState.remaining = enchantGrade === "ancient" ? 6 : 4;
        enchantStateChanged = true;
      }

      if (enchantId === "vein_hunter") {
        enchantState.misses = gem.rarity >= 10000
          ? 0
          : Math.min(30, Number(enchantState.misses ?? 0) + 1);
        enchantStateChanged = true;
      }

      if (enchantId === "blitz_vein") {
        if (!relicDrop && gem.rarity >= 30000) {
          enchantState.stacks = 0;
          enchantState.rolls = 0;
        } else {
          const interval = enchantGrade === "ancient" ? 10 : 20;
          const rolls = Number(enchantState.rolls ?? 0) + 1;
          if (rolls >= interval) {
            enchantState.stacks = Math.min(10, Number(enchantState.stacks ?? 0) + 1);
            enchantState.rolls = 0;
          } else enchantState.rolls = rolls;
        }
        enchantStateChanged = true;
      }

      if (enchantId === "slow_starter" && enchantGrade === "ancient") {
        const rolls = Number(enchantState.rolls ?? 0) + 1;
        enchantState.rolls = (!relicDrop && gem.rarity >= 10000) || rolls >= 100 ? 0 : rolls;
        enchantStateChanged = true;
      }


      let surgeProgress = Math.min(99, Math.max(0, Number(player.gravitational_surge_progress ?? 0)));
      let surgeReady = player.gravitational_surge_ready === true;
      if (hasGravitationalSurge && !surgeReady) {
        surgeProgress += 1;
        if (surgeProgress >= 100) {
          surgeProgress = 0;
          surgeReady = true;
        }
      }

      let rolledWeightMultiplier = rollWeightMultiplier(
        weightLuck,
        surgeReady && hasGravitationalSurge ? 2 / 3 : 1 / 3,
        surgeReady && hasGravitationalSurge ? 10 : null
      );
      if (hasGravitationalSurge && surgeReady && rolledWeightMultiplier >= 2) {
        surgeReady = false;
      }
      if (hasHeavyFooting && rolledWeightMultiplier >= 2 && random01() < 0.15) {
        rolledWeightMultiplier += 1;
      }

      let compressionProgress = Math.min(49, Math.max(0, Number(player.bag_compression_progress ?? 0)));
      let compressionRoll = false;
      if (equippedBag?.equipment_id === "singularity-vault") {
        compressionProgress += 1;
        if (compressionProgress >= 50) {
          compressionProgress = 0;
          compressionRoll = true;
        }
      }


      const rolledWeight =
        gem.baseWeight *
        rolledWeightMultiplier;


      let masterworkWeightFactor = 1;
      if (masterworkPickaxe === "steady_hand") masterworkWeightFactor *= masterworkPickaxeRank >= 2 ? 1.05 : 1.03;
      if (masterworkBoots === "sure_footing") masterworkWeightFactor *= masterworkBootsRank >= 2 ? 1.05 : 1.03;
      if (gem.rarity >= 100000 && masterworkPickaxe === "careful_extraction") masterworkWeightFactor *= masterworkPickaxeRank >= 2 ? 1.15 : 1.10;
      if (gem.rarity >= 100000 && masterworkBoots === "heavy_step") masterworkWeightFactor *= masterworkBootsRank >= 2 ? 1.12 : 1.08;
      if (!discoveredGemNames.has(gem.name) && masterworkBoots === "trailblazer") masterworkWeightFactor *= masterworkBootsRank >= 2 ? 1.25 : 1.15;

      const bagPassiveWeightFactor = getLateGameFinalWeightFactor(
        equippedBag?.equipment_id ?? null,
        rolledWeightMultiplier,
        Number(gem.rarity),
        compressionRoll
      );

      const finalWeight =
        rolledWeight *
        weightMultiplier *
        masterworkWeightFactor *
        bagPassiveWeightFactor;


      // Load the admin-managed mutation catalog when available. The bundled
      // definitions remain the safe fallback for older deployments.
      try {
        const { data: configuredMutations, error: mutationCatalogError } =
          await ctx.supabaseAdmin
            .from("game_mutations")
            .select("id,name,chance,multiplier,description,icon,color")
            .eq("enabled", true)
            .order("sort_order")
            .order("name");

        if (!mutationCatalogError && configuredMutations?.length) {
          gemMutations = configuredMutations.map((mutation: any) => ({
            id: String(mutation.id),
            name: String(mutation.name),
            chance: Math.min(1, 1 / Math.max(0.000001, Number(mutation.chance))),
            multiplier: Math.max(0.000001, Number(mutation.multiplier)),
            description: String(mutation.description ?? ""),
            icon: String(mutation.icon ?? "✦"),
            color: String(mutation.color ?? "#9fdcff")
          }));
        }
      } catch (mutationCatalogError) {
        console.warn("Mutation catalog unavailable; using bundled definitions:", mutationCatalogError);
      }

      // Mutation odds are independent, so one roll can have any
      // combination of the five mutations (32 combinations). The
      // multiplier is the higher of the legacy hardcoded boost and the
      // player's admin-granted mutation_luck column (default 1).
      let mutationChanceMultiplier =
        Math.max(
          getMutationChanceMultiplier(playerId),
          Number(player.mutation_luck ?? 1) || 1
        );

      if (hasMutationResonance) mutationChanceMultiplier *= 1.1;
      if (mineArtifacts.has("black-geode")) mutationChanceMultiplier *= 1.05;
      if (masterworkPickaxe === "mutation_resonance") mutationChanceMultiplier *= masterworkPickaxeRank >= 2 ? 1.08 : 1.05;
      mutationChanceMultiplier *= researchNumber("mutation_chance_multiplier");
      mutationChanceMultiplier *= crystalMutationMultiplier;
      mutationChanceMultiplier *= expeditionArtifactMutationMultiplier;

      // Global admin mutation-luck events apply after personal mutation luck
      // and all permanent equipment passives.
      if (activeAdminEvent) {
        const mutationBonus = Number(activeAdminEvent.mutation_luck_bonus ?? 0);
        const mutationEventMultiplier = Number(activeAdminEvent.mutation_luck_multiplier ?? 1);
        if (Number.isFinite(mutationBonus)) mutationChanceMultiplier += Math.max(0, mutationBonus);
        if (Number.isFinite(mutationEventMultiplier) && mutationEventMultiplier > 0) {
          mutationChanceMultiplier *= mutationEventMultiplier;
        }
      }

      const mutations = relicDrop
        ? []
        : rollGemMutations(mutationChanceMultiplier);

      const mutationMultiplier =
        mutations.reduce(
          (total, mutation) =>
            total * mutation.multiplier,
          1
        );

      // Effective rarity uses mutation odds, not their specimen-value boosts.
      // Every mutation is independent, so their chance denominators multiply.
      const mutationChanceProduct = mutations.reduce(
        (total, mutation) => total * Math.max(1, 1 / Number(mutation.chance || 1)),
        1
      );
      const effectiveRarity = Math.max(1, Number(gem.rarity) * mutationChanceProduct);

      const primaryMutation =
        mutations[0] ?? null;

      const mutationIds =
        mutations.map((mutation) => mutation.id);

      const mutationMultipliers =
        Object.fromEntries(
          mutations.map((mutation) => [
            mutation.id,
            mutation.multiplier
          ])
        );


      const researchMutationValue = mutations.length
        ? researchNumber("mutated_value_multiplier") * (1 + Math.min(5, mutations.length) * Math.max(0, Number(researchEffects.compound_value_per_mutation ?? 0)))
        : 1;
      const value =
        finalWeight *
        gem.valuePerGram *
        mutationMultiplier *
        researchNumber("gem_value_multiplier") *
        researchMutationValue *
        crystalGemValueMultiplier *
        expeditionArtifactGemValueMultiplier *
        (rolledWeightMultiplier >= 2 ? crystalHeavyGemValueMultiplier : 1) *
        (mineArtifacts.has("bedrock-crown") ? 1.05 : 1);


      const specimen = {
        gem_name:
          gem.name,

        base_weight:
          gem.baseWeight,

        rarity:
          gem.rarity,

        rolled_weight_multiplier:
          rolledWeightMultiplier,

        final_weight:
          finalWeight,

        mutation_id:
          primaryMutation?.id ?? null,

        mutation_multiplier:
          mutationMultiplier,

        mutation_ids:
          mutationIds,

        mutation_multipliers:
          mutationMultipliers,

        value
      };


      // =====================================================
      // TRY SERVER AUTO CRAFT
      // =====================================================

      let autoDeposited =
        false;

      let autoCraftRecipeId =
        null;

      let autoCraftRequirementIndex =
        null;


      const {
        data:
          playerCrafting,
        error:
          playerCraftingError
      } =
        await ctx.supabase
          .from(
            "player_crafting"
          )
          .select(
            "active_auto_craft"
          )
          .maybeSingle();


      if (
        playerCraftingError
      ) {
        console.error(
          "Failed to load Auto Craft state:",
          playerCraftingError
        );
      }


      const activeRecipeId =
        playerCrafting
          ?.active_auto_craft ??
        null;


      if (
        activeRecipeId
      ) {
        const {
          data:
            recipeRow,
          error:
            recipeError
        } =
          await ctx.supabaseAdmin
            .from(
              "game_recipes"
            )
            .select(
              "recipe"
            )
            .eq(
              "id",
              activeRecipeId
            )
            .maybeSingle();


        if (
          recipeError
        ) {
          console.error(
            "Auto Craft recipe load failed:",
            recipeError
          );
        }


        if (
          recipeRow?.recipe
        ) {
          const recipe =
            recipeRow.recipe;


          const {
            data:
              progressRow,
            error:
              progressError
          } =
            await ctx.supabase
              .from(
                "crafting_progress"
              )
              .select(
                "progress"
              )
              .eq(
                "recipe_id",
                activeRecipeId
              )
              .maybeSingle();


          if (
            progressError
          ) {
            console.error(
              "Auto Craft progress load failed:",
              progressError
            );
          } else {
            const databaseProgress =
              progressRow
                ?.progress ??
              {};


            const expectedProgress =
              structuredClone(
                databaseProgress
              );


            const workingProgress =
              structuredClone(
                databaseProgress
              );


            for (
              let index = 0;
              index <
                recipe
                  .requirements
                  .length;
              index++
            ) {
              const requirement =
                recipe
                  .requirements[
                    index
                  ];


              if (
                requirement.type ===
                "equipment"
              ) {
                continue;
              }


              if (
                isCraftingRequirementComplete(
                  workingProgress,
                  requirement,
                  index
                )
              ) {
                continue;
              }


              // =============================================
              // SPECIMEN MATCHING
              // =============================================

              if (
                requirement.type ===
                "gem-range"
              ) {
                if (
                  !requirement.gems.includes(
                    specimen.gem_name
                  )
                ) {
                  continue;
                }
              } else if (
                requirement.type !==
                  "specimen-value-total" &&
                requirement.type !==
                  "rarity-points" &&
                !specimenMatches(
                  requirement,
                  specimen
                )
              ) {
                continue;
              }


              const testProgress =
                structuredClone(
                  workingProgress
                );


              const deposited =
                depositIntoProgress(
                  testProgress,
                  requirement,
                  index,
                  specimen
                );


              if (
                !deposited
              ) {
                continue;
              }


              const {
                error:
                  autoDepositError
              } =
                await ctx
                  .supabaseAdmin
                  .rpc(
                    "apply_autocraft_progress",
                    {
                      p_player_id:
                        playerId,

                      p_recipe_id:
                        activeRecipeId,

                      p_expected_progress:
                        expectedProgress,

                      p_new_progress:
                        testProgress
                    }
                  );


              if (
                autoDepositError
              ) {
                console.error(
                  "Auto Craft deposit failed:",
                  autoDepositError
                );

                break;
              }


              autoDeposited =
                true;

              autoCraftRecipeId =
                activeRecipeId;

              autoCraftRequirementIndex =
                index;


              break;
            }
          }
        }
      }


      // =====================================================
      // SAVE TO INVENTORY IF NOT AUTO-DEPOSITED
      // =====================================================

      let savedGem =
        null;

      let veinHunterDuplicate = null;


      if (
        !autoDeposited
      ) {
        const {
          data:
            insertedGem,
          error:
            saveGemError
        } =
          await ctx
            .supabaseAdmin
            .from(
              "inventory_gems"
            )
            .insert({
              player_id:
                playerId,

              gem_name:
                gem.name,

              rarity:
                gem.rarity,

              base_weight:
                gem.baseWeight,

              value_per_gram:
                gem.valuePerGram,

              rolled_weight_multiplier:
                rolledWeightMultiplier,

              rolled_weight:
                rolledWeight,

              final_weight:
                finalWeight,

              mutation_id:
                primaryMutation?.id ?? null,

              mutation_multiplier:
                mutationMultiplier,

              mutation_ids:
                mutationIds,

              mutation_multipliers:
                mutationMultipliers,

              mutation_chance_multiplier:
                mutationChanceMultiplier,

              value,

              locked:
                false,

              roll_number:
                Number(
                  player.total_rolls ??
                  0
                ) +
                1,

              luck_at_roll:
                luck
            })
            .select()
            .single();


        if (
          saveGemError ||
          !insertedGem
        ) {
          console.error(
            "Failed to save rolled gem:",
            saveGemError
          );


          return jsonResponse(
            {
              error:
                "Failed to save rolled gem."
            },
            {
              status: 500
            }
          );
        }


        savedGem =
          insertedGem;
      }

      // Vein Hunter creates a true second specimen: only the base gem is
      // copied. Weight and every mutation are rolled again independently.
      // The bonus specimen does not count as another lifetime roll.
      const primaryOccupiesSlot = !autoDeposited && !relicDrop;
      const hasDuplicateCapacity = currentInventoryCount + (primaryOccupiesSlot ? 1 : 0) < effectiveInventoryCapacity;
      if (
        hasVeinHunter &&
        luckBasedGem &&
        gem.rarity >= 10000 &&
        gem.rarity <= 1000000 &&
        random01() < 0.05 &&
        hasDuplicateCapacity
      ) {
        let duplicateWeightMultiplier = rollWeightMultiplier(
          weightLuck,
          surgeReady && hasGravitationalSurge ? 2 / 3 : 1 / 3,
          surgeReady && hasGravitationalSurge ? 10 : null
        );
        if (hasGravitationalSurge && surgeReady && duplicateWeightMultiplier >= 2) {
          surgeReady = false;
        }
        if (hasHeavyFooting && duplicateWeightMultiplier >= 2 && random01() < 0.15) {
          duplicateWeightMultiplier += 1;
        }
        const duplicateRolledWeight = gem.baseWeight * duplicateWeightMultiplier;
        const duplicateBagPassiveFactor = getLateGameFinalWeightFactor(
          equippedBag?.equipment_id ?? null,
          duplicateWeightMultiplier,
          Number(gem.rarity),
          compressionRoll
        );
        const duplicateFinalWeight = duplicateRolledWeight * weightMultiplier * masterworkWeightFactor * duplicateBagPassiveFactor;
        const duplicateMutations = rollGemMutations(mutationChanceMultiplier);
        const duplicateMutationMultiplier = duplicateMutations.reduce(
          (total, mutation) => total * mutation.multiplier,
          1
        );
        const duplicateMutationIds = duplicateMutations.map((mutation) => mutation.id);
        const duplicateMutationMultipliers = Object.fromEntries(
          duplicateMutations.map((mutation) => [mutation.id, mutation.multiplier])
        );
        const duplicateResearchMutationValue = duplicateMutations.length
          ? researchNumber("mutated_value_multiplier") * (1 + Math.min(5, duplicateMutations.length) * Math.max(0, Number(researchEffects.compound_value_per_mutation ?? 0)))
          : 1;
        const duplicateValue = duplicateFinalWeight * gem.valuePerGram * duplicateMutationMultiplier *
          researchNumber("gem_value_multiplier") * duplicateResearchMutationValue *
          (mineArtifacts.has("bedrock-crown") ? 1.05 : 1);

        const { data: duplicateGem, error: duplicateError } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .insert({
            player_id: playerId,
            gem_name: gem.name,
            rarity: gem.rarity,
            base_weight: gem.baseWeight,
            value_per_gram: gem.valuePerGram,
            rolled_weight_multiplier: duplicateWeightMultiplier,
            rolled_weight: duplicateRolledWeight,
            final_weight: duplicateFinalWeight,
            mutation_id: duplicateMutations[0]?.id ?? null,
            mutation_multiplier: duplicateMutationMultiplier,
            mutation_ids: duplicateMutationIds,
            mutation_multipliers: duplicateMutationMultipliers,
            mutation_chance_multiplier: mutationChanceMultiplier,
            value: duplicateValue,
            locked: false,
            roll_number: Number(player.total_rolls ?? 0) + 1,
            luck_at_roll: luck
          })
          .select()
          .single();

        if (duplicateError) {
          console.error("Vein Hunter duplicate insert failed:", duplicateError);
        } else {
          veinHunterDuplicate = duplicateGem;
        }
      }

      if (hasRarityResonance && luckBasedGem) {
        // A 1/100,000+ result never changes the meter, including while it is
        // charged. The charge is consumed only by an eligible common result.
        const rarityResonance = gem.rarity >= 100000
          ? resonanceBeforeRoll
          : resonanceEmpowered
            ? 0
            : Math.min(100, resonanceBeforeRoll + 1);
        const { error: resonanceError } = await ctx.supabaseAdmin
          .from("players")
          .update({ rarity_resonance: rarityResonance })
          .eq("id", playerId);
        if (resonanceError) console.error("Rarity Resonance persistence failed:", resonanceError);
      }

      const progressionStateUpdate: Record<string, unknown> = {};
      if (hasGravitationalSurge) {
        progressionStateUpdate.gravitational_surge_progress = surgeProgress;
        progressionStateUpdate.gravitational_surge_ready = surgeReady;
      }
      if (equippedBag?.equipment_id === "singularity-vault") {
        progressionStateUpdate.bag_compression_progress = compressionProgress;
      }
      if (!relicDrop && gem.rarity >= 100000) {
        progressionStateUpdate.best_rare_natural_weight_100k = Math.max(
          Number(player.best_rare_natural_weight_100k ?? 0),
          rolledWeightMultiplier,
          Number(veinHunterDuplicate?.rolled_weight_multiplier ?? 0)
        );
      }
      if (!relicDrop && gem.rarity >= 1000000) {
        progressionStateUpdate.best_rare_natural_weight_1m = Math.max(
          Number(player.best_rare_natural_weight_1m ?? 0),
          rolledWeightMultiplier,
          Number(veinHunterDuplicate?.rolled_weight_multiplier ?? 0)
        );
      }
      if (Object.keys(progressionStateUpdate).length) {
        const { error: progressionStateError } = await ctx.supabaseAdmin
          .from("players")
          .update(progressionStateUpdate)
          .eq("id", playerId);
        if (progressionStateError) {
          console.error("Late-game equipment state persistence failed:", progressionStateError);
        }
      }

      // Run independent post-commit systems concurrently. The specimen is
      // already committed, but we still await every task before responding so
      // achievements, stats, indexes, and returned summary data stay current.
      const enchantStatePromise = (async () => {
        if (!enchantedPickaxe || !enchantStateChanged) return;
        const { error } = await ctx.supabaseAdmin
          .from("player_equipment")
          .update({ enchant_state: enchantState })
          .eq("id", enchantedPickaxe.id)
          .eq("player_id", playerId);
        if (error) console.error("Failed to save enchant state:", error);
      })();

      const bestRollHistoryPromise = (async () => {
        const { error } = await ctx.supabaseAdmin.rpc("record_roll_leaderboard_entry", {
          p_player_id: playerId,
          p_username: player.username ?? playerId,
          p_gem_name: gem.name,
          p_rarity: relicDrop ? 0 : gem.rarity,
          p_final_weight: finalWeight,
          p_value: value,
          p_mutation_id: primaryMutation?.id ?? null,
          p_mutation_ids: mutationIds,
          p_mutation_multiplier: mutationMultiplier,
          p_raw_luck: luck,
          p_base_luck: baseLuck,
          p_roll_number: Number(player.total_rolls ?? 0) + 1
        });
        if (error) console.error("Best Roll history update failed:", error);
      })();

      const weightHistoryPromise = (async () => {
        const { error } = await ctx.supabaseAdmin.from("roll_weight_history").insert({
          player_id: playerId,
          username: player.username ?? playerId,
          gem_name: gem.name,
          final_weight: finalWeight,
          base_rarity: gem.rarity,
          mutation_ids: mutationIds
        });
        if (error) console.error("Roll weight history update failed:", error);
      })();

      const progressionPromise = (async () => {
        try {
          const usedOneRollConsumable = String(oneRollBoost?.consumable_id ?? "");
          await processProgressEvent(ctx.supabaseAdmin, playerId, "roll", {
            gemName: gem.name,
            gemRarity: gem.rarity,
            finalWeight,
            value,
            mutationIds,
            mutationMultiplier,
            mutationChanceMultiplier,
            rawLuck: luck,
            baseLuck,
            usedOneRollPotion: Boolean(oneRollLuck > 0),
            usedLegendaryPotion: usedOneRollConsumable === "legendary-potion",
            usedMythicPotion: usedOneRollConsumable === "mythic-potion",
            usedAnyPotion: Boolean(oneRollLuck > 0)
          }, Number(player.total_rolls ?? 0) + 1);
        } catch (error) {
          console.error("Private feature progression update failed:", error);
        }
      })();

      const consumeBoostPromise = (async () => {
        if (oneRollLuck <= 0) return;
        const { data: remainingOneRollCharges, error } = await ctx.supabaseAdmin.rpc(
          "spend_one_roll_charge",
          { p_player_id: playerId }
        );
        if (error) console.error("Failed to consume one-roll boost:", error);
        else if (Number(remainingOneRollCharges ?? 0) > 0) {
          console.log("One-roll potion charge spent:", {
            playerId,
            remainingCharges: Number(remainingOneRollCharges)
          });
        }
      })();

      const lifetimeStatsPromise = (async () => {
        const { data, error } = await ctx.supabaseAdmin.rpc("record_server_roll", {
          p_player_id: playerId,
          p_gem_name: gem.name,
          p_gem_rarity: relicDrop ? 0 : gem.rarity,
          p_final_weight: finalWeight
        });
        if (error) console.error("Lifetime stats update failed:", error);
        return data ?? null;
      })();

      const boostTiers = Object.fromEntries(
        (activeBoosts ?? []).map((boost) => [boost.family, Number(boost.tier ?? 0)])
      );
      const expeditionPromise = (async () => {
        const { error } = await ctx.supabaseAdmin.rpc("record_abandoned_mine_roll", {
          p_player_id: playerId,
          p_payload: {
            gemName: relicDrop ? null : gem.name,
            rarity: relicDrop ? 0 : gem.rarity,
            weightMultiplier: relicDrop ? 0 : rolledWeightMultiplier,
            finalWeight: relicDrop ? 0 : finalWeight,
            displayedValue: relicDrop ? 0 : value,
            mutationIds: relicDrop ? [] : mutationIds,
            boostFamilies: (activeBoosts ?? []).map((boost) => boost.family),
            boostTiers,
            relicName: relicDrop ? gem.name : null
          }
        });
        if (error) console.error("Expedition progress update failed:", error);
      })();

      const seasonPromise = (async () => {
        const { error } = await ctx.supabaseAdmin.rpc("record_season_roll", {
          p_player_id: playerId,
          p_rarity: relicDrop ? 0 : gem.rarity,
          p_effective_rarity: relicDrop ? 0 : effectiveRarity,
          p_mutation_count: relicDrop ? 0 : mutationIds.length,
          p_relic: relicDrop
        });
        if (error && !String(error.message ?? "").includes("does not exist")) {
          console.error("Season progress update failed:", error);
        }
      })();

      const combinationKey = getMutationCombinationKey(mutationIds);
      const mutationCombinationPromise = (async () => {
        if (relicDrop) return null;
        const { data, error } = await ctx.supabaseAdmin.rpc("record_gem_mutation_combination", {
          p_player_id: playerId,
          p_gem_name: gem.name,
          p_combination_key: combinationKey,
          p_mutation_ids: mutationIds,
          p_mutation_multipliers: mutationMultipliers,
          p_value: value
        });
        if (error) console.error("Mutation combination index update failed:", error);
        return data ?? null;
      })();

      const mutationOnlyAnnouncementPromise = (async () => {
        if (relicDrop || Number(gem.rarity) >= 1_000_000 || effectiveRarity < 10_000_000) return;
        const payload = {
          player_id: playerId,
          gem_name: gem.name,
          rarity: gem.rarity,
          effective_rarity: effectiveRarity,
          mutation_ids: mutationIds,
          luck_at_roll: announcedLuck
        };
        let { error } = await ctx.supabaseAdmin.from("global_chat_announcements").insert(payload);
        if (error && /effective_rarity|column .* does not exist|schema cache/i.test(String(error.message ?? ""))) {
          ({ error } = await ctx.supabaseAdmin.from("global_chat_announcements").insert({
            player_id: playerId,
            gem_name: gem.name,
            rarity: gem.rarity,
            mutation_ids: mutationIds,
            luck_at_roll: announcedLuck
          }));
        }
        if (error) console.error("Mutation-only rare announcement insert failed:", error);
      })();

      const announcementMutationPromise = (async () => {
        // record_server_roll creates base-rarity announcements, so wait only
        // for that dependency while the other post-commit tasks continue.
        await lifetimeStatsPromise;
        try {
          const { data: announcementId, error } = await ctx.supabaseAdmin.rpc(
            "attach_roll_announcement_mutations",
            {
              p_player_id: playerId,
              p_gem_name: gem.name,
              p_gem_rarity: gem.rarity,
              p_mutation_ids: mutationIds,
              p_luck_at_roll: announcedLuck,
              p_effective_rarity: effectiveRarity
            }
          );
          if (error) throw error;
          if (!announcementId) {
            console.warn("No rare-roll announcement needed/found while attaching mutations:", {
              playerId, gem: gem.name, rarity: gem.rarity, mutationIds
            });
          }
        } catch (error) {
          console.error("Could not attach mutations to chat announcement:", error);
        }
      })();

      const guildPromise = (async () => {
        try {
          const { data, error } = await ctx.supabaseAdmin.rpc("record_guild_roll_activity", {
            p_player_id: playerId,
            p_rarity: relicDrop ? 0 : Number(gem.rarity),
            p_rarity_tier: "",
            p_effective_rarity: relicDrop ? 0 : effectiveRarity,
            p_weight_multiplier: relicDrop ? 0 : rolledWeightMultiplier,
            p_final_weight: relicDrop ? 0 : finalWeight,
            p_value: relicDrop ? 0 : value,
            p_mutated: !relicDrop && mutationIds.length > 0,
            p_is_relic: relicDrop
          });
          if (error) console.error("Guild roll activity update failed:", error);
          return data ?? null;
        } catch (error) {
          console.error("Guild roll activity update crashed:", error);
          return null;
        }
      })();

      const [
        , , , , ,
        lifetimeStats,
        , ,
        mutationCombination,
        , ,
        guildPoints
      ] = await Promise.all([
        enchantStatePromise,
        bestRollHistoryPromise,
        weightHistoryPromise,
        progressionPromise,
        consumeBoostPromise,
        lifetimeStatsPromise,
        expeditionPromise,
        seasonPromise,
        mutationCombinationPromise,
        mutationOnlyAnnouncementPromise,
        announcementMutationPromise,
        guildPromise
      ]);


      // =====================================================
      // FINAL INVENTORY COUNT
      // =====================================================

      const finalInventoryCount =
        autoDeposited || relicDrop
          ? currentInventoryCount
          : currentInventoryCount +
            1;
      const inventoryCountWithDuplicate = finalInventoryCount + (veinHunterDuplicate ? 1 : 0);

      // Release only the lease owned by this invocation. If this best-effort
      // cleanup fails, the short database expiry safely unlocks the account;
      // a stale request can never clear a newer request's lease token.
      const { error: releaseRollLeaseError } = await ctx.supabaseAdmin.rpc(
        "release_server_roll",
        {
          p_player_id: playerId,
          p_lease_id: rollLeaseId
        }
      );
      if (releaseRollLeaseError) {
        console.error("Roll lease release failed:", releaseRollLeaseError);
      }


      // =====================================================
      // RETURN SUCCESSFUL ROLL
      // =====================================================

      return jsonResponse({
        playerId,

        specimenId:
          savedGem?.id ??
          null,

        gem: {
          name:
            gem.name,

          rarity:
            gem.rarity,

          baseWeight:
            gem.baseWeight,

          valuePerGram:
            gem.valuePerGram,

          dropType:
            relicDrop ? "relic" : "gem"
        },

        enchant: enchantedPickaxe ? {
          id: enchantId,
          grade: enchantGrade,
          state: enchantState
        } : null,

        weightMultiplier:
          rolledWeightMultiplier,

        rolledWeight,

        finalWeight,

        mutation:
          primaryMutation
            ? {
                id: primaryMutation.id,
                name: primaryMutation.name,
                multiplier: primaryMutation.multiplier
              }
            : null,

        mutations:
          mutations.map((mutation) => ({
            id: mutation.id,
            name: mutation.name,
            multiplier: mutation.multiplier,
            chance: Math.max(1, 1 / Number(mutation.chance || 1))
          })),

        mutationIds,

        mutationMultiplier,

        effectiveRarity,

        // Exact effective luck used for this server-authoritative roll.
        luckAtRoll: luck,

        mutationCombination: {
          key: combinationKey,
          record: mutationCombination ?? null
        },

        value,

        equipmentPassives: {
          veinHunterDuplicate,
          rarityResonance: hasRarityResonance ? {
            before: resonanceBeforeRoll,
            after: luckBasedGem ? (gem.rarity >= 100000 ? resonanceBeforeRoll : resonanceEmpowered ? 0 : Math.min(100, resonanceBeforeRoll + 1)) : resonanceBeforeRoll,
            empowered: resonanceEmpowered && luckBasedGem,
            consumed: resonanceEmpowered && luckBasedGem && gem.rarity < 100000
          } : null
        },

        autoCraft: {
          deposited:
            autoDeposited,

          recipeId:
            autoCraftRecipeId,

          requirementIndex:
            autoCraftRequirementIndex
        },

        lifetimeStats:
          lifetimeStats ??
          null,

        guild: {
          rollPoints: guildPoints,
          mythicSurge
        },

        inventory: {
          count:
            inventoryCountWithDuplicate,

          capacity:
            effectiveInventoryCapacity
        },

        cooldown: {
          durationMs:
            cooldownMs,

          nextRollAt:
            claimedNextRollAt
              .toISOString()
        }
      });
    }
  )
};
