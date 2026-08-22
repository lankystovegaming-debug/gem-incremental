-- Add total player cash (sum of every wallet's money) to the cash feed.
-- Unlike global cash (lifetime earnings, which only rises), this falls when
-- players buy from the game and is unchanged by player-to-player trades.
create or replace function public.get_global_cash_feed()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'total', coalesce((select sum(lifetime_earnings) from public.players), 0),
    'cash',  coalesce((select sum(money) from public.players), 0),
    'events', coalesce((
      select jsonb_agg(row_to_json(e))
      from (
        select id, player_name as name, gem_name as gem, amount, created_at as at
        from public.global_cash_events order by id desc limit 10
      ) e
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_global_cash_feed() to anon, authenticated;
