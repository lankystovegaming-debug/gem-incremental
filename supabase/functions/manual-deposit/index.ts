import { withSupabase } from "npm:@supabase/server@^1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://gemincremental.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

// =========================================================
// REQUIREMENT HELPERS
// =========================================================

function getRequirementKey(requirement: any, index: number) {
  if (requirement?.id) {
    return requirement.id;
  }

  if (requirement?.type === "gem-count") {
    return requirement.gem;
  }

  if (
    requirement?.type === "consumable-count" ||
    requirement?.type === "potion-count" ||
    requirement?.type === "consumable" ||
    requirement?.type === "potion"
  ) {
    return (
      requirement.consumableId ??
      requirement.consumable_id ??
      requirement.potionId ??
      requirement.potion_id ??
      `${requirement.type}-${index}`
    );
  }

  return `${requirement?.type}-${index}`;
}


// =========================================================
// CONSUMABLE HELPERS
// =========================================================

const VALID_CONSUMABLE_IDS = new Set([
  "lucky-potion-1",
  "lucky-potion-2",
  "lucky-potion-3",
  "lucky-potion-4",
  "legendary-potion",
  "mythic-potion",

  "speed-potion-1",
  "speed-potion-2",
  "speed-potion-3",
  "speed-potion-4",

  "fortune-potion-1",
  "fortune-potion-2",
  "fortune-potion-3",
  "fortune-potion-4",

  "mass-potion-1",
  "mass-potion-2",
  "mass-potion-3",
  "mass-potion-4"
]);


function isConsumableRequirement(requirement: any) {
  if (!requirement || typeof requirement !== "object") {
    return false;
  }

  if (
    requirement.type === "consumable-count" ||
    requirement.type === "potion-count" ||
    requirement.type === "consumable" ||
    requirement.type === "potion"
  ) {
    return true;
  }

  // Also support recipes that identify the item directly.
  return Boolean(
    requirement.consumableId ??
    requirement.consumable_id ??
    requirement.potionId ??
    requirement.potion_id
  );
}


function getConsumableId(requirement: any): string | null {
  const value =
    requirement?.consumableId ??
    requirement?.consumable_id ??
    requirement?.potionId ??
    requirement?.potion_id ??
    requirement?.itemId ??
    requirement?.item_id;

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}


function getConsumableAmount(requirement: any): number {
  const amount =
    requirement?.amount ??
    requirement?.quantity ??
    requirement?.count ??
    1;

  const number = Number(amount);

  if (!Number.isFinite(number) || number <= 0) {
    return 1;
  }

  return Math.floor(number);
}


// =========================================================
// GEM HELPERS
// =========================================================

function getRarityPoints(specimen: any) {
  const rarity = Number(specimen?.rarity);

  if (rarity >= 500) {
    return 100;
  }

  if (rarity >= 250) {
    return 50;
  }

  if (rarity >= 100) {
    return 20;
  }

  if (rarity >= 50) {
    return 8;
  }

  if (rarity >= 10) {
    return 3;
  }

  return 1;
}


function specimenMatches(requirement: any, specimen: any) {
  const baseWeight = Number(specimen?.base_weight);
  const finalWeight = Number(specimen?.final_weight);
  const weightMultiplier =
    Number.isFinite(baseWeight) && baseWeight > 0 && Number.isFinite(finalWeight)
      ? finalWeight / baseWeight
      : Number(specimen?.rolled_weight_multiplier);

  if (
    requirement?.gem &&
    specimen?.gem_name !== requirement.gem
  ) {
    return false;
  }

  if (
    requirement?.minimumWeightMultiplier != null &&
    weightMultiplier <
      Number(requirement.minimumWeightMultiplier)
  ) {
    return false;
  }

  if (
    requirement?.maximumWeightMultiplier != null &&
    weightMultiplier >
      Number(requirement.maximumWeightMultiplier)
  ) {
    return false;
  }

  if (
    requirement?.minimumRarity != null &&
    Number(specimen?.rarity) <
      Number(requirement.minimumRarity)
  ) {
    return false;
  }

  if (
    requirement?.maximumRarity != null &&
    Number(specimen?.rarity) >
      Number(requirement.maximumRarity)
  ) {
    return false;
  }

  return true;
}


