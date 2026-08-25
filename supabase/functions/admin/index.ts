import { withSupabase } from "npm:@supabase/server";


// Admins are stored in the public.admins table, not hardcoded, so
// the list can change without a redeploy and no UUID is baked into
// the source or the client bundle.
async function isAdmin(ctx: any, id: string | undefined) {
  if (!id) return false;

  // Keep the configured owner authoritative even if the admins table has not
  // yet been seeded in a fresh project.
  if (id === "38d5e8ce-18af-46d3-aa9e-6e601e75dd78") return true;

  const { data, error } = await ctx.supabaseAdmin
    .from("admins")
    .select("user_id")
    .eq("user_id", id)
    .maybeSingle();

  if (error) {
    console.error("Admin lookup failed:", error);
    return false;
  }

  return data?.user_id === id;
}

const GEM_CATALOG = [
  ["Quartz",2,100,0.0575],["Calcite",3,110,0.0736],
  ["Feldspar",5,125,0.092],["Fluorite",8,140,0.115],
  ["Hematite",12,160,0.13685],["Obsidian",18,180,0.15985],
  ["Agate",25,200,0.184],["Jasper",35,225,0.2093],
  ["Amethyst",50,250,0.253],["Garnet",70,275,0.3013],
  ["Citrine",90,290,0.34],["Peridot",100,300,0.36455],
  ["Topaz",150,325,0.47725],["Aquamarine",225,350,0.60835],
  ["Tourmaline",325,375,0.76705],["Opal",475,400,1.035],
  ["Zircon",650,425,1.2719],["Moonstone",750,440,1.43],
  ["Spinel",850,450,1.59735],["Sapphire",1100,475,2.05735],
  ["Ruby",1400,500,2.53],["Emerald",1800,525,3.06705],
  ["Diamond",2300,550,3.8686],["Tanzanite",2900,575,4.09975],
  ["Alexandrite",3600,600,5.07955],["Benitoite",4400,625,5.52],
  ["Red Beryl",5300,650,6.3687],["Black Opal",6300,675,7.3255],
  ["Demantoid",6800,690,7.6],["Grandidierite",7400,700,7.88555],
  ["Taaffeite",8500,725,8.7239],["Musgravite",9300,750,9.2],
  ["Painite",10000,800,9.34375],["Jeremejevite",14000,850,12],
  ["Poudretteite",22000,925,16],["Serendibite",35000,1000,22],
  ["Blue Garnet",55000,1100,30],["Kyawthuite",85000,1200,42],
  ["Aether Quartz",140000,1350,54],["Void Opal",250000,1550,76.5],
  ["Chronite",480000,1800,112.5],["Neutron Crystal",800000,2200,157.5],
  ["Dark Matter",1000000,2500,200],["Antimatter Crystal",1800000,2900,270],
  ["Singularity Shard",4000000,3600,472.5],["Lanky Gem",10000000,40500,111.1111],
  ["Heart of Xy",100000000,6500,2000]
].map(([name, rarity, baseWeight, valuePerGram]) => ({
  name: String(name),
  rarity: Number(rarity),
  baseWeight: Number(baseWeight),
  valuePerGram: Number(valuePerGram)
}));

const CONSUMABLE_IDS = new Set([
  "lucky-potion-1", "lucky-potion-2", "lucky-potion-3",
  "speed-potion-1", "speed-potion-2", "speed-potion-3",
  "fortune-potion-1", "fortune-potion-2", "fortune-potion-3",
  "mass-potion-1", "mass-potion-2", "mass-potion-3",
  "legendary-potion", "mythic-potion"
]);

// Mirrors src/data/mutations.js — the value multiplier per mutation.
// Mutation order matters: the ids are stored sorted by this order and
// the "primary" mutation is the first (rarest wins is by the same order
// the game uses, i.e. definition order here).
const MUTATION_CATALOG: Record<string, { name: string; multiplier: number }> = {
  polished:  { name: "Polished",  multiplier: 1.5 },
  gilded:    { name: "Gilded",    multiplier: 2.5 },
  prismatic: { name: "Prismatic", multiplier: 5 },
  celestial: { name: "Celestial", multiplier: 12 },
  corrupted: { name: "Corrupted", multiplier: 30 }
};
const MUTATION_ORDER = Object.keys(MUTATION_CATALOG);

