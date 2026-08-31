-- Guild Shop: server-authoritative, immediately activated 30-minute buffs.
create table public.guild_shop_buffs (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  potion_id text not null check (potion_id in (
    'lucky_brew','haste_brew','heavy_brew','prosperity_brew',
    'greater_lucky','greater_haste','legendary','mythic'
  )),
  activated_by uuid not null references public.players(id) on delete restrict,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  mythic_surge_progress integer not null default 0
    check (mythic_surge_progress between 0 and 99),
  primary key (guild_id, potion_id),
  check (expires_at > activated_at),
  check (potion_id = 'mythic' or mythic_surge_progress = 0)
);

create index guild_shop_buffs_active_idx
  on public.guild_shop_buffs (guild_id, expires_at);

alter table public.guild_shop_buffs enable row level security;
revoke all on table public.guild_shop_buffs from public, anon, authenticated;
grant select, insert, update, delete on table public.guild_shop_buffs to service_role;

create or replace function public.guild_shop_catalog(p_potion_id text)
returns table (
  potion_id text,
  display_name text,
  base_price bigint,
  unlock_level integer,
  luck_multiplier numeric,
  roll_speed_multiplier numeric,
  weight_luck_multiplier numeric,
  weight_multiplier numeric
)
language sql immutable
set search_path = public
as $$
  select * from (values
    ('lucky_brew',      'Lucky Brew',       750::bigint, 1, 1.05::numeric, 1::numeric,    1::numeric,    1::numeric),
    ('haste_brew',      'Haste Brew',       750::bigint, 1, 1::numeric,    1.05::numeric, 1::numeric,    1::numeric),
    ('heavy_brew',      'Heavy Brew',      1000::bigint, 1, 1::numeric,    1::numeric,    1.10::numeric, 1::numeric),
    ('prosperity_brew', 'Prosperity Brew', 1250::bigint, 3, 1::numeric,    1::numeric,    1::numeric,    1.10::numeric),
    ('greater_lucky',   'Greater Lucky',   1750::bigint, 5, 1.10::numeric, 1::numeric,    1::numeric,    1::numeric),
    ('greater_haste',   'Greater Haste',   1750::bigint, 5, 1::numeric,    1.10::numeric, 1::numeric,    1::numeric),
    ('legendary',       'Legendary',        4000::bigint, 7, 1.10::numeric, 1.10::numeric, 1.15::numeric, 1.10::numeric),
    ('mythic',          'Mythic',           8000::bigint,10, 1.15::numeric, 1.15::numeric, 1.20::numeric, 1.15::numeric)
  ) as catalog(potion_id,display_name,base_price,unlock_level,luck_multiplier,roll_speed_multiplier,weight_luck_multiplier,weight_multiplier)
  where catalog.potion_id = p_potion_id;
$$;

create or replace function public.guild_shop_price(p_base_price bigint, p_member_count integer)
returns bigint
language sql immutable
as $$
  select (round((p_base_price * (1 + 0.25 * (greatest(1, p_member_count) - 1))) / 50.0) * 50)::bigint;
$$;

