-- SECURITY FIX (players PATCH-to-cheat).
--
-- The players_guard trigger was a *blocklist*: it rejected client UPDATEs that
-- changed a hard-coded set of columns. Any column not on that list (coins,
-- display_title, pickaxe_tier, bag_tier, ... i.e. the loot-box coins) was
-- silently editable via a direct PostgREST PATCH with a valid JWT, letting a
-- player set 9999… coins, free equipment tiers, or a custom title.
--
-- Fix = deny by default. A client (authenticated/anon) may not change ANY
-- column of its players row. Every legitimate mutation goes through a
-- SECURITY DEFINER RPC or an edge function (service_role) — both exempt via
-- the current_user check — so this breaks nothing while auto-covering every
-- current AND future column. Two independent layers:
--   1) the guard trigger below (deny-all on UPDATE, safe defaults on INSERT), and
--   2) removal of the client UPDATE RLS policy (denies the PATCH before the
--      trigger; server writes are unaffected because FORCE RLS is off, so the
--      table owner / SECURITY DEFINER functions bypass RLS).

create or replace function public.players_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Server paths (service_role; SECURITY DEFINER functions running as the
  -- table owner) are exempt.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A client may only create its own row; every server-owned column is
    -- forced to a safe default so a first insert can never seed cheat values.
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
    new.coins := 0;
    new.pickaxe_tier := 0;
    new.bag_tier := 0;
    new.max_equipment_tier := 0;
    new.current_island_id := null;
    new.leaderboard_hidden := false;
    new.display_title := '';
    new.display_title_color := '#ffd166';
    return new;
  end if;

  -- UPDATE: deny any client-side change to any column.
  if to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'forbidden_column_update';
  end if;

  return new;
end;
$function$;

-- Second layer: the client has no legitimate reason to UPDATE players.
drop policy if exists "Players can update own row" on public.players;
