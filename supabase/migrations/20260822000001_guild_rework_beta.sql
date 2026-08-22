-- Guild rework beta: clean beta data, permanent progression, safe membership,
-- upgrades, generated missions, and rotating six-day competitions.

begin;

-- Pre-release guild rows used the old roll-points model. Only wipe them and
-- migrate the legacy column on a database that has NOT been reworked yet, so
-- re-running this migration can never destroy live guild data or fail on a
-- database where the rework is already present.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guilds' and column_name = 'luck_tier'
  ) then
    truncate table public.guild_invites, public.guild_quests, public.guild_members, public.guilds cascade;
    alter table public.guilds rename column points to legacy_points;
  end if;
end $$;

alter table public.guilds
  add column if not exists tag text,
  add column if not exists description text not null default '',
  add column if not exists emblem text not null default 'gem',
  add column if not exists primary_color text not null default '#7c83ff',
  add column if not exists secondary_color text not null default '#42d6b3',
  add column if not exists accent_color text not null default '#f5c451',
  add column if not exists join_mode text not null default 'invite',
  add column if not exists xp bigint not null default 0,
  add column if not exists guild_points bigint not null default 0,
  add column if not exists member_capacity integer not null default 3,
  add column if not exists luck_tier integer not null default 0,
  add column if not exists speed_tier integer not null default 0,
  add column if not exists weight_luck_tier integer not null default 0,
  add column if not exists officer_capacity integer not null default 2,
  add column if not exists name_changed_at timestamptz,
  add column if not exists tag_changed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.guilds drop column if exists legacy_points;
alter table public.guilds drop constraint if exists guilds_tag_format;
alter table public.guilds add constraint guilds_tag_format check (tag ~ '^[A-Z0-9]{2,5}$');
alter table public.guilds drop constraint if exists guilds_description_length;
alter table public.guilds add constraint guilds_description_length check (char_length(description) between 1 and 200);
alter table public.guilds drop constraint if exists guilds_join_mode;
alter table public.guilds add constraint guilds_join_mode check (join_mode in ('invite','request','open'));
alter table public.guilds drop constraint if exists guilds_capacity_range;
alter table public.guilds add constraint guilds_capacity_range check (member_capacity between 3 and 10);
alter table public.guilds drop constraint if exists guilds_upgrade_ranges;
alter table public.guilds add constraint guilds_upgrade_ranges check (
  luck_tier between 0 and 10 and speed_tier between 0 and 10 and weight_luck_tier between 0 and 10
);
create unique index if not exists guilds_name_ci_unique on public.guilds(lower(name));
create unique index if not exists guilds_tag_ci_unique on public.guilds(lower(tag));

alter table public.guild_members drop constraint if exists guild_members_role_check;
alter table public.guild_members add constraint guild_members_role_check check (role in ('owner','officer','member'));
alter table public.guild_members
  add column if not exists eligible_at timestamptz not null default (now() + interval '24 hours'),
  add column if not exists lifetime_contribution bigint not null default 0,
  add column if not exists weekly_contribution bigint not null default 0;

