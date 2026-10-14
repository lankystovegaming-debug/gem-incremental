-- Approved in the 14 October handoff. Keep release_enabled=false: this does
-- not enable the unfinished native reward/cinematic integration.
alter table christmas_2026_private.configuration add column schedule_seed uuid not null default gen_random_uuid();
update christmas_2026_private.configuration set rush_frequency=3,rush_duration_minutes=20,
  rush_spacing_minutes=180,aurora_spacing_minutes=240,storm_spacing_minutes=90,
  quest_configuration='{"daily":{"rolls":300,"gems":20,"opened":3,"points":15},"weekly":{"rolls":2000,"gems":125,"ordinaryOpened":20,"shillings":7500,"dailies":12}}',
  emergency_supply='{"enabled":true,"price":10000,"limit":3,"startsAt":"2026-12-24T00:00:00Z","reward":{"snowflakes":1000,"ornaments":40,"lights":8,"small":5,"festive":2}}';

alter table christmas_2026_private.event_windows add column schedule_generated boolean not null default false;
create function christmas_2026_private.seed_schedule() returns void
language plpgsql security definer set search_path='' as $$
declare seed text; day_start timestamptz; day_end timestamptz; lower_bound timestamptz;
  last_end timestamptz; starts timestamptz; key text; d integer; count_windows integer;
  gap integer; slack double precision; offsets double precision[]; i integer;
begin
  if exists(select 1 from christmas_2026_private.event_windows where schedule_generated) then return; end if;
  if exists(select 1 from christmas_2026_private.event_windows) then raise exception 'christmas_schedule_already_configured'; end if;
  select schedule_seed::text into seed from christmas_2026_private.configuration where singleton;
  foreach key in array array['present_rush','christmas_aurora','present_storm'] loop
    last_end:=null;
    for d in 0..30 loop
      day_start:='2026-12-01 00:00:00+00'::timestamptz+make_interval(days=>d);
      day_end:=least(day_start+interval '1 day','2026-12-31 16:00:00+00'::timestamptz);
      if key='present_storm' and d<>23 then continue; end if;
      if key<>'present_storm' and d=23 then continue; end if;
      if key='christmas_aurora' and d<14 then continue; end if;
      count_windows:=case key when 'present_rush' then 3 when 'christmas_aurora' then 2 else 6 end;
      gap:=case key when 'present_rush' then 180 when 'christmas_aurora' then 240 else 90 end;
      lower_bound:=greatest(day_start,coalesce(last_end+make_interval(mins=>gap),day_start));
      slack:=extract(epoch from day_end-lower_bound)-count_windows*1200-(count_windows-1)*gap*60;
      if slack<0 then raise exception 'christmas_schedule_does_not_fit'; end if;
      select array_agg(x order by x) into offsets from (
        select (('x'||substr(md5(seed||':'||key||':'||d||':'||n),1,8))::bit(32)::bigint)::double precision/4294967296.0*slack x
        from generate_series(1,count_windows) n
      ) draws;
      for i in 1..count_windows loop
        starts:=lower_bound+make_interval(secs=>floor(offsets[i])+(i-1)*(1200+gap*60));
        last_end:=starts+interval '20 minutes';
        insert into christmas_2026_private.event_windows(event_key,starts_at,ends_at,schedule_generated)
          values(key,starts,last_end,true);
      end loop;
    end loop;
  end loop;
end $$;
revoke all on function christmas_2026_private.seed_schedule() from public,anon,authenticated;
select christmas_2026_private.seed_schedule();

-- Fold genuine-roll quest progress into the existing server bookkeeping call.
-- There is no additional Edge RPC, displayed-batch shortcut or client event.
create function christmas_2026_private.record_roll_quests(p_player_id uuid,p_gem_name text,p_total_rolls bigint) returns void
language plpgsql security definer set search_path='' as $$
declare n timestamptz:=christmas_2026_private.server_now(); s jsonb; q jsonb; day jsonb; week jsonb;
  day_key text; week_key text; completed jsonb; id text; is_christmas boolean;
