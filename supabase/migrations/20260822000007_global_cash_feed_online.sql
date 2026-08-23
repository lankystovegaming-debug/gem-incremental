-- Add a live "online now" count (players whose heartbeat landed in the last
-- 2 minutes; the client beats every 60s) to the cash feed, so the side
-- counter can show how many people are currently using the game.
create or replace function public.get_global_cash_feed()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'total',  coalesce((select sum(lifetime_earnings) from public.players), 0),
    'cash',   coalesce((select sum(money) from public.players), 0),
    'online', coalesce((select count(*) from public.player_presence
                        where last_seen_at > now() - interval '2 minutes'), 0),
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
