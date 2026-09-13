-- Batch Rolling and All-In Pickaxe balance.
-- Prepared against the live igrddscmrdrrwtvyspbf schema and optimized roll function.
-- Deployment is intentionally left to the project owner.
begin;

create or replace function public.roll_batch_unlock_status(
  p_player_id uuid,
  p_batch_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_genuine_rolls bigint;
  v_has_celestial boolean;
begin
  if p_player_id is null or p_batch_size is null or p_batch_size < 1 then
    return jsonb_build_object('status', 'invalid_batch_size');
  end if;

  select equipment_genuine_rolls
  into v_genuine_rolls
  from public.players
  where id = p_player_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    exists(
      select 1
      from public.equipment_ownership_history
      where player_id = p_player_id
        and equipment_id = 'celestial-pickaxe'
    )
    or exists(
      select 1
      from public.player_equipment
      where player_id = p_player_id
        and equipment_id = 'celestial-pickaxe'
    )
  into v_has_celestial;

  if p_batch_size in (1, 2) then
    return jsonb_build_object('status', 'unlocked');
  end if;

  if p_batch_size = 3 and v_genuine_rolls >= 100000 then
    return jsonb_build_object('status', 'unlocked');
  end if;

  if p_batch_size = 4 and v_genuine_rolls >= 500000 and v_has_celestial then
    return jsonb_build_object('status', 'unlocked');
  end if;

  if p_batch_size > 4 then
    return jsonb_build_object('status', 'invalid_batch_size');
  end if;

  return jsonb_build_object(
    'status', 'batch_locked',
    'genuineRolls', v_genuine_rolls,
    'requiredGenuineRolls', case p_batch_size when 3 then 100000 when 4 then 500000 else 0 end,
    'requiresCelestialPickaxe', p_batch_size = 4,
    'hasCelestialPickaxe', v_has_celestial
  );
end;
$$;

revoke all on function public.roll_batch_unlock_status(uuid, integer) from public, anon, authenticated;
grant execute on function public.roll_batch_unlock_status(uuid, integer) to service_role;

create or replace function public.claim_equipment_roll_batch(
  p_player_id uuid,
  p_cooldown_ms numeric,
  p_equipment_state jsonb,
  p_equipment_ids bigint[],
  p_batch_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_ids bigint[];
  v_access jsonb;
  v_claim jsonb;
begin
  select equipment_state
  into v_state
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_access := public.roll_batch_unlock_status(p_player_id, p_batch_size);
  if v_access->>'status' <> 'unlocked' then
    return v_access;
  end if;

  select coalesce(array_agg(id order by id), '{}'::bigint[])
  into v_ids
  from public.player_equipment
  where player_id = p_player_id
    and equipped;

  if v_state is distinct from p_equipment_state
     or v_ids is distinct from (
       select coalesce(array_agg(x order by x), '{}'::bigint[])
       from unnest(p_equipment_ids) x
     ) then
    return jsonb_build_object('status', 'state_changed');
  end if;

  v_claim := public.claim_server_roll(p_player_id, p_cooldown_ms);
  if v_claim->>'status' = 'claimed' then
    v_claim := v_claim || jsonb_build_object('batchSize', p_batch_size);
  end if;
  return v_claim;
end;
$$;

revoke all on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  from public, anon, authenticated;
grant execute on function public.claim_equipment_roll_batch(uuid, numeric, jsonb, bigint[], integer)
  to service_role;

-- Preserve the current settings allowlist while adding the batch selector.
create or replace function public.update_qol_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s jsonb;
  k text;
  v jsonb;
  legacy_missing boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text) > 200000 then
    raise exception 'invalid_settings';
  end if;

  insert into public.player_settings(player_id) values(uid) on conflict do nothing;
  select settings into s from public.player_settings where player_id = uid for update;
  legacy_missing := not (s ? 'legacyAutoSell');

  for k, v in select * from jsonb_each(p_patch) loop
    if k = 'gemFilter' then
      if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid_filter'; end if;
      if exists(
        select 1
        from jsonb_each_text(v) e
        where e.value is null
          or e.value not in ('DEFAULT', 'KEEP', 'SELL')
          or not exists(
            select 1
            from public.player_gem_mutation_combinations d
            where d.player_id = uid and d.gem_name = e.key
          )
      ) then
        raise exception 'invalid_or_undiscovered_gem';
      end if;
      s := jsonb_set(s, '{gemFilter}', coalesce(s->'gemFilter', '{}') || v);
    elsif k = 'maxLuck' then
      if v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
        s := jsonb_set(s, '{maxLuck}', 'null'::jsonb);
      else
        if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_max_luck'; end if;
        if (v::text)::numeric < 1 or (v::text)::numeric > 9007199254740991 then
          raise exception 'invalid_max_luck';
        end if;
        s := jsonb_set(s, '{maxLuck}', v);
      end if;
    elsif k in ('enableBuffs', 'discoveryKeep', 'autoRoll', 'autoKeep', 'rollAnimations', 'globalCash', 'cashGraph') then
      if jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
      s := jsonb_set(s, array[k], v);
    elsif k = 'batchSize' then
      if jsonb_typeof(v) is distinct from 'number'
         or (v::text)::numeric <> trunc((v::text)::numeric)
         or (v::text)::numeric < 1
         or (v::text)::numeric > 4 then
        raise exception 'invalid_batch_size';
      end if;
      s := jsonb_set(s, '{batchSize}', v);
    elsif k in ('discoveryKeepRarity', 'autoKeepEffectiveRarity', 'cutsceneMinimumRarity') then
      if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_threshold'; end if;
      if (v::text)::numeric < 1 or (v::text)::numeric > 9007199254740991 then
        raise exception 'invalid_threshold';
      end if;
      s := jsonb_set(s, array[k], v);
    elsif k = 'clearLegacyAutoSell' then
      if v is distinct from 'true'::jsonb then raise exception 'invalid_boolean'; end if;
      s := jsonb_set(s, '{legacyAutoSell}', 'false');
    elsif k in ('legacyAutoSell', 'legacyAutoSellTier') then
      if k = 'legacyAutoSell' and jsonb_typeof(v) is distinct from 'boolean' then
        raise exception 'invalid_boolean';
      end if;
      if k = 'legacyAutoSellTier' and v #>> '{}' not in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') then
        raise exception 'invalid_tier';
      end if;
      if legacy_missing then s := jsonb_set(s, array[k], v); end if;
    elsif k = 'gemRealism' then
      s := jsonb_set(s, array[k], v);
    else
      raise exception 'unknown_setting';
    end if;
  end loop;

  update public.player_settings set settings = s, updated_at = now() where player_id = uid;
  return s;
end;
$$;

update public.game_recipes
set recipe = jsonb_set(recipe, '{reward,bonus,rollSpeed}', to_jsonb(-0.75::numeric), true)
where id = 'all-in-pickaxe';

update public.player_equipment
set roll_speed_bonus = -0.75
where equipment_id = 'all-in-pickaxe';

commit;
