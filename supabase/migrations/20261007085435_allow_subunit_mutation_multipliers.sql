-- Supersizer's Small mutation is an intentional x0.75 value multiplier.
-- The legacy constraint predated subunit mutations and rejected otherwise
-- valid specimens whenever their combined mutation multiplier stayed below 1.
begin;

alter table public.inventory_gems
  drop constraint if exists inventory_gems_mutation_multiplier_check;

alter table public.inventory_gems
  add constraint inventory_gems_mutation_multiplier_check
  check (mutation_multiplier > 0);

-- Auto-sell must evaluate Gargantuan's Blessing from the state that was active
-- for the roll. Persisting the newly-triggered blessing before selling caused
-- the Gargantuan trigger itself to receive the x1.5 sell bonus even though the
-- passive explicitly begins after that roll. Keep the transaction atomic, but
-- sell the inserted primary specimen before commit_equipment_roll persists the
-- post-roll equipment state.
create or replace function public.roll_commit_result(
  p_player_id uuid,
  p_lease_id uuid,
  p_genuine_roll bigint,
  p_primary_specimen jsonb,
  p_save_primary boolean,
  p_relic_drop boolean,
  p_duplicate jsonb,
  p_auto_sell boolean,
  p_state jsonb,
  p_loot text,
  p_bonus jsonb,
  p_capacity integer,
  p_player_patch jsonb,
  p_bookkeeping jsonb,
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
  v_primary public.inventory_gems%rowtype;
  v_duplicate public.inventory_gems%rowtype;
  v_equipment jsonb;
  v_money double precision := null;
  v_sold boolean := false;
  v_sale_error text := null;
  v_duplicate_error text := null;
  v_lease_released boolean := false;
begin
  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found or v_player.roll_lease_id is distinct from p_lease_id then
    raise exception 'invalid_roll_lease';
  end if;
  if v_player.equipment_state_roll >= p_genuine_roll then
    return jsonb_build_object('duplicateCommit', true);
  end if;
  if p_genuine_roll <> v_player.equipment_genuine_rolls + 1 then
    raise exception 'invalid_genuine_roll';
  end if;

  if coalesce(p_save_primary, false) then
    if coalesce(p_relic_drop, false) then
      perform public.grant_player_relic(
        p_player_id, p_primary_specimen->>'gem_name', 1
      );
    else
      v_primary := public.roll_insert_inventory_specimen(p_player_id, p_primary_specimen);
    end if;
  end if;

  if p_duplicate is not null then
    begin
      v_duplicate := public.roll_insert_inventory_specimen(p_player_id, p_duplicate);
    exception when others then
      v_duplicate_error := sqlerrm;
    end;
  end if;

  if coalesce(p_auto_sell, false) and v_primary.id is not null then
    begin
      v_money := public.sell_inventory_gem(p_player_id, v_primary.id, 'auto');
      v_sold := true;
    exception when others then
      v_sale_error := sqlerrm;
    end;
  end if;

  v_equipment := public.commit_equipment_roll(
    p_player_id, p_lease_id, p_genuine_roll, p_state, p_loot, p_bonus,
    p_capacity, p_player_patch, p_bookkeeping, p_include_background
  );

  if coalesce(p_release_on_success, false) then
    update public.players
    set roll_lease_id = null,
        roll_lease_expires_at = null
    where id = p_player_id and roll_lease_id = p_lease_id;
    v_lease_released := found;
  end if;

  return jsonb_build_object(
    'primary', case when v_primary.id is not null then to_jsonb(v_primary) else null end,
    'duplicate', case when v_duplicate.id is not null then to_jsonb(v_duplicate) else null end,
    'duplicateError', v_duplicate_error,
    'equipment', v_equipment,
    'leaseReleased', v_lease_released,
    'sale', jsonb_build_object(
      'sold', v_sold,
      'money', v_money,
      'error', v_sale_error
    )
  );
end;
$$;

revoke all on function public.roll_commit_result(
  uuid, uuid, bigint, jsonb, boolean, boolean, jsonb, boolean,
  jsonb, text, jsonb, integer, jsonb, jsonb, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.roll_commit_result(
  uuid, uuid, bigint, jsonb, boolean, boolean, jsonb, boolean,
  jsonb, text, jsonb, integer, jsonb, jsonb, boolean, boolean
) to service_role;

commit;
