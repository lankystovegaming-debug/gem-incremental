import { withSupabase } from "npm:@supabase/server";
// Owner user IDs that can access the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_OWNER_USER_IDS: string[] = [];

// Extra admin user IDs for the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_ADMIN_USER_IDS: string[] = [];

// Password required by the hidden Upcoming Features workspace.
export const PRIVATE_FEATURE_PASSWORD = "lankygem";

function json(data: unknown, status = 200) { return Response.json(data, { status }); }
function samePassword(value: unknown) { return typeof value === "string" && value === PRIVATE_FEATURE_PASSWORD; }

async function isAllowed(ctx: any, userId: string) {
  if (PRIVATE_FEATURE_OWNER_USER_IDS.includes(userId) || PRIVATE_FEATURE_ADMIN_USER_IDS.includes(userId)) return true;
  const { data } = await ctx.supabaseAdmin.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return data?.user_id === userId;
}

function normalizeDefinition(body: any) {
  return {
    feature_kind: body.feature_kind === "achievement" ? "achievement" : "quest",
    quest_type: body.feature_kind === "achievement" ? null : (body.quest_type ?? "special"),
    name: String(body.name ?? "Untitled Feature").slice(0, 120),
    description: String(body.description ?? "").slice(0, 1000),
    icon: String(body.icon ?? "◆").slice(0, 8),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    enabled: body.enabled !== false,
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : [],
    requirements: body.requirements && typeof body.requirements === "object" ? body.requirements : { type: "rolls", amount: 1 },
    rewards: Array.isArray(body.rewards) ? body.rewards : [],
    unlocks: Array.isArray(body.unlocks) ? body.unlocks : [],
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {}
  };
}

const seedFeatures = [
  { feature_kind: "achievement", name: "First Spark", description: "Complete your first real roll.", icon: "✦", requirements: { type: "rolls", amount: 1 }, rewards: [{ type: "potion", consumableId: "lucky-potion-1", amount: 2 }] },
  { feature_kind: "achievement", name: "Twin Crowns", description: "Roll two Legendary-tier gems back-to-back. Adjust the rarity threshold to your game's definition of Legendary.", icon: "♛", requirements: { type: "consecutive", amount: 2, match: { gemRarityGte: 10000 } }, rewards: [{ type: "coins", amount: 10 }] },
  { feature_kind: "achievement", name: "Mythic by Fate", description: "Find a Mythic-tier gem without using a Legendary or Mythic one-roll potion.", icon: "☄", requirements: { type: "single", match: { gemRarityGte: 1000000, noLegendaryOrMythicPotion: true } }, rewards: [{ type: "potion", consumableId: "mythic-potion", amount: 1 }] },
  { feature_kind: "achievement", name: "Five Thousand Deep", description: "Roll 5,000 times.", icon: "∞", requirements: { type: "rolls", amount: 5000 }, rewards: [{ type: "money", amount: 1000000 }, { type: "coins", amount: 25 }] },
  { feature_kind: "achievement", name: "Mythic Storm", description: "Roll 20 Mythics within any 500-roll window.", icon: "⚡", requirements: { type: "count", amount: 20, windowRolls: 500, match: { gemRarityGte: 1000000 } }, rewards: [{ type: "potion", consumableId: "mythic-potion", amount: 3 }] },
  { feature_kind: "quest", quest_type: "main", name: "Astral Ascension 1", description: "Begin the main progression.", icon: "Ⅰ", sort_order: 10, requirements: { type: "rolls", amount: 100 }, rewards: [{ type: "potion", consumableId: "lucky-potion-1", amount: 5 }], unlocks: ["pickaxe_t5"] },
  { feature_kind: "quest", quest_type: "main", name: "Astral Ascension 2", description: "Push deeper into the gem ladder.", icon: "Ⅱ", sort_order: 20, requirements: { all: [{ type: "rolls", amount: 500 }, { type: "count", amount: 3, match: { gemRarityGte: 100 } }] }, rewards: [{ type: "money", amount: 250000 }], unlocks: ["pickaxe_t8"] },
  { feature_kind: "quest", quest_type: "main", name: "Astral Ascension 3", description: "Prove you can survive the rare tier.", icon: "Ⅲ", sort_order: 30, requirements: { all: [{ type: "rolls", amount: 1500 }, { type: "count", amount: 5, match: { gemRarityGte: 1000 } }] }, rewards: [{ type: "coins", amount: 20 }], unlocks: ["pickaxe_t11", "bag_t8"] },
  { feature_kind: "quest", quest_type: "main", name: "Astral Ascension 4", description: "Reach the endgame gates.", icon: "Ⅳ", sort_order: 40, requirements: { all: [{ type: "rolls", amount: 5000 }, { type: "count", amount: 10, match: { gemRarityGte: 10000 } }] }, rewards: [{ type: "potion", consumableId: "legendary-potion", amount: 2 }], unlocks: ["pickaxe_t14", "bag_t11"] },
  { feature_kind: "quest", quest_type: "event", name: "Eclipse Rush", description: "A limited-time event hunt.", icon: "☾", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 7 * 86400000).toISOString(), requirements: { count: 3, match: { gemRarityGte: 100000 } }, rewards: [{ type: "coins", amount: 50 }] },
  { feature_kind: "quest", quest_type: "special", name: "Designer Playground", description: "A fully customizable special quest template.", icon: "✹", requirements: { any: [{ type: "single", match: { hasMutation: "corrupted" } }, { type: "single", match: { valueGte: 100000 } }] }, rewards: [{ type: "money", amount: 500000 }] }
];