create table if not exists public.guild_activity (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  actor_id uuid references public.players(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_member_daily_xp (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  xp_date date not null,
  roll_xp integer not null default 0,
  primary key (guild_id, player_id, xp_date)
);

create table if not exists public.guild_player_cooldowns (
  player_id uuid primary key references public.players(id) on delete cascade,
  can_join_at timestamptz not null
);

create table if not exists public.guild_missions (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  cadence text not null check (cadence in ('daily','weekly')),
  difficulty text not null check (difficulty in ('standard','advanced','elite')),
  objective text not null,
  threshold numeric not null default 0,
  target numeric not null,
  progress numeric not null default 0,
  reward_xp bigint not null,
  reward_points bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guild_id, cadence, difficulty, starts_at)
);

create table if not exists public.guild_mission_contributions (
  mission_id uuid not null references public.guild_missions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  contribution numeric not null default 0,
  reward_claimed_at timestamptz,
  primary key (mission_id, player_id)
);

create table if not exists public.guild_competitions (
  id uuid primary key default gen_random_uuid(),
  cycle_start timestamptz not null unique,
  active_starts_at timestamptz not null,
  active_ends_at timestamptz not null,
  cycle_ends_at timestamptz not null,
  competition_type text not null check (competition_type in ('rarest','heavy','appraisal','rarity_rush')),
  rewards jsonb not null default '{}'::jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_competition_members (
  competition_id uuid not null references public.guild_competitions(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  score numeric not null default 0,
  best_values numeric[] not null default '{}',
  reached_at timestamptz not null default now(),
  primary key (competition_id, player_id)
);

create table if not exists public.guild_competition_results (
  competition_id uuid not null references public.guild_competitions(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  score numeric not null default 0,
  rank integer,
  reward_points bigint,
  finalized_at timestamptz,
  primary key (competition_id, guild_id)
);

create index if not exists guild_activity_recent_idx on public.guild_activity(guild_id, created_at desc);
create index if not exists guild_missions_active_idx on public.guild_missions(guild_id, starts_at, ends_at);
create index if not exists guild_competition_scores_idx on public.guild_competition_results(competition_id, score desc);

alter table public.guild_activity enable row level security;
alter table public.guild_member_daily_xp enable row level security;
alter table public.guild_player_cooldowns enable row level security;
alter table public.guild_missions enable row level security;
alter table public.guild_mission_contributions enable row level security;
alter table public.guild_competitions enable row level security;
alter table public.guild_competition_members enable row level security;
alter table public.guild_competition_results enable row level security;
revoke all on public.guild_activity, public.guild_member_daily_xp, public.guild_player_cooldowns, public.guild_missions,
  public.guild_mission_contributions, public.guild_competitions,
  public.guild_competition_members, public.guild_competition_results from anon, authenticated;
grant select, insert, update, delete on public.guild_activity, public.guild_member_daily_xp,
  public.guild_player_cooldowns, public.guild_missions, public.guild_mission_contributions, public.guild_competitions,
  public.guild_competition_members, public.guild_competition_results to service_role;

create or replace function public.guild_level(p_xp bigint)
returns integer language sql immutable as $$
  select case
    when p_xp >= 150000 then 10 when p_xp >= 115000 then 9
    when p_xp >= 85000 then 8 when p_xp >= 60000 then 7
    when p_xp >= 40000 then 6 when p_xp >= 25000 then 5
    when p_xp >= 15000 then 4 when p_xp >= 7500 then 3
    when p_xp >= 2500 then 2 else 1 end;
$$;

create or replace function public.guild_upgrade_cost(p_track text, p_next_tier integer)
returns bigint language plpgsql immutable as $$
declare
  v_track_costs bigint[] := array[500,750,1000,1500,2000,3000,4000,5500,7500,10000];
  v_capacity_costs bigint[] := array[750,1250,2000,3000,4500,6000,8000];
begin
  if p_track = 'capacity' then return v_capacity_costs[p_next_tier - 3]; end if;
  return v_track_costs[p_next_tier];
end $$;

create or replace function public.create_guild_v2(
  p_player_id uuid, p_name text, p_tag text, p_description text,
  p_emblem text, p_primary text, p_secondary text, p_accent text, p_join_mode text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild public.guilds%rowtype; v_money numeric;
begin
  if exists(select 1 from public.guild_members where player_id=p_player_id) then raise exception 'already_in_guild'; end if;
  if exists(select 1 from public.guild_player_cooldowns where player_id=p_player_id and can_join_at>now()) then raise exception 'guild_join_cooldown'; end if;
  if char_length(trim(p_name)) not between 3 and 24 or trim(p_name) !~ '^[A-Za-z0-9 _''-]+$' then raise exception 'invalid_name'; end if;
  if upper(trim(p_tag)) !~ '^[A-Z0-9]{2,5}$' then raise exception 'invalid_tag'; end if;
  if char_length(trim(p_description)) not between 1 and 200 then raise exception 'invalid_description'; end if;
  select money into v_money from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if coalesce(v_money,0) < 500000 then raise exception 'insufficient_money'; end if;
  update public.players set money=money-500000 where id=p_player_id;
  insert into public.guilds(name,tag,description,emblem,primary_color,secondary_color,accent_color,join_mode,owner_id)
  values(trim(p_name),upper(trim(p_tag)),trim(p_description),coalesce(nullif(p_emblem,''),'gem'),p_primary,p_secondary,p_accent,p_join_mode,p_player_id)
  returning * into v_guild;
  insert into public.guild_members(guild_id,player_id,role,eligible_at) values(v_guild.id,p_player_id,'owner',now());
  insert into public.guild_activity(guild_id,actor_id,action) values(v_guild.id,p_player_id,'guild_created');
  return jsonb_build_object('guild',to_jsonb(v_guild));
exception when unique_violation then raise exception 'guild_identity_taken';
end $$;

create or replace function public.guild_purchase_upgrade(p_player_id uuid, p_track text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild public.guilds%rowtype; v_current int; v_next int; v_required int; v_cost bigint;
begin
  select g.* into v_guild from public.guilds g where g.owner_id=p_player_id for update;
  if not found then raise exception 'owner_only'; end if;
  if p_track='capacity' then v_current:=v_guild.member_capacity; v_next:=v_current+1;
    if v_next>10 then raise exception 'max_upgrade'; end if;
    v_required:=(array[2,3,4,5,6,7,9])[v_next-3];
  elsif p_track='luck' then v_current:=v_guild.luck_tier; v_next:=v_current+1; v_required:=v_next;
  elsif p_track='speed' then v_current:=v_guild.speed_tier; v_next:=v_current+1; v_required:=v_next;
  elsif p_track='weight_luck' then v_current:=v_guild.weight_luck_tier; v_next:=v_current+1; v_required:=v_next;
  else raise exception 'invalid_upgrade'; end if;
  if v_next>10 then raise exception 'max_upgrade'; end if;
  if public.guild_level(v_guild.xp)<v_required then raise exception 'guild_level_required'; end if;
  v_cost:=public.guild_upgrade_cost(p_track,v_next);
  if v_guild.guild_points<v_cost then raise exception 'insufficient_guild_points'; end if;
  update public.guilds set guild_points=guild_points-v_cost,
    member_capacity=case when p_track='capacity' then v_next else member_capacity end,
    luck_tier=case when p_track='luck' then v_next else luck_tier end,
    speed_tier=case when p_track='speed' then v_next else speed_tier end,
    weight_luck_tier=case when p_track='weight_luck' then v_next else weight_luck_tier end,
    updated_at=now() where id=v_guild.id;
  insert into public.guild_activity(guild_id,actor_id,action,details)
  values(v_guild.id,p_player_id,'upgrade_purchased',jsonb_build_object('track',p_track,'tier',v_next,'cost',v_cost));
  return jsonb_build_object('ok',true,'track',p_track,'tier',v_next,'cost',v_cost);
end $$;

create or replace function public.guild_respond_invite_v2(p_player_id uuid,p_invite_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invite public.guild_invites%rowtype; v_guild public.guilds%rowtype; v_count integer;
begin
  select * into v_invite from public.guild_invites
  where id=p_invite_id and invited_player_id=p_player_id and status='pending' for update;
  if not found then raise exception 'invite_not_found'; end if;
  if not p_accept then
    update public.guild_invites set status='declined',responded_at=now() where id=v_invite.id;
    return jsonb_build_object('ok',true,'accepted',false);
  end if;
  if exists(select 1 from public.guild_members where player_id=p_player_id) then raise exception 'already_in_guild'; end if;
  if exists(select 1 from public.guild_player_cooldowns where player_id=p_player_id and can_join_at>now()) then raise exception 'guild_join_cooldown'; end if;
  select * into v_guild from public.guilds where id=v_invite.guild_id for update;
  select count(*) into v_count from public.guild_members where guild_id=v_guild.id;
  if v_count>=v_guild.member_capacity then raise exception 'guild_full'; end if;
  insert into public.guild_members(guild_id,player_id,role,eligible_at)
  values(v_guild.id,p_player_id,'member',now()+interval '24 hours');
  update public.guild_invites set status='accepted',responded_at=now() where id=v_invite.id;
  update public.guild_invites set status='cancelled',responded_at=now()
    where invited_player_id=p_player_id and status='pending' and id<>v_invite.id;
  insert into public.guild_activity(guild_id,actor_id,action) values(v_guild.id,p_player_id,'member_joined');
  return jsonb_build_object('ok',true,'accepted',true,'guildId',v_guild.id);
end $$;

create or replace function public.guild_manage_member(
  p_actor_id uuid,p_target_id uuid,p_action text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.guild_members%rowtype; v_target public.guild_members%rowtype; v_owner uuid; v_officers int;
begin
  select * into v_actor from public.guild_members where player_id=p_actor_id;
  select * into v_target from public.guild_members where player_id=p_target_id and guild_id=v_actor.guild_id for update;
  if not found then raise exception 'member_not_found'; end if;
  select owner_id into v_owner from public.guilds where id=v_actor.guild_id for update;
  if p_action='kick' then
    if v_actor.role not in ('owner','officer') then raise exception 'management_only'; end if;
    if v_target.role<>'member' then raise exception 'cannot_kick_role'; end if;
    insert into public.guild_player_cooldowns(player_id,can_join_at) values(p_target_id,now()+interval '24 hours') on conflict(player_id) do update set can_join_at=excluded.can_join_at;
    delete from public.guild_competition_members where player_id=p_target_id and competition_id in(select id from public.guild_competitions where active_ends_at>now());
    delete from public.guild_members where guild_id=v_actor.guild_id and player_id=p_target_id;
  elsif p_action='promote' then
    if v_actor.role<>'owner' then raise exception 'owner_only'; end if;
    select count(*) into v_officers from public.guild_members where guild_id=v_actor.guild_id and role='officer';
    if v_officers>=2 then raise exception 'officer_limit'; end if;
    if v_target.role<>'member' then raise exception 'invalid_role_change'; end if;
    update public.guild_members set role='officer' where guild_id=v_actor.guild_id and player_id=p_target_id;
  elsif p_action='demote' then
    if v_actor.role<>'owner' or v_target.role<>'officer' then raise exception 'invalid_role_change'; end if;
    update public.guild_members set role='member' where guild_id=v_actor.guild_id and player_id=p_target_id;
  elsif p_action='transfer' then
    if v_actor.role<>'owner' or v_target.role='owner' then raise exception 'owner_only'; end if;
    update public.guild_members set role='member' where guild_id=v_actor.guild_id and player_id=p_actor_id;
    update public.guild_members set role='owner' where guild_id=v_actor.guild_id and player_id=p_target_id;
    update public.guilds set owner_id=p_target_id,updated_at=now() where id=v_actor.guild_id;
  else raise exception 'invalid_member_action'; end if;
  insert into public.guild_activity(guild_id,actor_id,action,details)
  values(v_actor.guild_id,p_actor_id,'member_'||p_action,jsonb_build_object('targetId',p_target_id));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.guild_leave_v2(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_member public.guild_members%rowtype;
begin
  select * into v_member from public.guild_members where player_id=p_player_id for update;
  if not found then raise exception 'not_in_guild'; end if;
  if v_member.role='owner' then raise exception 'owner_cannot_leave'; end if;
  insert into public.guild_player_cooldowns(player_id,can_join_at) values(p_player_id,now()+interval '24 hours') on conflict(player_id) do update set can_join_at=excluded.can_join_at;
  delete from public.guild_competition_members where player_id=p_player_id and competition_id in(select id from public.guild_competitions where active_ends_at>now());
  delete from public.guild_members where guild_id=v_member.guild_id and player_id=p_player_id;
  insert into public.guild_activity(guild_id,actor_id,action) values(v_member.guild_id,p_player_id,'member_left');
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.guild_update_identity(
  p_player_id uuid,p_name text,p_tag text,p_description text,p_join_mode text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild public.guilds%rowtype;v_cost bigint:=0;v_now timestamptz:=now();
begin
  select * into v_guild from public.guilds where owner_id=p_player_id for update;
  if not found then raise exception 'owner_only'; end if;
  if char_length(trim(p_name)) not between 3 and 24 or trim(p_name)!~'^[A-Za-z0-9 _''-]+$' then raise exception 'invalid_name'; end if;
  if upper(trim(p_tag))!~'^[A-Z0-9]{2,5}$' then raise exception 'invalid_tag'; end if;
  if char_length(trim(p_description)) not between 1 and 200 then raise exception 'invalid_description'; end if;
  if p_join_mode not in('invite','request','open') then raise exception 'invalid_join_mode'; end if;
  if lower(trim(p_name))<>lower(v_guild.name) then if v_guild.name_changed_at>v_now-interval '7 days' then raise exception 'name_change_cooldown'; end if;v_cost:=v_cost+2500;end if;
  if upper(trim(p_tag))<>v_guild.tag then if v_guild.tag_changed_at>v_now-interval '7 days' then raise exception 'tag_change_cooldown'; end if;v_cost:=v_cost+1500;end if;
  if v_guild.guild_points<v_cost then raise exception 'insufficient_guild_points'; end if;
  update public.guilds set name=trim(p_name),tag=upper(trim(p_tag)),description=trim(p_description),join_mode=p_join_mode,guild_points=guild_points-v_cost,
    name_changed_at=case when lower(trim(p_name))<>lower(v_guild.name) then v_now else name_changed_at end,
    tag_changed_at=case when upper(trim(p_tag))<>v_guild.tag then v_now else tag_changed_at end,updated_at=v_now where id=v_guild.id;
  insert into public.guild_activity(guild_id,actor_id,action,details) values(v_guild.id,p_player_id,'identity_updated',jsonb_build_object('cost',v_cost));
  return jsonb_build_object('ok',true,'cost',v_cost);
exception when unique_violation then raise exception 'guild_identity_taken';
end $$;

create or replace function public.guild_disband_v2(p_player_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guild public.guilds%rowtype;
begin
 select * into v_guild from public.guilds where owner_id=p_player_id for update;
 if not found then raise exception 'owner_only';end if;
 if p_confirmation<>v_guild.name then raise exception 'confirmation_mismatch';end if;
 insert into public.guild_player_cooldowns(player_id,can_join_at) select player_id,now()+interval '24 hours' from public.guild_members where guild_id=v_guild.id on conflict(player_id) do update set can_join_at=excluded.can_join_at;
 delete from public.guilds where id=v_guild.id;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.finalize_guild_competitions()
returns integer language plpgsql security definer set search_path=public as $$
declare v_comp public.guild_competitions%rowtype; v_result record; v_member record; v_gp bigint; v_xp bigint; v_money numeric;
begin
  for v_comp in select * from public.guild_competitions where active_ends_at<=now() and finalized_at is null for update loop
    with ranked as (
      select guild_id,row_number() over(order by score desc, guild_id) rank from public.guild_competition_results where competition_id=v_comp.id and score>0
    ) update public.guild_competition_results r set rank=x.rank from ranked x where r.competition_id=v_comp.id and r.guild_id=x.guild_id;
    for v_result in select * from public.guild_competition_results where competition_id=v_comp.id and score>0 loop
      v_gp:=case when v_result.rank=1 then 10500 when v_result.rank=2 then 9000 when v_result.rank=3 then 7500 when v_result.rank<=5 then 5250 when v_result.rank<=10 then 3750 else 2250 end;
      v_xp:=500+case when v_result.rank=1 then 2500 when v_result.rank=2 then 2000 when v_result.rank=3 then 1500 when v_result.rank<=5 then 1000 when v_result.rank<=10 then 750 else 0 end;
      update public.guild_competition_results set reward_points=v_gp,finalized_at=now() where competition_id=v_comp.id and guild_id=v_result.guild_id;
      update public.guilds set guild_points=guild_points+v_gp,xp=xp+v_xp,updated_at=now() where id=v_result.guild_id;
      insert into public.guild_activity(guild_id,action,details) values(v_result.guild_id,'competition_finished',jsonb_build_object('rank',v_result.rank,'score',v_result.score,'points',v_gp));
      for v_member in select cm.player_id from public.guild_competition_members cm join public.guild_members gm on gm.player_id=cm.player_id and gm.guild_id=cm.guild_id where cm.competition_id=v_comp.id and cm.guild_id=v_result.guild_id and cm.score>0 loop
        v_money:=case when v_result.rank=1 then 2000000 when v_result.rank=2 then 1500000 when v_result.rank=3 then 1000000 when v_result.rank<=5 then 600000 when v_result.rank<=10 then 300000 else 100000 end;
        update public.players set money=money+v_money where id=v_member.player_id;
        if v_result.rank<=2 then perform public.expedition_grant_relic(v_member.player_id,'Ancient Relic',1); end if;
        if v_result.rank=1 then perform public.expedition_grant_relic(v_member.player_id,'Enchant Relic',4);perform public.expedition_grant_consumable(v_member.player_id,'mythic-potion',1);perform public.expedition_grant_consumable(v_member.player_id,'legendary-potion',3);
        elsif v_result.rank=2 then perform public.expedition_grant_relic(v_member.player_id,'Enchant Relic',3);perform public.expedition_grant_consumable(v_member.player_id,'legendary-potion',3);
        elsif v_result.rank=3 then perform public.expedition_grant_relic(v_member.player_id,'Enchant Relic',3);perform public.expedition_grant_consumable(v_member.player_id,'legendary-potion',2);
        elsif v_result.rank<=5 then perform public.expedition_grant_relic(v_member.player_id,'Enchant Relic',2);perform public.expedition_grant_consumable(v_member.player_id,'legendary-potion',1);perform public.expedition_grant_consumable(v_member.player_id,'lucky-potion-3',1);perform public.expedition_grant_consumable(v_member.player_id,'fortune-potion-3',1);
        elsif v_result.rank<=10 then perform public.expedition_grant_relic(v_member.player_id,'Enchant Relic',1);perform public.expedition_grant_consumable(v_member.player_id,'lucky-potion-3',1);perform public.expedition_grant_consumable(v_member.player_id,'fortune-potion-3',1);perform public.expedition_grant_consumable(v_member.player_id,'mass-potion-3',1);
        else perform public.expedition_grant_consumable(v_member.player_id,'lucky-potion-2',1);perform public.expedition_grant_consumable(v_member.player_id,'fortune-potion-2',1);perform public.expedition_grant_consumable(v_member.player_id,'mass-potion-3',1); end if;
      end loop;
    end loop;
    update public.guild_competitions set finalized_at=now() where id=v_comp.id;
  end loop;
  return 1;
end $$;

create or replace function public.ensure_guild_runtime(p_guild_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_now timestamptz:=now(); v_day timestamptz:=date_trunc('day',v_now at time zone 'utc') at time zone 'utc';
  v_anchor timestamptz:='2026-08-24 00:00:00+00'; v_cycle timestamptz; v_comp public.guild_competitions%rowtype;
  v_members int; v_categories text[]:=array['rolls','rarity','mutated','effective','heavy','value','participation'];
  v_daily_pool text[]:=array['rolls','rolls','rolls','rolls','rarity','rarity','rarity','rarity','mutated','mutated','mutated','heavy','heavy','heavy','value','value','value','effective','effective','participation'];
  v_weekly_pool text[]:=array['rolls','rolls','rolls','rarity','rarity','rarity','rarity','mutated','mutated','mutated','heavy','heavy','heavy','value','value','value','effective','effective','participation','participation'];
  v_d1 text; v_d2 text; v_w1 text; v_w2 text; v_w3 text; v_seed bigint;
begin
  perform public.finalize_guild_competitions();
  v_cycle:=v_anchor+(floor(extract(epoch from(v_now-v_anchor))/604800)*interval '7 days');
  v_seed:=abs(hashtextextended(v_cycle::text,0));
  insert into public.guild_competitions(cycle_start,active_starts_at,active_ends_at,cycle_ends_at,competition_type,rewards)
  values(v_cycle,v_cycle,v_cycle+interval '6 days',v_cycle+interval '7 days',
    (array['rarest','heavy','appraisal','rarity_rush'])[(v_seed%4)+1],
    '{"preview":true,"brackets":[1,2,3,5,10]}'::jsonb)
  on conflict(cycle_start) do nothing;
  select * into v_comp from public.guild_competitions where cycle_start=v_cycle;
  insert into public.guild_competition_results(competition_id,guild_id) values(v_comp.id,p_guild_id) on conflict do nothing;
  select greatest(3,count(*)) into v_members from public.guild_members where guild_id=p_guild_id and eligible_at<=v_now;

  v_seed:=abs(hashtextextended(p_guild_id::text||v_day::text,0));
  v_d1:=v_daily_pool[(v_seed%array_length(v_daily_pool,1))+1];
  v_d2:=v_daily_pool[((v_seed+7)%array_length(v_daily_pool,1))+1];
  while v_d2=v_d1 loop v_seed:=v_seed+1;v_d2:=v_daily_pool[((v_seed+7)%array_length(v_daily_pool,1))+1];end loop;
  insert into public.guild_missions(guild_id,cadence,difficulty,objective,threshold,target,reward_xp,reward_points,starts_at,ends_at)
  values
   (p_guild_id,'daily','standard',v_d1,
    case v_d1 when 'rarity' then 1000 when 'effective' then 25000 when 'heavy' then 2 else 0 end,
    case v_d1 when 'rolls' then 75*v_members when 'rarity' then 5*v_members when 'mutated' then v_members when 'effective' then 1 when 'heavy' then 3*v_members when 'value' then 50000*v_members else ceil(v_members*.5) end,
    250,300,v_day,v_day+interval '1 day'),
   (p_guild_id,'daily','advanced',v_d2,
    case v_d2 when 'rarity' then 10000 when 'effective' then 100000 when 'heavy' then 3 when 'participation' then 75 else 0 end,
    case v_d2 when 'rolls' then 200*v_members when 'rarity' then 2*v_members when 'mutated' then 2*v_members when 'effective' then 1 when 'heavy' then 3*v_members when 'value' then 200000*v_members else ceil(v_members*.75) end,
    500,600,v_day,v_day+interval '1 day')
  on conflict do nothing;

  v_seed:=abs(hashtextextended(p_guild_id::text||v_cycle::text,0));
  v_w1:=v_weekly_pool[(v_seed%20)+1]; v_w2:=v_weekly_pool[((v_seed+7)%20)+1]; v_w3:=v_weekly_pool[((v_seed+13)%20)+1];
  while v_w2=v_w1 loop v_seed:=v_seed+1;v_w2:=v_weekly_pool[((v_seed+7)%20)+1];end loop;
  while v_w3 in (v_w1,v_w2) loop v_seed:=v_seed+1;v_w3:=v_weekly_pool[((v_seed+13)%20)+1];end loop;
  insert into public.guild_missions(guild_id,cadence,difficulty,objective,threshold,target,reward_xp,reward_points,starts_at,ends_at)
  values
   (p_guild_id,'weekly','standard',v_w1,case v_w1 when 'rarity' then 1000 when 'effective' then 100000 when 'heavy' then 2 when 'participation' then 150 else 0 end,case v_w1 when 'rolls' then 400*v_members when 'rarity' then 20*v_members when 'mutated' then 5*v_members when 'effective' then ceil(v_members/3.0) when 'heavy' then 20*v_members when 'value' then 300000*v_members else ceil(v_members*.6) end,1000,1500,v_cycle,v_cycle+interval '7 days'),
   (p_guild_id,'weekly','advanced',v_w2,case v_w2 when 'rarity' then 10000 when 'effective' then 500000 when 'heavy' then 3 when 'participation' then 400 else 0 end,case v_w2 when 'rolls' then 1000*v_members when 'rarity' then 10*v_members when 'mutated' then 10*v_members when 'effective' then ceil(v_members/3.0) when 'heavy' then 20*v_members when 'value' then 1000000*v_members else ceil(v_members*.75) end,2000,3000,v_cycle,v_cycle+interval '7 days'),
   (p_guild_id,'weekly','elite',v_w3,case v_w3 when 'rarity' then 100000 when 'effective' then 1000000 when 'heavy' then 5 when 'participation' then 750 else 0 end,case v_w3 when 'rolls' then 2000*v_members when 'rarity' then v_members when 'mutated' then 20*v_members when 'effective' then ceil(v_members/5.0) when 'heavy' then 10*v_members when 'value' then 2000000*v_members else v_members end,4000,6000,v_cycle,v_cycle+interval '7 days')
  on conflict do nothing;
  return jsonb_build_object('competitionId',v_comp.id,'cycleStart',v_cycle);
end $$;

create or replace function public.record_guild_roll_activity(
  p_player_id uuid, p_rarity numeric, p_rarity_tier text, p_effective_rarity numeric,
  p_weight_multiplier numeric, p_final_weight numeric, p_value numeric,
  p_mutated boolean, p_is_relic boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_member public.guild_members%rowtype; v_award int; v_total int; v_guild public.guilds%rowtype; v_mission public.guild_missions%rowtype; v_inc numeric; v_before numeric; v_person_before numeric; v_comp public.guild_competitions%rowtype; v_score numeric; v_values numeric[]; v_claim record; v_consumable text;
begin
  select * into v_member from public.guild_members where player_id=p_player_id;
  if not found then return jsonb_build_object('guild',false); end if;
  insert into public.guild_member_daily_xp(guild_id,player_id,xp_date,roll_xp)
  values(v_member.guild_id,p_player_id,(now() at time zone 'utc')::date,1)
  on conflict(guild_id,player_id,xp_date) do update
    set roll_xp=public.guild_member_daily_xp.roll_xp+1
    where public.guild_member_daily_xp.roll_xp<750
  returning roll_xp into v_total;
  v_award:=case when v_total<=750 then 1 else 0 end;
  if v_award>0 then
    update public.guilds set xp=xp+1,updated_at=now() where id=v_member.guild_id returning * into v_guild;
    update public.guild_members set lifetime_contribution=lifetime_contribution+1,
      weekly_contribution=weekly_contribution+1 where guild_id=v_member.guild_id and player_id=p_player_id;
  else select * into v_guild from public.guilds where id=v_member.guild_id; end if;
  perform public.ensure_guild_runtime(v_member.guild_id);

  for v_mission in select * from public.guild_missions where guild_id=v_member.guild_id and starts_at<=now() and ends_at>now() and completed_at is null for update loop
    v_inc:=case v_mission.objective
      when 'rolls' then 1 when 'rarity' then case when not p_is_relic and p_rarity>=v_mission.threshold then 1 else 0 end
      when 'mutated' then case when p_mutated then 1 else 0 end
      when 'effective' then case when not p_is_relic and p_effective_rarity>=v_mission.threshold then 1 else 0 end
      when 'heavy' then case when not p_is_relic and p_weight_multiplier>=v_mission.threshold then 1 else 0 end
      when 'value' then case when not p_is_relic then greatest(0,p_value) else 0 end else 0 end;
    select contribution into v_person_before from public.guild_mission_contributions where mission_id=v_mission.id and player_id=p_player_id;
    v_person_before:=coalesce(v_person_before,0);
    if v_mission.objective='participation' then v_inc:=case when v_person_before<v_mission.threshold and v_person_before+1>=v_mission.threshold then 1 else 0 end; end if;
    insert into public.guild_mission_contributions(mission_id,player_id,contribution) values(v_mission.id,p_player_id,case when v_mission.objective='participation' then 1 else v_inc end)
    on conflict(mission_id,player_id) do update set contribution=public.guild_mission_contributions.contribution+excluded.contribution;
    if v_inc>0 then
      v_before:=v_mission.progress; update public.guild_missions set progress=least(target,progress+v_inc) where id=v_mission.id;
      if v_before<v_mission.target and v_before+v_inc>=v_mission.target then
        update public.guild_missions set completed_at=now() where id=v_mission.id and completed_at is null;
        update public.guilds set xp=xp+v_mission.reward_xp,guild_points=guild_points+v_mission.reward_points where id=v_member.guild_id;
        insert into public.guild_activity(guild_id,action,details) values(v_member.guild_id,'mission_completed',jsonb_build_object('missionId',v_mission.id,'points',v_mission.reward_points));
        for v_claim in select * from public.guild_mission_contributions where mission_id=v_mission.id and reward_claimed_at is null and contribution>=case when v_mission.objective='effective' then 1 when v_mission.objective='participation' then v_mission.threshold else v_mission.target*.05 end loop
          if v_mission.cadence='daily' and v_mission.difficulty='standard' then
            v_consumable:=(array['lucky-potion-1','speed-potion-1','fortune-potion-1','mass-potion-1'])[floor(random()*4)::int+1];perform public.expedition_grant_consumable(v_claim.player_id,v_consumable,1);
          elsif v_mission.cadence='daily' then
            v_consumable:=(array['lucky-potion-2','speed-potion-2','fortune-potion-2','mass-potion-2'])[floor(random()*4)::int+1];perform public.expedition_grant_consumable(v_claim.player_id,v_consumable,1);
          elsif v_mission.difficulty='standard' then
            v_consumable:=(array['lucky-potion-2','speed-potion-2','fortune-potion-2','mass-potion-2'])[floor(random()*4)::int+1];perform public.expedition_grant_consumable(v_claim.player_id,v_consumable,2);
          elsif v_mission.difficulty='advanced' then
            v_consumable:=(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])[floor(random()*4)::int+1];perform public.expedition_grant_consumable(v_claim.player_id,v_consumable,2);
          else perform public.expedition_grant_consumable(v_claim.player_id,'legendary-potion',1); end if;
          update public.guild_mission_contributions set reward_claimed_at=now() where mission_id=v_mission.id and player_id=v_claim.player_id;
        end loop;
      end if;
    end if;
  end loop;

  select * into v_comp from public.guild_competitions where active_starts_at<=now() and active_ends_at>now() order by cycle_start desc limit 1;
  if found and v_member.eligible_at<=now() then
    select score,best_values into v_score,v_values from public.guild_competition_members where competition_id=v_comp.id and player_id=p_player_id;
    v_score:=coalesce(v_score,0);v_values:=coalesce(v_values,'{}');
    if v_comp.competition_type='rarest' and not p_is_relic then v_score:=greatest(v_score,p_effective_rarity);
    elsif v_comp.competition_type='heavy' and not p_is_relic then v_score:=greatest(v_score,p_final_weight);
    elsif v_comp.competition_type='appraisal' and not p_is_relic then select coalesce(array_agg(x order by x desc),'{}'),coalesce(sum(x),0) into v_values,v_score from (select x from unnest(array_append(v_values,p_value)) x order by x desc limit 5)s;
    elsif v_comp.competition_type='rarity_rush' and not p_is_relic then v_score:=least(5000,v_score+case when p_rarity>=10000000 then 500 when p_rarity>=1000000 then 150 when p_rarity>=100000 then 30 when p_rarity>=10000 then 5 when p_rarity>=1000 then 1 else 0 end); end if;
    insert into public.guild_competition_members(competition_id,guild_id,player_id,score,best_values,reached_at) values(v_comp.id,v_member.guild_id,p_player_id,v_score,v_values,now())
    on conflict(competition_id,player_id) do update set score=excluded.score,best_values=excluded.best_values,reached_at=case when excluded.score>public.guild_competition_members.score then now() else public.guild_competition_members.reached_at end;
    update public.guild_competition_results set score=(select coalesce(sum(score),0) from public.guild_competition_members where competition_id=v_comp.id and guild_id=v_member.guild_id) where competition_id=v_comp.id and guild_id=v_member.guild_id;
  end if;
  return jsonb_build_object('guild',true,'guildId',v_member.guild_id,'xp',v_guild.xp,
    'level',public.guild_level(v_guild.xp),'luckMultiplier',1+v_guild.luck_tier/100.0,
    'speedMultiplier',1+v_guild.speed_tier/100.0,'weightLuckMultiplier',1+v_guild.weight_luck_tier/100.0);
end $$;

-- The old function must no longer mutate spendable progression. It remains as
-- a compatibility shim while all deployed roll workers move to the new RPC.
create or replace function public.record_guild_roll_points(p_player_id uuid,p_points bigint default 1)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('deprecated',true,'guild',exists(select 1 from public.guild_members where player_id=p_player_id));
$$;

revoke all on function public.create_guild_v2(uuid,text,text,text,text,text,text,text,text) from public;
revoke all on function public.guild_purchase_upgrade(uuid,text) from public;
revoke all on function public.guild_respond_invite_v2(uuid,uuid,boolean) from public;
revoke all on function public.guild_manage_member(uuid,uuid,text) from public;
revoke all on function public.guild_leave_v2(uuid) from public;
revoke all on function public.guild_update_identity(uuid,text,text,text,text) from public;
revoke all on function public.guild_disband_v2(uuid,text) from public;
revoke all on function public.finalize_guild_competitions() from public;
revoke all on function public.ensure_guild_runtime(uuid) from public;
revoke all on function public.record_guild_roll_activity(uuid,numeric,text,numeric,numeric,numeric,numeric,boolean,boolean) from public;
grant execute on function public.create_guild_v2(uuid,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.guild_purchase_upgrade(uuid,text) to service_role;
grant execute on function public.guild_respond_invite_v2(uuid,uuid,boolean) to service_role;
grant execute on function public.guild_manage_member(uuid,uuid,text) to service_role;
grant execute on function public.guild_leave_v2(uuid) to service_role;
grant execute on function public.guild_update_identity(uuid,text,text,text,text) to service_role;
grant execute on function public.guild_disband_v2(uuid,text) to service_role;
grant execute on function public.finalize_guild_competitions() to service_role;
grant execute on function public.ensure_guild_runtime(uuid) to service_role;
grant execute on function public.record_guild_roll_activity(uuid,numeric,text,numeric,numeric,numeric,numeric,boolean,boolean) to service_role;

commit;
