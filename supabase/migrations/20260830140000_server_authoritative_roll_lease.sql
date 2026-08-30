-- Browser visibility is only a UI optimization. Enforce one in-flight roll
-- per player in Postgres so tabs, userscripts, and direct HTTP callers all
-- share the same authoritative gate.

alter table public.players
  add column if not exists roll_lease_id uuid,
  add column if not exists roll_lease_expires_at timestamptz;

create or replace function public.claim_server_roll(
  p_player_id uuid,
  p_cooldown_ms numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_player public.players%rowtype;
  v_lease_id uuid := gen_random_uuid();
  v_cooldown_ms numeric;
  v_next_roll_at timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_player_id is null or p_cooldown_ms is null or p_cooldown_ms <= 0 then
    raise exception 'invalid_roll_claim' using errcode = '22023';
  end if;

  -- This is a sanity bound, not the game balance minimum. The Edge Function
  -- remains responsible for calculating the player's real cooldown.
  v_cooldown_ms := least(300000::numeric, greatest(10::numeric, p_cooldown_ms));

  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_player.roll_lease_expires_at is not null
     and v_player.roll_lease_expires_at > v_now then
    return jsonb_build_object(
      'status', 'in_flight',
      'retryAt', v_player.roll_lease_expires_at
    );
  end if;

  if v_player.next_roll_at is not null and v_player.next_roll_at > v_now then
    return jsonb_build_object(
      'status', 'cooldown',
      'retryAt', v_player.next_roll_at
    );
  end if;

  v_next_roll_at := v_now + make_interval(secs => (v_cooldown_ms / 1000)::double precision);

  update public.players
  set next_roll_at = v_next_roll_at,
      roll_lease_id = v_lease_id,
      -- A crashed/aborted Edge invocation heals automatically. Successful
      -- rolls release this lease explicitly after all writes finish.
      roll_lease_expires_at = v_now + make_interval(
        secs => greatest(30::numeric, v_cooldown_ms / 1000 + 10)::double precision
      )
  where id = p_player_id;

  return jsonb_build_object(
    'status', 'claimed',
    'leaseId', v_lease_id,
    'nextRollAt', v_next_roll_at
  );
end;
$$;

create or replace function public.release_server_roll(
  p_player_id uuid,
  p_lease_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.players
  set roll_lease_id = null,
      roll_lease_expires_at = null
  where id = p_player_id
    and roll_lease_id = p_lease_id;

  return found;
end;
$$;

revoke all on function public.claim_server_roll(uuid, numeric) from public, anon, authenticated;
revoke all on function public.release_server_roll(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_server_roll(uuid, numeric) to service_role;
grant execute on function public.release_server_roll(uuid, uuid) to service_role;
