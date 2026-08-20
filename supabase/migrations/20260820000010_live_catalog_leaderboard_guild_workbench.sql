-- =========================================================
-- 20260820000010 Live admin catalog + guild/workbench repairs
-- =========================================================

-- Older deployments created private_feature_gems without these presentation
-- columns. CREATE TABLE IF NOT EXISTS does not add them later, which caused
-- the Gem Index SELECT to fail and hide every admin-created gem.
alter table if exists public.private_feature_gems
  add column if not exists description text not null default '',
  add column if not exists hide_rarity_until_discovered boolean not null default false;

-- Keep public catalog reads available to the Gem Index.
alter table if exists public.private_feature_gems enable row level security;
drop policy if exists private_feature_gems_enabled_catalog_read on public.private_feature_gems;
create policy private_feature_gems_enabled_catalog_read
  on public.private_feature_gems
  for select
  to anon, authenticated
  using (
    enabled = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );
grant select on public.private_feature_gems to anon, authenticated;

-- Guild creation is called from an Edge Function with the service-role
-- client. auth.uid() is therefore NULL inside the RPC. Pass the already
-- authenticated player id explicitly so the transaction can still be
-- atomic and cannot create an ownerless guild.
create or replace function public.create_guild_for_player(
  p_name text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(left(coalesce(p_name,''),50));
  v_guild public.guilds%rowtype;
begin
  if p_player_id is null then
    raise exception 'not_authenticated';
  end if;

  if length(v_name) < 2 then
    raise exception 'invalid_name';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;

  if exists (select 1 from public.guild_members where player_id = p_player_id) then
    raise exception 'already_in_guild';
  end if;

  insert into public.guilds(name, owner_id)
  values(v_name, p_player_id)
  returning * into v_guild;

  insert into public.guild_members(guild_id, player_id, role)
  values(v_guild.id, p_player_id, 'owner');

  return jsonb_build_object('guild', to_jsonb(v_guild));
exception
  when unique_violation then
    raise exception 'guild_name_taken';
end;
$$;

revoke all on function public.create_guild_for_player(text, uuid) from public;
grant execute on function public.create_guild_for_player(text, uuid) to service_role;

-- Dynamic mutation chance product used by all-time/current best-roll boards.
-- This makes admin-created mutations behave exactly like built-in mutations.
create or replace function public.get_mutation_chance_product(p_mutation_ids text[])
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exp(sum(ln(greatest(m.chance::numeric, 0.000000000000000001)) * -1)),
    1::numeric
  )
  from unnest(coalesce(p_mutation_ids, '{}'::text[])) ids(id)
  join public.game_mutations m on m.id = ids.id
  where m.chance > 0;
$$;

revoke all on function public.get_mutation_chance_product(text[]) from public;
grant execute on function public.get_mutation_chance_product(text[]) to anon, authenticated, service_role;

-- Rebuild Best Roll using the LIVE game_mutations table rather than the five
-- historical hardcoded mutation ids.
create or replace function public.get_best_roll_leaderboard(
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  base_rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  mutation_chance_product numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with scored as (
    select
      h.id,
      h.username,
      h.gem_name,
      coalesce(h.rarity, 0)::numeric as base_rarity,
      h.value,
      h.final_weight,
      h.mutation_id,
      coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
      coalesce(h.mutation_multiplier, 1)::numeric as mutation_multiplier,
      h.created_at,
      public.get_mutation_chance_product(h.mutation_ids) as mutation_chance_product
    from public.best_roll_history h
    where h.username is not null
  ),
  ranked as (
    select
      scored.*,
      (
        base_rarity * mutation_chance_product
      )::numeric as effective_rarity
    from scored
  )
  select
    row_number() over (
      order by effective_rarity desc, base_rarity desc, created_at desc, id desc
    ) as rank,
    username,
    gem_name,
    effective_rarity as rarity,
    base_rarity,
    value,
    final_weight,
    mutation_id,
    mutation_ids,
    mutation_multiplier,
    1::numeric as mutation_chance_multiplier,
    mutation_chance_product,
    created_at
  from ranked
  order by effective_rarity desc, base_rarity desc, created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;

-- Keep the current-inventory board on the exact same live formula.
create or replace function public.get_rarest_gem_leaderboard(
  p_limit integer default 25
)
returns table (
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  base_rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  mutation_chance_product numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with inventory as (
    select
      g.id,
      g.player_id,
      p.username,
      g.gem_name,
      coalesce(g.rarity, 0)::numeric as base_rarity,
      coalesce(g.value, 0)::numeric as value,
      coalesce(g.final_weight, 0)::numeric as final_weight,
      g.mutation_id,
      coalesce(g.mutation_ids, '{}'::text[]) as mutation_ids,
      coalesce(g.mutation_multiplier, 1)::numeric as mutation_multiplier,
      g.created_at
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where p.username is not null
  ),
  scored as (
    select
      i.*,
      (
        i.base_rarity * public.get_mutation_chance_product(i.mutation_ids)
      )::numeric as effective_rarity,
      public.get_mutation_chance_product(i.mutation_ids) as mutation_chance_product
    from inventory i
  ),
  per_player as (
    select
      s.*,
      row_number() over (
        partition by s.player_id
        order by s.effective_rarity desc, s.base_rarity desc, s.created_at desc, s.id desc
      ) as player_rank
    from scored s
  )
  select
    row_number() over (
      order by effective_rarity desc, base_rarity desc, created_at desc, id desc
    ) as rank,
    username,
    gem_name,
    effective_rarity as rarity,
    base_rarity,
    value,
    final_weight,
    mutation_id,
    mutation_ids,
    mutation_multiplier,
    1::numeric as mutation_chance_multiplier,
    mutation_chance_product,
    created_at
  from per_player
  where player_rank = 1
  order by effective_rarity desc, base_rarity desc, created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.get_rarest_gem_leaderboard(integer) from public;
grant execute on function public.get_rarest_gem_leaderboard(integer) to anon, authenticated;

-- Workbench runtime tables are service-role only. Keep the compatibility
-- grants explicit for deployments that already have the tables.
grant all on public.workbench_sessions, public.workbench_items to service_role;
