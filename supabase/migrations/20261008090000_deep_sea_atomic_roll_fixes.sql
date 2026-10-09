begin;

-- Select and lock the exact recipe specimens before deleting them. If any
-- requirement cannot be satisfied, the exception rolls the whole craft back.
create or replace function deep_sea_private.consume_gems(
  p_player uuid,
  p_requirements jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requirement jsonb;
  needed integer;
  selected_ids bigint[];
  deleted_count integer;
begin
  for requirement in select value from jsonb_array_elements(p_requirements) loop
    needed := (requirement->>'quantity')::integer;
    if needed <= 0 then continue; end if;

    select array_agg(candidate.id order by candidate.id)
    into selected_ids
    from (
      select inventory.id
      from public.inventory_gems inventory
      where inventory.player_id = p_player
        and inventory.gem_name = requirement->>'gem'
        and not inventory.locked
      order by inventory.id
      limit needed
      for update
    ) candidate;

    if coalesce(cardinality(selected_ids), 0) <> needed then
      raise exception 'missing_recipe_gems:%', requirement->>'gem'
        using errcode = 'P0001';
    end if;

    delete from public.inventory_gems
    where player_id = p_player and id = any(selected_ids);
    get diagnostics deleted_count = row_count;

    if deleted_count <> needed then
      raise exception 'recipe_gem_consumption_conflict:%', requirement->>'gem'
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- Deep Sea rolls and Abyssal Potion rolls must not split irreversible work
-- across several RPC transactions. This coordinator performs the event charge
-- or potion consumption, routing, and final roll commit in one transaction.
create or replace function public.roll_finalize_atomic(
  p_player_id uuid,
  p_lease_id uuid,
  p_genuine_roll bigint,
  p_routing_specimen jsonb,
  p_primary_specimen jsonb,
  p_filter_keep boolean,
  p_filter_sell boolean,
  p_active_auto_craft text,
  p_external_deposit text,
  p_deep_sea boolean,
  p_neptune boolean,
  p_consume_abyssal boolean,
  p_deepcore_auto_contribute boolean,
  p_relic_drop boolean,
  p_duplicate jsonb,
  p_state jsonb,
  p_loot text,
  p_bonus jsonb,
  p_capacity integer,
  p_player_patch jsonb,
  p_bookkeeping jsonb,
  p_convergence_bonuses jsonb default '[]'::jsonb,
  p_include_background boolean default false,
  p_release_on_success boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_deep_sea jsonb := null;
  v_deepcore jsonb := null;
  v_deepcore_error text := null;
  v_route jsonb;
  v_commit jsonb;
  v_external_deposit text := p_external_deposit;
  v_bundle_deposited boolean;
  v_bundle_keep boolean;
  v_auto_deposited boolean;
  v_auto_conserved boolean;
  v_save_primary boolean;
  v_auto_sell boolean;
begin
  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found or p_lease_id is null
     or v_player.roll_lease_id is distinct from p_lease_id then
    raise exception 'invalid_roll_lease';
  end if;
  if v_player.equipment_state_roll >= p_genuine_roll then
    raise exception 'duplicate_roll_commit';
  end if;

  if coalesce(p_consume_abyssal, false) then
    perform public.deep_sea_consume_abyssal(p_player_id);
  end if;

  if coalesce(p_deep_sea, false) then
    v_deep_sea := public.deep_sea_commit_roll(
      p_player_id,
      p_lease_id,
      p_genuine_roll,
      p_routing_specimen,
      coalesce(p_neptune, false),
      false
    );
    if (v_deep_sea->>'fed') in ('neptune', 'depths') then
      v_external_deposit := 'deep-sea';
    end if;
  end if;

  if coalesce(p_deepcore_auto_contribute, false) then
    begin
      v_deepcore := public.deepcore_auto_contribute_roll(
        p_player_id,
        p_routing_specimen
      );
      if coalesce((v_deepcore->>'contributed')::boolean, false) then
        v_external_deposit := 'deepcore';
      end if;
    exception when others then
      v_deepcore_error := sqlerrm;
    end;
  end if;

  if v_external_deposit is not null then
    v_route := jsonb_build_object(
      'bundle', jsonb_build_object(
        'status', v_external_deposit,
        'keepInInventory', false
      ),
      'autoCraft', jsonb_build_object(
        'deposited', false,
        'preserved', false,
        'recipeId', null,
        'requirementIndex', null
      ),
      'autoCraftError', null
    );
  else
    v_route := public.roll_route_result(
      p_player_id,
      p_lease_id,
      p_routing_specimen,
      coalesce(p_filter_keep, false),
      p_active_auto_craft,
      null
    );
  end if;

  v_bundle_deposited := coalesce(v_route->'bundle'->>'status', 'none') = 'deposited'
    or v_external_deposit is not null;
  v_bundle_keep := coalesce((v_route->'bundle'->>'keepInInventory')::boolean, false);
  v_auto_deposited := coalesce((v_route->'autoCraft'->>'deposited')::boolean, false);
  v_auto_conserved := coalesce((v_route->'autoCraft'->>'preserved')::boolean, false);
  v_save_primary := not v_bundle_deposited and (not v_auto_deposited or v_auto_conserved);

  if v_save_primary and not coalesce(p_relic_drop, false)
     and (select count(*) from public.inventory_gems where player_id = p_player_id) >= p_capacity then
    raise exception 'inventory_full' using errcode = 'P0001';
  end if;

  v_auto_sell := coalesce(p_filter_sell, false)
    and v_save_primary
    and not coalesce(p_relic_drop, false)
    and not v_bundle_keep
    and not v_auto_deposited;

  v_commit := public.roll_commit_result(
    p_player_id,
    p_lease_id,
    p_genuine_roll,
    p_primary_specimen,
    v_save_primary,
    p_relic_drop,
    p_duplicate,
    v_auto_sell,
    p_state,
    p_loot,
    p_bonus,
    p_capacity,
    p_player_patch,
    p_bookkeeping,
    p_convergence_bonuses,
    p_include_background,
    p_release_on_success
  );

  return jsonb_build_object(
    'deepSea', v_deep_sea,
    'deepcore', v_deepcore,
    'deepcoreError', v_deepcore_error,
    'route', v_route,
    'commit', v_commit,
    'savePrimary', v_save_primary
  );
end;
$$;

revoke all on function public.roll_finalize_atomic(
  uuid, uuid, bigint, jsonb, jsonb, boolean, boolean, text, text,
  boolean, boolean, boolean, boolean, boolean, jsonb, jsonb, text, jsonb,
  integer, jsonb, jsonb, jsonb, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.roll_finalize_atomic(
  uuid, uuid, bigint, jsonb, jsonb, boolean, boolean, text, text,
  boolean, boolean, boolean, boolean, boolean, jsonb, jsonb, text, jsonb,
  integer, jsonb, jsonb, jsonb, boolean, boolean
) to service_role;

comment on function public.roll_finalize_atomic(
  uuid, uuid, bigint, jsonb, jsonb, boolean, boolean, text, text,
  boolean, boolean, boolean, boolean, boolean, jsonb, jsonb, text, jsonb,
  integer, jsonb, jsonb, jsonb, boolean, boolean
) is 'Atomically finalizes Deep Sea and Abyssal Potion rolls, including payment/consumption, routing, and specimen/equipment persistence.';

commit;
