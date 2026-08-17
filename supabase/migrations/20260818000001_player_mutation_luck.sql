-- =========================================================
-- Per-player mutation luck.
--
-- A double `mutation_luck` on players multiplies the chance of every
-- mutation on each roll (1 = normal odds). Only admins can set it
-- (via the admin edge function, service_role); the players_guard
-- blocks players from editing it directly, like the other protected
-- columns. The roll function reads it and uses the greater of it and
-- the legacy hardcoded mutation-luck boost.
-- =========================================================

alter table public.players
  add column if not exists mutation_luck double precision not null default 1;

set local check_function_bodies = off;

create or replace function public.players_guard()
returns trigger
language plpgsql
as $$
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
     or new.created_at         is distinct from old.created_at
  then
    raise exception 'forbidden_column_update';
  end if;

  return new;
end;
$$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update on public.players
  for each row execute function public.players_guard();
