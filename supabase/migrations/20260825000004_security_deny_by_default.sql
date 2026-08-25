-- Security hardening: deny browser writes by default and make internal
-- SECURITY DEFINER helpers unreachable through the Data API.

begin;

create or replace function public.players_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception 'players_are_server_managed' using errcode = '42501';
end;
$function$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update or delete on public.players
  for each row execute function public.players_guard();

-- Browser clients only read their permitted player projection. Creation and
-- mutations use ensure_player_record or server-authoritative functions.
revoke insert, update, delete on table public.players from anon, authenticated;

drop policy if exists "Players can insert own row" on public.players;
drop policy if exists "Players can update own row" on public.players;
drop policy if exists "Players can delete own row" on public.players;

-- Internal auction restoration accepts arbitrary JSON by design and must only
-- be reachable from the owner functions that settle/cancel auctions.
do $block$
begin
  if to_regprocedure('public._auction_restore_gem(uuid,jsonb)') is not null then
    execute 'revoke all on function public._auction_restore_gem(uuid,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public._auction_restore_gem(uuid,jsonb) to service_role';
  end if;

  if to_regprocedure('public._auction_restore_lot(uuid,jsonb)') is not null then
    execute 'revoke all on function public._auction_restore_lot(uuid,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public._auction_restore_lot(uuid,jsonb) to service_role';
  end if;

  -- Superseded by the rate-limited features Edge Function + create_guild_v2.
  if to_regprocedure('public.create_guild_for_player(text)') is not null then
    execute 'revoke all on function public.create_guild_for_player(text) from public, anon, authenticated';
  end if;
end
$block$;

-- The current dungeon implementation is kept unavailable until every combat
-- result is calculated and committed server-side.
update public.game_section_settings
set enabled = false,
    updated_at = now()
where id = 'dungeons';

-- PostgreSQL grants function execution to PUBLIC by default. Future functions
-- now require an explicit grant in the migration that creates them.
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated;

-- Remove implicit PUBLIC execution from existing functions. Existing explicit
-- grants to anon/authenticated/service_role remain intact.
revoke execute on all functions in schema public from public;

-- Edge Functions use the secret service_role and must retain unrestricted
-- server-side access. These grants do not apply to browser JWTs.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep newly created database objects usable by trusted Edge Functions while
-- their browser-facing permissions remain explicit and default-deny.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select, update on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

commit;