function response(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function validUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function audit(ctx: any, adminId: string, targetId: string | null,
  action: string, details: Record<string, unknown> = {}) {
  const { error } = await ctx.supabaseAdmin
    .from("admin_audit_log")
    .insert({
      admin_id: adminId,
      target_player_id: targetId,
      action,
      details
    });

  if (error) console.error("Admin audit write failed:", error);
}

async function playerSummary(ctx: any, player: any) {
  const [authResult, gemResult, equipmentResult, consumableResult, boostResult, titleResult] =
    await Promise.all([
      ctx.supabaseAdmin.auth.admin.getUserById(player.id),
      ctx.supabaseAdmin.from("inventory_gems")
        .select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_equipment")
        .select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_consumables")
        .select("consumable_id, quantity").eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_boosts")
        .select("family, tier, effect_value, expires_at").eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_titles")
        .select("title,color").eq("player_id", player.id).maybeSingle()
    ]);

  return {
    ...player,
    email: authResult.data?.user?.email ?? null,
    isAnonymous: authResult.data?.user?.is_anonymous ?? false,
    bannedUntil: authResult.data?.user?.banned_until ?? null,
    gemCount: gemResult.count ?? 0,
    equipmentCount: equipmentResult.count ?? 0,
    consumables: consumableResult.data ?? [],
    boosts: boostResult.data ?? [],
    title: titleResult.data?.title ?? player.display_title ?? "",
    title_color: titleResult.data?.color ?? player.display_title_color ?? "#ffd166"
  };
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      const adminId =
        ctx.userClaims?.sub ??
        ctx.userClaims?.id ??
        ctx.jwtClaims?.sub;

      console.log("ADMIN CONTEXT", {
        userClaims: ctx.userClaims,
        jwtClaims: ctx.jwtClaims,
        hasSupabaseAdmin: Boolean(ctx.supabaseAdmin)
      });

      let body: any;
      try {
        body = await req.json();
      } catch {
        return response({ error: "invalid_request" }, 400);
      }

      const action = body?.action;
      const targetId = body?.targetId;

      console.log("ADMIN DEBUG", {
        action,
        adminId,
        userClaims: ctx.userClaims,
        jwtSub: ctx.jwtClaims?.sub
      });

      // Any authenticated user may ask whether they are an admin, so
      // the client can gate its UI without knowing any admin id.
      if (action === "whoami") {
        return response({ isAdmin: await isAdmin(ctx, adminId) });
      }

      if (!(await isAdmin(ctx, adminId))) {
        return response({ error: "admin_forbidden" }, 403);
      }

      if (action === "search") {
        const query = String(body.query ?? "").trim().toLowerCase();
        if (query.length < 2) return response({ error: "search_too_short" }, 400);

        const [playersResult, usersResult] = await Promise.all([
          ctx.supabaseAdmin.from("players")
            .select("id, username, money, total_rolls, inventory_capacity, next_roll_at")
            .limit(1000),
          ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        ]);

        if (playersResult.error || usersResult.error) {
          console.error("Admin search failed:", playersResult.error, usersResult.error);
          return response({ error: "search_failed" }, 500);
        }

        const users = new Map(
          (usersResult.data?.users ?? []).map((user: any) => [user.id, user])
        );

        const players = (playersResult.data ?? [])
          .filter((player: any) => {
            const user: any = users.get(player.id);
            return player.id.toLowerCase().includes(query) ||
              String(player.username ?? "").toLowerCase().includes(query) ||
              String(user?.email ?? "").toLowerCase().includes(query);
          })
          .slice(0, 50)
          .map((player: any) => {
            const user: any = users.get(player.id);
            return {
              ...player,
              email: user?.email ?? null,
              isAnonymous: user?.is_anonymous ?? false,
              bannedUntil: user?.banned_until ?? null
            };
          });

        await audit(ctx, adminId, null, "player_search", { query, results: players.length });
        return response({ players });
      }

      if (action === "audit") {
        const { data, error } = await ctx.supabaseAdmin
          .from("admin_audit_log")
          .select("id, admin_id, target_player_id, action, details, created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          console.error("Admin audit log load failed:", error);
          return response({
            entries: [],
            degraded: true,
            message: "Audit storage is unavailable in this deployment. Run the latest admin observability migration."
          });
        }
        return response({ entries: data ?? [], degraded: false });
      }


      if (action === "section_settings") {
        const { data, error } = await ctx.supabaseAdmin
          .from("game_section_settings")
          .select("*")
          .order("sort_order");
        if (error) return response({ error: "section_settings_load_failed", message: error.message }, 500);
        return response({ sections: data ?? [] });
      }

      if (action === "section_toggle") {
        const id = String(body.id ?? "");
        const enabled = body.enabled === true;
        const { data, error } = await ctx.supabaseAdmin
          .from("game_section_settings")
          .update({ enabled, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single();
        if (error) return response({ error: "section_toggle_failed", message: error.message }, 500);
        await audit(ctx, adminId, null, "main_section_toggled", { id, enabled });
        return response({ section: data });
      }

      if (action === "section_access_toggle") {
        const id = String(body.id ?? "");
        const adminOnly = body.adminOnly === true;
        const { data, error } = await ctx.supabaseAdmin
          .from("game_section_settings")
          .update({ admin_only: adminOnly, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single();
        if (error) return response({ error: "section_access_toggle_failed", message: error.message }, 500);
        await audit(ctx, adminId, null, "main_section_access_toggled", { id, adminOnly });
        return response({ section: data });
      }

      if (action === "start_mutation_event") {
        const name = String(body.name ?? "Mutation Surge").trim().slice(0, 80);
        const durationMinutes = Math.trunc(Number(body.durationMinutes));
        const mutationLuckBonus = Math.max(0, Number(body.mutationLuckBonus) || 0);
        const mutationLuckMultiplier = Math.max(0.01, Number(body.mutationLuckMultiplier) || 1);
        if (name.length < 3 || !Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) {
          return response({ error: "invalid_mutation_event" }, 400);
        }

        if (!validUuid(adminId)) {
          return response({ error: "admin_identity_invalid" }, 401);
        }

        const now = new Date();
        const ends = new Date(now.getTime() + durationMinutes * 60000);

        const { error: stopError } = await ctx.supabaseAdmin
          .from("admin_events")
          .update({ active: false })
          .eq("active", true);
        if (stopError) return response({ error: "mutation_event_stop_failed", message: stopError.message }, 500);

        const mutationEvent = {
          name,
          created_by: adminId,
          active: true,
          starts_at: now.toISOString(),
          ends_at: ends.toISOString(),

          // Neutral values for the normal global event modifiers.
          luck_bonus: 0,
          roll_speed_bonus: 0,
          weight_luck_bonus: 0,
          weight_multiplier_bonus: 0,
          luck_multiplier: 1,
          roll_speed_multiplier: 1,
          weight_luck_multiplier: 1,
          weight_multiplier_multiplier: 1,

          // Mutation Surge values are kept separate from normal luck.
          mutation_luck_bonus: mutationLuckBonus,
          mutation_luck_multiplier: mutationLuckMultiplier
        };

        const { data, error } = await ctx.supabaseAdmin
          .from("admin_events")
          .insert(mutationEvent)
          .select("*")
          .single();

        if (error) return response({ error: "mutation_event_start_failed", message: error.message }, 500);

        await audit(ctx, adminId, null, "mutation_luck_event_started", {
          name, durationMinutes, mutationLuckBonus, mutationLuckMultiplier
        });
        return response({ event: data });
      }

      // =========================================================
      // MUTATION CATALOG ADMINISTRATION
      // =========================================================
      if (action === "mutation_list") {
        const { data, error } = await ctx.supabaseAdmin
          .from("game_mutations")
          .select("*")
          .order("sort_order")
          .order("name");

        if (error) {
          return response({ error: "mutation_list_failed", message: error.message }, 500);
        }

        return response({ mutations: data ?? [] });
      }

      if (action === "mutation_save") {
        const mutation = body.mutation ?? {};
        const id = String(mutation.id ?? "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 64);
        const name = String(mutation.name ?? "").trim().slice(0, 80);
        const chance = finiteNumber(mutation.chance);
        const multiplier = finiteNumber(mutation.multiplier);

        if (!id || !name || chance === null || chance <= 0 || multiplier === null || multiplier <= 0) {
          return response({ error: "invalid_mutation" }, 400);
        }

        const payload = {
          id,
          name,
          chance,
          multiplier,
          description: String(mutation.description ?? "").slice(0, 500),
          icon: String(mutation.icon ?? "✦").slice(0, 8),
          color: String(mutation.color ?? "#9fdcff").slice(0, 32),
          enabled: mutation.enabled !== false,
          sort_order: Math.trunc(Number(mutation.sort_order) || 0),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await ctx.supabaseAdmin
          .from("game_mutations")
          .upsert(payload)
          .select("*")
          .single();

        if (error) {
          return response({ error: "mutation_save_failed", message: error.message }, 500);
        }

        await audit(ctx, adminId, null, "mutation_saved", { id, name, chance, multiplier });
        return response({ mutation: data });
      }

      if (action === "mutation_delete") {
        const id = String(body.id ?? "").trim().toLowerCase();

        if (!id) return response({ error: "invalid_mutation" }, 400);

        const { error } = await ctx.supabaseAdmin
          .from("game_mutations")
          .delete()
          .eq("id", id);

        if (error) {
          return response({ error: "mutation_delete_failed", message: error.message }, 500);
        }

        await audit(ctx, adminId, null, "mutation_deleted", { id });
        return response({ ok: true });
      }

      // Global fee analytics does not target a player, so handle it before
      // validating targetId for player-specific administration actions.
      if (action === "market_fee_analytics") {
        const { data, error } = await ctx.supabaseAdmin.rpc("admin_market_fee_summary");
        if (error) return response({ error: "market_fee_analytics_failed", message: error.message }, 500);
        await audit(ctx, adminId, null, "market_fee_analytics_viewed");
        return response({ fees: data ?? {} });
      }

      if (action === "museum_analytics") {
        const [profiles, exhibits, registrations, purchases] = await Promise.all([
          ctx.supabaseAdmin.from("museum_profiles").select("prestige,collections_completed"),
          ctx.supabaseAdmin.from("museum_exhibits").select("specimen_id", { count: "exact", head: true }),
          ctx.supabaseAdmin.from("museum_registrations").select("id", { count: "exact", head: true }),
          ctx.supabaseAdmin.from("museum_purchases").select("money_removed")
        ]);
        const error = profiles.error || exhibits.error || registrations.error || purchases.error;
        if (error) return response({ error: "museum_analytics_failed", message: error.message }, 500);
        const rows = profiles.data ?? [];
        await audit(ctx, adminId, null, "museum_analytics_viewed");
        return response({ museum: {
          curators: rows.length,
          exhibits: exhibits.count ?? 0,
          registrations: registrations.count ?? 0,
          prestige: rows.reduce((sum, row) => sum + Number(row.prestige ?? 0), 0),
          collections: rows.reduce((sum, row) => sum + Number(row.collections_completed ?? 0), 0),
          moneyRemoved: (purchases.data ?? []).reduce((sum, row) => sum + Number(row.money_removed ?? 0), 0)
        }});
      }

      if (!validUuid(targetId)) {
        return response({ error: "invalid_player_id" }, 400);
      }

      if (action === "inspect") {
        const { data: player, error } = await ctx.supabaseAdmin
          .from("players")
          .select("id, username, money, total_rolls, inventory_capacity, next_roll_at, rarest_gem_name, rarest_gem_rarity, mutation_luck, leaderboard_hidden, display_title, display_title_color")
          .eq("id", targetId)
          .maybeSingle();

        if (error || !player) return response({ error: "player_not_found" }, 404);

        const [summary, gems, equipment] = await Promise.all([
          playerSummary(ctx, player),
          ctx.supabaseAdmin.from("inventory_gems")
            .select("id, gem_name, rarity, final_weight, value, locked, created_at")
            .eq("player_id", targetId).order("created_at", { ascending: false }).limit(100),
          ctx.supabaseAdmin.from("player_equipment")
            .select("equipment_id, name, category, tier, equipped")
            .eq("player_id", targetId).order("tier", { ascending: false })
        ]);

        return response({
          player: summary,
          gems: gems.data ?? [],
          equipment: equipment.data ?? []
        });
      }

      if (action === "player_title_set") {
        const title = String(body.title ?? "").trim().slice(0, 40);
        const color = String(body.color ?? "#ffd166").trim();
        if (!title || !/^#[0-9a-f]{6}$/i.test(color)) {
          return response({ error: "invalid_player_title" }, 400);
        }
        const normalizedColor = color.toLowerCase();
        const now = new Date().toISOString();

        const { data, error } = await ctx.supabaseAdmin
          .from("player_titles")
          .upsert({ player_id: targetId, title, color: normalizedColor, updated_at: now }, { onConflict: "player_id" })
          .select("player_id,title,color,updated_at")
          .single();
        if (error) return response({ error: "player_title_save_failed", message: error.message }, 500);

        // Keep a durable copy on players as well. This makes titles survive
        // older profile/chat RPCs and older deployments of the separate admin UI.
        const { error: playerError } = await ctx.supabaseAdmin
          .from("players")
          .update({ display_title: title, display_title_color: normalizedColor })
          .eq("id", targetId);
        if (playerError) return response({ error: "player_title_player_sync_failed", message: playerError.message }, 500);

        await audit(ctx, adminId, targetId, "player_title_set", { title, color: normalizedColor });
        return response({ title: data });
      }

      if (action === "player_title_remove") {
        const { error } = await ctx.supabaseAdmin.from("player_titles").delete().eq("player_id", targetId);
        if (error) return response({ error: "player_title_remove_failed", message: error.message }, 500);
        const { error: playerError } = await ctx.supabaseAdmin
          .from("players")
          .update({ display_title: "", display_title_color: "#ffd166" })
          .eq("id", targetId);
        if (playerError) return response({ error: "player_title_player_sync_failed", message: playerError.message }, 500);
        await audit(ctx, adminId, targetId, "player_title_removed", {});
        return response({ ok: true });
      }

      if (action === "money") {
        const amount = finiteNumber(body.amount);
        if (amount === null || amount === 0 || Math.abs(amount) > 1e12) {
          return response({ error: "invalid_amount" }, 400);
        }

        const { data: player } = await ctx.supabaseAdmin
          .from("players").select("money, lifetime_earnings").eq("id", targetId).maybeSingle();
        if (!player) return response({ error: "player_not_found" }, 404);

        const before = Number(player.money ?? 0);
        const after = Math.max(0, before + amount);
        // Credit lifetime earnings too (only for additions), so granted
        // money is reflected on the leaderboard.
        const lifetimeBefore = Number(player.lifetime_earnings ?? 0);
        const lifetimeAfter = Math.max(0, lifetimeBefore + Math.max(0, amount));
        const { error } = await ctx.supabaseAdmin
          .from("players")
          .update({ money: after, lifetime_earnings: lifetimeAfter })
          .eq("id", targetId);
        if (error) return response({ error: "money_update_failed" }, 500);

        await audit(ctx, adminId, targetId, "money_adjusted", { amount, before, after });
        return response({ money: after });
      }

      if (action === "grant_gem") {
        const gem = GEM_CATALOG.find((entry) => entry.name === body.gemName);
        const multiplier = finiteNumber(body.weightMultiplier);
        if (!gem || multiplier === null || multiplier < 0.01 || multiplier > 1000) {
          return response({ error: "invalid_gem" }, 400);
        }

        // Optional mutations, validated against the catalog and stored
        // sorted by definition order, exactly like a rolled gem.
        const requestedMutations = Array.isArray(body.mutationIds) ? body.mutationIds : [];
        const mutationIds = MUTATION_ORDER.filter((id) =>
          requestedMutations.map((m: unknown) => String(m)).includes(id)
        );
        const mutationMultiplier = mutationIds.reduce(
          (total, id) => total * MUTATION_CATALOG[id].multiplier, 1
        );
        const mutationMultipliers = Object.fromEntries(
          mutationIds.map((id) => [id, MUTATION_CATALOG[id].multiplier])
        );
        const primaryMutation = mutationIds[0] ?? null;

        const finalWeight = gem.baseWeight * multiplier;
        const value = finalWeight * gem.valuePerGram * mutationMultiplier;

        // Stamp the gem with the target's current roll count and their
        // effective luck (base 1 + equipped luck + active luck boosts),
        // so a granted gem reads like one rolled right now instead of
        // showing "—".
        const [playerStat, equipStat, boostStat] = await Promise.all([
          ctx.supabaseAdmin.from("players").select("total_rolls").eq("id", targetId).maybeSingle(),
          ctx.supabaseAdmin.from("player_equipment").select("luck_bonus").eq("player_id", targetId).eq("equipped", true),
          ctx.supabaseAdmin.from("player_boosts").select("effect_value").eq("player_id", targetId).eq("family", "luck").gt("expires_at", new Date().toISOString())
        ]);
        const rollNumber = Number(playerStat.data?.total_rolls ?? 0);
        const luckAtRoll = 1
          + (equipStat.data ?? []).reduce((sum: number, e: any) => sum + Number(e.luck_bonus ?? 0), 0)
          + (boostStat.data ?? []).reduce((sum: number, b: any) => sum + Number(b.effect_value ?? 0), 0);

        const { data, error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .insert({
            player_id: targetId,
            gem_name: gem.name,
            rarity: gem.rarity,
            base_weight: gem.baseWeight,
            value_per_gram: gem.valuePerGram,
            rolled_weight_multiplier: multiplier,
            rolled_weight: finalWeight,
            final_weight: finalWeight,
            value,
            locked: false,
            roll_number: rollNumber,
            luck_at_roll: luckAtRoll,
            mutation_id: primaryMutation,
            mutation_multiplier: mutationMultiplier,
            mutation_ids: mutationIds,
            mutation_multipliers: mutationMultipliers
          })
          .select("id").single();
        if (error) return response({ error: "gem_grant_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "gem_granted", {
          gemName: gem.name, weightMultiplier: multiplier, mutationIds, specimenId: data.id
        });
        return response({ specimenId: data.id });
      }

      if (action === "potion") {
        const consumableId = String(body.consumableId ?? "");
        const amount = Math.trunc(Number(body.amount));
        if (!CONSUMABLE_IDS.has(consumableId) || !Number.isFinite(amount) ||
          amount === 0 || Math.abs(amount) > 100000) {
          return response({ error: "invalid_potion" }, 400);
        }

        const { data: current, error: currentError } = await ctx.supabaseAdmin
          .from("player_consumables").select("quantity")
          .eq("player_id", targetId).eq("consumable_id", consumableId).maybeSingle();
        if (currentError) {
          return response({ error: "potion_load_failed", message: currentError.message }, 500);
        }

        const before = Number(current?.quantity ?? 0);
        const after = Math.max(0, before + amount);

        let mutation;

        if (after === 0) {
          mutation = ctx.supabaseAdmin
            .from("player_consumables")
            .delete()
            .eq("player_id", targetId)
            .eq("consumable_id", consumableId);
        } else if (current) {
          mutation = ctx.supabaseAdmin
            .from("player_consumables")
            .update({
              quantity: after,
              updated_at: new Date().toISOString()
            })
            .eq("player_id", targetId)
            .eq("consumable_id", consumableId);
        } else {
          mutation = ctx.supabaseAdmin
            .from("player_consumables")
            .insert({
              player_id: targetId,
              consumable_id: consumableId,
              quantity: after,
              updated_at: new Date().toISOString()
            });
        }

        const { error } = await mutation;
        if (error) {
          return response({ error: "potion_update_failed", message: error.message }, 500);
        }

        await audit(ctx, adminId, targetId, "potion_adjusted", {
          consumableId, amount, before, after
        });
        return response({ quantity: after });
      }

      if (action === "mutation_luck") {
        const value = finiteNumber(body.mutationLuck);
        if (value === null || value < 1 || value > 100000) {
          return response({ error: "invalid_mutation_luck" }, 400);
        }

        const { error } = await ctx.supabaseAdmin
          .from("players").update({ mutation_luck: value }).eq("id", targetId);
        if (error) return response({ error: "mutation_luck_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "mutation_luck_set", { mutationLuck: value });
        return response({ mutationLuck: value });
      }

      if (action === "reset_cooldown") {
        const { error } = await ctx.supabaseAdmin
          .from("players").update({ next_roll_at: null }).eq("id", targetId);
        if (error) return response({ error: "cooldown_reset_failed" }, 500);
        await audit(ctx, adminId, targetId, "cooldown_reset");
        return response({ success: true });
      }

      if (action === "leaderboard_visibility") {
        const hidden = body.hidden === true;
        const { error } = await ctx.supabaseAdmin
          .from("players").update({ leaderboard_hidden: hidden }).eq("id", targetId);
        if (error) return response({ error: "leaderboard_visibility_failed", message: error.message }, 500);
        await audit(ctx, adminId, targetId, hidden ? "leaderboard_hidden" : "leaderboard_shown");
        return response({ hidden });
      }

      if (action === "account_lock") {
        if (targetId === adminId && body.locked === true) {
          return response({ error: "cannot_lock_self" }, 409);
        }

        const locked = body.locked === true;
        const { data, error } = await ctx.supabaseAdmin.auth.admin.updateUserById(
          targetId,
          { ban_duration: locked ? "876000h" : "none" }
        );
        if (error) return response({ error: "account_lock_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, locked ? "account_locked" : "account_unlocked");
        return response({ locked, bannedUntil: data.user?.banned_until ?? null });
      }



      // =========================================================
      // GLOBAL ADMIN ANALYTICS
      // =========================================================
      if (action === "analytics") {
        // Prefer the aggregate SECURITY DEFINER RPC. This avoids RLS/row-limit
        // surprises and makes the analytics panel work consistently.
        const { data: aggregateAnalytics, error: aggregateAnalyticsError } =
          await ctx.supabaseAdmin.rpc("get_admin_analytics");

        if (!aggregateAnalyticsError && aggregateAnalytics) {
          await audit(ctx, adminId, null, "analytics_viewed");
          return response({
            ...aggregateAnalytics,
            topGems: [],
            mutations: [],
            mutationCombinations: [],
            activeBoosts: {},
            highestRollPlayers: []
          });
        }

        console.warn("Aggregate analytics RPC unavailable; using detailed fallback:", aggregateAnalyticsError);

        const [
          playersResult,
          rollsResult,
          gemsResult,
          moneyResult,
          activeBoostsResult,
          announcementsResult,
          oneRollBoostsResult
        ] = await Promise.all([
          ctx.supabaseAdmin.from("players")
            .select("id, money, total_rolls, mutation_luck"),
          ctx.supabaseAdmin.from("players")
            .select("id, total_rolls, updated_at")
            .order("total_rolls", { ascending: false })
            .limit(100),
          ctx.supabaseAdmin.from("inventory_gems")
            .select("gem_name, rarity, value, mutation_ids, created_at")
            .order("created_at", { ascending: false })
            .limit(10000),
          ctx.supabaseAdmin.from("players")
            .select("money"),
          ctx.supabaseAdmin.from("player_boosts")
            .select("family, effect_value, expires_at")
            .gt("expires_at", new Date().toISOString()),
          ctx.supabaseAdmin.from("global_chat_announcements")
            .select("id, mutation_ids, created_at")
            .order("created_at", { ascending: false })
            .limit(10000),
          ctx.supabaseAdmin.from("player_one_roll_boosts")
            .select("player_id, consumable_id, effect_value, activated_at")
        ]);

        const analyticsErrors = {
          players: playersResult.error,
          rolls: rollsResult.error,
          gems: gemsResult.error,
          money: moneyResult.error,
          activeBoosts: activeBoostsResult.error,
          announcements: announcementsResult.error,
          oneRollBoosts: oneRollBoostsResult.error
        };

        if (Object.values(analyticsErrors).some(Boolean)) {
          // Analytics should degrade gracefully when an optional table or
          // column is absent in an older deployment. Core player/economy
          // numbers are still useful, so do not turn the entire admin panel
          // into a 500 response.
          console.warn("Admin analytics partial load:", analyticsErrors);
        }

        const players = playersResult.data ?? [];
        const gems = gemsResult.data ?? [];

        const gemCounts = new Map<string, number>();
        const mutationCounts = new Map<string, number>();
        let totalValue = 0;
        let mutatedGems = 0;

        for (const gem of gems) {
          gemCounts.set(
            gem.gem_name,
            (gemCounts.get(gem.gem_name) ?? 0) + 1
          );
          totalValue += Number(gem.value ?? 0);

          let ids: string[] = [];
          if (Array.isArray(gem.mutation_ids)) {
            ids = gem.mutation_ids.map((id: unknown) => String(id));
          } else if (typeof gem.mutation_ids === "string") {
            try {
              const parsed = JSON.parse(gem.mutation_ids);
              ids = Array.isArray(parsed)
                ? parsed.map((id: unknown) => String(id))
                : [];
            } catch {
              ids = gem.mutation_ids
                .split(",")
                .map((id: string) => id.trim())
                .filter(Boolean);
            }
          }

          if (ids.length) mutatedGems += 1;
          for (const id of ids) {
            mutationCounts.set(id, (mutationCounts.get(id) ?? 0) + 1);
          }
        }

        const topGems = [...gemCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([name, count]) => ({ name, count }));

        const mutations = [...mutationCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => ({
            id,
            name: MUTATION_CATALOG[id]?.name ?? id,
            count
          }));

        const activeBoosts = (activeBoostsResult.data ?? []).reduce(
          (map: Record<string, number>, boost: any) => {
            map[boost.family] = (map[boost.family] ?? 0) + 1;
            return map;
          },
          {}
        );

        const totalRolls = players.reduce(
          (sum: number, player: any) => sum + Number(player.total_rolls ?? 0),
          0
        );
        const totalMoney = players.reduce(
          (sum: number, player: any) => sum + Number(player.money ?? 0),
          0
        );

        const announcementRows = announcementsResult.data ?? [];
        const announcementMutationIds = announcementRows
          .map((row: any) => Array.isArray(row.mutation_ids) ? row.mutation_ids : [])
          .map((ids: any[]) => ids.map((id) => String(id)).filter(Boolean));
        const announcementsWithMutations = announcementMutationIds.filter((ids: string[]) => ids.length > 0).length;
        const emptyAnnouncementMutations = Math.max(0, announcementRows.length - announcementsWithMutations);

        const mutationCombinationCounts = new Map<string, number>();
        for (const ids of announcementMutationIds) {
          const key = ids.length ? ids.join("+") : "none";
          mutationCombinationCounts.set(key, (mutationCombinationCounts.get(key) ?? 0) + 1);
        }

        const mutationCombinations = [...mutationCombinationCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([key, count]) => ({ key, count }));

        await audit(ctx, adminId, null, "analytics_viewed");

        return response({
          generatedAt: new Date().toISOString(),
          players: players.length,
          totalRolls,
          totalInventoryGems: gems.length,
          mutatedGems,
          mutationRate: gems.length ? mutatedGems / gems.length : 0,
          totalMoney,
          totalInventoryValue: totalValue,
          topGems,
          mutations,
          mutationCombinations,
          activeBoosts,
          pendingOneRollBoosts: oneRollBoostsResult.data?.length ?? 0,
          rareAnnouncements: announcementRows.length,
          announcementsWithMutations,
          emptyAnnouncementMutations,
          announcementMutationCoverage: announcementRows.length
            ? announcementsWithMutations / announcementRows.length
            : 1,
          highestRollPlayers: (rollsResult.data ?? []).slice(0, 10)
        });
      }

      // =========================================================
      // ADVANCED PLAYER ADMIN ACTIONS
      // =========================================================
      if (action === "coins") {
        const amount = finiteNumber(body.amount);
        if (amount === null || amount === 0 || Math.abs(amount) > 1e12) {
          return response({ error: "invalid_amount" }, 400);
        }

        const { data: player } = await ctx.supabaseAdmin
          .from("players")
          .select("coins")
          .eq("id", targetId)
          .maybeSingle();

        if (!player) return response({ error: "player_not_found" }, 404);

        const before = Number(player.coins ?? 0);
        const after = Math.max(0, before + Math.trunc(amount));

        const { error } = await ctx.supabaseAdmin
          .from("players")
          .update({ coins: after })
          .eq("id", targetId);

        if (error) return response({ error: "coins_update_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "coins_adjusted", { amount, before, after });
        return response({ coins: after });
      }

      if (action === "capacity") {
        const amount = finiteNumber(body.amount);
        if (amount === null || !Number.isInteger(amount) || Math.abs(amount) > 1000000) {
          return response({ error: "invalid_capacity_amount" }, 400);
        }

        const { data: player } = await ctx.supabaseAdmin
          .from("players")
          .select("inventory_capacity")
          .eq("id", targetId)
          .maybeSingle();

        if (!player) return response({ error: "player_not_found" }, 404);

        const before = Number(player.inventory_capacity ?? 1);
        const after = Math.max(1, before + amount);

        const { error } = await ctx.supabaseAdmin
          .from("players")
          .update({ inventory_capacity: after })
          .eq("id", targetId);

        if (error) return response({ error: "capacity_update_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "capacity_adjusted", { amount, before, after });
        return response({ inventoryCapacity: after });
      }

      if (action === "rolls") {
        const amount = finiteNumber(body.amount);
        if (amount === null || !Number.isInteger(amount) || Math.abs(amount) > 1000000000) {
          return response({ error: "invalid_roll_amount" }, 400);
        }

        const { data: player } = await ctx.supabaseAdmin
          .from("players")
          .select("total_rolls")
          .eq("id", targetId)
          .maybeSingle();

        if (!player) return response({ error: "player_not_found" }, 404);

        const before = Number(player.total_rolls ?? 0);
        const after = Math.max(0, before + amount);

        const { error } = await ctx.supabaseAdmin
          .from("players")
          .update({ total_rolls: after })
          .eq("id", targetId);

        if (error) return response({ error: "rolls_update_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "rolls_adjusted", { amount, before, after });
        return response({ totalRolls: after });
      }

      if (action === "boost") {
        const families = new Set(["luck", "rollSpeed", "weightLuck", "weightMultiplier"]);
        const family = String(body.family ?? "");
        const effect = finiteNumber(body.effect);
        const seconds = Math.trunc(Number(body.seconds));

        if (!families.has(family) || effect === null || effect <= 0 || effect > 100000 ||
            !Number.isFinite(seconds) || seconds < 1 || seconds > 31536000) {
          return response({ error: "invalid_boost" }, 400);
        }

        const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();

        const { error } = await ctx.supabaseAdmin
          .from("player_boosts")
          .upsert({
            player_id: targetId,
            family,
            tier: 3,
            effect_value: effect,
            expires_at: expiresAt,
            updated_at: new Date().toISOString()
          }, { onConflict: "player_id,family" });

        if (error) return response({ error: "boost_update_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "boost_set", {
          family, effect, seconds, expiresAt
        });
        return response({ family, effect, expiresAt });
      }

      if (action === "one_roll_boost") {
        const consumableId = String(body.consumableId ?? "");
        const effectValue = finiteNumber(body.effectValue);

        if (
          !new Set(["legendary-potion", "mythic-potion"]).has(consumableId) ||
          effectValue === null ||
          effectValue <= 0 ||
          effectValue > 1000000
        ) {
          return response({ error: "invalid_one_roll_boost" }, 400);
        }

        const { data: existing } = await ctx.supabaseAdmin
          .from("player_one_roll_boosts")
          .select("consumable_id, effect_value, activated_at")
          .eq("player_id", targetId)
          .maybeSingle();

        if (existing) {
          return response({
            error: "one_roll_boost_already_active",
            message: "This player already has a pending one-roll boost."
          }, 409);
        }

        const { error } = await ctx.supabaseAdmin
          .from("player_one_roll_boosts")
          .insert({
            player_id: targetId,
            consumable_id: consumableId,
            effect_value: effectValue
          });

        if (error) {
          return response({
            error: "one_roll_boost_failed",
            message: error.message
          }, 500);
        }

        await audit(ctx, adminId, targetId, "one_roll_boost_granted", {
          consumableId,
          effectValue
        });

        return response({
          consumableId,
          effectValue
        });
      }

      if (action === "grant_all_potions") {
        const quantity = Math.trunc(Number(body.quantity));
        if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100000) {
          return response({ error: "invalid_quantity" }, 400);
        }

        const { data: existing, error: existingError } = await ctx.supabaseAdmin
          .from("player_consumables")
          .select("consumable_id, quantity")
          .eq("player_id", targetId);

        if (existingError) {
          return response({ error: "grant_all_potions_load_failed", message: existingError.message }, 500);
        }

        const current = new Map(
          (existing ?? []).map((row: any) => [
            String(row.consumable_id),
            Number(row.quantity ?? 0)
          ])
        );

        const rows = [...CONSUMABLE_IDS].map((consumableId) => ({
          player_id: targetId,
          consumable_id: consumableId,
          quantity: Number(current.get(consumableId) ?? 0) + quantity,
          updated_at: new Date().toISOString()
        }));

        const { error } = await ctx.supabaseAdmin
          .from("player_consumables")
          .upsert(rows, { onConflict: "player_id,consumable_id" });

        if (error) return response({ error: "grant_all_potions_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "all_potions_granted", { quantity });
        return response({ quantity, count: rows.length });
      }

      if (action === "grant_all_gems") {
        const mutationIds = Array.isArray(body.mutationIds)
          ? MUTATION_ORDER.filter((id) =>
              body.mutationIds.map((value: unknown) => String(value)).includes(id)
            )
          : [];

        const mutationMultiplier = mutationIds.reduce(
          (total, id) => total * MUTATION_CATALOG[id].multiplier,
          1
        );
        const mutationMultipliers = Object.fromEntries(
          mutationIds.map((id) => [id, MUTATION_CATALOG[id].multiplier])
        );

        const rows = GEM_CATALOG.map((gem) => ({
          player_id: targetId,
          gem_name: gem.name,
          rarity: gem.rarity,
          base_weight: gem.baseWeight,
          value_per_gram: gem.valuePerGram,
          rolled_weight_multiplier: 1,
          rolled_weight: gem.baseWeight,
          final_weight: gem.baseWeight,
          value: gem.baseWeight * gem.valuePerGram * mutationMultiplier,
          locked: false,
          roll_number: 0,
          luck_at_roll: 1,
          mutation_id: mutationIds[0] ?? null,
          mutation_multiplier: mutationMultiplier,
          mutation_ids: mutationIds,
          mutation_multipliers: mutationMultipliers
        }));

        const { error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .insert(rows);

        if (error) return response({ error: "grant_all_gems_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "all_gems_granted", {
          count: rows.length,
          mutationIds
        });
        return response({ count: rows.length });
      }

      if (action === "clear_inventory") {
        const { count, error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .delete({ count: "exact" })
          .eq("player_id", targetId);

        if (error) return response({ error: "inventory_clear_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "inventory_cleared", { count: count ?? 0 });
        return response({ deleted: count ?? 0 });
      }

      if (action === "delete_gem") {
        const specimenId = String(body.specimenId ?? "");
        if (!specimenId) return response({ error: "invalid_specimen_id" }, 400);

        const { error } = await ctx.supabaseAdmin
          .from("inventory_gems")
          .delete()
          .eq("id", specimenId)
          .eq("player_id", targetId);

        if (error) return response({ error: "gem_delete_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "gem_deleted", { specimenId });
        return response({ success: true });
      }

      return response({ error: "unknown_admin_action" }, 400);
    }
  )
};