create or replace function public.guild_activate_shop_potion(p_player_id uuid, p_potion_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.guild_members%rowtype;
  v_guild public.guilds%rowtype;
  v_catalog record;
  v_member_count integer;
  v_price bigint;
  v_expires_at timestamptz := now() + interval '30 minutes';
begin
  select * into v_member from public.guild_members where player_id = p_player_id;
  if not found or v_member.role not in ('owner','officer') then
    raise exception 'guild_management_only';
  end if;

  select * into v_guild from public.guilds where id = v_member.guild_id for update;
  select * into v_catalog from public.guild_shop_catalog(p_potion_id);
  if not found then raise exception 'unknown_guild_potion'; end if;
  if public.guild_level(v_guild.xp) < v_catalog.unlock_level then
    raise exception 'guild_level_required';
  end if;

  select count(*)::integer into v_member_count
  from public.guild_members where guild_id = v_guild.id;
  v_price := public.guild_shop_price(v_catalog.base_price, v_member_count);
  if v_guild.guild_points < v_price then raise exception 'insufficient_guild_points'; end if;

  update public.guilds
  set guild_points = guild_points - v_price, updated_at = now()
  where id = v_guild.id;

  if p_potion_id in ('legendary','mythic') then
    delete from public.guild_shop_buffs
    where guild_id = v_guild.id and potion_id in ('legendary','mythic');
  end if;

  insert into public.guild_shop_buffs (
    guild_id,potion_id,activated_by,activated_at,expires_at,mythic_surge_progress
  ) values (
    v_guild.id,p_potion_id,p_player_id,now(),v_expires_at,0
  )
  on conflict (guild_id,potion_id) do update set
    activated_by = excluded.activated_by,
    activated_at = excluded.activated_at,
    expires_at = excluded.expires_at,
    mythic_surge_progress = 0;

  insert into public.guild_activity(guild_id,actor_id,action,details)
  values (v_guild.id,p_player_id,'shop_potion_activated',jsonb_build_object(
    'potionId',p_potion_id,'name',v_catalog.display_name,'price',v_price,'expiresAt',v_expires_at
  ));

  return jsonb_build_object(
    'ok',true,'potionId',p_potion_id,'price',v_price,
    'guildPoints',v_guild.guild_points-v_price,'expiresAt',v_expires_at
  );
end;
$$;

-- Called only after claim_server_roll accepts a genuine roll. Row locking makes
-- the shared 100-roll counter exact even when several members roll together.
create or replace function public.claim_guild_mythic_surge(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_buff public.guild_shop_buffs%rowtype;
  v_next integer;
  v_boosted boolean := false;
begin
  select guild_id into v_guild_id from public.guild_members where player_id = p_player_id;
  if not found then return jsonb_build_object('active',false,'boosted',false,'progress',0); end if;

  select * into v_buff from public.guild_shop_buffs
  where guild_id = v_guild_id and potion_id = 'mythic' and expires_at > now()
  for update;
  if not found then return jsonb_build_object('active',false,'boosted',false,'progress',0); end if;

  v_next := v_buff.mythic_surge_progress + 1;
  if v_next >= 100 then v_next := 0; v_boosted := true; end if;
  update public.guild_shop_buffs set mythic_surge_progress = v_next
  where guild_id = v_guild_id and potion_id = 'mythic';

  return jsonb_build_object('active',true,'boosted',v_boosted,'progress',v_next);
end;
$$;

revoke all on function public.guild_shop_catalog(text) from public, anon, authenticated;
revoke all on function public.guild_shop_price(bigint,integer) from public, anon, authenticated;
revoke all on function public.guild_activate_shop_potion(uuid,text) from public, anon, authenticated;
revoke all on function public.claim_guild_mythic_surge(uuid) from public, anon, authenticated;
grant execute on function public.guild_shop_catalog(text) to service_role;
grant execute on function public.guild_shop_price(bigint,integer) to service_role;
grant execute on function public.guild_activate_shop_potion(uuid,text) to service_role;
grant execute on function public.claim_guild_mythic_surge(uuid) to service_role;

-- Extend the authenticated stats RPC so the UI reports the same multiplicative
-- guild-shop effects the roll worker applies.
drop function if exists public.get_current_roll_stat_modifiers();
create function public.get_current_roll_stat_modifiers()
returns table (
  guild_luck_multiplier numeric,
  guild_roll_speed_multiplier numeric,
  guild_weight_luck_multiplier numeric,
  guild_weight_multiplier numeric,
  artifact_luck_bonus numeric,
  artifact_roll_speed_bonus numeric,
  artifact_weight_luck_bonus numeric,
  artifact_weight_multiplier_bonus numeric
)
language sql stable security definer set search_path = public
as $$
  with own_guild as (
    select membership.guild_id,membership.eligible_at,guild.luck_tier,guild.speed_tier,guild.weight_luck_tier
    from public.guild_members membership join public.guilds guild on guild.id=membership.guild_id
    where membership.player_id=auth.uid() limit 1
  ), shop as (
    select
      coalesce(exp(sum(ln(c.luck_multiplier))),1) shop_luck,
      coalesce(exp(sum(ln(c.roll_speed_multiplier))),1) shop_speed,
      coalesce(exp(sum(ln(c.weight_luck_multiplier))),1) shop_weight_luck,
      coalesce(exp(sum(ln(c.weight_multiplier))),1) shop_weight
    from own_guild g
    join public.guild_shop_buffs b on b.guild_id=g.guild_id and b.expires_at>now()
    cross join lateral public.guild_shop_catalog(b.potion_id) c
  ), own_artifacts as (
    select artifact_key from public.museum_artifact_registrations where player_id=auth.uid()
  )
  select
    coalesce((select (case when eligible_at<=now() then 1+least(10,greatest(0,coalesce(luck_tier,0)))/100.0 else 1 end) from own_guild),1)*(select shop_luck from shop),
    coalesce((select (case when eligible_at<=now() then 1+least(10,greatest(0,coalesce(speed_tier,0)))/100.0 else 1 end) from own_guild),1)*(select shop_speed from shop),
    coalesce((select (case when eligible_at<=now() then 1+least(10,greatest(0,coalesce(weight_luck_tier,0)))/100.0 else 1 end) from own_guild),1)*(select shop_weight_luck from shop),
    (select shop_weight from shop),
    case when exists(select 1 from own_artifacts where artifact_key='vein-prism') then 0.05 else 0 end,
    (case when exists(select 1 from own_artifacts where artifact_key='miners-lamp') then 0.02 else 0 end)+(case when exists(select 1 from own_artifacts where artifact_key='clockwork-drill') then 0.05 else 0 end),
    case when exists(select 1 from own_artifacts where artifact_key='surveyors-compass') then 0.03 else 0 end,
    case when exists(select 1 from own_artifacts where artifact_key='silver-pick') then 0.05 else 0 end;
$$;
revoke all on function public.get_current_roll_stat_modifiers() from public, anon;
grant execute on function public.get_current_roll_stat_modifiers() to authenticated, service_role;
