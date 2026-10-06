import { generateResult, nextReset, singaporeDay } from "./rules.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers });
const unwrap = (response: any) => { if (response.error) throw response.error; return response.data; };

// Supabase may cap a single response at 1,000 rows. Never score a truncated pool.
async function loadCatalog(admin: any, table: string, tieKey: string, primaryKey = tieKey) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = unwrap(await admin.from(table).select("*").eq("enabled", true)
      .order(primaryKey, { ascending: true }).order(tieKey).range(offset, offset + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function loadAllGemdleResults(admin: any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = unwrap(await admin.from("gemdle_results").select("id,player_id,overall_rarity")
      .order("id", { ascending: true }).range(offset, offset + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function loadRowsForPlayers(admin: any, table: string, columns: string, key: string, playerIds: string[]) {
  const rows: any[] = [];
  for (let offset = 0; offset < playerIds.length; offset += 100) {
    rows.push(...unwrap(await admin.from(table).select(columns).in(key, playerIds.slice(offset, offset + 100))));
  }
  return rows;
}

export function lifetimeBoardFromRows(results: any[], players: any[], bans: any[], playerId: string, now: Date) {
  const totals = new Map<string, { total: number; discoveries: number }>();
  for (const row of results) {
    const score = Number(row.overall_rarity);
    if (!row.player_id || !Number.isFinite(score) || score < 1) continue;
    const current = totals.get(row.player_id) ?? { total: 0, discoveries: 0 };
    current.total += score; current.discoveries += 1; totals.set(row.player_id, current);
  }
  const profiles = new Map(players.map(player => [player.id, player]));
  const suspended = new Set(bans.filter(ban => ban?.active_until && Date.parse(ban.active_until) > now.getTime()).map(ban => ban.player_id));
  const ordered = [...totals.entries()].filter(([id]) => {
    const profile = profiles.get(id);
    return profile && profile.leaderboard_hidden !== true && !suspended.has(id);
  }).sort((left, right) => right[1].total - left[1].total || left[0].localeCompare(right[0]));
  let rank = 0, previousScore: number | null = null;
  const ranked = ordered.map(([id, score], index) => {
    if (score.total !== previousScore) rank = index + 1;
    previousScore = score.total;
    const username = String(profiles.get(id)?.username ?? "").trim() || "Player";
    return { rank, username, total_score: score.total, discoveries: score.discoveries, is_you: id === playerId };
  });
  return {
    entries: ranked.slice(0, 50),
    own_rank: ranked.find(entry => entry.is_you)?.rank ?? null,
    participants: ranked.length
  };
}

async function fallbackLifetimeBoard(admin: any, playerId: string, now: Date) {
  const results = await loadAllGemdleResults(admin);
  const playerIds = [...new Set(results.map(row => row.player_id).filter(Boolean))];
  if (!playerIds.length) return { entries: [], own_rank: null, participants: 0 };
  const [players, bans] = await Promise.all([
    loadRowsForPlayers(admin, "players", "id,username,leaderboard_hidden", "id", playerIds),
    loadRowsForPlayers(admin, "user_roll_luck_rarity_mult", "player_id,active_until", "player_id", playerIds)
  ]);
  return lifetimeBoardFromRows(results, players, bans, playerId, now);
}

export function createHandler(admin: any, clock = () => new Date()) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return json({ error: "not_authenticated" }, 401);
      const auth = await admin.auth.getUser(token);
      if (auth.error || !auth.data?.user || auth.data.user.is_anonymous) return json({ error: "not_authenticated" }, 401);
      const playerId = auth.data.user.id;
      let body;
      try { body = await request.json(); } catch { return json({ error: "invalid_request" }, 400); }
      if (!body || !["state", "roll", "history"].includes(body.action)) return json({ error: "invalid_action" }, 400);
      const [profileResponse, banResponse] = await Promise.all([
        admin.from("players").select("id,leaderboard_hidden").eq("id", playerId).maybeSingle(),
        admin.from("user_roll_luck_rarity_mult").select("active_until").eq("player_id", playerId).maybeSingle()
      ]);
      const profile = unwrap(profileResponse), ban = unwrap(banResponse);
      if (!profile) return json({ error: "player_profile_missing" }, 409);
      if (ban?.active_until && Date.parse(ban.active_until) > clock().getTime()) return json({ error: "banned" }, 403);
      const now = clock(), day = singaporeDay(now);
      const time = { gemdle_date: day, server_now: now.toISOString(), resets_at: nextReset(now) };
      if (body.action === "history") {
        const before = body.before;
        if (before != null && (typeof before !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(before) || !Number.isFinite(Date.parse(before)))) return json({ error: "invalid_cursor" }, 400);
        let query = admin.from("gemdle_results").select("gemdle_date,rolled_at,specimen").eq("player_id", playerId).order("gemdle_date", { ascending: false }).limit(31);
        if (before) query = query.lt("gemdle_date", before);
        const [rows, lifetimeScore] = await Promise.all([
          query.then(unwrap),
          admin.rpc("gemdle_lifetime_rarity_score", { p_player_id: playerId }).then(unwrap)
        ]);
        return json({ ...time, history: rows.slice(0, 30), next_cursor: rows.length > 30 ? rows[29].gemdle_date : null, lifetime_rarity_score: lifetimeScore });
      }
      let result = unwrap(await admin.from("gemdle_results").select("gemdle_date,rolled_at,specimen").eq("player_id", playerId).eq("gemdle_date", day).maybeSingle());
      let created = false;
      if (body.action === "roll" && !result) {
        const [gems, mutations, event] = await Promise.all([
          loadCatalog(admin, "private_feature_gems", "name", "rarity"),
          loadCatalog(admin, "game_mutations", "id", "multiplier"),
          admin.rpc("get_active_global_event")
        ]);
        const specimen = generateResult(gems, mutations, unwrap(event), now);
        const saved = unwrap(await admin.rpc("save_gemdle_result", { p_player_id: playerId, p_rolled_at: now.toISOString(), p_specimen: specimen }));
        result = { gemdle_date: saved.gemdle_date, rolled_at: saved.rolled_at, specimen: saved.specimen };
        created = true;
      }
      // A board outage must not hide a successfully persisted specimen.
      const optionalBoard = async (name: string, args: any, label: string) => {
        try { return unwrap(await admin.rpc(name, args)); }
        catch (error) { console.error(`${label} unavailable`, error); return null; }
      };
      const lifetimeBoardRequest = async () => {
        try { return unwrap(await admin.rpc("gemdle_lifetime_board", { p_player_id: playerId })); }
        catch (error) {
          console.error("Gemdle lifetime board RPC unavailable; using paginated fallback", error);
          try { return await fallbackLifetimeBoard(admin, playerId, now); }
          catch (fallbackError) { console.error("Gemdle lifetime board fallback unavailable", fallbackError); return null; }
        }
      };
      const [board, lifetimeBoard, lifetimeScoreResponse] = await Promise.all([
        optionalBoard("gemdle_daily_board", { p_date: day, p_player_id: playerId }, "Gemdle daily board"),
        lifetimeBoardRequest(),
        admin.rpc("gemdle_lifetime_rarity_score", { p_player_id: playerId })
      ]);
      const lifetimeScore = unwrap(lifetimeScoreResponse);
      return json({ ...time, result, created, board, lifetime_board: lifetimeBoard, lifetime_rarity_score: lifetimeScore, leaderboard_hidden: profile.leaderboard_hidden === true });
    } catch (error) {
      console.error("Gemdle request failed", error);
      return json({ error: "gemdle_unavailable" }, 503);
    }
  };
}
