begin;

-- Service-only lifetime leaderboard. Equal total scores share a rank;
-- player ID is used only to keep display ordering deterministic.
create function public.gemdle_lifetime_board(p_player_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with totals as (
    select r.player_id,
      coalesce(nullif(p.username, ''), 'Player') as username,
      sum(r.overall_rarity)::double precision as total_score,
      count(*)::bigint as discoveries
    from public.gemdle_results r
    join public.players p on p.id = r.player_id
    where not coalesce(p.leaderboard_hidden, false)
      and not exists (
        select 1
        from public.user_roll_luck_rarity_mult b
        where b.player_id = r.player_id and b.active_until > now()
      )
    group by r.player_id, p.username
  ), ranked as (
    select t.*,
      rank() over (order by t.total_score desc) as position,
      row_number() over (order by t.total_score desc, t.player_id) as display_order
    from totals t
  )
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', position,
        'username', username,
        'total_score', total_score,
        'discoveries', discoveries,
        'is_you', player_id = p_player_id
      ) order by display_order)
      from ranked
      where display_order <= 50
    ), '[]'::jsonb),
    'own_rank', (select position from ranked where player_id = p_player_id),
    'participants', (select count(*) from ranked)
  );
$$;

revoke all on function public.gemdle_lifetime_board(uuid) from public, anon, authenticated;
grant execute on function public.gemdle_lifetime_board(uuid) to service_role;

commit;
