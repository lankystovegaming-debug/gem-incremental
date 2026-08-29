-- Daily Spin reliability
--
-- Avoid serialising every player's spin behind the one configuration row and
-- preserve the already-claimed reward so the client can render it on reload.

create or replace function public.get_daily_spin_state()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.daily_spin_config%rowtype;
  v_claim jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_cfg from public.daily_spin_config where id = true;
  if not found or not v_cfg.enabled then
    return jsonb_build_object(
      'disabled', true,
      'claimed', false,
      'config', jsonb_build_object('title', 'Daily Spin', 'subtitle', 'Coming soon.', 'rewards', '[]'::jsonb)
    );
  end if;

  select jsonb_build_object('claimDate', claim_date, 'reward', reward)
    into v_claim
  from public.daily_spin_claims
  where player_id = v_uid and claim_date = current_date;

  return jsonb_build_object(
    'disabled', false,
    'claimed', v_claim is not null,
    'claim', v_claim,
    'config', jsonb_build_object(
      'title', coalesce(v_cfg.title, 'Daily Spin'),
      'subtitle', coalesce(v_cfg.subtitle, 'One free spin every day.'),
      'rewards', v_cfg.rewards
    )
  );
end;
$$;

create or replace function public.claim_daily_spin()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.daily_spin_config%rowtype;
  v_item jsonb;
  v_reward jsonb;
  v_granted jsonb;
  v_total numeric := 0;
  v_roll numeric;
  v_cursor numeric := 0;
  v_type text;
  v_consumable text;
  v_gem_name text;
  v_date date := current_date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Prevent a double click or two tabs from claiming twice, without holding a
  -- global configuration lock that makes unrelated players wait on each other.
  perform pg_advisory_xact_lock(hashtextextended('daily-spin:' || v_uid::text, 0));

  if not exists (select 1 from public.players where id = v_uid) then
    raise exception 'player_profile_missing';
  end if;

  select * into v_cfg from public.daily_spin_config where id = true;
  if not found or not v_cfg.enabled then
    raise exception 'feature_disabled';
  end if;

  if exists (
    select 1 from public.daily_spin_claims
    where player_id = v_uid and claim_date = v_date
  ) then
    raise exception 'already_claimed';
  end if;

  if jsonb_typeof(v_cfg.rewards) <> 'array' or jsonb_array_length(v_cfg.rewards) = 0 then
    raise exception 'no_rewards_configured';
  end if;

  select coalesce(sum(greatest(0, coalesce((x->>'chance')::numeric, 0))), 0)
    into v_total
  from jsonb_array_elements(v_cfg.rewards) x;
  if v_total <= 0 then
    raise exception 'invalid_rewards';
  end if;

  v_roll := random() * v_total;
  for v_item in select value from jsonb_array_elements(v_cfg.rewards)
  loop
    v_cursor := v_cursor + greatest(0, coalesce((v_item->>'chance')::numeric, 0));
    if v_roll <= v_cursor then
      v_reward := coalesce(v_item->'reward', '{}'::jsonb) || jsonb_build_object(
        'id', coalesce(v_item->>'id', ''),
        'label', coalesce(v_item->>'label', 'Reward')
      );
      exit;
    end if;
  end loop;

  if v_reward is null then
    raise exception 'invalid_rewards';
  end if;

  v_type := v_reward->>'type';
  if v_type not in ('money', 'coins', 'potion', 'gem', 'capacity', 'boost') then
    raise exception 'unsupported_reward_type';
  end if;

  if v_type = 'potion' then
    v_consumable := v_reward->>'consumableId';
    if not exists (select 1 from public.game_consumables where id = v_consumable) then
      raise exception 'invalid_consumable';
    end if;
  elsif v_type = 'gem' then
    v_gem_name := v_reward->>'gemName';
    if not exists (select 1 from public.private_feature_gems where name = v_gem_name and enabled = true) then
      raise exception 'invalid_gem_reward';
    end if;
  end if;

  if v_type in ('money', 'coins', 'potion', 'gem') then
    v_granted := public.apply_reward_object(v_uid, v_reward);
  elsif v_type = 'capacity' then
    update public.players
      set inventory_capacity = greatest(0, coalesce(inventory_capacity, 0) + greatest(0, coalesce((v_reward->>'amount')::integer, 0)))
      where id = v_uid;
    v_granted := v_reward;
  else
    if (v_reward->>'family') not in ('luck', 'rollSpeed', 'weightLuck', 'weightMultiplier') then
      raise exception 'invalid_boost_family';
    end if;
    insert into public.player_boosts(player_id, family, tier, effect_value, expires_at, updated_at)
    values (
      v_uid,
      v_reward->>'family',
      3,
      greatest(0.0001, coalesce((v_reward->>'effectValue')::numeric, 0)),
      now() + make_interval(secs => greatest(1, coalesce((v_reward->>'seconds')::integer, 300))),
      now()
    )
    on conflict(player_id, family) do update
      set tier = excluded.tier,
          effect_value = excluded.effect_value,
          expires_at = excluded.expires_at,
          updated_at = now();
    v_granted := v_reward;
  end if;

  insert into public.daily_spin_claims(player_id, claim_date, reward)
  values (v_uid, v_date, v_granted);

  return jsonb_build_object('success', true, 'claimDate', v_date, 'reward', v_granted);
exception
  when unique_violation then
    raise exception 'already_claimed';
end;
$$;

revoke all on function public.get_daily_spin_state() from public;
grant execute on function public.get_daily_spin_state() to authenticated;
revoke all on function public.claim_daily_spin() from public;
grant execute on function public.claim_daily_spin() to authenticated;
