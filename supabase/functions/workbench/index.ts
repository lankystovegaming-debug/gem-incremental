import { withSupabase } from "npm:@supabase/server";

/**
 * Workbench [BETA]
 * ----------------
 * The database tables intentionally retain their historical `forge_*`
 * names so existing saved items are not lost. The public feature name and
 * Edge Function slug are "workbench".
 *
 * This function is admin-only while the feature is being tested.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_USER_IDS = new Set([
  "38d5e8ce-18af-46d3-aa9e-6e601e75dd78",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function getUserId(ctx: any): string | null {
  return (
    ctx?.userClaims?.id ??
    ctx?.userClaims?.sub ??
    ctx?.jwtClaims?.sub ??
    null
  );
}

async function isAdmin(ctx: any, userId: string) {
  if (OWNER_USER_IDS.has(userId)) {
    return true;
  }

  const { data, error } = await ctx.supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[WORKBENCH] Admin lookup failed:", error);
    return false;
  }

  return data?.user_id === userId;
}

const DEFAULT_CONFIG = {
  id: true,
  enabled: true,
  beta_label: "Workbench [BETA]",
  display_name: "Workbench [BETA]",
  icon: "⚒",
  min_materials: 3,
  max_materials: 50,
  stage_time_seconds: 8,
  quality_broken: 0.65,
  quality_poor: 0.8,
  quality_average: 1,
  quality_good: 1.1,
  quality_excellent: 1.2,
  quality_masterwork: 1.3,
  trait_threshold_minor: 0.1,
  trait_threshold_full: 0.3,
  ore_count_rules: {
    weapon: [
      { min: 3, max: 6, class: "Dagger" },
      { min: 7, max: 14, class: "Sword" },
      { min: 15, max: 29, class: "Great Sword" },
      { min: 30, max: 9999, class: "Colossal Sword" },
    ],
    armor: [
      { min: 3, max: 9, class: "Light Helmet" },
      { min: 10, max: 19, class: "Medium Helmet" },
      { min: 20, max: 9999, class: "Heavy Helmet" },
    ],
  },
  trait_rules: [],
};

async function loadConfig(ctx: any) {
  /*
   * Select * deliberately. Some installations were deployed before the
   * Workbench presentation columns were added. Selecting those columns
   * explicitly made an otherwise valid Workbench return HTTP 500.
   */
  const { data, error } = await ctx.supabaseAdmin
    .from("forge_config")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error("[WORKBENCH] Config query failed:", error);
    throw error;
  }

  if (!data) {
    /*
     * Only write columns that existed in the original forge migration.
     * The returned object is then decorated with the newer presentation
     * fields in memory.
     */
    const { data: created, error: createError } = await ctx.supabaseAdmin
      .from("forge_config")
      .upsert({
        id: true,
        enabled: true,
        beta_label: DEFAULT_CONFIG.beta_label,
        min_materials: DEFAULT_CONFIG.min_materials,
        max_materials: DEFAULT_CONFIG.max_materials,
        stage_time_seconds: DEFAULT_CONFIG.stage_time_seconds,
        quality_broken: DEFAULT_CONFIG.quality_broken,
        quality_poor: DEFAULT_CONFIG.quality_poor,
        quality_average: DEFAULT_CONFIG.quality_average,
        quality_good: DEFAULT_CONFIG.quality_good,
        quality_excellent: DEFAULT_CONFIG.quality_excellent,
        quality_masterwork: DEFAULT_CONFIG.quality_masterwork,
        trait_threshold_minor: DEFAULT_CONFIG.trait_threshold_minor,
        trait_threshold_full: DEFAULT_CONFIG.trait_threshold_full,
        ore_count_rules: DEFAULT_CONFIG.ore_count_rules,
        trait_rules: DEFAULT_CONFIG.trait_rules,
      })
      .select("*")
      .single();

    if (createError) {
      console.error("[WORKBENCH] Config creation failed:", createError);
      throw createError;
    }

    return {
      ...DEFAULT_CONFIG,
      ...created,
      display_name:
        created?.display_name ||
        created?.beta_label ||
        DEFAULT_CONFIG.display_name,
      icon: created?.icon || DEFAULT_CONFIG.icon,
    };
  }

  return {
    ...DEFAULT_CONFIG,
    ...data,
    display_name:
      data.display_name ||
      data.beta_label ||
      DEFAULT_CONFIG.display_name,
    icon: data.icon || DEFAULT_CONFIG.icon,
  };
}

function qualityFromScores(scores: number[], config: any) {
  const average =
    scores.reduce((sum, score) => sum + score, 0) /
    Math.max(1, scores.length);

  if (average < 0.2) return ["Broken", Number(config.quality_broken)];
  if (average < 0.4) return ["Poor", Number(config.quality_poor)];
  if (average < 0.6) return ["Average", Number(config.quality_average)];
  if (average < 0.75) return ["Good", Number(config.quality_good)];
  if (average < 0.9) return ["Excellent", Number(config.quality_excellent)];

  return ["Masterwork", Number(config.quality_masterwork)];
}

