-- Repair two regressions introduced by the batch-roll branch: crafting and
-- batch unlocks described as lifetime progress must use players.total_rolls.
begin;

-- Convert the authoritative recipe catalogue.
update public.game_recipes recipe_row
set recipe = jsonb_set(
  recipe_row.recipe,
  '{requirements}',
  (
    select jsonb_agg(
      case
        when requirement->>'type' = 'equipment-history'
         and requirement->>'metric' = 'genuineRolls'
        then (requirement - 'metric' - 'amount' - 'consume' - 'label') ||
          jsonb_build_object(
            'type', 'lifetime-rolls',
            'rolls', (requirement->>'amount')::bigint
          )
        else requirement
      end
      order by ordinal
    )
    from jsonb_array_elements(recipe_row.recipe->'requirements')
      with ordinality as requirements(requirement, ordinal)
  ),
  false
)
where exists (
  select 1
  from jsonb_array_elements(recipe_row.recipe->'requirements') requirement
  where requirement->>'type' = 'equipment-history'
    and requirement->>'metric' = 'genuineRolls'
);

-- In-progress equipment crafts preserve a recipe snapshot. Repair those too,
-- otherwise existing players continue seeing and validating the stale counter.
update public.crafting_progress progress_row
set progress = jsonb_set(
  progress_row.progress,
  '{_equipment_recipe,requirements}',
  (
    select jsonb_agg(
      case
        when requirement->>'type' = 'equipment-history'
         and requirement->>'metric' = 'genuineRolls'
        then (requirement - 'metric' - 'amount' - 'consume' - 'label') ||
          jsonb_build_object(
            'type', 'lifetime-rolls',
            'rolls', (requirement->>'amount')::bigint
          )
        else requirement
      end
      order by ordinal
    )
    from jsonb_array_elements(progress_row.progress#>'{_equipment_recipe,requirements}')
      with ordinality as requirements(requirement, ordinal)
  ),
  false
)
where jsonb_typeof(progress_row.progress#>'{_equipment_recipe,requirements}') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(progress_row.progress#>'{_equipment_recipe,requirements}') requirement
    where requirement->>'type' = 'equipment-history'
      and requirement->>'metric' = 'genuineRolls'
  );

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
  v_total_rolls bigint;
  v_has_celestial boolean;
begin
  if p_player_id is null or p_batch_size is null or p_batch_size < 1 then
    return jsonb_build_object('status', 'invalid_batch_size');
  end if;

  select total_rolls
  into v_total_rolls
  from public.players
  where id = p_player_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select
    exists(
      select 1 from public.equipment_ownership_history
      where player_id = p_player_id and equipment_id = 'celestial-pickaxe'
    )
    or exists(
      select 1 from public.player_equipment
      where player_id = p_player_id and equipment_id = 'celestial-pickaxe'
    )
  into v_has_celestial;

  if p_batch_size in (1, 2) then
    return jsonb_build_object('status', 'unlocked');
  end if;
  if p_batch_size = 3 and v_total_rolls >= 100000 then
    return jsonb_build_object('status', 'unlocked');
  end if;
  if p_batch_size = 4 and v_total_rolls >= 500000 and v_has_celestial then
    return jsonb_build_object('status', 'unlocked');
  end if;
  if p_batch_size > 4 then
    return jsonb_build_object('status', 'invalid_batch_size');
  end if;

  return jsonb_build_object(
    'status', 'batch_locked',
    'totalRolls', v_total_rolls,
    'requiredTotalRolls', case p_batch_size when 3 then 100000 when 4 then 500000 else 0 end,
    'requiresCelestialPickaxe', p_batch_size = 4,
    'hasCelestialPickaxe', v_has_celestial
  );
end;
$$;

revoke all on function public.roll_batch_unlock_status(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.roll_batch_unlock_status(uuid, integer)
  to service_role;

commit;
