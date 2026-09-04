begin;
create table public.gemdle_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  gemdle_date date not null,
  rolled_at timestamptz not null,
  specimen jsonb not null check (jsonb_typeof(specimen) = 'object'),
  overall_rarity double precision not null check (overall_rarity >= 1 and overall_rarity < 'Infinity'::double precision),
  constraint gemdle_one_per_day unique (player_id, gemdle_date)
);
create index gemdle_daily_ranking on public.gemdle_results (gemdle_date, overall_rarity desc, rolled_at, id);
alter table public.gemdle_results enable row level security;
revoke all on public.gemdle_results from public, anon, authenticated;
grant select on public.gemdle_results to authenticated;
revoke all on public.gemdle_results from service_role;
grant select, insert on public.gemdle_results to service_role;
create policy gemdle_read_own on public.gemdle_results for select to authenticated
  using (player_id = (select auth.uid()));

-- Only the authenticated Edge Function supplies the timestamp and specimen.
-- Concurrent attempts wait on the unique key and return the committed winner.
create function public.save_gemdle_result(p_player_id uuid, p_rolled_at timestamptz, p_specimen jsonb)
returns public.gemdle_results
language plpgsql security invoker set search_path = '' as $$
declare saved public.gemdle_results; day date := (p_rolled_at at time zone 'Asia/Singapore')::date;
begin
  insert into public.gemdle_results (player_id, gemdle_date, rolled_at, specimen, overall_rarity)
  values (p_player_id, day, p_rolled_at, p_specimen, (p_specimen->>'overall_rarity')::double precision)
  on conflict (player_id, gemdle_date) do nothing;
  select * into strict saved from public.gemdle_results where player_id = p_player_id and gemdle_date = day;
  return saved;
end;
$$;
revoke all on function public.save_gemdle_result(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.save_gemdle_result(uuid, timestamptz, jsonb) to service_role;

-- Service-only read API. Equal scores share a rank; timestamp/id break display ties.
create function public.gemdle_daily_board(p_date date, p_player_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with ranked as (
    select r.id, r.player_id, r.specimen, r.rolled_at, r.overall_rarity,
      coalesce(nullif(p.username, ''), 'Player') as username,
      rank() over (order by r.overall_rarity desc) as position,
      row_number() over (order by r.overall_rarity desc, r.rolled_at, r.id) as display_order
    from public.gemdle_results r join public.players p on p.id = r.player_id
    where r.gemdle_date = p_date and not coalesce(p.leaderboard_hidden, false)
      and not exists (select 1 from public.user_roll_luck_rarity_mult b
        where b.player_id = r.player_id and b.active_until > now())
  )
  select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('rank', position,
      'username', username, 'specimen', specimen, 'is_you', player_id = p_player_id)
      order by display_order) from ranked where display_order <= 50), '[]'::jsonb),
    'own_rank', (select position from ranked where player_id = p_player_id),
    'participants', (select count(*) from ranked)
  );
$$;
revoke all on function public.gemdle_daily_board(date, uuid) from public, anon, authenticated;
grant execute on function public.gemdle_daily_board(date, uuid) to service_role;
commit;
