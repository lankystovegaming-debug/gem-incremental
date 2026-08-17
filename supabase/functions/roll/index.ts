import {
  withSupabase
} from "npm:@supabase/server";


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

const gems = [
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
    valuePerGram: 2.05735
  },

  {
    name: "Ruby",
    rarity: 1400,
    baseWeight: 500,
    valuePerGram: 2.53
  },

  {
    name: "Emerald",
    rarity: 1800,
    baseWeight: 525,
    valuePerGram: 3.06705
  },

  {
    name: "Diamond",
    rarity: 2300,
    baseWeight: 550,
    valuePerGram: 3.8686
  },

  {
    name: "Tanzanite",
    rarity: 2900,
    baseWeight: 575,
    valuePerGram: 4.09975
  },

  {
    name: "Alexandrite",
    rarity: 3600,
    baseWeight: 600,
    valuePerGram: 5.07955
  },

  {
    name: "Benitoite",
    rarity: 4400,
    baseWeight: 625,
    valuePerGram: 5.52
  },

  {
    name: "Red Beryl",
    rarity: 5300,
    baseWeight: 650,
    valuePerGram: 6.3687
  },

  {
    name: "Black Opal",
    rarity: 6300,
    baseWeight: 675,
    valuePerGram: 7.3255
  },

  {
    name: "Grandidierite",
    rarity: 7400,
    baseWeight: 700,
    valuePerGram: 7.88555
  },

  {
    name: "Taaffeite",
    rarity: 8500,
    baseWeight: 725,
    valuePerGram: 8.7239
  },

  {
    name: "Musgravite",
    rarity: 9300,
    baseWeight: 750,
    valuePerGram: 9.2
  },

  {
    name: "Painite",
    rarity: 10000,
    baseWeight: 800,
    valuePerGram: 9.34375
  },

  {
    name: "Dark Matter",
    rarity: 1000000,
    baseWeight: 2500,
    valuePerGram: 200
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
    valuePerGram: 7.6
  },

  {
    name: "Jeremejevite",
    rarity: 14000,
    baseWeight: 850,
    valuePerGram: 12
  },

  {
    name: "Poudretteite",
    rarity: 22000,
    baseWeight: 925,
    valuePerGram: 16
  },

  {
    name: "Serendibite",
    rarity: 35000,
    baseWeight: 1000,
    valuePerGram: 22
  },

  {
    name: "Blue Garnet",
    rarity: 55000,
    baseWeight: 1100,
    valuePerGram: 30
  },

  {
    name: "Kyawthuite",
    rarity: 85000,
    baseWeight: 1200,
    valuePerGram: 42
  },

  {
    name: "Aether Quartz",
    rarity: 140000,
    baseWeight: 1350,
    valuePerGram: 54
  },

  {
    name: "Void Opal",
    rarity: 250000,
    baseWeight: 1550,
    valuePerGram: 76.5
  },

  {
    name: "Chronite",
    rarity: 480000,
    baseWeight: 1800,
    valuePerGram: 112.5
  },

  {
    name: "Neutron Crystal",
    rarity: 800000,
    baseWeight: 2200,
    valuePerGram: 157.5
  },

  {
    name: "Antimatter Crystal",
    rarity: 1800000,
    baseWeight: 2900,
    valuePerGram: 270
  },

  {
    name: "Singularity Shard",
    rarity: 4000000,
    baseWeight: 3600,
    valuePerGram: 472.5
  },

  {
    name: "Lanky Gem",
    rarity: 10000000,
    baseWeight: 40500,
    valuePerGram: 111.1111
  }
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
          gem.rarity >=
          rarityFloor
      )
      .sort(
        (a, b) =>
          b.rarity -
          a.rarity
      );

  const fallbackGem =
    rollableGems[
      rollableGems.length - 1
    ];


  for (
    const gem
    of rollableGems
  ) {
    const chance =
      Math.min(
        safeLuck /
        gem.rarity,
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


// =========================================================
// MUTATION RNG
// =========================================================

const gemMutations = [
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
  return playerId === MUTATION_LUCK_PLAYER_ID ? 10 : 1;
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

function rollWeightMultiplier(
  weightLuck = 1
) {
  const safeWeightLuck =
    Math.max(
      0,
      weightLuck
    );

  const baseHighChance =
    0.25;

  const highChance =
    Math.min(
      baseHighChance *
      safeWeightLuck,
      1
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


  while (
    random01() < 0.5
  ) {
    wholeMultiplier++;
  }


  return randomBetween(
    wholeMultiplier,
    wholeMultiplier + 1
  );
}


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
    specimen.rolled_weight_multiplier <
      requirement.minimumWeightMultiplier
  ) {
    return false;
  }


  if (
    requirement.maximumWeightMultiplier !=
      null &&
    specimen.rolled_weight_multiplier >
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
            next_roll_at,
            inventory_capacity,
            total_rolls,
            mutation_luck
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


      if (
        currentInventoryCount >=
        player.inventory_capacity
      ) {
        return jsonResponse(
          {
            error:
              "inventory_full",

            inventoryCount:
              currentInventoryCount,

            capacity:
              player.inventory_capacity
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
            luck_bonus,
            roll_speed_bonus,
            weight_luck_bonus,
            weight_multiplier_bonus
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
            "family, effect_value"
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
        const equipmentLuck =
          Number(
            equipment
              .luck_bonus ??
            0
          );

        luck +=
          equipmentLuck;

        rollSpeed +=
          Number(
            equipment
              .roll_speed_bonus ??
            0
          );

        weightLuck +=
          Number(
            equipment
              .weight_luck_bonus ??
            0
          );

        weightMultiplier +=
          Number(
            equipment
              .weight_multiplier_bonus ??
            0
          );
      }


      for (
        const boost
        of activeBoosts ??
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


      // =====================================================
      // CALCULATE + SAVE COOLDOWN
      // =====================================================

      const baseCooldownSeconds =
        2.5;


      const cooldownMs =
        (
          baseCooldownSeconds /
          rollSpeed
        ) *
        1000;


      const nextRollAt =
        new Date(
          now.getTime() +
          cooldownMs
        );


      const {
        error:
          cooldownError
      } =
        await ctx.supabaseAdmin
          .from(
            "players"
          )
          .update({
            next_roll_at:
              nextRollAt
                .toISOString()
          })
          .eq(
            "id",
            playerId
          );


      if (
        cooldownError
      ) {
        console.error(
          "Cooldown update failed:",
          cooldownError
        );


        return jsonResponse(
          {
            error:
              "Failed to update cooldown."
          },
          {
            status: 500
          }
        );
      }


      // =====================================================
      // GENERATE ROLL
      // =====================================================

      const gem =
        rollGem(
          luck
        );


      const rolledWeightMultiplier =
        rollWeightMultiplier(
          weightLuck
        );


      const rolledWeight =
        gem.baseWeight *
        rolledWeightMultiplier;


      const finalWeight =
        rolledWeight *
        weightMultiplier;


      // Mutation odds are independent, so one roll can have any
      // combination of the five mutations (32 combinations). The
      // multiplier is the higher of the legacy hardcoded boost and the
      // player's admin-granted mutation_luck column (default 1).
      const mutationChanceMultiplier =
        Math.max(
          getMutationChanceMultiplier(playerId),
          Number(player.mutation_luck ?? 1) || 1
        );

      const mutations =
        rollGemMutations(mutationChanceMultiplier);

      const mutationMultiplier =
        mutations.reduce(
          (total, mutation) =>
            total * mutation.multiplier,
          1
        );

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


      const value =
        finalWeight *
        gem.valuePerGram *
        mutationMultiplier;


      const specimen = {
        gem_name:
          gem.name,

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


      // =====================================================
      // LIFETIME STATS + GEM INDEX
      // =====================================================

      const {
        data:
          lifetimeStats,
        error:
          lifetimeStatsError
      } =
        await ctx
          .supabaseAdmin
          .rpc(
            "record_server_roll",
            {
              p_player_id:
                playerId,

              p_gem_name:
                gem.name,

              p_gem_rarity:
                gem.rarity,

              p_final_weight:
                finalWeight
            }
          );


      // IMPORTANT:
      // The actual roll has already been
      // successfully saved / auto-deposited
      // at this point.
      //
      // Therefore, if lifetime stats fail,
      // don't turn the whole roll into a 500
      // and encourage a duplicate reroll.
      if (
        lifetimeStatsError
      ) {
        console.error(
          "Lifetime stats update failed:",
          lifetimeStatsError
        );
      }


      // Record the COMPLETE mutation combination as one index entry.
      // "none" is also a real combination, so every roll records exactly
      // one combination: none, or any of the 31 non-empty subsets.
      const combinationKey =
        getMutationCombinationKey(mutationIds);

      const {
        data: mutationCombination,
        error: mutationCombinationError
      } = await ctx.supabaseAdmin.rpc(
        "record_gem_mutation_combination",
        {
          p_player_id: playerId,
          p_gem_name: gem.name,
          p_combination_key: combinationKey,
          p_mutation_ids: mutationIds,
          p_mutation_multipliers: mutationMultipliers,
          p_value: value
        }
      );

      if (mutationCombinationError) {
        console.error(
          "Mutation combination index update failed:",
          mutationCombinationError
        );
      }


      // Attach the complete mutation list to the rare-roll chat
      // announcement created by the server-side roll stats path.
      // This is best-effort: chat failure must never invalidate a roll.
      try {
        const {
          data: announcement
        } = await ctx.supabaseAdmin
          .from("global_chat_announcements")
          .select("id")
          .eq("player_id", playerId)
          .eq("gem_name", gem.name)
          .eq("rarity", gem.rarity)
          .gte("created_at", now.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (announcement?.id) {
          await ctx.supabaseAdmin
            .from("global_chat_announcements")
            .update({ mutation_ids: mutationIds })
            .eq("id", announcement.id);
        }
      } catch (announcementError) {
        console.error(
          "Could not attach mutations to chat announcement:",
          announcementError
        );
      }


      // =====================================================
      // FINAL INVENTORY COUNT
      // =====================================================

      const finalInventoryCount =
        autoDeposited
          ? currentInventoryCount
          : currentInventoryCount +
            1;


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
            gem.valuePerGram
        },

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
            multiplier: mutation.multiplier
          })),

        mutationIds,

        mutationMultiplier,

        mutationCombination: {
          key: combinationKey,
          record: mutationCombination ?? null
        },

        value,

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

        inventory: {
          count:
            finalInventoryCount,

          capacity:
            player
              .inventory_capacity
        },

        cooldown: {
          durationMs:
            cooldownMs,

          nextRollAt:
            nextRollAt
              .toISOString()
        }
      });
    }
  )
};
