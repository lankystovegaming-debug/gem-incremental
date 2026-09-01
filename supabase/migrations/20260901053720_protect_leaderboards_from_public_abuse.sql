-- Expensive ranking functions must only be called by the authenticated,
-- cached leaderboards Edge Function. Browser roles retain no direct route.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'get_total_rolls_leaderboard',
        'get_lifetime_earnings_leaderboard',
        'get_gems_found_leaderboard',
        'get_best_roll_leaderboard',
        'get_most_weight_leaderboard',
        'get_raw_rare_roll_leaderboard',
        'get_base_luck_leaderboard',
        'get_museum_prestige_leaderboard',
        'get_rarest_gem_leaderboard'
      ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end
$$;