// =========================================================
// PROGRESS HELPERS
// =========================================================

function ensureProgressValue(
  progress: Record<string, any>,
  requirement: any,
  index: number
) {
  const key = getRequirementKey(requirement, index);

  if (progress[key] !== undefined) {
    return key;
  }

  if (requirement?.type === "rarity-points") {
    progress[key] = {
      points: 0,
      gemTypes: []
    };

    return key;
  }

  if (requirement?.type === "gem-range") {
    progress[key] = {};

    return key;
  }

  progress[key] = 0;

  return key;
}


function isComplete(
  progress: Record<string, any>,
  requirement: any,
  index: number
) {
  const key = ensureProgressValue(
    progress,
    requirement,
    index
  );

  // -------------------------------------------------------
  // CONSUMABLE / POTION
  // -------------------------------------------------------

  if (isConsumableRequirement(requirement)) {
    const requiredAmount =
      getConsumableAmount(requirement);

    return (
      Number(progress[key] ?? 0) >=
      requiredAmount
    );
  }

  // -------------------------------------------------------
  // GEM COUNT
  // -------------------------------------------------------

  if (requirement?.type === "gem-count") {
    return (
      Number(progress[key] ?? 0) >=
      Number(requirement.amount ?? 0)
    );
  }

  // -------------------------------------------------------
  // GEM TOTAL WEIGHT
  // -------------------------------------------------------

  if (requirement?.type === "gem-total-weight") {
    return (
      Number(progress[key] ?? 0) >=
      Number(requirement.totalWeight ?? 0)
    );
  }

  // -------------------------------------------------------
  // SPECIMEN VALUE
  // -------------------------------------------------------

  if (requirement?.type === "specimen-value-total") {
    return (
      Number(progress[key] ?? 0) >=
      Number(requirement.totalValue ?? 0)
    );
  }

  // -------------------------------------------------------
  // WEIGHT / CONDITION
  // -------------------------------------------------------

  if (
    requirement?.type === "gem-min-weight-multiplier" ||
    requirement?.type === "gem-max-weight-multiplier" ||
    requirement?.type === "specimen-condition"
  ) {
    return (
      Number(progress[key] ?? 0) >=
      Number(requirement.amount ?? 1)
    );
  }

  // -------------------------------------------------------
  // RARITY POINTS
  // -------------------------------------------------------

  if (requirement?.type === "rarity-points") {
    const current =
      progress[key] ?? {
        points: 0,
        gemTypes: []
      };

    const gemTypes =
      Array.isArray(current.gemTypes)
        ? current.gemTypes
        : [];

    return (
      Number(current.points ?? 0) >=
        Number(requirement.points ?? 0) &&
      gemTypes.length >=
        Number(requirement.minimumUniqueGemTypes ?? 0)
    );
  }

  // -------------------------------------------------------
  // GEM RANGE
  // -------------------------------------------------------

  if (requirement?.type === "gem-range") {
    const current =
      progress[key] ?? {};

    return (
      Array.isArray(requirement.gems) &&
      requirement.gems.every(
        (gemName: string) =>
          Number(current[gemName] ?? 0) >=
          Number(requirement.amountEach ?? 1)
      )
    );
  }

  return false;
}


