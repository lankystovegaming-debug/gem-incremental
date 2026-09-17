-- A rate-limit violation in the authenticated roll Edge Function is strong
-- evidence of automated request abuse. Record the resulting permanent ban in
-- the existing in-game restriction table so the normal ban screen and appeal
-- workflow continue to work.

create or replace function public.apply_roll_rate_limit_permanent_ban(
  p_player_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reason constant text := 'Automated permanent ban: roll request rate limit exceeded.';
  v_ban public.user_roll_luck_rarity_mult%rowtype;
begin
  if p_player_id is null then
    raise exception 'player_id_required' using errcode = '22023';
  end if;
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid_rate_limit_evidence' using errcode = '22023';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;

  insert into public.user_roll_luck_rarity_mult (
    player_id,
    active_until,
    note,
    applied_at,
    applied_by
  ) values (
    p_player_id,
    now() + interval '100 years',
    v_reason,
    now(),
    null
  )
  on conflict (player_id) do update
    set active_until = excluded.active_until,
        note = excluded.note,
        applied_at = excluded.applied_at,
        applied_by = null
  -- Keep the applied_at value stable once this exact system ban exists so a
  -- banned player cannot invalidate their own appeal by continuing to spam.
  where public.user_roll_luck_rarity_mult.active_until <= now()
     or public.user_roll_luck_rarity_mult.note is distinct from v_reason
  returning * into v_ban;

  if not found then
    select *
      into v_ban
      from public.user_roll_luck_rarity_mult
     where player_id = p_player_id;
  end if;

  return jsonb_build_object(
    'bannedUntil', v_ban.active_until,
    'reason', v_ban.note,
    'appliedAt', v_ban.applied_at,
    'limit', p_limit,
    'windowSeconds', p_window_seconds
  );
end;
$$;

revoke all on function public.apply_roll_rate_limit_permanent_ban(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_roll_rate_limit_permanent_ban(uuid, integer, integer)
  to service_role;
