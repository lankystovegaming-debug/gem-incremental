import { withSupabase } from "npm:@supabase/server";


// Admins are stored in the public.admins table, not hardcoded, so
// the list can change without a redeploy and no UUID is baked into
// the source or the client bundle.
async function isAdmin(ctx: any, id: string | undefined) {
  if (!id) return false;
  const { data } = await ctx.supabaseAdmin
    .from("admins").select("user_id").eq("user_id", id).maybeSingle();
  return Boolean(data);
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
  ["Singularity Shard",4000000,3600,472.5],["Lanky Gem",10000000,40500,111.1111]
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
  "mass-potion-1", "mass-potion-2", "mass-potion-3"
]);

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
  const [authResult, gemResult, equipmentResult, consumableResult, boostResult] =
    await Promise.all([
      ctx.supabaseAdmin.auth.admin.getUserById(player.id),
      ctx.supabaseAdmin.from("inventory_gems")
        .select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_equipment")
        .select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_consumables")
        .select("consumable_id, quantity").eq("player_id", player.id),
      ctx.supabaseAdmin.from("player_boosts")
        .select("family, tier, effect_value, expires_at").eq("player_id", player.id)
    ]);

  return {
    ...player,
    email: authResult.data?.user?.email ?? null,
    isAnonymous: authResult.data?.user?.is_anonymous ?? false,
    bannedUntil: authResult.data?.user?.banned_until ?? null,
    gemCount: gemResult.count ?? 0,
    equipmentCount: equipmentResult.count ?? 0,
    consumables: consumableResult.data ?? [],
    boosts: boostResult.data ?? []
  };
}

export default {
  fetch: withSupabase(
    { auth: "user" },
    async (req, ctx) => {
      const adminId = ctx.userClaims?.id;

      let body: any;
      try {
        body = await req.json();
      } catch {
        return response({ error: "invalid_request" }, 400);
      }

      const action = body?.action;
      const targetId = body?.targetId;

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

        if (error) return response({ error: "audit_load_failed" }, 500);
        return response({ entries: data ?? [] });
      }

      if (!validUuid(targetId)) {
        return response({ error: "invalid_player_id" }, 400);
      }

      if (action === "inspect") {
        const { data: player, error } = await ctx.supabaseAdmin
          .from("players")
          .select("id, username, money, total_rolls, inventory_capacity, next_roll_at, rarest_gem_name, rarest_gem_rarity")
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

        const finalWeight = gem.baseWeight * multiplier;
        const value = finalWeight * gem.valuePerGram;

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
            luck_at_roll: luckAtRoll
          })
          .select("id").single();
        if (error) return response({ error: "gem_grant_failed", message: error.message }, 500);

        await audit(ctx, adminId, targetId, "gem_granted", {
          gemName: gem.name, weightMultiplier: multiplier, specimenId: data.id
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

        const { data: current } = await ctx.supabaseAdmin
          .from("player_consumables").select("quantity")
          .eq("player_id", targetId).eq("consumable_id", consumableId).maybeSingle();
        const before = Number(current?.quantity ?? 0);
        const after = Math.max(0, before + amount);

        const { error } = await ctx.supabaseAdmin
          .from("player_consumables")
          .upsert({
            player_id: targetId,
            consumable_id: consumableId,
            quantity: after,
            updated_at: new Date().toISOString()
          }, { onConflict: "player_id,consumable_id" });
        if (error) return response({ error: "potion_update_failed" }, 500);

        await audit(ctx, adminId, targetId, "potion_adjusted", {
          consumableId, amount, before, after
        });
        return response({ quantity: after });
      }

      if (action === "reset_cooldown") {
        const { error } = await ctx.supabaseAdmin
          .from("players").update({ next_roll_at: null }).eq("id", targetId);
        if (error) return response({ error: "cooldown_reset_failed" }, 500);
        await audit(ctx, adminId, targetId, "cooldown_reset");
        return response({ success: true });
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

      return response({ error: "unknown_admin_action" }, 400);
    }
  )
};
