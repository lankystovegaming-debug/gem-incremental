import { withSupabase } from "npm:@supabase/server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", ...cors }
});

const uid = (ctx: any) =>
  ctx?.userClaims?.id ?? ctx?.userClaims?.sub ?? ctx?.jwtClaims?.sub ?? null;

async function sectionEnabled(ctx: any, id: string) {
  const { data, error } = await ctx.supabaseAdmin
    .from("game_section_settings").select("enabled").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
      const playerId = uid(ctx);
      if (!playerId) return json({ error: "unauthenticated" }, 401);
      if (!(await sectionEnabled(ctx, "relic-vault"))) return json({ error: "feature_disabled" }, 403);
      let body: any = {}; try { body = await req.json(); } catch {}
      const action = body.action ?? "list";

      if (action === "list") {
        const { data: definitions, error } = await ctx.supabaseAdmin
          .from("relic_definitions").select("*").eq("enabled", true).order("sort_order");
        if (error) throw error;
        const { data: owned, error: oe } = await ctx.supabaseAdmin
          .from("player_relics").select("*, relic_definitions(*)").eq("player_id", playerId).order("created_at", { ascending: false });
        if (oe) throw oe;
        return json({ definitions: definitions ?? [], owned: owned ?? [] });
      }

      if (action === "equip") {
        const id = String(body.id ?? "");
        const { data: relicRow, error: re } = await ctx.supabaseAdmin
          .from("player_relics").select("*, relic_definitions(*)").eq("id", id).eq("player_id", playerId).single();
        if (re) throw re;
        const slot = relicRow.relic_definitions?.slot ?? "core";
        const { data: equipped, error: ee } = await ctx.supabaseAdmin
          .from("player_relics").select("id, relic_definitions!inner(slot)").eq("player_id", playerId).eq("equipped", true);
        if (ee) throw ee;
        for (const row of equipped ?? []) {
          if (row.relic_definitions?.slot === slot) {
            await ctx.supabaseAdmin.from("player_relics").update({ equipped: false }).eq("id", row.id);
          }
        }
        const { data, error } = await ctx.supabaseAdmin
          .from("player_relics").update({ equipped: true, updated_at: new Date().toISOString() })
          .eq("id", id).eq("player_id", playerId).select("*").single();
        if (error) throw error;
        return json({ relic: data });
      }

      if (action === "socket") {
        const id = String(body.id ?? "");
        const socketIndex = Math.max(0, Number(body.socketIndex ?? 0));
        const gemName = String(body.gemName ?? "").slice(0, 120);
        const { data: row, error: re } = await ctx.supabaseAdmin
          .from("player_relics").select("*, relic_definitions(*)").eq("id", id).eq("player_id", playerId).single();
        if (re) throw re;
        const sockets = Array.isArray(row.sockets) ? [...row.sockets] : [];
        const max = Number(row.relic_definitions?.socket_count ?? 0);
        if (socketIndex >= max) return json({ error: "socket_out_of_range" }, 400);
        sockets[socketIndex] = { gemName, insertedAt: new Date().toISOString() };
        const { data, error } = await ctx.supabaseAdmin.from("player_relics")
          .update({ sockets, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
        if (error) throw error;
        return json({ relic: data });
      }

      return json({ error: "unknown_action" }, 400);
    } catch (error) {
      console.error("RELIC_VAULT", error);
      return json({ error: "relic_vault_error", message: error instanceof Error ? error.message : String(error) }, 500);
    }
  })
};
