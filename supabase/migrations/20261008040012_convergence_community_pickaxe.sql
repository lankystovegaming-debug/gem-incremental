begin;

create schema if not exists convergence_private;
revoke all on schema convergence_private from public, anon, authenticated;

create table convergence_private.event (
  id boolean primary key default true check (id),
  preview_at timestamptz not null,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null check (status in ('scheduled','active','succeeded','failed')),
  targets jsonb not null,
  progress jsonb not null,
  succeeded_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (preview_at < starts_at and starts_at < deadline_at)
);

create table convergence_private.contributions (
  player_id uuid primary key references public.players(id) on delete cascade,
  contribution_points bigint not null default 0 check (contribution_points >= 0),
  gems_donated bigint not null default 0 check (gems_donated >= 0),
  cash_donated numeric not null default 0 check (cash_donated >= 0),
  entitled boolean not null default false,
  claimed_at timestamptz,
  first_contributed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table convergence_private.donation_requests (
  player_id uuid not null references public.players(id) on delete cascade,
  request_key uuid not null,
  donation_type text not null check (donation_type in ('gems','cash')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, request_key)
);

create table convergence_private.auto_craft (
  player_id uuid primary key references public.players(id) on delete cascade,
  enabled boolean not null default false,
  previous_recipe_id text,
  updated_at timestamptz not null default now()
);

create table convergence_private.roll_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  echo integer not null default 0 check (echo >= 0 and echo < 1000),
  resonance_rolls integer not null default 0 check (resonance_rolls between 0 and 5),
  momentum_charges integer not null default 0 check (momentum_charges between 0 and 3),
  surge_rolls integer not null default 0 check (surge_rolls between 0 and 10),
  convergence_rolls bigint not null default 0 check (convergence_rolls >= 0),
  updated_at timestamptz not null default now()
);

revoke all on all tables in schema convergence_private from public, anon, authenticated;

insert into convergence_private.event (
  id, preview_at, starts_at, deadline_at, status, targets, progress
) values (
  true,
  '2026-10-08T16:00:00Z',
  '2026-10-10T16:00:00Z',
  '2026-10-17T16:00:00Z',
  'scheduled',
  '{"common":10000,"rare":300000,"epic":2000000,"legendary":800000,"mythic":125000,"exotic":9000,"exalted":600,"cosmic":125,"transcendent":15,"weight3":400000,"weight5":100000,"weight10":1000,"weight25":1,"effective1b":500,"effective10b":75,"effective100b":10,"effective1t":3,"mass":3250000000,"under001g":1,"over2500000g":1,"cash":30000000000}'::jsonb,
  '{"common":0,"rare":0,"epic":0,"legendary":0,"mythic":0,"exotic":0,"exalted":0,"cosmic":0,"transcendent":0,"weight3":0,"weight5":0,"weight10":0,"weight25":0,"effective1b":0,"effective10b":0,"effective100b":0,"effective1t":0,"mass":0,"under001g":0,"over2500000g":0,"cash":0}'::jsonb
)
on conflict (id) do update set
  preview_at = excluded.preview_at,
  starts_at = excluded.starts_at,
  deadline_at = excluded.deadline_at,
  targets = excluded.targets;

insert into public.game_recipes(id, recipe)
values ('convergence-pickaxe', jsonb_build_object(
  'id','convergence-pickaxe', 'name','Convergence', 'category','pickaxe',
  'craftingTab','limited-time', 'horizontal',false, 'equipmentOverhaul',true,
  'consumeMaterials',true, 'convergenceCommunity',true, 'moneyCost',0,
  'description','A permanent T16 community pickaxe forged by every eligible contribution.',
  'requirements',jsonb_build_array(jsonb_build_object(
    'id','convergence-community', 'type','convergence-community', 'amount',1,
    'label','Community construction and personal entitlement'
  )),
  'reward',jsonb_build_object(
    'id','convergence-pickaxe', 'name','Convergence', 'category','pickaxe', 'tier',16,
    'bonus',jsonb_build_object('luck',31,'rollSpeed',2,'mutationChance',0.5,'weightLuck',4,'weightMultiplier',0.75)
  )
)) on conflict(id) do update set recipe=excluded.recipe;

create or replace function convergence_private.all_complete(p_progress jsonb, p_targets jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from jsonb_each_text(p_targets) target
    where coalesce((p_progress->>target.key)::numeric, 0) < target.value::numeric
  )
$$;
revoke all on function convergence_private.all_complete(jsonb,jsonb) from public,anon,authenticated;