export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  const userId = ctx.userClaims?.sub ?? ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
  if (!userId || !(await isAllowed(ctx, userId))) return json({ error: "private_feature_forbidden" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { }
  if (body.action !== "whoami" && !samePassword(body.password)) return json({ error: "private_feature_password_required" }, 401);

  const action = body.action;
  if (action === "whoami") return json({ allowed: true, requiresPassword: true });

  if (action === "list") {
    const { data, error } = await ctx.supabaseAdmin.from("private_feature_definitions").select("*").order("feature_kind").order("quest_type").order("sort_order");
    if (error) return json({ error: "feature_list_failed", message: error.message }, 500);
    return json({ definitions: data ?? [] });
  }

  if (action === "seed") {
    const inserted: any[] = [];
    for (const feature of seedFeatures) {
      const { data, error } = await ctx.supabaseAdmin.from("private_feature_definitions").insert(normalizeDefinition(feature)).select("*").single();
      if (error) return json({ error: "seed_failed", message: error.message }, 500);
      inserted.push(data);
    }
    return json({ inserted });
  }

  if (action === "save") {
    const normalized = normalizeDefinition(body.definition ?? {});
    if (body.definition?.id) {
      const { data, error } = await ctx.supabaseAdmin.from("private_feature_definitions").update(normalized).eq("id", body.definition.id).select("*").single();
      if (error) return json({ error: "feature_update_failed", message: error.message }, 500);
      return json({ definition: data });
    }
    const { data, error } = await ctx.supabaseAdmin.from("private_feature_definitions").insert(normalized).select("*").single();
    if (error) return json({ error: "feature_create_failed", message: error.message }, 500);
    return json({ definition: data });
  }

  if (action === "delete") {
    const { error } = await ctx.supabaseAdmin.from("private_feature_definitions").delete().eq("id", body.id);
    if (error) return json({ error: "feature_delete_failed", message: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "progress") {
    const { data, error } = await ctx.supabaseAdmin.from("private_feature_progress").select("*").order("updated_at", { ascending: false }).limit(5000);
    if (error) return json({ error: "progress_load_failed", message: error.message }, 500);
    return json({ progress: data ?? [] });
  }

  return json({ error: "unknown_action" }, 400);
}) };
