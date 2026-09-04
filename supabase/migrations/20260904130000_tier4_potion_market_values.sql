-- Add auction reference values for the timed Tier IV potions.

create or replace function public._market_consumable_shop_value(p_consumable_id text)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_consumable_id
    when 'lucky-potion-1' then 200
    when 'speed-potion-1' then 150
    when 'fortune-potion-1' then 200
    when 'mass-potion-1' then 300
    when 'lucky-potion-2' then 40000
    when 'speed-potion-2' then 30000
    when 'fortune-potion-2' then 40000
    when 'mass-potion-2' then 60000
    when 'lucky-potion-3' then 175000
    when 'speed-potion-3' then 125000
    when 'fortune-potion-3' then 175000
    when 'mass-potion-3' then 250000
    when 'lucky-potion-4' then 500000
    when 'speed-potion-4' then 400000
    when 'fortune-potion-4' then 500000
    when 'mass-potion-4' then 750000
    else 0
  end::numeric;
$function$;

revoke all on function public._market_consumable_shop_value(text) from public, anon, authenticated;