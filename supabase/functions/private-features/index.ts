import { withSupabase } from "npm:@supabase/server";

// =========================================================
// PRIVATE UPCOMING-FEATURE ACCESS
// Keep these lists/password here so the hidden workspace is easy to edit.
// =========================================================

// Owner user IDs that can access the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_OWNER_USER_IDS: string[] = [
  "38d5e8ce-18af-46d3-aa9e-6e601e75dd78"
];

// Extra admin user IDs for the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_ADMIN_USER_IDS: string[] = [];

// Password required by the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_PASSWORD = "lankygem";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

function samePassword(value: unknown) {
  return typeof value === "string" && value === PRIVATE_FEATURE_PASSWORD;
}

function getUserId(ctx: any): string | null {
  const candidates = [
    ctx?.userClaims?.id,
    ctx?.userClaims?.sub,
    ctx?.jwtClaims?.sub,
    ctx?.jwtClaims?.user_id
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}

async function isAllowed(ctx: any, userId: string) {
  if (
    PRIVATE_FEATURE_OWNER_USER_IDS.includes(userId) ||
    PRIVATE_FEATURE_ADMIN_USER_IDS.includes(userId)
  ) {
    return true;
  }

  if (!ctx?.supabaseAdmin) {
    console.error("Private features: supabaseAdmin is unavailable");
    return false;
  }

  try {
    const { data, error } = await ctx.supabaseAdmin
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Private features admin lookup failed:", error.message);
      return false;
    }

    return data?.user_id === userId;
  } catch (error) {
    console.error("Private features admin lookup crashed:", error);
    return false;
  }
}

async function ensureProgressRows(ctx: any, playerId: string) {
  if (!ctx?.supabaseAdmin) {
    throw new Error("supabase_admin_client_missing");
  }

  // Prefer the RPC when it exists, but do not make the entire Upcoming
  // workspace depend on a migration having created that RPC.
  const { error: rpcError } = await ctx.supabaseAdmin.rpc(
    "ensure_private_feature_progress",
    { p_player_id: playerId }
  );

  if (!rpcError) return;

  console.warn(
    "ensure_private_feature_progress RPC unavailable; using direct upsert:",
    rpcError.message
  );

  const { data: definitions, error: definitionError } =
    await ctx.supabaseAdmin
      .from("private_feature_definitions")
      .select("id")
      .eq("enabled", true);

  if (definitionError) {
    throw new Error(`feature_progress_definition_load_failed: ${definitionError.message}`);
  }

  if (!definitions?.length) return;

  const rows = definitions.map((definition: any) => ({
    player_id: playerId,
    feature_id: definition.id,
    current_value: 0,
    completed: false,
    reward_granted: false,
    metadata: {
      initializedBy: "private-features-direct-fallback",
      initializedAt: new Date().toISOString()
    }
  }));

  const { error: upsertError } = await ctx.supabaseAdmin
    .from("private_feature_progress")
    .upsert(rows, { onConflict: "player_id,feature_id", ignoreDuplicates: true });

  if (upsertError) {
    throw new Error(`feature_progress_upsert_failed: ${upsertError.message}`);
  }
}

function normalizeDefinition(body: any) {
  return {
    feature_kind:
      body.feature_kind === "achievement"
        ? "achievement"
        : "quest",

    quest_type:
      body.feature_kind === "achievement"
        ? null
        : (body.quest_type ?? "special"),

    name: String(body.name ?? "Untitled Feature").slice(0, 120),
    description: String(body.description ?? "").slice(0, 1000),
    icon: String(body.icon ?? "◆").slice(0, 8),

    sort_order:
      Number.isFinite(Number(body.sort_order))
        ? Number(body.sort_order)
        : 0,

    enabled: body.enabled !== false,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,

    prerequisites:
      Array.isArray(body.prerequisites)
        ? body.prerequisites
        : [],

    requirements:
      body.requirements &&
      typeof body.requirements === "object"
        ? body.requirements
        : { type: "rolls", amount: 1 },

    rewards:
      Array.isArray(body.rewards)
        ? body.rewards
        : [],

    unlocks:
      Array.isArray(body.unlocks)
        ? body.unlocks
        : [],

    metadata:
      body.metadata &&
      typeof body.metadata === "object"
        ? body.metadata
        : {}
  };
}

