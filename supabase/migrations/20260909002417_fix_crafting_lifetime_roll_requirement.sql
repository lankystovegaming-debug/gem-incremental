-- A lifetime-rolls recipe requirement must always use players.total_rolls.
-- The equipment overhaul accidentally switched these checks to the newer
-- equipment_genuine_rolls counter, while the recipe and UI still correctly
-- describe the requirement as lifetime progress.
do $migration$
declare
  v_definition text;
  v_old text := 'select money,case when v_recipe->>''equipmentOverhaul''=''true'' then equipment_genuine_rolls else total_rolls end,best_rare_natural_weight_100k,best_rare_natural_weight_1m';
  v_new text := 'select money,total_rolls,best_rare_natural_weight_100k,best_rare_natural_weight_1m';
begin
  select pg_get_functiondef('public.craft_equipment_recipe(text)'::regprocedure)
  into v_definition;

  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'craft_equipment_recipe has an unexpected roll-counter implementation';
  end if;
end
$migration$;

notify pgrst, 'reload schema';
