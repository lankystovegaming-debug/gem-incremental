-- =========================================================
-- Anti-cheat: guard direct client writes to public.players.
--
-- players is the ONLY game table the `authenticated` role can write
-- directly (INSERT + UPDATE, own row via RLS). Without this guard a
-- player could hit the REST API and set their own money, total_rolls,
-- lifetime_earnings, inventory_capacity, next_roll_at or rarest-gem
-- record — infinite money, top the leaderboards, clear cooldowns.
--
-- The guard blocks changes to those columns for direct client writes
-- while leaving the legitimate ones (username, last_seen) open. It is
-- SECURITY INVOKER on purpose: current_user then reflects the ACTUAL
-- role, so Edge Functions (service_role) and SECURITY DEFINER RPCs
-- (run as the table owner) bypass it and the game's own writes keep
-- working. Verified: money/rolls cheats blocked; username allowed;
-- the money-granting RPC still succeeds.
-- =========================================================

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
