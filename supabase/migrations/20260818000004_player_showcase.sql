-- Profile / leaderboard showcase: pin up to 3 gems you've found next to
-- your name. Stored as a jsonb snapshot on players.showcase so a pin
-- survives selling the gem. Only settable via set_showcase (which
-- verifies ownership), so nobody can fake a gem they never found.

alter table public.players
  add column if not exists showcase jsonb not null default '[]'::jsonb;

set local check_function_bodies = off;

create or replace function public.players_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.money := 0;
    new.lifetime_earnings := 0;
    new.total_rolls := 0;
    new.inventory_capacity := 15;
    new.next_roll_at := null;
    new.rarest_gem_name := null;
    new.rarest_gem_rarity := null;
    new.crafting_migrated := false;
    new.stats_migrated := false;
    new.legacy_save_migrated := false;
    new.mutation_luck := 1;
    new.showcase := '[]'::jsonb;
    return new;
  end if;

  if new.id                    is distinct from old.id
     or new.money              is distinct from old.money
     or new.lifetime_earnings  is distinct from old.lifetime_earnings
     or new.total_rolls        is distinct from old.total_rolls
     or new.inventory_capacity is distinct from old.inventory_capacity
     or new.next_roll_at       is distinct from old.next_roll_at
     or new.rarest_gem_name    is distinct from old.rarest_gem_name
     or new.rarest_gem_rarity  is distinct from old.rarest_gem_rarity
     or new.crafting_migrated  is distinct from old.crafting_migrated
     or new.stats_migrated     is distinct from old.stats_migrated
     or new.legacy_save_migrated is distinct from old.legacy_save_migrated
     or new.mutation_luck      is distinct from old.mutation_luck
     or new.showcase           is distinct from old.showcase
     or new.created_at         is distinct from old.created_at
  then
    raise exception 'forbidden_column_update';
  end if;

  return new;
end; $$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update on public.players
  for each row execute function public.players_guard();

-- Pin up to 3 OWNED gems (snapshotted, order preserved). inventory_gems.id
-- is a bigint, hence bigint[].
create or replace function public.set_showcase(p_specimen_ids bigint[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_showcase jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_specimen_ids is null then p_specimen_ids := '{}'::bigint[]; end if;
  if coalesce(array_length(p_specimen_ids, 1), 0) > 3 then raise exception 'too_many'; end if;

  select coalesce(jsonb_agg(g.snap order by g.ord), '[]'::jsonb)
  into v_showcase
  from (
    select jsonb_build_object(
      'id', ig.id,
      'gem_name', ig.gem_name,
      'rarity', ig.rarity,
      'final_weight', ig.final_weight,
      'value', ig.value,
      'mutation_ids', to_jsonb(coalesce(ig.mutation_ids, '{}'::text[])),
      'mutation_multiplier', ig.mutation_multiplier
    ) as snap, arr.ord
    from unnest(p_specimen_ids) with ordinality as arr(id, ord)
    join public.inventory_gems ig on ig.id = arr.id and ig.player_id = v_uid
  ) g;

  update public.players set showcase = v_showcase where id = v_uid;
  return v_showcase;
end; $$;
grant execute on function public.set_showcase(bigint[]) to authenticated;

-- Public read of showcases for a set of usernames (leaderboard render).
create or replace function public.get_showcases_for_usernames(p_usernames text[])
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(username, showcase), '{}'::jsonb)
  from public.players
  where username = any(p_usernames)
    and showcase is not null and showcase <> '[]'::jsonb;
$$;
grant execute on function public.get_showcases_for_usernames(text[]) to anon, authenticated;