function depositIntoProgress(
  progress: Record<string, any>,
  requirement: any,
  index: number,
  specimen: any
) {
  const key = ensureProgressValue(
    progress,
    requirement,
    index
  );

  // -------------------------------------------------------
  // CONSUMABLE / POTION
  // -------------------------------------------------------

  if (isConsumableRequirement(requirement)) {
    const current =
      Number(progress[key] ?? 0);

    const target =
      getConsumableAmount(requirement);

    if (current >= target) {
      return false;
    }

    progress[key] =
      current + 1;

    return true;
  }

  // -------------------------------------------------------
  // GEM COUNT
  // -------------------------------------------------------

  if (requirement?.type === "gem-count") {
    const current =
      Number(progress[key] ?? 0);

    const target =
      Number(requirement.amount ?? 0);

    if (current >= target) {
      return false;
    }

    progress[key] =
      current + 1;

    return true;
  }

  // -------------------------------------------------------
  // GEM TOTAL WEIGHT
  // -------------------------------------------------------

  if (requirement?.type === "gem-total-weight") {
    progress[key] =
      Number(progress[key] ?? 0) +
      Number(specimen?.final_weight ?? 0);

    return true;
  }

  // -------------------------------------------------------
  // SPECIMEN VALUE
  // -------------------------------------------------------

  if (requirement?.type === "specimen-value-total") {
    progress[key] =
      Number(progress[key] ?? 0) +
      Number(specimen?.value ?? 0);

    return true;
  }

  // -------------------------------------------------------
  // WEIGHT / CONDITION
  // -------------------------------------------------------

  if (
    requirement?.type === "gem-min-weight-multiplier" ||
    requirement?.type === "gem-max-weight-multiplier" ||
    requirement?.type === "specimen-condition"
  ) {
    const current =
      Number(progress[key] ?? 0);

    const target =
      Number(requirement.amount ?? 1);

    if (current >= target) {
      return false;
    }

    progress[key] =
      current + 1;

    return true;
  }

  // -------------------------------------------------------
  // RARITY POINTS
  // -------------------------------------------------------

  if (requirement?.type === "rarity-points") {
    const current =
      progress[key] ?? {
        points: 0,
        gemTypes: []
      };

    current.points =
      Number(current.points ?? 0) +
      getRarityPoints(specimen);

    if (!Array.isArray(current.gemTypes)) {
      current.gemTypes = [];
    }

    if (
      specimen?.gem_name &&
      !current.gemTypes.includes(
        specimen.gem_name
      )
    ) {
      current.gemTypes.push(
        specimen.gem_name
      );
    }

    progress[key] = current;

    return true;
  }

  // -------------------------------------------------------
  // GEM RANGE
  // -------------------------------------------------------

  if (requirement?.type === "gem-range") {
    if (
      !Array.isArray(requirement.gems) ||
      !requirement.gems.includes(
        specimen?.gem_name
      )
    ) {
      return false;
    }

    const target =
      Number(requirement.amountEach ?? 1);

    const current =
      Number(
        progress[key]?.[specimen.gem_name] ?? 0
      );

    if (current >= target) {
      return false;
    }

    progress[key][specimen.gem_name] =
      current + 1;

    return true;
  }

  return false;
}


// =========================================================
// AUTHENTICATED DEPOSIT HANDLER
// =========================================================

