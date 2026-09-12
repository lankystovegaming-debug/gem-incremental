-- In-game ban appeals.
-- Players submit one appeal per ban from the restriction screen. Admins review
-- appeals through the admin Edge Function; accepting an appeal atomically
-- removes the matching ban and stores the warning shown on the next login.

create table if not exists public.ban_appeals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  username text not null,
  ban_applied_at timestamptz not null,
  reason text not null check (char_length(reason) between 3 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  decision_message text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  notified_at timestamptz
);

create unique index if not exists ban_appeals_one_per_ban_idx
  on public.ban_appeals (player_id, ban_applied_at);

create index if not exists ban_appeals_admin_queue_idx
  on public.ban_appeals (status, created_at desc);

alter table public.ban_appeals enable row level security;

-- The table is deliberately unavailable through the public REST surface.
-- Player access is limited to the SECURITY DEFINER functions below, and admin
-- access goes through the authenticated admin Edge Function.
revoke all on table public.ban_appeals from anon, authenticated;
grant select, insert, update, delete on table public.ban_appeals to service_role;

create or replace function public.submit_ban_appeal(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := auth.uid();
  v_ban_applied_at timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_username text;
  v_result jsonb;
begin
  if v_player_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if char_length(v_reason) < 3 then
    raise exception 'appeal_reason_too_short';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'appeal_reason_too_long';
  end if;

  select restriction.applied_at
    into v_ban_applied_at
    from public.user_roll_luck_rarity_mult restriction
   where restriction.player_id = v_player_id
     and restriction.active_until > now()
   for share;

  if v_ban_applied_at is null then
    raise exception 'active_ban_required';
  end if;

  select coalesce(nullif(btrim(player.username), ''), 'Unnamed player')
    into v_username
    from public.players player
   where player.id = v_player_id;

  if v_username is null then
    raise exception 'player_not_found';
  end if;

  insert into public.ban_appeals (
    player_id,
    username,
    ban_applied_at,
    reason
  ) values (
    v_player_id,
    v_username,
    v_ban_applied_at,
    v_reason
  )
  on conflict (player_id, ban_applied_at) do update
    set username = excluded.username,
        reason = excluded.reason
    where public.ban_appeals.status = 'pending';

  select jsonb_build_object(
    'id', appeal.id,
    'username', appeal.username,
    'reason', appeal.reason,
    'status', appeal.status,
    'decision_message', appeal.decision_message,
    'created_at', appeal.created_at,
    'reviewed_at', appeal.reviewed_at
  )
    into v_result
    from public.ban_appeals appeal
   where appeal.player_id = v_player_id
     and appeal.ban_applied_at = v_ban_applied_at;

  return v_result;
end;
$$;

create or replace function public.get_my_ban_appeal()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := auth.uid();
  v_ban_applied_at timestamptz;
  v_result jsonb;
begin
  if v_player_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select restriction.applied_at
    into v_ban_applied_at
    from public.user_roll_luck_rarity_mult restriction
   where restriction.player_id = v_player_id
     and restriction.active_until > now();

  if v_ban_applied_at is not null then
    select jsonb_build_object(
      'id', appeal.id,
      'username', appeal.username,
      'reason', appeal.reason,
      'status', appeal.status,
      'decision_message', appeal.decision_message,
      'created_at', appeal.created_at,
      'reviewed_at', appeal.reviewed_at
    )
      into v_result
      from public.ban_appeals appeal
     where appeal.player_id = v_player_id
       and appeal.ban_applied_at = v_ban_applied_at;
  else
    -- Once the ban is gone, return only a decision the player has not yet
    -- acknowledged. This is how an accepted appeal's warning follows them
    -- onto their first unbanned page.
    select jsonb_build_object(
      'id', appeal.id,
      'username', appeal.username,
      'reason', appeal.reason,
      'status', appeal.status,
      'decision_message', appeal.decision_message,
      'created_at', appeal.created_at,
      'reviewed_at', appeal.reviewed_at
    )
      into v_result
      from public.ban_appeals appeal
     where appeal.player_id = v_player_id
       and appeal.status in ('accepted', 'rejected')
       and appeal.notified_at is null
     order by appeal.reviewed_at desc nulls last
     limit 1;
  end if;

  return v_result;
end;
$$;

create or replace function public.acknowledge_ban_appeal_decision(p_appeal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.ban_appeals
     set notified_at = coalesce(notified_at, now())
   where id = p_appeal_id
     and player_id = auth.uid()
     and status in ('accepted', 'rejected');
end;
$$;

create or replace function public.admin_review_ban_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_message text,
  p_reviewed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := coalesce(auth.role() = 'service_role', false);
  v_is_admin boolean;
  v_reviewer uuid;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_appeal public.ban_appeals%rowtype;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

  if not v_is_service and not v_is_admin then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if v_decision not in ('accepted', 'rejected') then
    raise exception 'invalid_appeal_decision';
  end if;
  if v_decision = 'accepted' and v_message = '' then
    raise exception 'unban_warning_required';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'decision_message_too_long';
  end if;

  select *
    into v_appeal
    from public.ban_appeals
   where id = p_appeal_id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'pending_appeal_not_found';
  end if;

  if not exists (
    select 1
      from public.user_roll_luck_rarity_mult restriction
     where restriction.player_id = v_appeal.player_id
       and restriction.applied_at = v_appeal.ban_applied_at
  ) then
    raise exception 'ban_changed_since_appeal';
  end if;

  v_reviewer := case when v_is_service then p_reviewed_by else auth.uid() end;
  if v_decision = 'rejected' and v_message = '' then
    v_message := 'Your ban appeal was rejected.';
  end if;

  update public.ban_appeals
     set status = v_decision,
         decision_message = v_message,
         reviewed_at = now(),
         reviewed_by = v_reviewer,
         notified_at = null
   where id = v_appeal.id;

  if v_decision = 'accepted' then
    delete from public.user_roll_luck_rarity_mult
     where player_id = v_appeal.player_id
       and applied_at = v_appeal.ban_applied_at;
  end if;

  return jsonb_build_object(
    'id', v_appeal.id,
    'player_id', v_appeal.player_id,
    'status', v_decision,
    'decision_message', v_message
  );
end;
$$;

revoke all on function public.submit_ban_appeal(text) from public;
revoke all on function public.get_my_ban_appeal() from public;
revoke all on function public.acknowledge_ban_appeal_decision(uuid) from public;
revoke all on function public.admin_review_ban_appeal(uuid,text,text,uuid) from public;

grant execute on function public.submit_ban_appeal(text) to authenticated;
grant execute on function public.get_my_ban_appeal() to authenticated;
grant execute on function public.acknowledge_ban_appeal_decision(uuid) to authenticated;
grant execute on function public.admin_review_ban_appeal(uuid,text,text,uuid) to service_role;
