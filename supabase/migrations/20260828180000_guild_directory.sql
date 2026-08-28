-- Public guild discovery, open enrolment, and owner-reviewed join requests.
-- All writes are routed through the authenticated features Edge Function.

begin;

create table if not exists public.guild_join_requests (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.players(id) on delete set null,
  unique (guild_id, player_id)
);

create index if not exists guild_join_requests_pending_idx
  on public.guild_join_requests(guild_id, requested_at)
  where status = 'pending';

alter table public.guild_join_requests enable row level security;
revoke all on public.guild_join_requests from anon, authenticated;
grant select, insert, update, delete on public.guild_join_requests to service_role;

create or replace function public.guild_join_open_v1(
  p_player_id uuid,
  p_guild_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds%rowtype;
  v_member_count integer;
begin
  -- Serialise attempts by the same player before checking membership, so two
  -- simultaneous directory clicks cannot put them into different guilds.
  perform 1 from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if exists (select 1 from public.guild_members where player_id = p_player_id) then
    raise exception 'already_in_guild';
  end if;
  if exists (select 1 from public.guild_player_cooldowns where player_id = p_player_id and can_join_at > now()) then
    raise exception 'guild_join_cooldown';
  end if;

  select * into v_guild from public.guilds where id = p_guild_id for update;
  if not found then raise exception 'guild_not_found'; end if;
  if v_guild.join_mode <> 'open' then raise exception 'guild_not_open'; end if;
  select count(*) into v_member_count from public.guild_members where guild_id = v_guild.id;
  if v_member_count >= v_guild.member_capacity then raise exception 'guild_full'; end if;

  insert into public.guild_members(guild_id, player_id, role, eligible_at)
  values(v_guild.id, p_player_id, 'member', now());
  update public.guild_invites set status = 'cancelled', responded_at = now()
    where invited_player_id = p_player_id and status = 'pending';
  update public.guild_join_requests set status = 'cancelled', resolved_at = now()
    where player_id = p_player_id and status = 'pending';
  insert into public.guild_activity(guild_id, actor_id, action)
  values(v_guild.id, p_player_id, 'member_joined');
  return jsonb_build_object('ok', true, 'guildId', v_guild.id);
end;
$$;

create or replace function public.guild_request_join_v1(
  p_player_id uuid,
  p_guild_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild public.guilds%rowtype;
  v_member_count integer;
  v_request_id uuid;
begin
  perform 1 from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if exists (select 1 from public.guild_members where player_id = p_player_id) then
    raise exception 'already_in_guild';
  end if;
  if exists (select 1 from public.guild_player_cooldowns where player_id = p_player_id and can_join_at > now()) then
    raise exception 'guild_join_cooldown';
  end if;

  select * into v_guild from public.guilds where id = p_guild_id for update;
  if not found then raise exception 'guild_not_found'; end if;
  if v_guild.join_mode <> 'request' then raise exception 'guild_not_requestable'; end if;
  select count(*) into v_member_count from public.guild_members where guild_id = v_guild.id;
  if v_member_count >= v_guild.member_capacity then raise exception 'guild_full'; end if;

  insert into public.guild_join_requests(guild_id, player_id, status, requested_at, resolved_at, resolved_by)
  values(v_guild.id, p_player_id, 'pending', now(), null, null)
  on conflict (guild_id, player_id) do update
    set status = 'pending', requested_at = now(), resolved_at = null, resolved_by = null
    where public.guild_join_requests.status <> 'pending'
  returning id into v_request_id;
  if v_request_id is null then raise exception 'join_request_pending'; end if;
  insert into public.guild_activity(guild_id, actor_id, action)
  values(v_guild.id, p_player_id, 'join_requested');
  return jsonb_build_object('ok', true, 'requestId', v_request_id);
end;
$$;

create or replace function public.guild_manage_join_request_v1(
  p_actor_id uuid,
  p_request_id uuid,
  p_accept boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.guild_join_requests%rowtype;
  v_actor public.guild_members%rowtype;
  v_guild public.guilds%rowtype;
  v_member_count integer;
begin
  -- Read the target first, then take that player's lock before the request
  -- row. Every directory enrolment path locks the player first, which avoids
  -- a request-review racing an open-guild join into a lock cycle.
  select * into v_request from public.guild_join_requests
    where id = p_request_id and status = 'pending';
  if not found then raise exception 'join_request_not_found'; end if;
  perform 1 from public.players where id = v_request.player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select * into v_request from public.guild_join_requests
    where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'join_request_not_found'; end if;
  select * into v_actor from public.guild_members
    where player_id = p_actor_id and guild_id = v_request.guild_id;
  if not found or v_actor.role not in ('owner', 'officer') then raise exception 'management_only'; end if;

  if not p_accept then
    update public.guild_join_requests
      set status = 'declined', resolved_at = now(), resolved_by = p_actor_id
      where id = v_request.id;
    insert into public.guild_activity(guild_id, actor_id, action, details)
    values(v_request.guild_id, p_actor_id, 'join_request_declined', jsonb_build_object('playerId', v_request.player_id));
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;

  if exists (select 1 from public.guild_members where player_id = v_request.player_id) then
    raise exception 'already_in_guild';
  end if;
  if exists (select 1 from public.guild_player_cooldowns where player_id = v_request.player_id and can_join_at > now()) then
    raise exception 'guild_join_cooldown';
  end if;
  select * into v_guild from public.guilds where id = v_request.guild_id for update;
  select count(*) into v_member_count from public.guild_members where guild_id = v_guild.id;
  if v_member_count >= v_guild.member_capacity then raise exception 'guild_full'; end if;

  insert into public.guild_members(guild_id, player_id, role, eligible_at)
  values(v_guild.id, v_request.player_id, 'member', now());
  update public.guild_join_requests
    set status = 'accepted', resolved_at = now(), resolved_by = p_actor_id
    where id = v_request.id;
  update public.guild_join_requests set status = 'cancelled', resolved_at = now(), resolved_by = p_actor_id
    where player_id = v_request.player_id and status = 'pending' and id <> v_request.id;
  update public.guild_invites set status = 'cancelled', responded_at = now()
    where invited_player_id = v_request.player_id and status = 'pending';
  insert into public.guild_activity(guild_id, actor_id, action, details)
  values(v_guild.id, p_actor_id, 'join_request_accepted', jsonb_build_object('playerId', v_request.player_id));
  return jsonb_build_object('ok', true, 'accepted', true, 'guildId', v_guild.id);
end;
$$;

revoke all on function public.guild_join_open_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.guild_request_join_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.guild_manage_join_request_v1(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.guild_join_open_v1(uuid, uuid) to service_role;
grant execute on function public.guild_request_join_v1(uuid, uuid) to service_role;
grant execute on function public.guild_manage_join_request_v1(uuid, uuid, boolean) to service_role;

commit;