begin
  if n<'2026-12-01 00:00:00+00' or n>='2026-12-31 16:00:00+00'
    or not coalesce((select release_enabled from christmas_2026_private.configuration where singleton),false) then return; end if;
  day_key:=(floor(extract(epoch from n-'2026-12-01 00:00:00+00'::timestamptz)/86400)+1)::integer::text;
  week_key:=floor(extract(epoch from n-'2026-12-01 00:00:00+00'::timestamptz)/(7*86400))::integer::text;
  insert into christmas_2026_private.player_state(player_id) values(p_player_id) on conflict do nothing;
  select state into s from christmas_2026_private.player_state where player_id=p_player_id for update;
  if p_total_rolls is null or p_total_rolls<=coalesce((s->>'lastQuestTotalRolls')::bigint,-1) then return; end if;
  q:=coalesce(s->'quests','{"days":{},"weeks":{}}'::jsonb);
  q:=jsonb_set(q,'{days}',coalesce(q->'days','{}'));q:=jsonb_set(q,'{weeks}',coalesce(q->'weeks','{}'));
  day:=coalesce(q#>array['days',day_key],'{"rolls":0,"gems":0,"opened":0,"points":0,"completed":[],"claimed":[],"bonusClaimed":false}');
  week:=coalesce(q#>array['weeks',week_key],'{"rolls":0,"gems":0,"ordinaryOpened":0,"shillings":0,"dailies":0,"fourClaimed":false,"allClaimed":false}');
  -- The recorded gem is the authoritative primary acquisition, regardless of
  -- Keep/Exchange/Sell or whether this name was previously discovered.
  is_christmas:=coalesce(p_gem_name=any(array['Snowball','Icicle','Mistletoe','Candy Cane Ore','Gingerbreadite','Glass Ornament','Snow Globe','First Snow','Wrapping Paper','Jingle Bell','Toymaker Crystal','Nutcracker','Reindeer Antler','Sleighbell','Workshop Star','Frostfire','Polar Prism','Frozen Aurora','North Star','Winter''s Heart','Aurora Borealis','Guiding Star','Yuletide','Eternal Christmas','Wrapped Miracle','Celestine Veil','Wish Upon a Star','Christmas Singularity']),false);
  day:=day||jsonb_build_object('rolls',coalesce((day->>'rolls')::bigint,0)+1,'gems',coalesce((day->>'gems')::bigint,0)+is_christmas::integer);
  week:=week||jsonb_build_object('rolls',coalesce((week->>'rolls')::bigint,0)+1,'gems',coalesce((week->>'gems')::bigint,0)+is_christmas::integer);
  completed:=day->'completed';
  foreach id in array array['rolling','christmas','activities'] loop
    if not completed ? id and (case id when 'rolling' then (day->>'rolls')::bigint>=300
      when 'christmas' then (day->>'gems')::bigint>=20
      else (day->>'rolls')::bigint>=300 or (day->>'opened')::bigint>=3 or (day->>'points')::bigint>=15 end) then
      completed:=completed||jsonb_build_array(id);
      week:=jsonb_set(week,'{dailies}',to_jsonb((week->>'dailies')::bigint+1));
    end if;
  end loop;
  day:=jsonb_set(day,'{completed}',completed);
  q:=jsonb_set(q,array['days',day_key],day);q:=jsonb_set(q,array['weeks',week_key],week);
  s:=s||jsonb_build_object('quests',q,'genuineRolls',coalesce((s->>'genuineRolls')::bigint,0)+1,'lastQuestTotalRolls',p_total_rolls);
  update christmas_2026_private.player_state set state=s,version=version+1,updated_at=n where player_id=p_player_id;
end $$;
revoke all on function christmas_2026_private.record_roll_quests(uuid,text,bigint) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_server_roll(p_player_id uuid, p_gem_name text, p_gem_rarity integer, p_final_weight double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total_rolls bigint;
  v_rarest_name text;
  v_rarest_rarity integer;
begin
  update public.players
  set
    total_rolls = coalesce(total_rolls, 0) + 1,
    equipment_genuine_rolls = equipment_genuine_rolls + 1,
    rarest_gem_name = case
      when rarest_gem_rarity is null or p_gem_rarity > rarest_gem_rarity
        then p_gem_name
      else rarest_gem_name
    end,
    rarest_gem_rarity = case
      when rarest_gem_rarity is null or p_gem_rarity > rarest_gem_rarity
        then p_gem_rarity
      else rarest_gem_rarity
    end
  where id = p_player_id
  returning total_rolls, rarest_gem_name, rarest_gem_rarity
  into v_total_rolls, v_rarest_name, v_rarest_rarity;

  if not found then
    raise exception 'player_not_found';
  end if;

  perform christmas_2026_private.record_roll_quests(p_player_id,p_gem_name,v_total_rolls);

  return jsonb_build_object(
    'total_rolls', v_total_rolls,
    'rarest_gem_name', v_rarest_name,
    'rarest_gem_rarity', v_rarest_rarity,
    'gem_name', p_gem_name,
    'final_weight', p_final_weight
  );
end;
$function$
;
revoke all on function public.record_server_roll(uuid,text,integer,double precision) from public,anon,authenticated;
grant execute on function public.record_server_roll(uuid,text,integer,double precision) to service_role;

-- Phase eligibility uses the occurrence start so all five warning minutes
-- remain visible even immediately before a phase boundary.
create or replace function public.get_active_global_events() returns jsonb
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
    and (w.event_key<>'christmas_aurora' or (w.starts_at>='2026-12-15 00:00:00+00'
      and not(w.starts_at>='2026-12-24 00:00:00+00' and w.starts_at<'2026-12-25 00:00:00+00')))
    and (w.event_key<>'present_storm' or (w.starts_at>='2026-12-24 00:00:00+00' and w.starts_at<'2026-12-25 00:00:00+00'))
    and (w.event_key<>'present_rush' or not(w.starts_at>='2026-12-24 00:00:00+00' and w.starts_at<'2026-12-25 00:00:00+00'));
  return ordinary||seasonal;
end $$;
revoke all on function public.get_active_global_events() from public,anon;
grant execute on function public.get_active_global_events() to authenticated;

-- A committed Jackpot House Edge loss is still a genuine roll. Record it in
-- its existing atomic commit, not the later background loss bookkeeping.
CREATE OR REPLACE FUNCTION public.commit_jackpot_loss(p_player_id uuid, p_lease_id uuid, p_genuine_roll bigint, p_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.players%rowtype; begin
 select * into p from public.players where id=p_player_id for update;
 if not found or p.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
 if p.equipment_state_roll>=p_genuine_roll then return jsonb_build_object('total_rolls',p.total_rolls,'duplicate',true); end if;
 if p_genuine_roll<>p.equipment_genuine_rolls+1 then raise exception 'invalid_genuine_roll'; end if;
 if not exists(select 1 from public.player_equipment where player_id=p_player_id and equipment_id='jackpot-slot' and equipped) then raise exception 'invalid_equipment'; end if;
 update public.players set equipment_state=p_state,equipment_state_roll=p_genuine_roll,
 equipment_genuine_rolls=p_genuine_roll,total_rolls=coalesce(total_rolls,0)+1 where id=p_player_id returning * into p;
 perform christmas_2026_private.record_roll_quests(p_player_id,null,p.total_rolls);
 return jsonb_build_object('total_rolls',p.total_rolls);
end $function$
;
revoke all on function public.commit_jackpot_loss(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_jackpot_loss(uuid,uuid,bigint,jsonb) to service_role;

-- Revalidate the claimed reset period at commit time, after retry receipt lookup.
create or replace function public.christmas_2026_commit(
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
  if action='quest' and (p_command->>'period') is distinct from
    (case p_command->>'kind' when 'daily' then
      (floor(extract(epoch from n-'2026-12-01 00:00:00+00'::timestamptz)/86400)+1)::integer::text
    when 'weekly' then
      floor(extract(epoch from n-'2026-12-01 00:00:00+00'::timestamptz)/(7*86400))::integer::text
    else null end) then raise exception 'quest_period_expired'; end if;
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

