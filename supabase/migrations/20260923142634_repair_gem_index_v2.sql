-- Gem Index v2: one canonical mutation-key format, repaired history, and an
-- intentionally public catalog that includes enabled historical gems.

create or replace function public.canonical_gem_mutation_ids(p_ids text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(normalized.id order by normalized.id), '{}'::text[])
  from (
    select distinct lower(btrim(value)) as id
    from unnest(coalesce(p_ids, '{}'::text[])) as input(value)
    where btrim(value) <> ''
  ) as normalized;
$$;

create or replace function public.canonical_gem_mutation_key(p_ids text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when cardinality(ids) = 0 then 'none'
    else array_to_string(ids, '+')
  end
  from (select public.canonical_gem_mutation_ids(p_ids) as ids) normalized;
$$;

revoke all on function public.canonical_gem_mutation_ids(text[]) from public, anon, authenticated;
revoke all on function public.canonical_gem_mutation_key(text[]) from public, anon, authenticated;
grant execute on function public.canonical_gem_mutation_ids(text[]) to service_role;
grant execute on function public.canonical_gem_mutation_key(text[]) to service_role;

-- Repair legacy rows in place. If two historical spellings reduce to the same
-- key, merge their counters and discovery timestamps before deleting the extra.
do $$
declare
  source_row public.player_gem_mutation_combinations%rowtype;
  target_row public.player_gem_mutation_combinations%rowtype;
  canonical_ids text[];
  canonical_key text;
begin
  for source_row in
    select *
    from public.player_gem_mutation_combinations
    where combination_key is distinct from public.canonical_gem_mutation_key(mutation_ids)
       or mutation_ids is distinct from public.canonical_gem_mutation_ids(mutation_ids)
    order by id
  loop
    if not exists (
      select 1 from public.player_gem_mutation_combinations where id = source_row.id
    ) then
      continue;
    end if;

    canonical_ids := public.canonical_gem_mutation_ids(source_row.mutation_ids);
    canonical_key := public.canonical_gem_mutation_key(canonical_ids);

    select * into target_row
    from public.player_gem_mutation_combinations
    where player_id = source_row.player_id
      and gem_name = source_row.gem_name
      and combination_key = canonical_key
      and id <> source_row.id
    order by id
    limit 1;

    if found then
      update public.player_gem_mutation_combinations
      set mutation_ids = canonical_ids,
          mutation_multipliers = coalesce(target_row.mutation_multipliers, '{}'::jsonb)
            || coalesce(source_row.mutation_multipliers, '{}'::jsonb),
          total_found = target_row.total_found + source_row.total_found,
          highest_value = greatest(target_row.highest_value, source_row.highest_value),
          first_discovered_at = least(target_row.first_discovered_at, source_row.first_discovered_at),
          last_discovered_at = greatest(target_row.last_discovered_at, source_row.last_discovered_at)
      where id = target_row.id;

      delete from public.player_gem_mutation_combinations where id = source_row.id;
    elsif source_row.combination_key is distinct from canonical_key
       or source_row.mutation_ids is distinct from canonical_ids then
      update public.player_gem_mutation_combinations
      set combination_key = canonical_key,
          mutation_ids = canonical_ids
      where id = source_row.id;
    end if;
  end loop;
end;
$$;

-- The key supplied by callers is retained in the signature for compatibility,
-- but the database derives its own key from mutation_ids.
create or replace function public.record_gem_mutation_combination(
  p_player_id uuid,
  p_gem_name text,
  p_combination_key text,
  p_mutation_ids text[] default '{}'::text[],
  p_mutation_multipliers jsonb default '{}'::jsonb,
  p_value numeric default 0
)
returns public.player_gem_mutation_combinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[] := public.canonical_gem_mutation_ids(p_mutation_ids);
  v_key text := public.canonical_gem_mutation_key(p_mutation_ids);
  v_row public.player_gem_mutation_combinations;
begin
  if auth.uid() is distinct from p_player_id
     and coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1 from public.code_improvement where user_id = auth.uid()
     ) then
    raise exception 'not_authorized';
  end if;

  insert into public.player_gem_mutation_combinations (
    player_id, gem_name, combination_key, mutation_ids, mutation_multipliers,
    total_found, highest_value, first_discovered_at, last_discovered_at
  ) values (
    p_player_id, p_gem_name, v_key, v_ids,
    coalesce(p_mutation_multipliers, '{}'::jsonb),
    1, coalesce(p_value, 0), now(), now()
  )
  on conflict (player_id, gem_name, combination_key) do update set
    mutation_ids = excluded.mutation_ids,
    mutation_multipliers = public.player_gem_mutation_combinations.mutation_multipliers
      || excluded.mutation_multipliers,
    total_found = public.player_gem_mutation_combinations.total_found + 1,
    highest_value = greatest(
      public.player_gem_mutation_combinations.highest_value,
      excluded.highest_value
    ),
    last_discovered_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric)
  from public, anon, authenticated;
grant execute on function public.record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric)
  to service_role;

create or replace function public.get_public_gem_index_catalog()
returns table (
  id uuid,
  title text,
  name text,
  rarity double precision,
  base_weight numeric,
  value_per_gram numeric,
  description text,
  metadata jsonb,
  hide_rarity_until_discovered boolean,
  affected_by_luck boolean,
  enabled boolean,
  sort_order integer,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz,
  availability_mode text,
  daily_start_time time,
  daily_end_time time,
  daily_time_windows jsonb,
  availability_timezone text,
  required_event_key text,
  special_gem boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gem.id, gem.title, gem.name, gem.rarity, gem.base_weight,
    gem.value_per_gram, gem.description, gem.metadata,
    gem.hide_rarity_until_discovered, gem.affected_by_luck, gem.enabled,
    gem.sort_order, gem.starts_at, gem.ends_at, gem.updated_at,
    gem.availability_mode, gem.daily_start_time, gem.daily_end_time,
    gem.daily_time_windows, gem.availability_timezone,
    gem.required_event_key, gem.special_gem
  from public.private_feature_gems as gem
  where gem.enabled = true
  order by gem.sort_order, gem.rarity desc, gem.name;
$$;

revoke all on function public.get_public_gem_index_catalog() from public;
grant execute on function public.get_public_gem_index_catalog() to anon, authenticated, service_role;
