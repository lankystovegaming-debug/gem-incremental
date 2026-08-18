-- Retain every unlocked equipment tier so players can manually select it.
-- Existing crafting consumed the prerequisite row, leaving only the highest
-- tier. Reconstruct lower tiers from the authoritative game recipe rewards.

with highest_owned as (
  select
    player_id,
    category,
    max(tier) as highest_tier
  from public.player_equipment
  group by player_id, category
),
equipment_rewards as (
  select
    recipe -> 'reward' as reward
  from public.game_recipes
  where coalesce(recipe -> 'reward' ->> 'type', 'equipment') <> 'consumable'
    and recipe -> 'reward' ->> 'id' is not null
    and recipe -> 'reward' ->> 'category' is not null
)
insert into public.player_equipment (
  player_id,
  equipment_id,
  category,
  tier,
  name,
  luck_bonus,
  roll_speed_bonus,
  weight_luck_bonus,
  weight_multiplier_bonus,
  equipped
)
select
  owned.player_id,
  reward.reward ->> 'id',
  reward.reward ->> 'category',
  coalesce((reward.reward ->> 'tier')::integer, 1),
  reward.reward ->> 'name',
  coalesce((reward.reward -> 'bonus' ->> 'luck')::double precision, 0),
  coalesce((reward.reward -> 'bonus' ->> 'rollSpeed')::double precision, 0),
  coalesce((reward.reward -> 'bonus' ->> 'weightLuck')::double precision, 0),
  coalesce((reward.reward -> 'bonus' ->> 'weightMultiplier')::double precision, 0),
  false
from highest_owned owned
join equipment_rewards reward
  on reward.reward ->> 'category' = owned.category
 and coalesce((reward.reward ->> 'tier')::integer, 1) <= owned.highest_tier
on conflict (player_id, equipment_id) do nothing;