function classFor(itemType: string, count: number, config: any) {
  const rules = Array.isArray(config.ore_count_rules?.[itemType])
    ? config.ore_count_rules[itemType]
    : [];

  if (!rules.length) {
    return itemType === "weapon" ? "Weapon" : "Armor";
  }

  const candidates = rules.map((rule: any) => {
    const min = Number(rule.min);
    const max = Number(rule.max);

    const midpoint =
      min +
      Math.max(
        1,
        Math.round((Math.min(max, min + Math.max(1, max - min)) - min) * 0.55),
      );

    const optimal = Number(rule.optimal ?? (min + midpoint) / 2);
    const distance = Math.abs(count - optimal);

    return {
      rule,
      weight: 1 / (1 + distance),
    };
  });

  const totalWeight = candidates.reduce(
    (sum: number, candidate: any) => sum + candidate.weight,
    0,
  );

  let roll = Math.random() * totalWeight;

  for (const candidate of candidates) {
    roll -= candidate.weight;

    if (roll <= 0) {
      return candidate.rule.class;
    }
  }

  return candidates[candidates.length - 1].rule.class;
}

function numeric(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalizeMaterial(row: any) {
  const baseWeight = numeric(
    row?.base_weight ?? row?.baseWeight,
    0,
  );

  const valuePerGram = numeric(
    row?.value_per_gram ?? row?.valuePerGram,
    baseWeight > 0 ? numeric(row?.value, 0) / baseWeight : 0,
  );

  return {
    ...row,
    value_per_gram: valuePerGram,
    rarity: numeric(row?.rarity, 0),
    mutation_multiplier: numeric(row?.mutation_multiplier, 1),
  };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    const playerId = getUserId(ctx);

    if (!playerId) {
      return json(
        {
          error: "unauthenticated",
          message: "Your session is not authenticated.",
        },
        401,
      );
    }

    try {
      if (!(await isAdmin(ctx, playerId))) {
        return json(
          {
            error: "workbench_admin_only",
            message:
              "Workbench is currently available to administrators only.",
          },
          403,
        );
      }

      const config = await loadConfig(ctx);

      if (!config.enabled) {
        return json(
          {
            error: "feature_disabled",
            message: "Workbench is currently disabled.",
          },
          403,
        );
      }

      const body = await request.json().catch(() => ({}));
      const action = String(body?.action || "config");

      if (action === "config") {
        return json({ config });
      }

      if (action === "materials") {
        /*
         * Select * keeps this compatible with both the original inventory
         * schema and the later mutation/weight columns.
         */
        const { data, error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .select("*")
          .eq("player_id", playerId)
          .eq("locked", false)
          .order("rarity", { ascending: true })
          .limit(200);

        if (error) {
          console.error("[WORKBENCH] Material query failed:", error);
          throw error;
        }

        const gems = (data ?? []).map(normalizeMaterial);

        return json({ gems });
      }

      if (action === "start") {
        const itemType =
          body?.itemType === "armor" ? "armor" : "weapon";

        const materialIds = Array.isArray(body?.materialIds)
          ? body.materialIds.map(String)
          : [];

        if (
          materialIds.length < Number(config.min_materials) ||
          materialIds.length > Number(config.max_materials)
        ) {
          return json(
            {
              error: "invalid_material_count",
              min: Number(config.min_materials),
              max: Number(config.max_materials),
            },
            400,
          );
        }

        const { data, error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .select("*")
          .eq("player_id", playerId)
          .eq("locked", false)
          .in("id", materialIds);

        if (error) {
          console.error("[WORKBENCH] Material selection failed:", error);
          throw error;
        }

        const gems = (data ?? []).map(normalizeMaterial);

        if (gems.length !== materialIds.length) {
          return json(
            {
              error: "materials_missing",
              message:
                "One or more selected gems are no longer available.",
            },
            400,
          );
        }

        const { data: session, error: sessionError } =
          await ctx.supabaseAdmin
            .from("forge_sessions")
            .insert({
              player_id: playerId,
              item_type: itemType,
              material_ids: materialIds,
              material_summary: gems,
              stage: 1,
              stage_scores: [],
              quality: 1,
            })
            .select("*")
            .single();

        if (sessionError) {
          console.error(
            "[WORKBENCH] Session creation failed:",
            sessionError,
          );
          throw sessionError;
        }

        return json({
          session,
          stage: 1,
          stageTime: Number(config.stage_time_seconds),
        });
      }

      if (action === "stage") {
        const sessionId = String(body?.sessionId || "");
        const score = Math.max(
          0,
          Math.min(1, numeric(body?.score, 0)),
        );

        if (!sessionId) {
          return json(
            {
              error: "invalid_session",
              message: "The Workbench session is missing.",
            },
            400,
          );
        }

        const { data: session, error: sessionError } =
          await ctx.supabaseAdmin
            .from("forge_sessions")
            .select("*")
            .eq("id", sessionId)
            .eq("player_id", playerId)
            .eq("status", "active")
            .maybeSingle();

        if (sessionError) {
          console.error(
            "[WORKBENCH] Session lookup failed:",
            sessionError,
          );
          throw sessionError;
        }

        if (!session) {
          return json(
            {
              error: "session_not_found",
              message: "That Workbench session is no longer active.",
            },
            404,
          );
        }

        const scores = [
          ...(Array.isArray(session.stage_scores)
            ? session.stage_scores
            : []),
          score,
        ];

        const nextStage = Number(session.stage) + 1;

        if (nextStage <= 3) {
          const { data: updated, error: updateError } =
            await ctx.supabaseAdmin
              .from("forge_sessions")
              .update({
                stage: nextStage,
                stage_scores: scores,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessionId)
              .eq("player_id", playerId)
              .select("*")
              .single();

          if (updateError) {
            console.error(
              "[WORKBENCH] Stage update failed:",
              updateError,
            );
            throw updateError;
          }

          return json({
            session: updated,
            stage: nextStage,
          });
        }

        const [qualityName, qualityMultiplier] =
          qualityFromScores(scores, config);

        const materials = Array.isArray(session.material_summary)
          ? session.material_summary.map(normalizeMaterial)
          : [];

        const averageMaterialValue =
          materials.reduce(
            (sum: number, gem: any) =>
              sum +
              numeric(gem.value_per_gram, 0) *
                numeric(gem.mutation_multiplier, 1),
            0,
          ) / Math.max(1, materials.length);

        const oreCount = materials.length;
        const itemClass = classFor(
          session.item_type,
          oreCount,
          config,
        );

        const rarity =
          qualityMultiplier >= 1.3
            ? "Legendary"
            : qualityMultiplier >= 1.2
              ? "Epic"
              : qualityMultiplier >= 1.1
                ? "Rare"
                : "Common";

        const traits: Record<string, string> = {};

        for (const material of materials) {
          const share = 1 / Math.max(1, oreCount);

          if (
            share >= Number(config.trait_threshold_minor)
          ) {
            traits[material.gem_name] =
              share >= Number(config.trait_threshold_full)
                ? "full"
                : "minor";
          }
        }

        const stats =
          session.item_type === "weapon"
            ? {
                attack: Math.max(
                  1,
                  averageMaterialValue *
                    100 *
                    qualityMultiplier,
                ),
                attackSpeed: Math.max(
                  0.15,
                  1.5 /
                    (1 + averageMaterialValue * 0.25),
                ),
              }
            : {
                vitality: Math.max(
                  1,
                  averageMaterialValue *
                    120 *
                    qualityMultiplier,
                ),
                defense: Math.max(
                  0,
                  averageMaterialValue *
                    60 *
                    qualityMultiplier,
                ),
              };

        const result = {
          itemType: session.item_type,
          itemClass,
          quality: qualityName,
          qualityMultiplier,
          oreCount,
          rarity,
          multiplier: averageMaterialValue,
          stats,
          traits,
        };

        const { data: item, error: itemError } =
          await ctx.supabaseAdmin
            .from("forge_items")
            .insert({
              player_id: playerId,
              item_type: session.item_type,
              item_name: itemClass,
              rarity,
              quality: qualityMultiplier,
              ore_count: oreCount,
              multiplier: averageMaterialValue,
              stats,
              traits: Object.entries(traits).map(
                ([name, level]) => ({
                  name,
                  level,
                }),
              ),
            })
            .select("*")
            .single();

        if (itemError) {
          console.error(
            "[WORKBENCH] Item creation failed:",
            itemError,
          );
          throw itemError;
        }

        /*
         * Consume only after the result item has been persisted.
         * This prevents a failed item insert from destroying materials.
         */
        const { error: deleteError } =
          await ctx.supabaseAdmin
            .from("inventory_gems")
            .delete()
            .eq("player_id", playerId)
            .in("id", session.material_ids);

        if (deleteError) {
          console.error(
            "[WORKBENCH] Material consumption failed:",
            deleteError,
          );
          throw deleteError;
        }

        const { data: completed, error: completeError } =
          await ctx.supabaseAdmin
            .from("forge_sessions")
            .update({
              stage_scores: scores,
              quality: qualityMultiplier,
              result,
              status: "completed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", sessionId)
            .eq("player_id", playerId)
            .select("*")
            .single();

        if (completeError) {
          console.error(
            "[WORKBENCH] Session completion failed:",
            completeError,
          );
          throw completeError;
        }

        return json({
          session: completed,
          item,
          result,
        });
      }

      if (action === "history") {
        const { data, error } = await ctx.supabaseAdmin
          .from("forge_items")
          .select("*")
          .eq("player_id", playerId)
          .order("created_at", { ascending: false })
          .limit(30);

        if (error) {
          console.error("[WORKBENCH] History query failed:", error);
          throw error;
        }

        return json({ items: data ?? [] });
      }

      return json(
        {
          error: "unknown_action",
          message: `Unknown Workbench action: ${action}`,
        },
        400,
      );
    } catch (error) {
      console.error("[WORKBENCH] Unhandled error:", error);

      return json(
        {
          error: "workbench_server_error",
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
        500,
      );
    }
  }),
};
