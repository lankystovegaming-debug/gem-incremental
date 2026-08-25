import { supabase } from "./supabase.js";

export async function loadFurnaceState() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { error: sessionError };
  const leaderboardPromise = supabase.rpc("get_top_money_burners", { p_limit: 10 });
  const playerPromise = session?.user
    ? supabase.from("players").select("money, lifetime_money_burned").eq("id", session.user.id).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [leaderboard, player] = await Promise.all([leaderboardPromise, playerPromise]);
  return {
    data: {
      authenticated: Boolean(session?.user),
      money: Number(player.data?.money ?? 0),
      lifetimeMoneyBurned: Number(player.data?.lifetime_money_burned ?? 0),
      leaderboard: leaderboard.data ?? []
    },
    error: player.error || leaderboard.error || null
  };
}

export async function burnMoney({ amount = null, burnAll = false } = {}) {
  const { data, error } = await supabase.rpc("burn_player_money", {
    p_amount: burnAll ? null : amount,
    p_burn_all: burnAll
  });
  return { data, error };
}