const seedFeatures = [
  {
    feature_kind: "achievement",
    name: "First Spark",
    description: "Complete your first real roll.",
    icon: "✦",
    requirements: { type: "rolls", amount: 1 },
    rewards: [{ type: "potion", consumableId: "lucky-potion-1", amount: 2 }]
  },
  {
    feature_kind: "achievement",
    name: "Twin Crowns",
    description: "Roll two Legendary-tier gems back-to-back.",
    icon: "♛",
    requirements: {
      type: "consecutive",
      amount: 2,
      match: { gemRarityGte: 10000 }
    },
    rewards: [{ type: "coins", amount: 10 }]
  },
  {
    feature_kind: "achievement",
    name: "Mythic by Fate",
    description: "Find a Mythic-tier gem without using a Legendary or Mythic one-roll potion.",
    icon: "☄",
    requirements: {
      type: "single",
      match: {
        gemRarityGte: 1000000,
        noLegendaryOrMythicPotion: true
      }
    },
    rewards: [{ type: "potion", consumableId: "mythic-potion", amount: 1 }]
  },
  {
    feature_kind: "achievement",
    name: "Five Thousand Deep",
    description: "Roll 5,000 times.",
    icon: "∞",
    requirements: { type: "rolls", amount: 5000 },
    rewards: [
      { type: "money", amount: 1000000 },
      { type: "coins", amount: 25 }
    ]
  },
  {
    feature_kind: "achievement",
    name: "Mythic Storm",
    description: "Roll 20 Mythics within any 500-roll window.",
    icon: "⚡",
    requirements: {
      type: "count",
      amount: 20,
      windowRolls: 500,
      match: { gemRarityGte: 1000000 }
    },
    rewards: [{ type: "potion", consumableId: "mythic-potion", amount: 3 }]
  },
  {
    feature_kind: "quest",
    quest_type: "main",
    name: "Astral Ascension 1",
    description: "Begin the main progression.",
    icon: "Ⅰ",
    sort_order: 10,
    requirements: { type: "rolls", amount: 100 },
    rewards: [{ type: "potion", consumableId: "lucky-potion-1", amount: 5 }],
    unlocks: ["pickaxe_t5"]
  },
  {
    feature_kind: "quest",
    quest_type: "main",
    name: "Astral Ascension 2",
    description: "Push deeper into the gem ladder.",
    icon: "Ⅱ",
    sort_order: 20,
    requirements: {
      all: [
        { type: "rolls", amount: 500 },
        { type: "count", amount: 3, match: { gemRarityGte: 100 } }
      ]
    },
    rewards: [{ type: "money", amount: 250000 }],
    unlocks: ["pickaxe_t8"]
  },
  {
    feature_kind: "quest",
    quest_type: "main",
    name: "Astral Ascension 3",
    description: "Prove you can survive the rare tier.",
    icon: "Ⅲ",
    sort_order: 30,
    requirements: {
      all: [
        { type: "rolls", amount: 1500 },
        { type: "count", amount: 5, match: { gemRarityGte: 1000 } }
      ]
    },
    rewards: [{ type: "coins", amount: 20 }],
    unlocks: ["pickaxe_t11", "bag_t8"]
  },
  {
    feature_kind: "quest",
    quest_type: "main",
    name: "Astral Ascension 4",
    description: "Reach the endgame gates.",
    icon: "Ⅳ",
    sort_order: 40,
    requirements: {
      all: [
        { type: "rolls", amount: 5000 },
        { type: "count", amount: 10, match: { gemRarityGte: 10000 } }
      ]
    },
    rewards: [{ type: "potion", consumableId: "legendary-potion", amount: 2 }],
    unlocks: ["pickaxe_t14", "bag_t11"]
  },
  {
    feature_kind: "quest",
    quest_type: "event",
    name: "Eclipse Rush",
    description: "A limited-time event hunt.",
    icon: "☾",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    requirements: {
      count: 3,
      match: { gemRarityGte: 100000 }
    },
    rewards: [{ type: "coins", amount: 50 }]
  },
  {
    feature_kind: "quest",
    quest_type: "special",
    name: "Designer Playground",
    description: "A fully customizable special quest template.",
    icon: "✹",
    requirements: {
      any: [
        { type: "single", match: { hasMutation: "corrupted" } },
        { type: "single", match: { valueGte: 100000 } }
      ]
    },
    rewards: [{ type: "money", amount: 500000 }]
  }
];

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      try {
        if (req.method === "OPTIONS") {
          return new Response("ok", {
            status: 200,
            headers: corsHeaders
          });
        }

        const userId = getUserId(ctx);

        if (!userId) {
          return json(
            { error: "private_feature_unauthenticated" },
            401
          );
        }

        const allowed = await isAllowed(ctx, userId);

        if (!allowed) {
          return json(
            { error: "private_feature_forbidden" },
            403
          );
        }

        let body: any = {};

        try {
          body = await req.json();
        } catch {
          body = {};
        }

        const action = body.action;

        // The client may check visibility without sending the password.
        if (action === "whoami") {
          return json({
            allowed: true,
            requiresPassword: true
          });
        }

        if (!samePassword(body.password)) {
          return json(
            { error: "private_feature_password_required" },
            401
          );
        }

        // ---------------------------------------------------------
        // FEATURE SEEDING
        //
        // This is deliberately idempotent. The migration creates the
        // tables, but it does not populate them. Older versions required
        // the browser to insert every seed row and could leave the workspace
        // empty if one row failed. We now insert only missing definitions.
        // ---------------------------------------------------------
        async function ensureSeedFeatures() {
          const inserted: any[] = [];
          const existing: any[] = [];

          for (const feature of seedFeatures) {
            const normalized = normalizeDefinition(feature);

            const { data: found, error: findError } =
              await ctx.supabaseAdmin
                .from("private_feature_definitions")
                .select("*")
                .eq("feature_kind", normalized.feature_kind)
                .eq("name", normalized.name)
                .maybeSingle();

            if (findError) {
              throw new Error(`seed_lookup_failed: ${findError.message}`);
            }

            if (found) {
              existing.push(found);
              continue;
            }

            const { data: created, error: createError } =
              await ctx.supabaseAdmin
                .from("private_feature_definitions")
                .insert(normalized)
                .select("*")
                .single();

            if (createError) {
              throw new Error(`seed_insert_failed: ${createError.message}`);
            }

            if (created) inserted.push(created);
          }

          return { inserted, existing };
        }

        if (action === "list") {
          if (!ctx?.supabaseAdmin) {
            return json({
              error: "feature_server_client_missing",
              message: "The private-features Edge Function does not have a service-role Supabase client. Redeploy the function from the supplied ZIP."
            }, 500);
          }

          let { data, error } = await ctx.supabaseAdmin
            .from("private_feature_definitions")
            .select("*")
            .order("feature_kind")
            .order("quest_type")
            .order("sort_order");

          if (error) {
            console.error("Feature list failed:", error);
            return json({
              error: "feature_list_failed",
              message: error.message,
              details: error.details ?? null,
              hint: error.hint ?? null,
              code: error.code ?? null
            }, 500);
          }

          // A brand-new installation has valid empty tables after the
          // migration. Bootstrap the examples automatically so the user
          // never gets stuck at "0 definitions loaded".
          if ((data ?? []).length === 0) {
            try {
              const seeded = await ensureSeedFeatures();
              const { data: refreshed, error: refreshError } =
                await ctx.supabaseAdmin
                  .from("private_feature_definitions")
                  .select("*")
                  .order("feature_kind")
                  .order("quest_type")
                  .order("sort_order");

              if (refreshError) {
                throw new Error(`feature_refresh_failed: ${refreshError.message}`);
              }

              const bootDefinitions = refreshed ?? [];

              // IMPORTANT: listing definitions must never depend on player
              // progress. Progress initialization has its own endpoint.
              return json({
                definitions: bootDefinitions,
                bootstrapped: true,
                inserted: seeded.inserted.length
              });
            } catch (error) {
              console.error("Automatic feature bootstrap failed:", error);
              return json(
                {
                  error: "feature_bootstrap_failed",
                  message: error instanceof Error ? error.message : String(error)
                },
                500
              );
            }
          }

          // Listing definitions must never depend on progression storage.
          // Progress is initialized only by the progress endpoint or a real roll.
          return json({
            definitions: data ?? [],
            bootstrapped: false
          });
        }

        if (action === "progress") {
          const { data: definitions, error: definitionsError } = await ctx.supabaseAdmin
            .from("private_feature_definitions")
            .select("*")
            .order("feature_kind")
            .order("quest_type")
            .order("sort_order");
          if (definitionsError) return json({ error: "progress_definitions_failed", message: definitionsError.message }, 500);

          if ((definitions ?? []).length) {
            try {
              await ensureProgressRows(ctx, userId);
            } catch (initError) {
              console.error("Progress initialization failed:", initError);
              return json({
                error: "progress_initialize_failed",
                message: initError instanceof Error ? initError.message : String(initError)
              }, 500);
            }
          }

          const { data: progress, error: progressError } = await ctx.supabaseAdmin
            .from("private_feature_progress")
            .select("*")
            .eq("player_id", userId)
            .order("updated_at", { ascending: false });
          if (progressError) return json({ error: "progress_load_failed", message: progressError.message, details: progressError.details ?? null, hint: progressError.hint ?? null, code: progressError.code ?? null }, 500);

          return json({ definitions: definitions ?? [], progress: progress ?? [] });
        }

        if (action === "health") {
          const checks: Record<string, any> = {};

          const tableChecks = [
            "private_feature_definitions",
            "private_feature_progress",
            "private_feature_progress_events"
          ];

          for (const table of tableChecks) {
            const { error } = await ctx.supabaseAdmin
              .from(table)
              .select("id", { count: "exact", head: true });
            checks[table] = error
              ? { ok: false, message: error.message, code: error.code ?? null, details: error.details ?? null, hint: error.hint ?? null }
              : { ok: true };
          }

          const { data: rpcData, error: rpcError } =
            await ctx.supabaseAdmin.rpc("ensure_private_feature_progress", { p_player_id: userId });

          checks.ensure_private_feature_progress = rpcError
            ? { ok: false, message: rpcError.message, code: rpcError.code ?? null, details: rpcError.details ?? null, hint: rpcError.hint ?? null }
            : { ok: true, count: rpcData };

          const { data: eventRpcData, error: eventRpcError } =
            await ctx.supabaseAdmin.rpc("record_private_feature_progress_event", {
              p_player_id: userId,
              p_event_type: "health_check",
              p_roll_number: null,
              p_payload: { source: "private-features-health" }
            });

          checks.record_private_feature_progress_event = eventRpcError
            ? { ok: false, message: eventRpcError.message, code: eventRpcError.code ?? null, details: eventRpcError.details ?? null, hint: eventRpcError.hint ?? null }
            : { ok: true, id: eventRpcData };

          return json({ ok: Object.values(checks).every((check: any) => check?.ok), checks });
        }

        if (action === "seed") {
          try {
            const result = await ensureSeedFeatures();
            return json({
              inserted: result.inserted,
              existing: result.existing,
              total: result.inserted.length + result.existing.length
            });
          } catch (error) {
            console.error("Feature seed failed:", error);
            return json(
              {
                error: "seed_failed",
                message: error instanceof Error ? error.message : String(error)
              },
              500
            );
          }
        }

        if (action === "save") {
          const normalized =
            normalizeDefinition(body.definition ?? {});

          if (body.definition?.id) {
            const { data, error } =
              await ctx.supabaseAdmin
                .from("private_feature_definitions")
                .update(normalized)
                .eq("id", body.definition.id)
                .select("*")
                .single();

            if (error) {
              return json(
                {
                  error: "feature_update_failed",
                  message: error.message
                },
                500
              );
            }

            return json({ definition: data });
          }

          const { data, error } =
            await ctx.supabaseAdmin
              .from("private_feature_definitions")
              .insert(normalized)
              .select("*")
              .single();

          if (error) {
            return json(
              {
                error: "feature_create_failed",
                message: error.message
              },
              500
            );
          }

          return json({ definition: data });
        }

        if (action === "delete") {
          const { error } =
            await ctx.supabaseAdmin
              .from("private_feature_definitions")
              .delete()
              .eq("id", body.id);

          if (error) {
            return json(
              {
                error: "feature_delete_failed",
                message: error.message
              },
              500
            );
          }

          return json({ ok: true });
        }

        return json(
          { error: "unknown_action" },
          400
        );
      } catch (error) {
        // Never let an unexpected exception turn into an opaque browser-only
        // 500. The browser gets a useful JSON error and Supabase logs the
        // complete server-side exception.
        console.error("PRIVATE_FEATURES_UNHANDLED_ERROR", error);

        return json(
          {
            error: "private_feature_unhandled_error",
            message:
              error instanceof Error
                ? error.message
                : String(error)
          },
          500
        );
      }
    }
  )
};