const depositHandler = withSupabase(
  {
    auth: "user"
  },
  async (req, ctx) => {
    try {
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
      // REQUEST BODY
      // =====================================================

      let body: any;

      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            error:
              "Invalid request body."
          },
          {
            status: 400
          }
        );
      }


      const recipeId =
        body?.recipeId;

      const requirementIndex =
        Number(body?.requirementIndex);


      if (
        typeof recipeId !== "string" ||
        !Number.isInteger(requirementIndex) ||
        requirementIndex < 0
      ) {
        return Response.json(
          {
            error:
              "Invalid deposit request."
          },
          {
            status: 400
          }
        );
      }


      // =====================================================
      // LOAD CANONICAL RECIPE
      // =====================================================

      const {
        data: recipeRow,
        error: recipeError
      } =
        await ctx.supabaseAdmin
          .from("game_recipes")
          .select("recipe")
          .eq("id", recipeId)
          .single();


      if (
        recipeError ||
        !recipeRow
      ) {
        console.error(
          "Recipe load failed:",
          recipeError
        );

        return Response.json(
          {
            error:
              "Recipe not found."
          },
          {
            status: 404
          }
        );
      }


      const recipe =
        recipeRow.recipe;

      const requirement =
        recipe?.requirements?.[
          requirementIndex
        ];


      if (!requirement) {
        return Response.json(
          {
            error:
              "Requirement not found."
          },
          {
            status: 400
          }
        );
      }


      if ((recipe.includedSpecimens && requirement.type === "specimen-condition") || requirement.type === "gem-count") {
        const { data, error } = await ctx.supabaseAdmin.rpc("deposit_equipment_material", {
          p_player_id: playerId, p_recipe_id: recipeId, p_requirement_index: requirementIndex
        });
        if (error) return Response.json({ error: error.message }, { status: 409 });
        if (!data?.deposited) return Response.json({ error: "no_eligible_specimen" }, { status: 409 });
        return Response.json({ recipeId, requirementIndex, progress: data.progress,
          consumedSpecimen: data.consumedSpecimen, preserved: data.preserved });
      }

      if (
        requirement.type ===
        "equipment"
      ) {
        return Response.json(
          {
            error:
              "Equipment requirements cannot receive deposits."
          },
          {
            status: 400
          }
        );
      }


      // =====================================================
      // LOAD PLAYER'S CRAFTING PROGRESS
      //
      // IMPORTANT:
      // The previous version only filtered by recipe_id.
      // That could return every player's progress rows and
      // caused PGRST116.
      // =====================================================

      const {
        data: progressRow,
        error: progressError
      } =
        await ctx.supabaseAdmin
          .from("crafting_progress")
          .select("progress")
          .eq("player_id", playerId)
          .eq("recipe_id", recipeId)
          .maybeSingle();


      if (progressError) {
        console.error(
          "Progress load failed:",
          progressError
        );

        return Response.json(
          {
            error:
              "Could not load crafting progress."
          },
          {
            status: 500
          }
        );
      }


      const databaseProgress =
        progressRow?.progress ?? {};


      const expectedProgress =
        structuredClone(
          databaseProgress
        );


      const currentProgress =
        structuredClone(
          databaseProgress
        );


      // =====================================================
      // REQUIREMENT ALREADY COMPLETE?
      // =====================================================

      if (
        isComplete(
          currentProgress,
          requirement,
          requirementIndex
        )
      ) {
        return Response.json(
          {
            error:
              "requirement_complete"
          },
          {
            status: 409
          }
        );
      }


      // =====================================================
      // POTION / CONSUMABLE DEPOSIT
      // =====================================================

      if (
        isConsumableRequirement(
          requirement
        )
      ) {
        const consumableId =
          getConsumableId(
            requirement
          );


        if (!consumableId) {
          return Response.json(
            {
              error:
                "invalid_consumable_requirement"
            },
            {
              status: 400
            }
          );
        }


        if (
          !VALID_CONSUMABLE_IDS.has(
            consumableId
          )
        ) {
          return Response.json(
            {
              error:
                "invalid_consumable"
            },
            {
              status: 400
            }
          );
        }


        // -----------------------------------------------------
        // Find the player's consumable row.
        // -----------------------------------------------------

        const {
  data: consumableRows,
  error: consumableError
} =
  await ctx.supabaseAdmin
    .from("player_consumables")
    .select("consumable_id, quantity")
    .eq("player_id", playerId)
    .eq("consumable_id", consumableId)
    .order("updated_at", {
      ascending: false
    })
    .limit(1);

if (consumableError) {
  console.error(
    "Consumable load failed:",
    consumableError
  );

  return Response.json(
    {
      error: "Could not load consumable.",
      details: consumableError.message,
      code: consumableError.code,
      hint: consumableError.hint,
      detailsRaw: consumableError.details
    },
    {
      status: 500
    }
  );
}

const consumableRow =
  consumableRows?.[0] ?? null;


        if (consumableError) {
  console.error(
    "Consumable load failed:",
    consumableError
  );

  return Response.json(
    {
      error: "Could not load consumable.",
      details: consumableError.message,
      code: consumableError.code,
      hint: consumableError.hint,
      detailsRaw: consumableError.details
    },
    {
      status: 500
    }
  );
}


        const currentQuantity =
          Number(
            consumableRow?.quantity ?? 0
          );


        // A manual deposit always consumes exactly
        // one item.
        if (
          currentQuantity < 1
        ) {
          return Response.json(
            {
              error:
                "no_eligible_consumable"
            },
            {
              status: 409
            }
          );
        }


        // -----------------------------------------------------
        // Calculate new progress.
        // -----------------------------------------------------

        const updatedProgress =
          structuredClone(
            currentProgress
          );


        const deposited =
          depositIntoProgress(
            updatedProgress,
            requirement,
            requirementIndex,
            null
          );


        if (!deposited) {
          return Response.json(
            {
              error:
                "requirement_complete"
            },
            {
              status: 409
            }
          );
        }


        // -----------------------------------------------------
        // Consume one potion using an optimistic
        // quantity check.
        //
        // This prevents two simultaneous requests from
        // both consuming the same last potion.
        // -----------------------------------------------------

        const newQuantity =
          currentQuantity - 1;


        const {
          data: updatedConsumable,
          error:
            consumeError
        } =
          await ctx.supabaseAdmin
            .from(
              "player_consumables"
            )
            .update({
              quantity:
                newQuantity,
              updated_at:
                new Date().toISOString()
            })
            .eq(
              "player_id",
              playerId
            )
            .eq(
              "consumable_id",
              consumableId
            )
            .eq(
              "quantity",
              currentQuantity
            )
            .select(
              "consumable_id, quantity"
            )
            .maybeSingle();


        if (consumableError) {
  console.error(
    "Consumable load failed:",
    consumableError
  );

  return Response.json(
    {
      error: "Could not load consumable.",
      details: consumableError.message,
      code: consumableError.code,
      hint: consumableError.hint,
      detailsRaw: consumableError.details
    },
    {
      status: 500
    }
  );
}


        if (!updatedConsumable) {
          return Response.json(
            {
              error:
                "consumable_changed"
            },
            {
              status: 409
            }
          );
        }


        // -----------------------------------------------------
        // Save crafting progress.
        //
        // We explicitly scope this to the current player.
        // -----------------------------------------------------

        const {
  data: savedProgressRow,
  error: saveProgressError
} = await ctx.supabaseAdmin
  .from("crafting_progress")
  .upsert(
    {
      player_id: playerId,
      recipe_id: recipeId,
      progress: updatedProgress,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "player_id,recipe_id"
    }
  )
  .select("progress")
  .single();


        if (
  saveProgressError ||
  !savedProgressRow
) {
  console.error(
    "Consumable progress save failed:",
    saveProgressError
  );

  console.error(
    "Progress row existed:",
    !!progressRow
  );

  console.error(
    "Player:",
    playerId
  );

  console.error(
    "Recipe:",
    recipeId
  );

  if (!savedProgressRow && !saveProgressError) {
    console.error(
      "UPDATE affected 0 rows."
    );
  }

  // Roll back the consumable if progress couldn't be saved.
  await ctx.supabaseAdmin
    .from("player_consumables")
    .update({
      quantity: currentQuantity,
      updated_at: new Date().toISOString()
    })
    .eq("player_id", playerId)
    .eq("consumable_id", consumableId)
    .eq("quantity", newQuantity);

  return Response.json(
    {
      error: "Could not save crafting progress.",
      databaseError: saveProgressError
        ? {
            message: saveProgressError.message ?? null,
            code: saveProgressError.code ?? null,
            details: saveProgressError.details ?? null,
            hint: saveProgressError.hint ?? null
          }
        : null,
      progressRowExists: !!progressRow
    },
    {
      status: 500
    }
  );
}


        return Response.json(
          {
            recipeId,
            requirementIndex,

            consumedConsumable: {
              consumableId,
              quantity:
                newQuantity
            },

            progress:
              savedProgressRow.progress,

            consumableQuantity:
              newQuantity
          }
        );
      }


      // =====================================================
      // GEM DEPOSIT
      // =====================================================

      let gemQuery =
        ctx.supabase
          .from("inventory_gems")
          .select(`
            id,
            gem_name,
            rarity,
            base_weight,
            rolled_weight_multiplier,
            final_weight,
            value,
            locked
          `)
          .eq(
            "player_id",
            playerId
          )
          // Legacy specimens can have a null lock flag. The inventory UI
          // already treats null as unlocked, so keep manual crafting
          // compatible while the database backfill rolls out.
          .or(
            "locked.eq.false,locked.is.null"
          );

      // PostgREST caps a response at the project's maximum row count
      // (1,000 by default). Filter named-gem requirements in Postgres so a
      // rare, heavy specimen cannot disappear behind a large inventory's
      // first 1,000 lighter gems.
      if (
        typeof requirement.gem === "string" &&
        requirement.gem
      ) {
        gemQuery = gemQuery.eq(
          "gem_name",
          requirement.gem
        );
      } else if (
        requirement.type === "gem-range" &&
        Array.isArray(requirement.gems) &&
        requirement.gems.length > 0
      ) {
        gemQuery = gemQuery.in(
          "gem_name",
          requirement.gems
        );
      }

      const {
        data: gems,
        error: gemsError
      } =
        await gemQuery
          .order(
            "final_weight",
            {
              ascending: true
            }
          );


      if (gemsError) {
        console.error(
          "Inventory load failed:",
          gemsError
        );

        return Response.json(
          {
            error:
              "Could not load inventory."
          },
          {
            status: 500
          }
        );
      }


      // =====================================================
      // FIND LIGHTEST ELIGIBLE GEM
      // =====================================================

      let selectedGem: any = null;
      let updatedProgress: any = null;


      for (
        const gem of gems ?? []
      ) {
        if (
          requirement.type ===
          "gem-range"
        ) {
          if (
            !requirement.gems.includes(
              gem.gem_name
            )
          ) {
            continue;
          }
        } else if (
          requirement.type ===
            "specimen-value-total" ||
          requirement.type ===
            "rarity-points"
        ) {
          // Any unlocked gem is eligible.
        } else if (
          !specimenMatches(
            requirement,
            gem
          )
        ) {
          continue;
        }


        const testProgress =
          structuredClone(
            currentProgress
          );


        const deposited =
          depositIntoProgress(
            testProgress,
            requirement,
            requirementIndex,
            gem
          );


        if (!deposited) {
          continue;
        }


        selectedGem =
          gem;

        updatedProgress =
          testProgress;

        break;
      }


      if (
        !selectedGem ||
        !updatedProgress
      ) {
        return Response.json(
          {
            error:
              "no_eligible_specimen"
          },
          {
            status: 409
          }
        );
      }


      // =====================================================
      // ATOMIC GEM DATABASE DEPOSIT
      // =====================================================

      const {
        data: savedProgress,
        error: depositError
      } =
        await ctx.supabaseAdmin.rpc(
          "apply_crafting_deposit",
          {
            p_player_id:
              playerId,

            p_recipe_id:
              recipeId,

            p_specimen_id:
              selectedGem.id,

            p_expected_progress:
              expectedProgress,

            p_new_progress:
              updatedProgress
          }
        );


      if (depositError) {
        console.error(
          "Deposit RPC failed:",
          depositError
        );


        if (
          depositError.message?.includes(
            "crafting_progress_changed"
          )
        ) {
          return Response.json(
            {
              error:
                "crafting_progress_changed"
            },
            {
              status: 409
            }
          );
        }


        if (
          depositError.message?.includes(
            "specimen_not_found"
          )
        ) {
          return Response.json(
            {
              error:
                "specimen_not_found"
            },
            {
              status: 409
            }
          );
        }


        if (
          depositError.message?.includes(
            "specimen_locked"
          )
        ) {
          return Response.json(
            {
              error:
                "specimen_locked"
            },
            {
              status: 409
            }
          );
        }


        return Response.json(
          {
            error:
              "Deposit failed."
          },
          {
            status: 500
          }
        );
      }


      // =====================================================
      // GEM SUCCESS
      // =====================================================

      return Response.json(
        {
          recipeId,

          requirementIndex,

          consumedSpecimen: {
            id:
              selectedGem.id,

            gemName:
              selectedGem.gem_name,

            weight:
              selectedGem.final_weight,

            value:
              selectedGem.value
          },

          progress:
            savedProgress
        }
      );


    } catch (error) {
      console.error(
        "Unhandled manual-deposit error:",
        error
      );

      return Response.json(
        {
          error:
            "Internal manual-deposit error."
        },
        {
          status: 500
        }
      );
    }
  }
);


// =========================================================
// OUTER CORS HANDLER
// =========================================================

Deno.serve(async (req: Request) => {
  // Browser CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Real authenticated request
  const response = await depositHandler(req);

  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
