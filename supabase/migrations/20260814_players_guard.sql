-- =========================================================
-- players_guard
--
-- Closes a hole where the "Players can update own row" RLS
-- policy let any player edit their OWN money, lifetime_earnings
-- (the leaderboard metric), capacity, cooldown, etc. from the
-- browser console.
--
-- A guard trigger blocks changes to the sensitive columns for
-- the authenticated / anon roles. Edge functions run as
-- service_role, and SECURITY DEFINER RPCs run as the table
-- owner, so both bypass the guard and keep working. The client
-- may still change only username and last_seen.
-- =========================================================

create or replace function public.players_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    -- A player can create their own row, but it always starts clean.
    NEW.money := 0;
    NEW.lifetime_earnings := 0;
    NEW.inventory_capacity := 15;
    NEW.next_roll_at := null;
    NEW.total_rolls := 0;
    NEW.rarest_gem_name := null;
    NEW.rarest_gem_rarity := null;
    NEW.crafting_migrated := false;
    NEW.stats_migrated := false;
    NEW.legacy_save_migrated := false;
    return NEW;
  end if;

  if NEW.money is distinct from OLD.money
     or NEW.lifetime_earnings is distinct from OLD.lifetime_earnings
     or NEW.inventory_capacity is distinct from OLD.inventory_capacity
     or NEW.next_roll_at is distinct from OLD.next_roll_at
     or NEW.total_rolls is distinct from OLD.total_rolls
     or NEW.rarest_gem_name is distinct from OLD.rarest_gem_name
     or NEW.rarest_gem_rarity is distinct from OLD.rarest_gem_rarity
     or NEW.crafting_migrated is distinct from OLD.crafting_migrated
     or NEW.stats_migrated is distinct from OLD.stats_migrated
     or NEW.legacy_save_migrated is distinct from OLD.legacy_save_migrated
     or NEW.id is distinct from OLD.id
  then
    raise exception 'forbidden_column_update';
  end if;

  return NEW;
end;
$$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update on public.players
  for each row execute function public.players_guard();
