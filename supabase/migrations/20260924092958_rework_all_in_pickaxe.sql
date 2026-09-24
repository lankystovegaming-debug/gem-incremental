-- Approved All-In Pickaxe rework. The optimized roll function is deployed
-- separately; this migration updates authoritative crafting data and existing
-- equipment rows without changing All-In's established restriction semantics.
begin;

insert into public.game_mutations(id,name,chance,multiplier,description,icon,color,enabled) values(
  'tryhard','Tryhard',2000,10,
  'Exclusive to All-In Pickaxe: flat 1/2,000 chance per genuine roll, unaffected by Mutation Chance and stackable with ordinary mutations.',
  '🎯','#ff7043',true
)
on conflict(id) do update set
  name=excluded.name,
  chance=excluded.chance,
  multiplier=excluded.multiplier,
  description=excluded.description,
  icon=excluded.icon,
  color=excluded.color,
  enabled=excluded.enabled;

insert into public.game_recipes(id,recipe) values(
  'all-in-pickaxe',
  $recipe${
    "id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe",
    "craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,
    "moneyCost":500000000,
    "requirements":[
      {"id":"all-in-pickaxe-legendary","type":"gem-count","label":"Legendary","amount":7500,"minimumRarity":1000,"maximumRarity":9999},
      {"id":"all-in-pickaxe-mythic","type":"gem-count","label":"Mythic","amount":2000,"minimumRarity":10000,"maximumRarity":99999},
      {"id":"all-in-pickaxe-exotic","type":"gem-count","label":"Exotic","amount":150,"minimumRarity":100000,"maximumRarity":999999},
      {"id":"all-in-pickaxe-exalted","type":"gem-count","label":"Exalted","amount":20,"minimumRarity":1000000,"maximumRarity":9999999},
      {"id":"all-in-pickaxe-cosmic","type":"gem-count","label":"Cosmic","amount":3,"minimumRarity":10000000,"maximumRarity":99999999},
      {"type":"lifetime-rolls","rolls":100000},
      {"type":"equipment-history","metric":"endgamePickaxes","amount":3,"label":"Distinct post-Celestial endgame Pickaxes ever owned","consume":false},
      {"type":"equipment-history","metric":"raw10m","amount":3,"label":"Historical base-rarity ≥1/10M rolls","consume":false}
    ],
    "reward":{"id":"all-in-pickaxe","name":"All-In Pickaxe","category":"pickaxe","tier":15,
      "bonus":{"luck":499,"rollSpeed":-0.67,"mutationChance":-0.85,"weightLuck":-0.85,"weightMultiplier":-0.85}}
  }$recipe$::jsonb
)
on conflict(id) do update set recipe=excluded.recipe;

-- Equipment crafts snapshot their recipe on first deposit. Replace only the
-- All-In snapshot so the UI and server validate the same approved requirements;
-- deposited material counters remain intact in the surrounding progress object.
update public.crafting_progress progress_row
set progress=jsonb_set(
  progress_row.progress,
  '{_equipment_recipe}',
  (select recipe from public.game_recipes where id='all-in-pickaxe'),
  true
)
where progress_row.recipe_id='all-in-pickaxe'
  and progress_row.progress ? '_equipment_recipe';

update public.player_equipment
set luck_bonus=499,
    roll_speed_bonus=-0.67,
    mutation_chance_bonus=-0.85,
    weight_luck_bonus=-0.85,
    weight_multiplier_bonus=-0.85
where equipment_id='all-in-pickaxe';

-- Tryhard is equipment-exclusive, so it must not count toward the Impossible
-- Pickaxe's ordinary-mutation discovery requirement. Use dynamic DDL so this
-- migration remains replayable in partial test schemas without Impossible.
do $do$
begin
  if to_regprocedure('impossible_private.requirements(uuid)') is not null then
    execute $definition$
      create or replace function impossible_private.requirements(p_uid uuid)
      returns jsonb language sql stable security definer set search_path='' as $function$
       with history as (
         select
           count(*) filter(where h.rarity>=10000000 and g.base_weight>0 and h.final_weight/g.base_weight>=5) rare_heavy_10m,
           count(*) filter(where h.rarity>=100000000 and g.base_weight>0 and h.final_weight/g.base_weight>=10) rare_heavy_100m,
           count(distinct h.roll_number) filter(where h.rarity>=100000000 and h.roll_number is not null) rare_100m,
           count(distinct h.roll_number) filter(where h.rarity>=500000000 and h.roll_number is not null) rare_500m
         from public.best_roll_history h
         left join public.private_feature_gems g on g.name=h.gem_name
         where h.player_id=p_uid
       ), mutations as (
         select count(distinct mutation_id) ordinary
         from public.player_gem_mutation_combinations c
         cross join lateral unnest(coalesce(c.mutation_ids,'{}'::text[])) mutation_id
         join public.game_mutations m on m.id=mutation_id and m.enabled
         where c.player_id=p_uid and mutation_id not in (
           'balanced','shifted','tryhard','supersizer-small','supersizer-big','supersizer-giant',
           'supersizer-massive','supersizer-colossal','supersizer-titanic','supersizer-gargantuan',
           'silly-small','silly-large','happy'
         )
       ), specials as (
         select count(distinct g.name) amount
         from public.private_feature_gems g
         join public.player_gem_mutation_combinations c on c.player_id=p_uid and c.gem_name=g.name
         where g.special_gem and g.enabled
       ), specialists as (
         select count(distinct h.equipment_id) amount
         from public.equipment_ownership_history h
         where h.player_id=p_uid and h.equipment_id in (
           'tectonic-pickaxe','the-accelerator','the-resonator','the-excavator','fortune-pickaxe','supersizer-pickaxe'
         )
       )
       select jsonb_build_object(
         'impossibleRareHeavy10m',coalesce(history.rare_heavy_10m,0),
         'impossibleRareHeavy100m',coalesce(history.rare_heavy_100m,0),
         'impossibleRare100m',coalesce(history.rare_100m,0),
         'impossibleRare500m',coalesce(history.rare_500m,0),
         'impossibleOrdinaryMutations',coalesce(mutations.ordinary,0),
         'impossibleSpecialGems',coalesce(specials.amount,0),
         'impossibleSpecialists',coalesce(specialists.amount,0),
         'impossibleLifetimeEarnings',coalesce(p.lifetime_earnings,0),
         'totalRolls',coalesce(p.total_rolls,0)
       )
       from public.players p cross join history cross join mutations cross join specials cross join specialists
       where p.id=p_uid
      $function$;
    $definition$;
  end if;
end
$do$;

commit;
