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


async function auditPrivateAction(ctx: any, adminId: string, action: string, details: Record<string, unknown> = {}) {
  try {
    const { error } = await ctx.supabaseAdmin
      .from("admin_audit_log")
      .insert({ admin_id: adminId, target_player_id: null, action, details });
    if (error) console.error("Private feature audit write failed:", error.message);
  } catch (error) {
    console.error("Private feature audit write crashed:", error);
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


function normalizeGem(body: any) {
  return {
    name: String(body.name ?? "Untitled Gem").trim().slice(0, 120),
    rarity: Number(body.rarity ?? 1),
    base_weight: Number(body.base_weight ?? 1),
    value_per_gram: Number(body.value_per_gram ?? 0),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    enabled: body.enabled !== false,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}
  };
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
    admin_only: body.admin_only === true,

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


        if (action === "gem-list") {
          const { data, error } = await ctx.supabaseAdmin
            .from("private_feature_gems")
            .select("*")
            .order("sort_order")
            .order("rarity");
          if (error) return json({
            error: "gem_list_failed",
            message: error.message,
            details: error.details ?? null,
            hint: error.hint ?? null,
            code: error.code ?? null
          }, 500);
          return json({ gems: data ?? [] });
        }

        if (action === "gem-save") {
          const normalized = normalizeGem(body.gem ?? {});
          if (!normalized.name || !Number.isFinite(normalized.rarity) || normalized.rarity <= 0 ||
              !Number.isFinite(normalized.base_weight) || normalized.base_weight <= 0 ||
              !Number.isFinite(normalized.value_per_gram) || normalized.value_per_gram < 0) {
            return json({ error: "invalid_gem", message: "Name, rarity, base weight and value per gram must be valid." }, 400);
          }

          let result;
          if (body.gem?.id) {
            result = await ctx.supabaseAdmin
              .from("private_feature_gems")
              .update(normalized)
              .eq("id", body.gem.id)
              .select("*")
              .single();
          } else {
            result = await ctx.supabaseAdmin
              .from("private_feature_gems")
              .insert(normalized)
              .select("*")
              .single();
          }

          if (result.error) return json({
            error: "gem_save_failed",
            message: result.error.message,
            details: result.error.details ?? null,
            code: result.error.code ?? null
          }, 500);
          await auditPrivateAction(ctx, userId, body.gem?.id ? "private_gem_updated" : "private_gem_created", { name: normalized.name, enabled: normalized.enabled });
          return json({ gem: result.data });
        }

        if (action === "gem-toggle") {
          const id = String(body.id ?? "");
          const enabled = body.enabled === true;
          const { data, error } = await ctx.supabaseAdmin
            .from("private_feature_gems")
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("*")
            .single();
          if (error) return json({ error: "gem_toggle_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "private_gem_toggled", { id, enabled });
          return json({ gem: data });
        }

        if (action === "gem-delete") {
          const id = String(body.id ?? "");
          const { error } = await ctx.supabaseAdmin
            .from("private_feature_gems")
            .delete()
            .eq("id", id);
          if (error) return json({ error: "gem_delete_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "private_gem_deleted", { id });
          return json({ ok: true });
        }

        if (action === "section-list") {
          const { data, error } = await ctx.supabaseAdmin
            .from("game_section_settings")
            .select("*")
            .order("sort_order");
          if (error) return json({ error: "section_list_failed", message: error.message }, 500);
          return json({ sections: data ?? [] });
        }

        if (action === "section-toggle") {
          const id = String(body.id ?? "");
          const enabled = body.enabled === true;
          const update = { enabled, updated_at: new Date().toISOString() };
          const { data, error } = await ctx.supabaseAdmin
            .from("game_section_settings")
            .update(update)
            .eq("id", id)
            .select("*")
            .single();
          if (error) return json({ error: "section_toggle_failed", message: error.message }, 500);
          if (id === "workbench") {
            const { error: forgeToggleError } = await ctx.supabaseAdmin
              .from("forge_config")
              .upsert({ id:true, enabled, updated_at:new Date().toISOString() });
            if (forgeToggleError) console.error("Workbench config sync failed:", forgeToggleError.message);
          }
          if (id === "daily-spin") {
            const { error: spinToggleError } = await ctx.supabaseAdmin
              .from("daily_spin_config")
              .upsert({ id:true, enabled, updated_at:new Date().toISOString() });
            if (spinToggleError) console.error("Daily Spin config sync failed:", spinToggleError.message);
          }
          await auditPrivateAction(ctx, userId, "site_section_toggled", { id, enabled });
          return json({ section: data });
        }

        if (action === "section-access-toggle") {
          const id = String(body.id ?? "");
          const adminOnly = body.adminOnly === true;
          const { data, error } = await ctx.supabaseAdmin
            .from("game_section_settings")
            .update({ admin_only: adminOnly, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("*")
            .single();
          if (error) return json({ error: "section_access_toggle_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "site_section_access_toggled", { id, adminOnly });
          return json({ section: data });
        }

        if (action === "section-save") {
          const id = String(body.id ?? "");
          const label = String(body.label ?? "Feature").trim().slice(0, 80) || "Feature";
          const shortLabel = String(body.short_label ?? label).trim().slice(0, 24) || label;
          const icon = String(body.icon ?? "◆").slice(0, 8) || "◆";
          const adminOnly = body.admin_only === true;
          const { data, error } = await ctx.supabaseAdmin
            .from("game_section_settings")
            .update({
              label,
              short_label: shortLabel,
              icon,
              admin_only: adminOnly,
              updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .select("*")
            .single();
          if (error) return json({ error: "section_save_failed", message: error.message }, 500);

          if (id === "workbench") {
            const { error: forgeNameError } = await ctx.supabaseAdmin
              .from("forge_config")
              .upsert({
                id: true,
                display_name: label,
                beta_label: label,
                icon,
                updated_at: new Date().toISOString()
              });
            if (forgeNameError) return json({ error: "workbench_name_sync_failed", message: forgeNameError.message }, 500);
          }

          await auditPrivateAction(ctx, userId, "site_section_customized", { id, label, short_label: shortLabel, icon });
          return json({ section: data });
        }

        if (action === "daily-spin-config") {
          if (body.save) {
            const c = body.config ?? {};
            const rewards = Array.isArray(c.rewards) ? c.rewards : [];
            const normalizedRewards = rewards.map((r:any, index:number) => ({
              id: String(r.id ?? `reward-${index + 1}`).slice(0, 80),
              label: String(r.label ?? `Reward ${index + 1}`).slice(0, 120),
              chance: Math.max(0, Number(r.chance ?? 0)),
              reward: r.reward && typeof r.reward === "object" ? r.reward : { type: "custom", label: "Custom reward" }
            }));
            if (!normalizedRewards.some((r:any) => r.chance > 0)) {
              return json({ error: "daily_spin_no_positive_chances", message: "At least one reward needs a chance above 0." }, 400);
            }
            const { data, error } = await ctx.supabaseAdmin
              .from("daily_spin_config")
              .upsert({
                id: true,
                enabled: c.enabled === true,
                title: String(c.title ?? "Daily Spin").slice(0, 80),
                subtitle: String(c.subtitle ?? "One free spin every day.").slice(0, 180),
                icon: String(c.icon ?? "◉").slice(0, 8),
                rewards: normalizedRewards,
                updated_at: new Date().toISOString()
              })
              .select("*")
              .single();
            if (error) return json({ error: "daily_spin_save_failed", message: error.message }, 500);
            await auditPrivateAction(ctx, userId, "daily_spin_config_saved", { enabled: data.enabled, rewardCount: normalizedRewards.length });
            return json({ dailySpin: data });
          }
          const { data, error } = await ctx.supabaseAdmin.from("daily_spin_config").select("*").eq("id", true).single();
          if (error) return json({ error: "daily_spin_load_failed", message: error.message }, 500);
          return json({ dailySpin: data });
        }

        if (action === "rarity-list") {
          const { data, error } = await ctx.supabaseAdmin.from("gem_rarity_definitions").select("*").order("sort_order").order("min_rarity");
          if (error) return json({ error: "rarity_list_failed", message: error.message }, 500);
          return json({ rarities: data ?? [] });
        }

        if (action === "rarity-save") {
          const r = body.rarity ?? {};
          const row = {
            name: String(r.name ?? "New Rarity").trim().slice(0, 60),
            min_rarity: Math.max(1, Number(r.min_rarity ?? 1)),
            max_rarity: r.max_rarity == null || r.max_rarity === "" ? null : Math.max(1, Number(r.max_rarity)),
            color: String(r.color ?? "#9aa4b2").slice(0, 20),
            icon: String(r.icon ?? "◆").slice(0, 8),
            sort_order: Number(r.sort_order ?? 0),
            enabled: r.enabled !== false,
            metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
            updated_at: new Date().toISOString()
          };
          if (!row.name) return json({ error: "invalid_rarity_name" }, 400);
          const q = r.id
            ? ctx.supabaseAdmin.from("gem_rarity_definitions").update(row).eq("id", r.id).select("*").single()
            : ctx.supabaseAdmin.from("gem_rarity_definitions").insert(row).select("*").single();
          const { data, error } = await q;
          if (error) return json({ error: "rarity_save_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, r.id ? "gem_rarity_updated" : "gem_rarity_created", { id: data.id, name: data.name });
          return json({ rarity: data });
        }

        if (action === "rarity-delete") {
          const { error } = await ctx.supabaseAdmin.from("gem_rarity_definitions").delete().eq("id", String(body.id));
          if (error) return json({ error: "rarity_delete_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "gem_rarity_deleted", { id: body.id });
          return json({ ok: true });
        }

        if (action === "pvp-list") {
          const { data, error } = await ctx.supabaseAdmin.from("pvp_weapon_definitions").select("*").order("sort_order");
          if (error) return json({ error: "pvp_weapon_list_failed", message: error.message }, 500);
          return json({ weapons: data ?? [] });
        }

        if (action === "pvp-save") {
          const w = body.weapon ?? {};
          const attacks = Array.isArray(w.attacks) ? w.attacks : [];
          if (attacks.length < 3) return json({ error: "pvp_weapon_requires_three_attacks", message: "Every PvP weapon must have at least 3 attacks." }, 400);
          const normalizedAttacks = attacks.map((a:any, i:number) => ({
            id: String(a.id ?? `attack-${i+1}`).slice(0, 60),
            name: String(a.name ?? `Attack ${i+1}`).slice(0, 80),
            damageMultiplier: Math.max(0, Number(a.damageMultiplier ?? 1)),
            cooldown: Math.max(0, Number(a.cooldown ?? 0)),
            description: String(a.description ?? "").slice(0, 240)
          }));
          const row = {
            name: String(w.name ?? "PvP Weapon").slice(0, 100),
            description: String(w.description ?? "").slice(0, 500),
            enabled: w.enabled !== false,
            rarity: String(w.rarity ?? "Common").slice(0, 40),
            base_damage: Math.max(1, Number(w.base_damage ?? 10)),
            attacks: normalizedAttacks,
            metadata: w.metadata && typeof w.metadata === "object" ? w.metadata : {},
            sort_order: Number(w.sort_order ?? 0),
            updated_at: new Date().toISOString()
          };
          const q = w.id
            ? ctx.supabaseAdmin.from("pvp_weapon_definitions").update(row).eq("id", w.id).select("*").single()
            : ctx.supabaseAdmin.from("pvp_weapon_definitions").insert(row).select("*").single();
          const { data, error } = await q;
          if (error) return json({ error: "pvp_weapon_save_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "pvp_weapon_saved", { id: data.id, name: data.name, attackCount: normalizedAttacks.length });
          return json({ weapon: data });
        }

        if (action === "pvp-delete") {
          const { error } = await ctx.supabaseAdmin.from("pvp_weapon_definitions").delete().eq("id", String(body.id));
          if (error) return json({ error: "pvp_weapon_delete_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "pvp_weapon_deleted", { id: body.id });
          return json({ ok: true });
        }



        // ---------------------------------------------------------
        // WORLD / FORGE / DUNGEON BUILDERS
        // These are deliberately service-role only and remain disabled
        // until the corresponding game_section_settings row is enabled.
        // ---------------------------------------------------------
        if (action === "world-list") {
          const { data: islands, error } = await ctx.supabaseAdmin
            .from("island_definitions").select("*").order("sort_order");
          if (error) return json({ error:"world_list_failed", message:error.message },500);
          const { data: dungeons, error: de } = await ctx.supabaseAdmin
            .from("dungeon_definitions").select("*").order("sort_order");
          if (de) return json({ error:"dungeon_list_failed", message:de.message },500);
          const { data: sections, error: se } = await ctx.supabaseAdmin
            .from("game_section_settings").select("*")
            .in("id",["islands","workbench","dungeons"]);
          if (se) return json({ error:"world_sections_failed", message:se.message },500);
          const { data: forge, error: fe } = await ctx.supabaseAdmin
            .from("forge_config").select("*").eq("id",true).maybeSingle();
          if (fe) return json({ error:"forge_config_failed", message:fe.message },500);
          return json({ islands:islands??[], dungeons:dungeons??[], sections:sections??[], workbench:forge??null });
        }

        if (action === "world-save") {
          const w = body.island ?? {};
          const row = {
            island_number: Number(w.island_number ?? 1),
            name: String(w.name ?? "Unnamed Island").slice(0,120),
            description: String(w.description ?? "").slice(0,1000),
            enabled: w.enabled === true,
            permanent: w.permanent !== false,
            starts_at: w.starts_at || null,
            ends_at: w.ends_at || null,
            unlock_requirements: (w.unlock_requirements && typeof w.unlock_requirements==="object") ? w.unlock_requirements : {},
            boosts: (w.boosts && typeof w.boosts==="object") ? w.boosts : {},
            sort_order: Number(w.sort_order ?? 0),
            updated_at: new Date().toISOString()
          };
          const q = w.id
            ? ctx.supabaseAdmin.from("island_definitions").update(row).eq("id",w.id).select("*").single()
            : ctx.supabaseAdmin.from("island_definitions").insert(row).select("*").single();
          const {data,error}=await q;
          if(error) return json({error:"world_save_failed",message:error.message},500);
          await auditPrivateAction(ctx,userId,"island_saved",{id:data?.id,name:row.name,enabled:row.enabled});
          return json({island:data});
        }

        if (action === "world-toggle") {
          const {data,error}=await ctx.supabaseAdmin.from("island_definitions")
            .update({enabled:body.enabled===true,updated_at:new Date().toISOString()})
            .eq("id",String(body.id)).select("*").single();
          if(error) return json({error:"world_toggle_failed",message:error.message},500);
          return json({island:data});
        }

        if (action === "world-delete") {
          const {error}=await ctx.supabaseAdmin.from("island_definitions").delete().eq("id",String(body.id));
          if(error) return json({error:"world_delete_failed",message:error.message},500);
          await auditPrivateAction(ctx,userId,"island_deleted",{id:body.id});
          return json({ok:true});
        }

        if (action === "dungeon-save") {
          const d=body.dungeon??{};
          const row={
            name:String(d.name??"Untitled Dungeon").slice(0,120),
            description:String(d.description??"").slice(0,1000),
            enabled:d.enabled===true, permanent:d.permanent!==false,
            starts_at:d.starts_at||null, ends_at:d.ends_at||null,
            max_enemies:Math.max(1,Number(d.max_enemies??5)),
            entry_requirements:(d.entry_requirements&&typeof d.entry_requirements==="object")?d.entry_requirements:{},
            loot:Array.isArray(d.loot)?d.loot:[],
            rewards:(d.rewards&&typeof d.rewards==="object")?d.rewards:{},
            sort_order:Number(d.sort_order??0), updated_at:new Date().toISOString()
          };
          const q=d.id?ctx.supabaseAdmin.from("dungeon_definitions").update(row).eq("id",d.id).select("*").single():ctx.supabaseAdmin.from("dungeon_definitions").insert(row).select("*").single();
          const {data,error}=await q;
          if(error)return json({error:"dungeon_save_failed",message:error.message},500);
          return json({dungeon:data});
        }

        if (action === "dungeon-delete") {
          const {error}=await ctx.supabaseAdmin.from("dungeon_definitions").delete().eq("id",String(body.id));
          if(error)return json({error:"dungeon_delete_failed",message:error.message},500);
          return json({ok:true});
        }

        if (action === "dungeon-enemies") {
          const {data,error}=await ctx.supabaseAdmin.from("dungeon_enemies").select("*")
            .eq("dungeon_id",String(body.dungeonId)).order("sort_order");
          if(error)return json({error:"enemy_list_failed",message:error.message},500);
          return json({enemies:data??[]});
        }

        if (action === "enemy-save") {
          const e=body.enemy??{};
          const row={
            dungeon_id:String(e.dungeon_id), name:String(e.name??"Enemy").slice(0,120),
            max_health:Math.max(1,Number(e.max_health??100)), attack:Math.max(0,Number(e.attack??10)),
            defense:Math.max(0,Number(e.defense??0)), speed:Math.max(0,Number(e.speed??1)),
            crit_chance:Math.max(0,Math.min(1,Number(e.crit_chance??0))),
            stats:(e.stats&&typeof e.stats==="object")?e.stats:{},
            loot:Array.isArray(e.loot)?e.loot:[], sort_order:Number(e.sort_order??0),
            enabled:e.enabled!==false, updated_at:new Date().toISOString()
          };
          const q=e.id?ctx.supabaseAdmin.from("dungeon_enemies").update(row).eq("id",e.id).select("*").single():ctx.supabaseAdmin.from("dungeon_enemies").insert(row).select("*").single();
          const {data,error}=await q;
          if(error)return json({error:"enemy_save_failed",message:error.message},500);
          return json({enemy:data});
        }

        if (action === "enemy-delete") {
          const {error}=await ctx.supabaseAdmin.from("dungeon_enemies").delete().eq("id",String(body.id));
          if(error)return json({error:"enemy_delete_failed",message:error.message},500);
          return json({ok:true});
        }

        if (action === "workbench-config") {
          if (body.save) {
            const c=body.config??{};
            const row={
              enabled:c.enabled===true, beta_label:String(c.beta_label??c.display_name??"Workbench [BETA]").slice(0,80),
              display_name:String(c.display_name??c.beta_label??"Workbench [BETA]").slice(0,80),
              icon:String(c.icon??"⚒").slice(0,8),
              min_materials:Math.max(1,Number(c.min_materials??3)), max_materials:Math.max(1,Number(c.max_materials??50)),
              stage_time_seconds:Math.max(2,Number(c.stage_time_seconds??8)),
              quality_broken:Number(c.quality_broken??.65),quality_poor:Number(c.quality_poor??.8),
              quality_average:Number(c.quality_average??1),quality_good:Number(c.quality_good??1.1),
              quality_excellent:Number(c.quality_excellent??1.2),quality_masterwork:Number(c.quality_masterwork??1.3),
              trait_threshold_minor:Number(c.trait_threshold_minor??.1),trait_threshold_full:Number(c.trait_threshold_full??.3),
              ore_count_rules:Array.isArray(c.ore_count_rules)?c.ore_count_rules:[],
              trait_rules:Array.isArray(c.trait_rules)?c.trait_rules:[],
              updated_at:new Date().toISOString()
            };
            const {data,error}=await ctx.supabaseAdmin.from("forge_config").upsert({...row,id:true}).select("*").single();
            if(error)return json({error:"forge_config_save_failed",message:error.message},500);
            return json({workbench:data});
          }
          const {data,error}=await ctx.supabaseAdmin.from("forge_config").select("*").eq("id",true).single();
          if(error)return json({error:"forge_config_load_failed",message:error.message},500);
          return json({workbench:data});
        }


        // ---------------------------------------------------------
        // ADDITIONAL EXPANSION FEATURE LAB
        // Structured builders manage these records; raw JSON is never
        // required by the Upcoming Features UI.
        // ---------------------------------------------------------
        if (action === "expansion-list") {
          const { data, error } = await ctx.supabaseAdmin
            .from("expansion_feature_definitions")
            .select("*")
            .order("feature_type")
            .order("sort_order")
            .order("name");
          if (error) return json({ error: "expansion_list_failed", message: error.message }, 500);
          return json({ definitions: data ?? [] });
        }

        if (action === "expansion-save") {
          const d = body.definition ?? {};
          const featureType = String(d.feature_type ?? "").trim();
          const allowedTypes = [
            "artifact-archives","gem-fusion","enchanting-lab","collection-hall",
            "mining-events","merchant-caravan","research-tree"
          ];
          if (!allowedTypes.includes(featureType)) {
            return json({ error: "invalid_expansion_type" }, 400);
          }
          const row = {
            feature_type: featureType,
            name: String(d.name ?? "Untitled System").trim().slice(0, 120),
            description: String(d.description ?? "").slice(0, 1000),
            enabled: d.enabled === true,
            permanent: d.permanent !== false,
            starts_at: d.starts_at || null,
            ends_at: d.ends_at || null,
            sort_order: Number(d.sort_order ?? 0),
            config: d.config && typeof d.config === "object" ? d.config : {},
            metadata: d.metadata && typeof d.metadata === "object" ? d.metadata : {},
            updated_at: new Date().toISOString()
          };
          if (!row.name) return json({ error: "expansion_name_required" }, 400);

          const q = d.id
            ? ctx.supabaseAdmin.from("expansion_feature_definitions").update(row).eq("id", d.id).select("*").single()
            : ctx.supabaseAdmin.from("expansion_feature_definitions").insert(row).select("*").single();
          const { data, error } = await q;
          if (error) return json({ error: "expansion_save_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, d.id ? "expansion_feature_updated" : "expansion_feature_created", {
            id: data.id, feature_type: featureType, name: row.name, enabled: row.enabled
          });
          return json({ definition: data });
        }

        if (action === "expansion-toggle") {
          const enabled = body.enabled === true;
          const { data, error } = await ctx.supabaseAdmin
            .from("expansion_feature_definitions")
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq("id", String(body.id))
            .select("*")
            .single();
          if (error) return json({ error: "expansion_toggle_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "expansion_feature_toggled", { id: body.id, enabled });
          return json({ definition: data });
        }

        if (action === "expansion-delete") {
          const { error } = await ctx.supabaseAdmin
            .from("expansion_feature_definitions")
            .delete()
            .eq("id", String(body.id));
          if (error) return json({ error: "expansion_delete_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "expansion_feature_deleted", { id: body.id });
          return json({ ok: true });
        }

        if (action === "toggle") {
          const id = String(body.id ?? "");
          const enabled = body.enabled === true;
          const { data, error } = await ctx.supabaseAdmin
            .from("private_feature_definitions")
            .update({ enabled, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("*")
            .single();
          if (error) return json({ error: "feature_toggle_failed", message: error.message }, 500);
          await auditPrivateAction(ctx, userId, "private_feature_toggled", { id, enabled });
          return json({ definition: data });
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

            await auditPrivateAction(ctx, userId, "private_feature_updated", { id: body.definition.id, name: normalized.name, enabled: normalized.enabled });
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

          await auditPrivateAction(ctx, userId, "private_feature_created", { name: normalized.name, kind: normalized.feature_kind, enabled: normalized.enabled });
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

          await auditPrivateAction(ctx, userId, "private_feature_deleted", { id: body.id });
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
