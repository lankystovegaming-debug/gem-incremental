-- Christmas foundation only. Keep release_enabled=false until the roll,
-- native reward, scheduling and cinematic integration checklist is complete.
create schema if not exists christmas_2026_private;
revoke all on schema christmas_2026_private from public, anon, authenticated;

create table christmas_2026_private.configuration (
  singleton boolean primary key default true check(singleton),
  release_enabled boolean not null default false,
  rush_frequency integer,
  rush_duration_minutes integer,
  rush_spacing_minutes integer,
  aurora_spacing_minutes integer,
  storm_spacing_minutes integer,
  quest_configuration jsonb not null default '{}'::jsonb,
  emergency_supply jsonb not null default '{"enabled":false}'::jsonb
);
insert into christmas_2026_private.configuration(singleton) values(true);

create table christmas_2026_private.player_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  version bigint not null default 0 check(version>=0),
  state jsonb not null default '{}'::jsonb check(jsonb_typeof(state)='object'),
  updated_at timestamptz not null default clock_timestamp()
);
create table christmas_2026_private.action_receipts (
  player_id uuid not null references public.players(id) on delete cascade,
  request_id uuid not null,
  command jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(player_id,request_id)
);
alter table christmas_2026_private.configuration enable row level security;
alter table christmas_2026_private.player_state enable row level security;
alter table christmas_2026_private.action_receipts enable row level security;
revoke all on all tables in schema christmas_2026_private from public,anon,authenticated;

create function christmas_2026_private.server_now() returns timestamptz
language sql volatile set search_path='' as $$select clock_timestamp()$$;
revoke all on function christmas_2026_private.server_now() from public,anon,authenticated;

