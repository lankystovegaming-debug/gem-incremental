-- Timed, app-level player bans with an in-game reason screen.
-- Distinct from the hard Supabase-auth lock (account_lock): the session stays
-- alive so the client can show a friendly "you are banned" screen, and it is
-- admin-gated through SECURITY DEFINER RPCs so no edge-function redeploy is
-- needed to start banning.

alter table public.players
  add column if not exists ban_until  timestamptz,
  add column if not exists ban_reason text,
  add column if not exists ban_at     timestamptz,
  add column if not exists ban_by     uuid;

create index if not exists players_ban_until_idx on public.players (ban_until);

-- The player must be able to read their own ban status (own-row RLS applies).
grant select (ban_until, ban_reason) on public.players to anon, authenticated;

-- p_hours null or <= 0 => permanent (~100 years).
create or replace function public.admin_ban_player(
  p_target uuid, p_hours numeric default null, p_reason text default null
) returns table(ban_until timestamptz, ban_reason text)
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if not (auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
          or exists (select 1 from public.admins where user_id = auth.uid())) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_target = auth.uid() then
    raise exception 'cannot_ban_self';
  end if;
  v_until := case when p_hours is null or p_hours <= 0
                  then now() + interval '100 years'
                  else now() + (p_hours * interval '1 hour') end;
  update public.players
     set ban_until  = v_until,
         ban_reason = coalesce(nullif(btrim(p_reason), ''), 'No reason provided.'),
         ban_at     = now(),
         ban_by     = auth.uid()
   where id = p_target;
  if not found then raise exception 'player_not_found'; end if;
  return query select p.ban_until, p.ban_reason from public.players p where p.id = p_target;
end $$;

create or replace function public.admin_unban_player(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
          or exists (select 1 from public.admins where user_id = auth.uid())) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.players
     set ban_until = null, ban_reason = null, ban_at = null, ban_by = null
   where id = p_target;
end $$;

create or replace function public.admin_get_ban(p_target uuid)
returns table(ban_until timestamptz, ban_reason text, ban_at timestamptz, ban_by uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not (auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
          or exists (select 1 from public.admins where user_id = auth.uid())) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query select p.ban_until, p.ban_reason, p.ban_at, p.ban_by
               from public.players p where p.id = p_target;
end $$;

revoke all on function public.admin_ban_player(uuid,numeric,text) from public;
revoke all on function public.admin_unban_player(uuid) from public;
revoke all on function public.admin_get_ban(uuid) from public;
grant execute on function public.admin_ban_player(uuid,numeric,text) to authenticated;
grant execute on function public.admin_unban_player(uuid) to authenticated;
grant execute on function public.admin_get_ban(uuid) to authenticated;
