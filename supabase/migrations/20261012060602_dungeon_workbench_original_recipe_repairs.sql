begin;

-- These are exact drop names, not pooled aliases. Preserve quantities/order.
update public.dungeon_workbench_recipes r
set ingredients = (
  select jsonb_agg(
    case i.value->>'item'
      when 'Hide' then jsonb_set(i.value, '{item}', '"Orc Hide"'::jsonb)
      when 'Reaper Hearts' then jsonb_set(i.value, '{item}', '"Reaper Heart"'::jsonb)
      when 'Ghost Shards' then jsonb_set(i.value, '{item}', '"Ghost Shard"'::jsonb)
      else i.value
    end order by i.ordinality)
  from jsonb_array_elements(r.ingredients) with ordinality as i(value, ordinality)
)
where r.kind = 'original'
  and r.name in ('Basic Chestplate', 'Basic Leggings', 'Basic Boots',
                 'Reinforced Chestplate', 'Reaper Armor', 'Ghost Mantle');

-- The original Tier 1-6 catalog omitted GP entirely. Combat uses the best
-- owned item's GP, adding floor(GP/10000) attack and floor(GP/5000) health.
-- Conservative tier baselines plus a bounded 1k-10k essence-cost bonus:
-- every recipe helps a player without stronger gear, tiers never overlap,
-- and Tier 6 stays below Tier 7's first armor (187500 GP).
-- Only fill missing power; preserve any already-balanced/custom values.
with powers as (
  select id,
    (case tier when 1 then 10000 when 2 then 25000 when 3 then 50000
               when 4 then 75000 when 5 then 100000 when 6 then 125000 end
     + 1000 * greatest(1, ceil(10.0 * essence_cost /
         greatest(1, max(essence_cost) over (partition by tier)))))::bigint as gp
  from public.dungeon_workbench_recipes
  where kind = 'original' and tier between 1 and 6
)
update public.dungeon_workbench_recipes r
set gem_power = p.gp
from powers p
where r.id = p.id and r.gem_power = 0;

-- Repair existing crafts as well, without rerolling gear, charging resources,
-- or touching enemy drops, non-original recipes, or positive-power gear.
update public.dungeon_gear g
set gem_power = r.gem_power
from public.dungeon_workbench_recipes r
where g.quality = 'Workbench' and g.room_number = 0 and g.gem_power = 0
  and g.stats->>'recipe' = r.name
  and r.kind = 'original' and r.tier between 1 and 6 and r.gem_power > 0;

commit;
