import {
  withSupabase
} from "npm:@supabase/server";


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
      0,
      luck
    );

  const fallbackGem =
    gems.find(
      (gem) =>
        gem.name ===
        "Quartz"
    )!;

  const rollableGems =
    gems
      .filter(
        (gem) =>
          gem.name !==
          "Quartz"
      )
      .sort(
        (a, b) =>
          b.rarity -
          a.rarity
      );


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
      _req,
      ctx
    ) => {
      // =====================================================
      // IDENTIFY PLAYER
      // =====================================================

      const playerId =
        ctx.userClaims?.id;


      if (!playerId) {
        return Response.json(
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
            inventory_capacity
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


        return Response.json(
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


          return Response.json(
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
          );


      if (
        inventoryCountError
      ) {
        console.error(
          "Inventory count failed:",
          inventoryCountError
        );


        return Response.json(
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
        return Response.json(
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


        return Response.json(
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


        return Response.json(
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
      // CALCULATE PLAYER STATS
      // =====================================================

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
        luck +=
          Number(
            equipment
              .luck_bonus ??
            0
          );

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


        return Response.json(
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


      const value =
        finalWeight *
        gem.valuePerGram;


      const specimen = {
        gem_name:
          gem.name,

        rarity:
          gem.rarity,

        rolled_weight_multiplier:
          rolledWeightMultiplier,

        final_weight:
          finalWeight,

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

              value,

              locked:
                false
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


          return Response.json(
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

      return Response.json({
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