create or replace function convergence_private.restore_auto_craft(p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous text;
begin
  select previous_recipe_id into v_previous
  from convergence_private.auto_craft where player_id=p_player_id for update;
  if not found then return; end if;
  update public.player_crafting
  set active_auto_craft=v_previous, updated_at=now()
  where player_id=p_player_id and active_auto_craft='convergence-pickaxe';
  update convergence_private.auto_craft set enabled=false, previous_recipe_id=null, updated_at=now()
  where player_id=p_player_id;
end $$;
revoke all on function convergence_private.restore_auto_craft(uuid) from public,anon,authenticated;

create or replace function convergence_private.settle_event(p_now timestamptz default clock_timestamp())
returns convergence_private.event language plpgsql security definer set search_path = '' as $$
declare e convergence_private.event%rowtype; next_status text;
begin
  select * into e from convergence_private.event where id=true for update;
  if not found then raise exception 'convergence_event_missing'; end if;
  next_status := e.status;
  if e.status in ('scheduled','active') then
    if convergence_private.all_complete(e.progress,e.targets) then next_status := 'succeeded';
    elsif p_now >= e.deadline_at then next_status := 'failed';
    elsif p_now >= e.starts_at then next_status := 'active';
    else next_status := 'scheduled';
    end if;
  end if;
  if next_status is distinct from e.status then
    update convergence_private.event set status=next_status,
      succeeded_at=case when next_status='succeeded' then p_now else succeeded_at end,
      failed_at=case when next_status='failed' then p_now else failed_at end,
      updated_at=p_now where id=true returning * into e;
    if next_status in ('succeeded','failed') then
      update public.player_crafting pc set active_auto_craft=ac.previous_recipe_id, updated_at=p_now
      from convergence_private.auto_craft ac
      where ac.player_id=pc.player_id and ac.enabled and pc.active_auto_craft='convergence-pickaxe';
      update convergence_private.auto_craft set enabled=false, previous_recipe_id=null, updated_at=p_now where enabled;
    end if;
  end if;
  return e;
end $$;
revoke all on function convergence_private.settle_event(timestamptz) from public,anon,authenticated;

create or replace function convergence_private.rarity_key(p_rarity numeric)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_rarity>=1 and p_rarity<10 then 'common'
    when p_rarity>=50 and p_rarity<100 then 'rare'
    when p_rarity>=100 and p_rarity<1000 then 'epic'
    when p_rarity>=1000 and p_rarity<10000 then 'legendary'
    when p_rarity>=10000 and p_rarity<100000 then 'mythic'
    when p_rarity>=100000 and p_rarity<1000000 then 'exotic'
    when p_rarity>=1000000 and p_rarity<10000000 then 'exalted'
    when p_rarity>=10000000 and p_rarity<100000000 then 'cosmic'
    when p_rarity>=100000000 and p_rarity<1000000000 then 'transcendent'
    else null end
$$;
revoke all on function convergence_private.rarity_key(numeric) from public,anon,authenticated;

create or replace function convergence_private.specimen_preview(p_specimen jsonb, p_progress jsonb, p_targets jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  rarity numeric:=coalesce((p_specimen->>'rarity')::numeric,0);
  base_weight numeric:=coalesce((p_specimen->>'base_weight')::numeric,0);
  final_weight numeric:=greatest(0,coalesce((p_specimen->>'final_weight')::numeric,0));
  final_wm numeric:=case when base_weight>0 then final_weight/base_weight else 0 end;
  effective numeric:=greatest(0,coalesce((p_specimen->>'effective_rarity')::numeric,rarity));
  rarity_key text:=convergence_private.rarity_key(rarity);
  advances jsonb:='{}'::jsonb; points bigint:=0; delta numeric;
begin
  if rarity_key is not null and coalesce((p_progress->>rarity_key)::numeric,0)<(p_targets->>rarity_key)::numeric then
    advances:=jsonb_set(advances,array[rarity_key],'1'::jsonb,true);
  end if;
  for rarity_key in select key from (values
    ('weight3',final_wm>=3),('weight5',final_wm>=5),('weight10',final_wm>=10),('weight25',final_wm>=25),
    ('effective1b',effective>=1000000000),('effective10b',effective>=10000000000),
    ('effective100b',effective>=100000000000),('effective1t',effective>=1000000000000),
    ('under001g',final_weight<0.01),('over2500000g',final_weight>2500000)
  ) as checks(key,eligible)
  where eligible and coalesce((p_progress->>key)::numeric,0)<(p_targets->>key)::numeric
  loop advances:=jsonb_set(advances,array[rarity_key],'1'::jsonb,true); end loop;
  delta:=least(final_weight,greatest(0,(p_targets->>'mass')::numeric-coalesce((p_progress->>'mass')::numeric,0)));
  if delta>0 then advances:=jsonb_set(advances,'{mass}',to_jsonb(delta),true); end if;
  points:=case convergence_private.rarity_key(rarity)
    when 'common' then 1 when 'rare' then 2 when 'epic' then 5 when 'legendary' then 15
    when 'mythic' then 50 when 'exotic' then 150 when 'exalted' then 500
    when 'cosmic' then 2000 when 'transcendent' then 10000 else 0 end;
  points:=points+floor(final_weight/1000)::bigint+
    case when final_wm>=25 then 200 when final_wm>=10 then 20 when final_wm>=5 then 5 when final_wm>=3 then 2 else 0 end+
    case when effective>=1000000000000 then 5000 when effective>=100000000000 then 1000 when effective>=10000000000 then 200 when effective>=1000000000 then 50 else 0 end+
    case when final_weight<0.01 or final_weight>2500000 then 500 else 0 end;
  return jsonb_build_object('useful',advances<>'{}'::jsonb,'advances',advances,'points',points,
    'finalWeightMultiplier',final_wm,'effectiveRarity',effective);
end $$;
revoke all on function convergence_private.specimen_preview(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function convergence_private.apply_specimen(p_uid uuid,p_specimen jsonb,p_only_if_useful boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e convergence_private.event%rowtype; preview jsonb; k text; v jsonb; next_progress jsonb; gained bigint;
begin
  e:=convergence_private.settle_event(clock_timestamp());
  if e.status<>'active' then return jsonb_build_object('deposited',false,'preserved',true,'reason','event_'||e.status); end if;
  if coalesce((p_specimen->>'locked')::boolean,false) or coalesce((p_specimen->>'museum_locked')::boolean,false)
     or coalesce((p_specimen->>'automatic_consumption_protected')::boolean,false)
     or p_specimen->>'gem_name' in ('Enchant Relic','Ancient Relic') then
    return jsonb_build_object('deposited',false,'preserved',true,'reason','protected');
  end if;
  preview:=convergence_private.specimen_preview(p_specimen,e.progress,e.targets);
  if p_only_if_useful and not coalesce((preview->>'useful')::boolean,false) then
    return jsonb_build_object('deposited',false,'preserved',true,'reason','advances_none');
  end if;
  next_progress:=e.progress;
  for k,v in select * from jsonb_each(preview->'advances') loop
    next_progress:=jsonb_set(next_progress,array[k],to_jsonb(least((e.targets->>k)::numeric,
      coalesce((next_progress->>k)::numeric,0)+(v#>>'{}')::numeric)),true);
  end loop;
  gained:=coalesce((preview->>'points')::bigint,0);
  update convergence_private.event set progress=next_progress,updated_at=now() where id=true;
  insert into convergence_private.contributions(player_id,contribution_points,gems_donated,entitled)
  values(p_uid,gained,1,gained>=1000)
  on conflict(player_id) do update set
    contribution_points=convergence_private.contributions.contribution_points+excluded.contribution_points,
    gems_donated=convergence_private.contributions.gems_donated+1,
    entitled=convergence_private.contributions.entitled or
      convergence_private.contributions.contribution_points+excluded.contribution_points>=1000,
    updated_at=now();
  e:=convergence_private.settle_event(clock_timestamp());
  return jsonb_build_object('deposited',true,'preserved',false,'recipeId','convergence-pickaxe',
    'requirementIndex',0,'pointsAwarded',gained,'advances',preview->'advances','status',e.status);
end $$;
revoke all on function convergence_private.apply_specimen(uuid,jsonb,boolean) from public,anon,authenticated;

create or replace function convergence_private.player_has_prerequisite(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.player_equipment pe
    where pe.player_id=p_uid and pe.category='pickaxe' and (
      pe.tier=15 or pe.equipment_id in ('tectonic-pickaxe','the-accelerator','the-resonator','the-excavator')
    )
  ) or exists(
    select 1 from public.equipment_ownership_history h
    left join public.game_recipes r on r.id=h.equipment_id
    where h.player_id=p_uid and (
      coalesce((r.recipe->'reward'->>'tier')::integer,0)=15
      or h.equipment_id in ('tectonic-pickaxe','the-accelerator','the-resonator','the-excavator')
    )
  )
$$;
revoke all on function convergence_private.player_has_prerequisite(uuid) from public,anon,authenticated;

create or replace function convergence_private.public_snapshot(p_uid uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e convergence_private.event%rowtype; c convergence_private.contributions%rowtype; a convergence_private.auto_craft%rowtype;
  s convergence_private.roll_state%rowtype; complete_count integer; requirement_count integer; progress_percent numeric;
  contributor_count bigint; total_points numeric; total_gems numeric; total_cash numeric;
begin
  e:=convergence_private.settle_event(clock_timestamp());
  if clock_timestamp()<e.preview_at then raise exception 'preview_not_started'; end if;
  if p_uid is not null then
    select * into c from convergence_private.contributions where player_id=p_uid;
    select * into a from convergence_private.auto_craft where player_id=p_uid;
    select * into s from convergence_private.roll_state where player_id=p_uid;
  end if;
  select count(*),count(*) filter(where coalesce((e.progress->>t.key)::numeric,0)>=t.value::numeric)
  into requirement_count,complete_count from jsonb_each_text(e.targets)t;
  select avg(least(1,coalesce((e.progress->>t.key)::numeric,0)/nullif(t.value::numeric,0)))*100
  into progress_percent from jsonb_each_text(e.targets)t;
  select count(*),coalesce(sum(contribution_points),0),coalesce(sum(gems_donated),0),coalesce(sum(cash_donated),0)
  into contributor_count,total_points,total_gems,total_cash from convergence_private.contributions;
  return jsonb_build_object(
    'previewAt',e.preview_at,'startsAt',e.starts_at,'deadlineAt',e.deadline_at,'status',e.status,
    'succeededAt',e.succeeded_at,'failedAt',e.failed_at,'targets',e.targets,'progress',e.progress,
    'completedRequirements',complete_count,'requirementCount',requirement_count,'progressPercent',coalesce(progress_percent,0),
    'community',jsonb_build_object('contributors',contributor_count,'contributionPoints',total_points,
      'gemsDonated',total_gems,'cashDonated',total_cash),
    'player',case when p_uid is null then null else jsonb_build_object(
      'contributionPoints',coalesce(c.contribution_points,0),'gemsDonated',coalesce(c.gems_donated,0),
      'cashDonated',coalesce(c.cash_donated,0),'entitled',coalesce(c.entitled,false),
      'claimed',c.claimed_at is not null,'claimedAt',c.claimed_at,
      'prerequisiteMet',convergence_private.player_has_prerequisite(p_uid),
      'autoCraft',coalesce(a.enabled,false),
      'echo',coalesce(s.echo,0),'resonanceRolls',coalesce(s.resonance_rolls,0),
      'momentumCharges',coalesce(s.momentum_charges,0),'surgeRolls',coalesce(s.surge_rolls,0),
      'convergenceRolls',coalesce(s.convergence_rolls,0)
    ) end
  );
end $$;
revoke all on function convergence_private.public_snapshot(uuid) from public,anon,authenticated;

create or replace function public.get_convergence_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return convergence_private.public_snapshot(auth.uid()); end $$;
revoke all on function public.get_convergence_status() from public,anon;
grant execute on function public.get_convergence_status() to authenticated;

create or replace function public.get_convergence_leaderboard(p_limit integer default 100)
returns table(rank bigint,player_id uuid,username text,contribution_points bigint,contribution_percent numeric,
  gems_donated bigint,cash_donated numeric,entitled boolean)
language sql stable security definer set search_path = '' as $$
  select row_number() over(order by c.contribution_points desc,c.first_contributed_at,c.player_id),
    c.player_id,p.username,c.contribution_points,
    case when sum(c.contribution_points) over()>0 then c.contribution_points::numeric/sum(c.contribution_points) over()*100 else 0 end,
    c.gems_donated,c.cash_donated,c.entitled
  from convergence_private.contributions c join public.players p on p.id=c.player_id
  order by c.contribution_points desc,c.first_contributed_at,c.player_id
  limit least(100,greatest(1,coalesce(p_limit,100)))
$$;
revoke all on function public.get_convergence_leaderboard(integer) from public,anon;
grant execute on function public.get_convergence_leaderboard(integer) to authenticated;

create or replace function public.get_convergence_candidates(p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); e convergence_private.event%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into e from convergence_private.event where id=true;
  return coalesce((select jsonb_agg(row_data order by (row_data->>'id')::bigint desc) from (
    select to_jsonb(i)||jsonb_build_object('preview',convergence_private.specimen_preview(to_jsonb(i),e.progress,e.targets)) row_data
    from public.inventory_gems i where i.player_id=uid and not coalesce(i.locked,false)
      and not coalesce(i.museum_locked,false) and i.gem_name not in ('Enchant Relic','Ancient Relic')
    order by i.id desc offset greatest(0,coalesce(p_offset,0)) limit least(200,greatest(1,coalesce(p_limit,100)))
  ) candidates),'[]'::jsonb);
end $$;
revoke all on function public.get_convergence_candidates(integer,integer) from public,anon;
grant execute on function public.get_convergence_candidates(integer,integer) to authenticated;

create or replace function public.preview_convergence_donation(p_gem_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); ids bigint[]; e convergence_private.event%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select coalesce(array_agg(distinct id order by id),'{}'::bigint[]) into ids from unnest(coalesce(p_gem_ids,'{}'::bigint[]))id;
  if cardinality(ids)=0 or cardinality(ids)>500 then raise exception 'select_between_1_and_500_gems'; end if;
  select * into e from convergence_private.event where id=true;
  return jsonb_build_object('selectedCount',cardinality(ids),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'gemName',i.gem_name,'finalWeight',i.final_weight,
    'preview',convergence_private.specimen_preview(to_jsonb(i),e.progress,e.targets)
  ) order by i.id) from public.inventory_gems i where i.player_id=uid and i.id=any(ids)),'[]'::jsonb));
end $$;
revoke all on function public.preview_convergence_donation(bigint[]) from public,anon;
grant execute on function public.preview_convergence_donation(bigint[]) to authenticated;

create or replace function public.donate_convergence_gems(p_gem_ids bigint[],p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); ids bigint[]; selected_ids bigint[]; gem public.inventory_gems%rowtype; receipt jsonb;
  result jsonb; donated integer:=0; rejected integer:=0; points bigint:=0; one_result jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'request_key_required'; end if;
  select dr.result into receipt from convergence_private.donation_requests dr
  where dr.player_id=uid and dr.request_key=p_request_key;
  if found then return receipt||jsonb_build_object('idempotentReplay',true); end if;
  select coalesce(array_agg(distinct id order by id),'{}'::bigint[]) into ids from unnest(coalesce(p_gem_ids,'{}'::bigint[]))id;
  if cardinality(ids)=0 or cardinality(ids)>500 then raise exception 'select_between_1_and_500_gems'; end if;
  perform 1 from public.players where id=uid for update;
  select dr.result into receipt from convergence_private.donation_requests dr
  where dr.player_id=uid and dr.request_key=p_request_key;
  if found then return receipt||jsonb_build_object('idempotentReplay',true); end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[]) into selected_ids from (
    select id from public.inventory_gems where player_id=uid and id=any(ids) and not coalesce(locked,false)
      and not coalesce(museum_locked,false) and gem_name not in ('Enchant Relic','Ancient Relic') order by id for update
  ) selected;
  if selected_ids is distinct from ids then raise exception 'gem_selection_changed'; end if;
  for gem in select * from public.inventory_gems where player_id=uid and id=any(ids) order by id loop
    one_result:=convergence_private.apply_specimen(uid,to_jsonb(gem),true);
    if coalesce((one_result->>'deposited')::boolean,false) then
      delete from public.inventory_gems where id=gem.id and player_id=uid;
      donated:=donated+1; points:=points+coalesce((one_result->>'pointsAwarded')::bigint,0);
    else rejected:=rejected+1; end if;
  end loop;
  if donated=0 then raise exception 'donation_advances_none'; end if;
  result:=jsonb_build_object('donated',donated,'rejected',rejected,'pointsAwarded',points,
    'status',convergence_private.public_snapshot(uid));
  insert into convergence_private.donation_requests(player_id,request_key,donation_type,result)
  values(uid,p_request_key,'gems',result);
  return result;
end $$;
revoke all on function public.donate_convergence_gems(bigint[],uuid) from public,anon;
grant execute on function public.donate_convergence_gems(bigint[],uuid) to authenticated;

create or replace function public.donate_convergence_cash(p_amount numeric,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); e convergence_private.event%rowtype; receipt jsonb; amount numeric; points bigint; money_after numeric; result jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'request_key_required'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>trunc(p_amount) then raise exception 'invalid_cash_amount'; end if;
  perform 1 from public.players where id=uid for update;
  select dr.result into receipt from convergence_private.donation_requests dr where dr.player_id=uid and dr.request_key=p_request_key;
  if found then return receipt||jsonb_build_object('idempotentReplay',true); end if;
  e:=convergence_private.settle_event(clock_timestamp());
  if e.status<>'active' then raise exception 'event_%',e.status; end if;
  amount:=least(p_amount,greatest(0,(e.targets->>'cash')::numeric-(e.progress->>'cash')::numeric));
  if amount<=0 then raise exception 'donation_advances_none'; end if;
  update public.players set money=money-amount where id=uid and money>=amount returning money into money_after;
  if not found then raise exception 'insufficient_funds'; end if;
  update convergence_private.event set progress=jsonb_set(progress,'{cash}',to_jsonb((progress->>'cash')::numeric+amount),true),updated_at=now() where id=true;
  points:=floor(amount/100000)::bigint;
  insert into convergence_private.contributions(player_id,contribution_points,cash_donated,entitled)
  values(uid,points,amount,points>=1000)
  on conflict(player_id) do update set contribution_points=convergence_private.contributions.contribution_points+excluded.contribution_points,
    cash_donated=convergence_private.contributions.cash_donated+excluded.cash_donated,
    entitled=convergence_private.contributions.entitled or convergence_private.contributions.contribution_points+excluded.contribution_points>=1000,
    updated_at=now();
  e:=convergence_private.settle_event(clock_timestamp());
  result:=jsonb_build_object('amount',amount,'pointsAwarded',points,'money',money_after,'status',convergence_private.public_snapshot(uid));
  insert into convergence_private.donation_requests(player_id,request_key,donation_type,result) values(uid,p_request_key,'cash',result);
  return result;
end $$;
revoke all on function public.donate_convergence_cash(numeric,uuid) from public,anon;
grant execute on function public.donate_convergence_cash(numeric,uuid) to authenticated;

create or replace function convergence_private.set_auto_craft(p_uid uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e convergence_private.event%rowtype; current_recipe text; previous_recipe text;
begin
  if p_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  e:=convergence_private.settle_event(clock_timestamp());
  insert into public.player_crafting(player_id,active_auto_craft,updated_at) values(p_uid,null,now()) on conflict(player_id) do nothing;
  select active_auto_craft into current_recipe from public.player_crafting where player_id=p_uid for update;
  if coalesce(p_enabled,false) then
    if e.status<>'active' then raise exception 'event_not_active'; end if;
    select previous_recipe_id into previous_recipe from convergence_private.auto_craft where player_id=p_uid;
    if current_recipe<>'convergence-pickaxe' then previous_recipe:=current_recipe; end if;
    insert into convergence_private.auto_craft(player_id,enabled,previous_recipe_id,updated_at)
    values(p_uid,true,previous_recipe,now()) on conflict(player_id) do update set enabled=true,
      previous_recipe_id=excluded.previous_recipe_id,updated_at=now();
    update public.player_crafting set active_auto_craft='convergence-pickaxe',updated_at=now() where player_id=p_uid;
  else
    perform convergence_private.restore_auto_craft(p_uid);
  end if;
  return jsonb_build_object('enabled',coalesce(p_enabled,false),
    'activeAutoCraftRecipeId',(select active_auto_craft from public.player_crafting where player_id=p_uid));
end $$;
revoke all on function convergence_private.set_auto_craft(uuid,boolean) from public,anon,authenticated;

create or replace function public.set_convergence_auto_craft(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return convergence_private.set_auto_craft(auth.uid(),p_enabled); end $$;
revoke all on function public.set_convergence_auto_craft(boolean) from public,anon;
grant execute on function public.set_convergence_auto_craft(boolean) to authenticated;

create or replace function public.set_convergence_auto_craft_for_player(p_uid uuid,p_enabled boolean)
returns jsonb language sql security definer set search_path = '' as $$
  select convergence_private.set_auto_craft(p_uid,p_enabled)
$$;
revoke all on function public.set_convergence_auto_craft_for_player(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_convergence_auto_craft_for_player(uuid,boolean) to service_role;

create or replace function convergence_private.replace_auto_craft_target(p_uid uuid,p_recipe_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from convergence_private.auto_craft where player_id=p_uid and enabled) then
    perform convergence_private.restore_auto_craft(p_uid);
    if p_recipe_id is null then
      return jsonb_build_object('activeAutoCraftRecipeId',
        (select active_auto_craft from public.player_crafting where player_id=p_uid));
    end if;
  end if;
  insert into public.player_crafting(player_id,active_auto_craft,updated_at) values(p_uid,p_recipe_id,now())
  on conflict(player_id) do update set active_auto_craft=excluded.active_auto_craft,updated_at=now();
  return jsonb_build_object('activeAutoCraftRecipeId',p_recipe_id);
end $$;
revoke all on function convergence_private.replace_auto_craft_target(uuid,text) from public,anon,authenticated;
grant execute on function convergence_private.replace_auto_craft_target(uuid,text) to service_role;

create or replace function public.claim_convergence_pickaxe()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); e convergence_private.event%rowtype; c convergence_private.contributions%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform 1 from public.players where id=uid for update;
  e:=convergence_private.settle_event(clock_timestamp());
  if e.status<>'succeeded' then raise exception 'construction_not_succeeded'; end if;
  select * into c from convergence_private.contributions where player_id=uid for update;
  if not found or not c.entitled then raise exception 'not_entitled'; end if;
  if not convergence_private.player_has_prerequisite(uid) then raise exception 'prerequisite_not_met'; end if;
  if c.claimed_at is not null or exists(select 1 from public.player_equipment where player_id=uid and equipment_id='convergence-pickaxe') then
    return jsonb_build_object('claimed',true,'alreadyOwned',true);
  end if;
  update public.player_equipment set equipped=false where player_id=uid and category='pickaxe' and equipped;
  insert into public.player_equipment(player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
    mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped)
  values(uid,'convergence-pickaxe','pickaxe',16,'Convergence',31,2,.5,4,.75,true)
  on conflict(player_id,equipment_id) do update set equipped=true;
  insert into public.equipment_ownership_history(player_id,equipment_id) values(uid,'convergence-pickaxe') on conflict do nothing;
  insert into convergence_private.roll_state(player_id) values(uid) on conflict do nothing;
  update convergence_private.contributions set claimed_at=now(),updated_at=now() where player_id=uid;
  return jsonb_build_object('claimed',true,'alreadyOwned',false,'equipmentId','convergence-pickaxe');
end $$;
revoke all on function public.claim_convergence_pickaxe() from public,anon;
grant execute on function public.claim_convergence_pickaxe() to authenticated;

create or replace function public.activate_convergence_surge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); s convergence_private.roll_state%rowtype;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not exists(select 1 from public.player_equipment where player_id=uid and equipment_id='convergence-pickaxe') then raise exception 'not_owned'; end if;
  insert into convergence_private.roll_state(player_id) values(uid) on conflict do nothing;
  select * into s from convergence_private.roll_state where player_id=uid for update;
  if s.surge_rolls>0 then raise exception 'surge_already_active'; end if;
  if s.momentum_charges<1 then raise exception 'no_momentum_charges'; end if;
  update convergence_private.roll_state set momentum_charges=momentum_charges-1,surge_rolls=10,updated_at=now() where player_id=uid
  returning * into s;
  return jsonb_build_object('momentumCharges',s.momentum_charges,'surgeRolls',s.surge_rolls);
end $$;
revoke all on function public.activate_convergence_surge() from public,anon;
grant execute on function public.activate_convergence_surge() to authenticated;

create or replace function convergence_private.get_roll_state(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('echo',coalesce(s.echo,0),'resonanceRolls',coalesce(s.resonance_rolls,0),
    'momentumCharges',coalesce(s.momentum_charges,0),'surgeRolls',coalesce(s.surge_rolls,0),
    'convergenceRolls',coalesce(s.convergence_rolls,0))
  from (select 1) seed left join convergence_private.roll_state s on s.player_id=p_uid
$$;
revoke all on function convergence_private.get_roll_state(uuid) from public,anon,authenticated;
grant execute on function convergence_private.get_roll_state(uuid) to service_role;

create or replace function public.get_convergence_roll_state(p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select convergence_private.get_roll_state(p_uid)
$$;
revoke all on function public.get_convergence_roll_state(uuid) from public,anon,authenticated;
grant execute on function public.get_convergence_roll_state(uuid) to service_role;

create or replace function public.replace_auto_craft_target(p_uid uuid,p_recipe_id text)
returns jsonb language sql security definer set search_path = '' as $$
  select convergence_private.replace_auto_craft_target(p_uid,p_recipe_id)
$$;
revoke all on function public.replace_auto_craft_target(uuid,text) from public,anon,authenticated;
grant execute on function public.replace_auto_craft_target(uuid,text) to service_role;

create or replace function convergence_private.sync_roll_state()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  s:=new.equipment_state->'convergence';
  if s is null then return new; end if;
  insert into convergence_private.roll_state(player_id,echo,resonance_rolls,momentum_charges,surge_rolls,convergence_rolls,updated_at)
  values(new.id,greatest(0,least(999,coalesce((s->>'echo')::integer,0))),greatest(0,least(5,coalesce((s->>'resonanceRolls')::integer,0))),
    0,greatest(0,least(10,coalesce((s->>'surgeRolls')::integer,0))),
    greatest(0,coalesce((s->>'convergenceRolls')::bigint,0)),now())
  on conflict(player_id) do update set echo=excluded.echo,resonance_rolls=excluded.resonance_rolls,
    surge_rolls=excluded.surge_rolls,
    convergence_rolls=excluded.convergence_rolls,updated_at=now();
  return new;
end $$;
revoke all on function convergence_private.sync_roll_state() from public,anon,authenticated;
drop trigger if exists convergence_sync_roll_state on public.players;
create trigger convergence_sync_roll_state after update of equipment_state on public.players
for each row execute function convergence_private.sync_roll_state();

create sequence if not exists convergence_private.global_genuine_roll_seq;
revoke all on sequence convergence_private.global_genuine_roll_seq from public,anon,authenticated;

create or replace function convergence_private.award_momentum_milestone()
returns trigger language plpgsql security definer set search_path = '' as $$
declare seq_value bigint; delta_index bigint;
begin
  if new.total_rolls<=old.total_rolls then return new; end if;
  for delta_index in 1..(new.total_rolls-old.total_rolls) loop
    seq_value:=nextval('convergence_private.global_genuine_roll_seq');
    if seq_value%1000000=0 then
      insert into convergence_private.roll_state(player_id,momentum_charges,updated_at)
      select distinct owner.player_id,1,now() from (
        select player_id from public.player_equipment where equipment_id='convergence-pickaxe'
        union select player_id from public.equipment_ownership_history where equipment_id='convergence-pickaxe'
      ) owner
      on conflict(player_id) do update set momentum_charges=least(3,convergence_private.roll_state.momentum_charges+1),updated_at=now();
    end if;
  end loop;
  return new;
end $$;
revoke all on function convergence_private.award_momentum_milestone() from public,anon,authenticated;
drop trigger if exists convergence_award_momentum on public.players;
create trigger convergence_award_momentum after update of total_rolls on public.players
for each row execute function convergence_private.award_momentum_milestone();

create or replace function convergence_private.autocraft_deposit(p_uid uuid,p_specimen jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from convergence_private.auto_craft where player_id=p_uid and enabled) then
    return jsonb_build_object('deposited',false,'preserved',true,'reason','disabled');
  end if;
  return convergence_private.apply_specimen(p_uid,p_specimen,true);
end $$;
revoke all on function convergence_private.autocraft_deposit(uuid,jsonb) from public,anon,authenticated;

create or replace function public.roll_route_result(
  p_player_id uuid,p_lease_id uuid,p_specimen jsonb,p_filter_keep boolean,
  p_active_auto_craft text default null,p_external_deposit text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_player public.players%rowtype; v_bundle jsonb;
  v_auto_craft jsonb:=jsonb_build_object('deposited',false,'preserved',false,'recipeId',null,'requirementIndex',null);
  v_auto_craft_error text:=null;
begin
  select * into v_player from public.players where id=p_player_id for update;
  if not found or p_lease_id is null or v_player.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
  if p_external_deposit is not null then v_bundle:=jsonb_build_object('status',p_external_deposit,'keepInInventory',false);
  elsif coalesce(p_filter_keep,false) then v_bundle:=jsonb_build_object('status','kept','keepInInventory',true,'reason','filter');
  else v_bundle:=public.bundle_route_roll(p_player_id,p_lease_id,p_specimen); end if;
  if coalesce(v_bundle->>'status','none')<>'deposited' and not coalesce((v_bundle->>'keepInInventory')::boolean,false) then
    begin
      if p_active_auto_craft='convergence-pickaxe' then
        v_auto_craft:=convergence_private.autocraft_deposit(p_player_id,p_specimen);
      elsif p_active_auto_craft='paradox-pickaxe' then
        v_auto_craft:=public.paradox_autocraft_deposit(p_player_id,p_specimen);
      elsif p_active_auto_craft is not null then
        v_auto_craft:=public.roll_autocraft_deposit(p_player_id,p_specimen);
      end if;
    exception when others then v_auto_craft_error:=sqlerrm; end;
  end if;
  return jsonb_build_object('bundle',v_bundle,'autoCraft',v_auto_craft,'autoCraftError',v_auto_craft_error);
end $$;
revoke all on function public.roll_route_result(uuid,uuid,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.roll_route_result(uuid,uuid,jsonb,boolean,text,text) to service_role;

drop function if exists public.roll_commit_result(uuid,uuid,bigint,jsonb,boolean,boolean,jsonb,boolean,jsonb,text,jsonb,integer,jsonb,jsonb,boolean,boolean);
create function public.roll_commit_result(
  p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_primary_specimen jsonb,p_save_primary boolean,
  p_relic_drop boolean,p_duplicate jsonb,p_auto_sell boolean,p_state jsonb,p_loot text,p_bonus jsonb,
  p_capacity integer,p_player_patch jsonb,p_bookkeeping jsonb,p_convergence_bonuses jsonb default '[]'::jsonb,
  p_include_background boolean default false,p_release_on_success boolean default false
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_player public.players%rowtype; v_primary public.inventory_gems%rowtype; v_duplicate public.inventory_gems%rowtype;
  v_extra public.inventory_gems%rowtype; v_equipment jsonb; v_extras jsonb:='[]'::jsonb; v_item jsonb; v_count integer;
  v_money double precision:=null; v_sold boolean:=false; v_sale_error text:=null; v_duplicate_error text:=null; v_lease_released boolean:=false;
begin
  select * into v_player from public.players where id=p_player_id for update;
  if not found or v_player.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
  if v_player.equipment_state_roll>=p_genuine_roll then return jsonb_build_object('duplicateCommit',true); end if;
  if p_genuine_roll<>v_player.equipment_genuine_rolls+1 then raise exception 'invalid_genuine_roll'; end if;
  if coalesce(p_save_primary,false) then
    if coalesce(p_relic_drop,false) then perform public.grant_player_relic(p_player_id,p_primary_specimen->>'gem_name',1);
    else v_primary:=public.roll_insert_inventory_specimen(p_player_id,p_primary_specimen); end if;
  end if;
  if p_duplicate is not null then
    begin v_duplicate:=public.roll_insert_inventory_specimen(p_player_id,p_duplicate);
    exception when others then v_duplicate_error:=sqlerrm; end;
  end if;
  if jsonb_typeof(coalesce(p_convergence_bonuses,'[]'::jsonb))='array' then
    for v_item in select value from jsonb_array_elements(coalesce(p_convergence_bonuses,'[]'::jsonb)) loop
      select count(*) into v_count from public.inventory_gems where player_id=p_player_id;
      exit when v_count>=p_capacity;
      v_extra:=public.roll_insert_inventory_specimen(p_player_id,v_item);
      v_extras:=v_extras||jsonb_build_array(to_jsonb(v_extra));
    end loop;
  end if;
  v_equipment:=public.commit_equipment_roll(p_player_id,p_lease_id,p_genuine_roll,p_state,p_loot,p_bonus,
    p_capacity,p_player_patch,p_bookkeeping,p_include_background);
  if coalesce(p_auto_sell,false) and v_primary.id is not null then
    begin v_money:=public.sell_inventory_gem(p_player_id,v_primary.id,'auto');v_sold:=true;
    exception when others then v_sale_error:=sqlerrm; end;
  end if;
  if coalesce(p_release_on_success,false) then
    update public.players set roll_lease_id=null,roll_lease_expires_at=null where id=p_player_id and roll_lease_id=p_lease_id;
    v_lease_released:=found;
  end if;
  return jsonb_build_object('primary',case when v_primary.id is not null then to_jsonb(v_primary) else null end,
    'duplicate',case when v_duplicate.id is not null then to_jsonb(v_duplicate) else null end,'duplicateError',v_duplicate_error,
    'convergenceBonuses',v_extras,'equipment',v_equipment,'leaseReleased',v_lease_released,
    'sale',jsonb_build_object('sold',v_sold,'money',v_money,'error',v_sale_error));
end $$;
revoke all on function public.roll_commit_result(uuid,uuid,bigint,jsonb,boolean,boolean,jsonb,boolean,jsonb,text,jsonb,integer,jsonb,jsonb,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.roll_commit_result(uuid,uuid,bigint,jsonb,boolean,boolean,jsonb,boolean,jsonb,text,jsonb,integer,jsonb,jsonb,jsonb,boolean,boolean) to service_role;

-- Preserve the optimized pre-Convergence RPC contract during a staggered Edge
-- Function deployment. The exact 16-argument overload forwards without bonus
-- specimens; the new roll handler calls the 17-argument overload explicitly.
create function public.roll_commit_result(
  p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_primary_specimen jsonb,p_save_primary boolean,
  p_relic_drop boolean,p_duplicate jsonb,p_auto_sell boolean,p_state jsonb,p_loot text,p_bonus jsonb,
  p_capacity integer,p_player_patch jsonb,p_bookkeeping jsonb,
  p_include_background boolean default false,p_release_on_success boolean default false
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.roll_commit_result(p_player_id,p_lease_id,p_genuine_roll,p_primary_specimen,p_save_primary,
    p_relic_drop,p_duplicate,p_auto_sell,p_state,p_loot,p_bonus,p_capacity,p_player_patch,p_bookkeeping,
    '[]'::jsonb,p_include_background,p_release_on_success)
$$;
revoke all on function public.roll_commit_result(uuid,uuid,bigint,jsonb,boolean,boolean,jsonb,boolean,jsonb,text,jsonb,integer,jsonb,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.roll_commit_result(uuid,uuid,bigint,jsonb,boolean,boolean,jsonb,boolean,jsonb,text,jsonb,integer,jsonb,jsonb,boolean,boolean) to service_role;

commit;