-- Only the authenticated Edge Function's service client calls these APIs.
-- The user ID always comes from verified user claims, never the request body.
create function public.christmas_2026_load(p_player_id uuid,p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s christmas_2026_private.player_state; n timestamptz:=christmas_2026_private.server_now();
begin
  insert into christmas_2026_private.player_state(player_id)
    select id from public.players where id=p_player_id on conflict do nothing;
  select * into s from christmas_2026_private.player_state where player_id=p_player_id;
  if not found then raise exception 'player_not_found'; end if;
  return jsonb_build_object('state',s.state,'version',s.version,'serverNow',n,
    'releaseEnabled',(select release_enabled from christmas_2026_private.configuration where singleton),
    'receipt',(select jsonb_build_object('command',command,'result',result) from christmas_2026_private.action_receipts
      where player_id=p_player_id and request_id=p_request_id));
end $$;
revoke all on function public.christmas_2026_load(uuid,uuid) from public,anon,authenticated;
grant execute on function public.christmas_2026_load(uuid,uuid) to service_role;

create function public.christmas_2026_commit(
  p_player_id uuid,p_request_id uuid,p_command jsonb,p_expected_version bigint,
  p_state jsonb,p_rewards jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s christmas_2026_private.player_state; receipt christmas_2026_private.action_receipts;
  n timestamptz:=christmas_2026_private.server_now(); action text:=p_command->>'action'; key text;
begin
  if p_request_id is null or p_command is null or jsonb_typeof(p_command)<>'object' then
    raise exception 'invalid_request'; end if;
  -- Match the roll transaction's lock order: player, then subsystem state.
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select * into receipt from christmas_2026_private.action_receipts
    where player_id=p_player_id and request_id=p_request_id;
  if found then
    if receipt.command is distinct from p_command then raise exception 'idempotency_conflict'; end if;
    return receipt.result;
  end if;
  if not (select release_enabled from christmas_2026_private.configuration where singleton) then
    raise exception 'christmas_not_released'; end if;
  if action='acknowledge' then
    if p_rewards is distinct from '{}'::jsonb then raise exception 'receipt_cannot_grant_rewards'; end if;
  elsif n<'2026-12-01 00:00:00+00' or n>='2026-12-31 16:00:00+00' then
    raise exception 'event_closed';
  end if;
  select * into s from christmas_2026_private.player_state where player_id=p_player_id for update;
  if not found or s.version<>p_expected_version then raise exception 'version_conflict'; end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' or pg_column_size(p_state)>1048576 then
    raise exception 'invalid_state'; end if;
  foreach key in array array['snowflakes','ornaments','lights','shillings','presentPoints','genuineRolls'] loop
    if jsonb_typeof(p_state->key) is distinct from 'number'
      or (p_state->>key)::numeric<0 or trunc((p_state->>key)::numeric)<>(p_state->>key)::numeric then
      raise exception 'invalid_balance'; end if;
  end loop;
  if (p_state->>'tree')::integer not between 0 and 25 then raise exception 'invalid_tree'; end if;
  update christmas_2026_private.player_state set version=version+1,
    state=jsonb_set(p_state,'{version}',to_jsonb(version+1)),updated_at=n
    where player_id=p_player_id;
  -- This foundation stores event rewards in the same transaction as spending.
  -- Native equipment/consumable/cosmetic projection is a release blocker.
  insert into christmas_2026_private.action_receipts(player_id,request_id,command,result)
    values(p_player_id,p_request_id,p_command,jsonb_build_object('rewards',p_rewards,'version',s.version+1))
    returning * into receipt;
  return receipt.result;
end $$;
revoke all on function public.christmas_2026_commit(uuid,uuid,jsonb,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.christmas_2026_commit(uuid,uuid,jsonb,bigint,jsonb,jsonb) to service_role;

-- Independently identified occurrences. Scheduling is deliberately unseeded
-- until the frequency/duration/spacing parameters have been confirmed.
create table christmas_2026_private.event_windows (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check(event_key in ('christmas_aurora','present_rush','present_storm')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  unique(event_key,starts_at)
);
create index christmas_2026_windows_time on christmas_2026_private.event_windows(starts_at,ends_at);
alter table christmas_2026_private.event_windows enable row level security;
revoke all on christmas_2026_private.event_windows from public,anon,authenticated;

create function public.get_active_global_events() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ordinary jsonb; seasonal jsonb; n timestamptz:=christmas_2026_private.server_now();
begin
  ordinary:=public.get_active_global_event();
  if ordinary is null or ordinary='null'::jsonb then ordinary:='[]'::jsonb;
    else ordinary:=jsonb_build_array(ordinary); end if;
  if n<'2026-12-01 00:00:00+00' or n>='2026-12-31 16:00:00+00'
    or not (select release_enabled from christmas_2026_private.configuration where singleton) then return ordinary; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',w.id,'eventKey',w.event_key,'layer','christmas',
    'name',case w.event_key when 'christmas_aurora' then 'Christmas Aurora' when 'present_storm' then 'Present Storm' else 'Present Rush' end,
    'icon',case w.event_key when 'christmas_aurora' then '🌌' else '🎁' end,'tier','Christmas',
    'description',case w.event_key when 'christmas_aurora' then '+25% Weight Luck · +20% Mutation Luck' else 'More Presents may fall while rolling.' end,
    'startsAt',w.starts_at,'endsAt',least(w.ends_at,'2026-12-31 16:00:00+00'),
    'serverNow',n,'approaching',w.starts_at>n,
    'config',case w.event_key when 'christmas_aurora' then '{"weightLuckMultiplier":1.25,"mutationMultiplier":1.2}'::jsonb else '{}'::jsonb end
  ) order by w.starts_at),'[]'::jsonb) into seasonal
  from christmas_2026_private.event_windows w
  where w.starts_at<=n+interval '5 minutes' and w.ends_at>n
    and (w.event_key<>'christmas_aurora' or (n>='2026-12-15 00:00:00+00'
      and not(n>='2026-12-24 00:00:00+00' and n<'2026-12-25 00:00:00+00')))
    and (w.event_key<>'present_storm' or (n>='2026-12-24 00:00:00+00' and n<'2026-12-25 00:00:00+00'))
    and (w.event_key<>'present_rush' or not(n>='2026-12-24 00:00:00+00' and n<'2026-12-25 00:00:00+00'));
  return ordinary||seasonal;
end $$;
revoke all on function public.get_active_global_events() from public,anon;
grant execute on function public.get_active_global_events() to authenticated;
