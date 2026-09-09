-- Prepared from live Supabase igrddscmrdrrwtvyspbf, roll v137, 2026-09-07.
-- Manual deployment only. Archive before changing any existing ownership/recipe.
begin;
create table if not exists public.equipment_overhaul_archive (
 kind text not null, source_key text not null, snapshot jsonb not null,
 archived_at timestamptz not null default now(), primary key(kind,source_key)
);
alter table public.equipment_overhaul_archive enable row level security;
revoke all on public.equipment_overhaul_archive from public,anon,authenticated;
grant all on public.equipment_overhaul_archive to service_role;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'recipe',id,to_jsonb(r) from public.game_recipes r where recipe->>'category' in ('pickaxe','clover','lantern','boots','bag') on conflict do nothing;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'equipment',id::text,to_jsonb(e) from public.player_equipment e on conflict do nothing;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'progress',player_id::text||':'||recipe_id,to_jsonb(p) from public.crafting_progress p on conflict do nothing;

alter table public.player_equipment add column if not exists mutation_chance_bonus double precision not null default 0;
alter table public.players add column if not exists equipment_state jsonb not null default '{}';
alter table public.players add column if not exists equipment_state_roll bigint not null default 0;
alter table public.private_feature_gems add column if not exists special_gem boolean not null default false;
-- Classification is explicit and independent of rarity. Future special releases must set this tag.
update public.private_feature_gems set special_gem=true where availability_mode in ('daily','global_event','date_range') or name='the clock';
alter table public.game_consumables drop constraint if exists game_consumables_family_check;
alter table public.game_consumables add constraint game_consumables_family_check check(family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic'));
alter table public.player_boosts drop constraint if exists player_boosts_family_check;
alter table public.player_boosts add constraint player_boosts_family_check check(family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic'));
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price)
values('relic-potion','Relic Potion','relic',1,1.5,60,false,null)
on conflict(id) do update set family='relic',effect_value=1.5,duration_seconds=60,purchasable=false,shop_price=null;

-- Fail before installing recipes if live ingredient identity or availability has changed.
do $$ declare missing text; begin
 select string_agg(n,', ') into missing from unnest(array['Chronite','Ringwoodite','Paraershovite','Vesuvianite','Fluorcalciobritholite','Singularity Shard','random rock I found outside','Quartz','Peridot','Pyrite','Opal','Aventurine','Bloodstone','Sapphire','Emerald','Diamond','Black Opal','Mythril','Demantoid','Lodestone','Titanite','Diaspore','Tsavorite','Void Pearl','Red Diamond','Chambersite','Kyawthuite','Carletonite','Natural Moissanite','Aether Quartz','Hibonite','Black Diamond','Magnesiochloritoid','Void Opal']) n
 where not exists(select 1 from public.private_feature_gems g where g.name=n and g.enabled and g.availability_mode='always' and (g.starts_at is null or g.starts_at<=now()) and (g.ends_at is null or g.ends_at>now()));
 if missing is not null then raise exception 'Equipment overhaul ingredients unavailable: %',missing; end if;
end $$;

insert into public.game_recipes(id,recipe) values('three-leaf-clover','{"id":"three-leaf-clover","name":"Three-Leaf Clover","category":"clover","moneyCost":5000,"equipmentOverhaul":true,"requirements":[{"type":"gem-count","gem":"Peridot","amount":3}],"reward":{"id":"three-leaf-clover","name":"Three-Leaf Clover","category":"clover","tier":1,"bonus":{"luck":0.01}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('four-leaf-clover','{"id":"four-leaf-clover","name":"Four-Leaf Clover","category":"clover","moneyCost":25000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"three-leaf-clover"},{"type":"gem-count","gem":"Aventurine","amount":4}],"reward":{"id":"four-leaf-clover","name":"Four-Leaf Clover","category":"clover","tier":2,"bonus":{"luck":0.02}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('silver-clover','{"id":"silver-clover","name":"Silver Clover","category":"clover","moneyCost":100000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"four-leaf-clover"},{"type":"gem-count","gem":"Emerald","amount":3},{"id":"silver-clover-rare","type":"gem-count","label":"Rare","minimumRarity":100,"maximumRarity":999,"amount":5}],"reward":{"id":"silver-clover","name":"Silver Clover","category":"clover","tier":3,"bonus":{"luck":0.035}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('golden-clover','{"id":"golden-clover","name":"Golden Clover","category":"clover","moneyCost":500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"silver-clover"},{"type":"gem-count","gem":"Demantoid","amount":3},{"id":"golden-clover-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":15}],"reward":{"id":"golden-clover","name":"Golden Clover","category":"clover","tier":4,"bonus":{"luck":0.05}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('prismatic-clover','{"id":"prismatic-clover","name":"Prismatic Clover","category":"clover","moneyCost":2000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"golden-clover"},{"type":"gem-count","gem":"Tsavorite","amount":2},{"id":"prismatic-clover-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":30},{"id":"prismatic-clover-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":5}],"reward":{"id":"prismatic-clover","name":"Prismatic Clover","category":"clover","tier":5,"bonus":{"luck":0.07}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('astral-clover','{"id":"astral-clover","name":"Astral Clover","category":"clover","moneyCost":7500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"prismatic-clover"},{"type":"gem-count","gem":"Kyawthuite","amount":1},{"id":"astral-clover-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":60},{"id":"astral-clover-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":10}],"reward":{"id":"astral-clover","name":"Astral Clover","category":"clover","tier":6,"bonus":{"luck":0.085}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('celestial-clover','{"id":"celestial-clover","name":"Celestial Clover","category":"clover","moneyCost":20000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"astral-clover"},{"type":"gem-count","gem":"Hibonite","amount":1},{"id":"celestial-clover-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":100},{"id":"celestial-clover-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":20},{"id":"celestial-clover-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":2}],"reward":{"id":"celestial-clover","name":"Celestial Clover","category":"clover","tier":7,"bonus":{"luck":0.1}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('dim-lantern','{"id":"dim-lantern","name":"Dim Lantern","category":"lantern","moneyCost":2500,"equipmentOverhaul":true,"requirements":[{"type":"gem-count","gem":"Pyrite","amount":3}],"reward":{"id":"dim-lantern","name":"Dim Lantern","category":"lantern","tier":1,"bonus":{"mutationChance":0.02}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('bright-lantern','{"id":"bright-lantern","name":"Bright Lantern","category":"lantern","moneyCost":10000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"dim-lantern"},{"type":"gem-count","gem":"Opal","amount":3}],"reward":{"id":"bright-lantern","name":"Bright Lantern","category":"lantern","tier":2,"bonus":{"mutationChance":0.035}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('radiant-lantern','{"id":"radiant-lantern","name":"Radiant Lantern","category":"lantern","moneyCost":35000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"bright-lantern"},{"type":"gem-count","gem":"Sapphire","amount":3}],"reward":{"id":"radiant-lantern","name":"Radiant Lantern","category":"lantern","tier":3,"bonus":{"mutationChance":0.05}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('beacon-lantern','{"id":"beacon-lantern","name":"Beacon Lantern","category":"lantern","moneyCost":100000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"radiant-lantern"},{"type":"gem-count","gem":"Diamond","amount":2}],"reward":{"id":"beacon-lantern","name":"Beacon Lantern","category":"lantern","tier":4,"bonus":{"mutationChance":0.07}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('eternal-lantern','{"id":"eternal-lantern","name":"Eternal Lantern","category":"lantern","moneyCost":300000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"beacon-lantern"},{"type":"gem-count","gem":"Black Opal","amount":2},{"id":"eternal-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":5}],"reward":{"id":"eternal-lantern","name":"Eternal Lantern","category":"lantern","tier":5,"bonus":{"mutationChance":0.09}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('celestial-lantern','{"id":"celestial-lantern","name":"Celestial Lantern","category":"lantern","moneyCost":750000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"eternal-lantern"},{"type":"gem-count","gem":"Titanite","amount":2},{"id":"celestial-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":10}],"reward":{"id":"celestial-lantern","name":"Celestial Lantern","category":"lantern","tier":6,"bonus":{"mutationChance":0.115}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('aether-lantern','{"id":"aether-lantern","name":"Aether Lantern","category":"lantern","moneyCost":2000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"celestial-lantern"},{"type":"gem-count","gem":"Void Pearl","amount":2},{"id":"aether-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":20}],"reward":{"id":"aether-lantern","name":"Aether Lantern","category":"lantern","tier":7,"bonus":{"mutationChance":0.14}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('void-lantern','{"id":"void-lantern","name":"Void Lantern","category":"lantern","moneyCost":5000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"aether-lantern"},{"type":"gem-count","gem":"Carletonite","amount":1},{"id":"void-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":35},{"id":"void-lantern-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":5}],"reward":{"id":"void-lantern","name":"Void Lantern","category":"lantern","tier":8,"bonus":{"mutationChance":0.17}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('event-horizon-lantern','{"id":"event-horizon-lantern","name":"Event Horizon Lantern","category":"lantern","moneyCost":10000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"void-lantern"},{"type":"gem-count","gem":"Aether Quartz","amount":1},{"id":"event-horizon-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":60},{"id":"event-horizon-lantern-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":10}],"reward":{"id":"event-horizon-lantern","name":"Event Horizon Lantern","category":"lantern","tier":9,"bonus":{"mutationChance":0.205}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('singularity-lantern','{"id":"singularity-lantern","name":"Singularity Lantern","category":"lantern","moneyCost":20000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"event-horizon-lantern"},{"type":"gem-count","gem":"Void Opal","amount":1},{"id":"singularity-lantern-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":100},{"id":"singularity-lantern-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":20},{"id":"singularity-lantern-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":2}],"reward":{"id":"singularity-lantern","name":"Singularity Lantern","category":"lantern","tier":10,"bonus":{"mutationChance":0.25}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('miners-boots','{"id":"miners-boots","name":"Miner''s Boots","category":"boots","moneyCost":2500,"equipmentOverhaul":true,"requirements":[{"type":"gem-count","gem":"Pyrite","amount":5}],"reward":{"id":"miners-boots","name":"Miner''s Boots","category":"boots","tier":1,"bonus":{"weightLuck":0.01}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('reinforced-boots','{"id":"reinforced-boots","name":"Reinforced Boots","category":"boots","moneyCost":10000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"miners-boots"},{"type":"gem-count","gem":"Bloodstone","amount":4}],"reward":{"id":"reinforced-boots","name":"Reinforced Boots","category":"boots","tier":2,"bonus":{"weightLuck":0.02}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('prospectors-boots','{"id":"prospectors-boots","name":"Prospector''s Boots","category":"boots","moneyCost":30000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"reinforced-boots"},{"type":"gem-count","gem":"Diamond","amount":3}],"reward":{"id":"prospectors-boots","name":"Prospector''s Boots","category":"boots","tier":3,"bonus":{"weightLuck":0.03}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('fortune-boots','{"id":"fortune-boots","name":"Fortune Boots","category":"boots","moneyCost":75000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"prospectors-boots"},{"type":"gem-count","gem":"Mythril","amount":3}],"reward":{"id":"fortune-boots","name":"Fortune Boots","category":"boots","tier":4,"bonus":{"weightLuck":0.04}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('gravity-boots','{"id":"gravity-boots","name":"Gravity Boots","category":"boots","moneyCost":200000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"fortune-boots"},{"type":"gem-count","gem":"Lodestone","amount":2},{"id":"gravity-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":5}],"reward":{"id":"gravity-boots","name":"Gravity Boots","category":"boots","tier":5,"bonus":{"weightLuck":0.05}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('astral-boots','{"id":"astral-boots","name":"Astral Boots","category":"boots","moneyCost":500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"gravity-boots"},{"type":"gem-count","gem":"Titanite","amount":2},{"id":"astral-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":10}],"reward":{"id":"astral-boots","name":"Astral Boots","category":"boots","tier":6,"bonus":{"weightLuck":0.06}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('aetherstep-boots','{"id":"aetherstep-boots","name":"Aetherstep Boots","category":"boots","moneyCost":1000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"astral-boots"},{"type":"gem-count","gem":"Diaspore","amount":2},{"id":"aetherstep-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":15}],"reward":{"id":"aetherstep-boots","name":"Aetherstep Boots","category":"boots","tier":7,"bonus":{"weightLuck":0.075}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('voidwalker-boots','{"id":"voidwalker-boots","name":"Voidwalker Boots","category":"boots","moneyCost":2500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"aetherstep-boots"},{"type":"gem-count","gem":"Void Pearl","amount":1},{"id":"voidwalker-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":25}],"reward":{"id":"voidwalker-boots","name":"Voidwalker Boots","category":"boots","tier":8,"bonus":{"weightLuck":0.09}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('eventide-boots','{"id":"eventide-boots","name":"Eventide Boots","category":"boots","moneyCost":5000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"voidwalker-boots"},{"type":"gem-count","gem":"Red Diamond","amount":1},{"id":"eventide-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":35},{"id":"eventide-boots-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":5}],"reward":{"id":"eventide-boots","name":"Eventide Boots","category":"boots","tier":9,"bonus":{"weightLuck":0.105}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('singularity-striders','{"id":"singularity-striders","name":"Singularity Striders","category":"boots","moneyCost":7500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"eventide-boots"},{"type":"gem-count","gem":"Natural Moissanite","amount":1},{"id":"singularity-striders-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":50},{"id":"singularity-striders-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":8}],"reward":{"id":"singularity-striders","name":"Singularity Striders","category":"boots","tier":10,"bonus":{"weightLuck":0.12}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('event-horizon-boots','{"id":"event-horizon-boots","name":"Event Horizon Boots","category":"boots","moneyCost":12500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"singularity-striders"},{"type":"gem-count","gem":"Hibonite","amount":1},{"id":"event-horizon-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":75},{"id":"event-horizon-boots-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":12}],"reward":{"id":"event-horizon-boots","name":"Event Horizon Boots","category":"boots","tier":11,"bonus":{"weightLuck":0.135}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('gravitational-boots','{"id":"gravitational-boots","name":"Gravitational Boots","category":"boots","moneyCost":20000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"event-horizon-boots"},{"type":"gem-count","gem":"Magnesiochloritoid","amount":1},{"id":"gravitational-boots-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":100},{"id":"gravitational-boots-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":20},{"id":"gravitational-boots-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":2}],"reward":{"id":"gravitational-boots","name":"Gravitational Boots","category":"boots","tier":12,"bonus":{"weightLuck":0.15}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('worn-bag','{"id":"worn-bag","name":"Worn Bag","category":"bag","moneyCost":2500,"equipmentOverhaul":true,"requirements":[{"type":"gem-count","gem":"Pyrite","amount":5}],"reward":{"id":"worn-bag","name":"Worn Bag","category":"bag","tier":1,"bonus":{"weightMultiplier":0.01}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('sturdy-bag','{"id":"sturdy-bag","name":"Sturdy Bag","category":"bag","moneyCost":10000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"worn-bag"},{"type":"gem-count","gem":"Aventurine","amount":4}],"reward":{"id":"sturdy-bag","name":"Sturdy Bag","category":"bag","tier":2,"bonus":{"weightMultiplier":0.02}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('reinforced-bag','{"id":"reinforced-bag","name":"Reinforced Bag","category":"bag","moneyCost":30000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"sturdy-bag"},{"type":"gem-count","gem":"Sapphire","amount":3}],"reward":{"id":"reinforced-bag","name":"Reinforced Bag","category":"bag","tier":3,"bonus":{"weightMultiplier":0.03}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('gemkeeper-bag','{"id":"gemkeeper-bag","name":"Gemkeeper Bag","category":"bag","moneyCost":75000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"reinforced-bag"},{"type":"gem-count","gem":"Diamond","amount":3}],"reward":{"id":"gemkeeper-bag","name":"Gemkeeper Bag","category":"bag","tier":4,"bonus":{"weightMultiplier":0.04}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('bottomless-bag','{"id":"bottomless-bag","name":"Bottomless Bag","category":"bag","moneyCost":200000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"gemkeeper-bag"},{"type":"gem-count","gem":"Black Opal","amount":2},{"id":"bottomless-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":5}],"reward":{"id":"bottomless-bag","name":"Bottomless Bag","category":"bag","tier":5,"bonus":{"weightMultiplier":0.05}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('colossal-bag','{"id":"colossal-bag","name":"Colossal Bag","category":"bag","moneyCost":500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"bottomless-bag"},{"type":"gem-count","gem":"Titanite","amount":2},{"id":"colossal-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":10}],"reward":{"id":"colossal-bag","name":"Colossal Bag","category":"bag","tier":6,"bonus":{"weightMultiplier":0.065}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('aetherwoven-bag','{"id":"aetherwoven-bag","name":"Aetherwoven Bag","category":"bag","moneyCost":1000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"colossal-bag"},{"type":"gem-count","gem":"Tsavorite","amount":2},{"id":"aetherwoven-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":15}],"reward":{"id":"aetherwoven-bag","name":"Aetherwoven Bag","category":"bag","tier":7,"bonus":{"weightMultiplier":0.08}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('dimensional-bag','{"id":"dimensional-bag","name":"Dimensional Bag","category":"bag","moneyCost":2500000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"aetherwoven-bag"},{"type":"gem-count","gem":"Void Pearl","amount":1},{"id":"dimensional-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":25}],"reward":{"id":"dimensional-bag","name":"Dimensional Bag","category":"bag","tier":8,"bonus":{"weightMultiplier":0.095}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('riftwoven-bag','{"id":"riftwoven-bag","name":"Riftwoven Bag","category":"bag","moneyCost":5000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"dimensional-bag"},{"type":"gem-count","gem":"Chambersite","amount":1},{"id":"riftwoven-bag-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":40},{"id":"riftwoven-bag-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":5}],"reward":{"id":"riftwoven-bag","name":"Riftwoven Bag","category":"bag","tier":9,"bonus":{"weightMultiplier":0.11}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('vault-of-plenty','{"id":"vault-of-plenty","name":"Vault of Plenty","category":"bag","moneyCost":10000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"riftwoven-bag"},{"type":"gem-count","gem":"Natural Moissanite","amount":1},{"id":"vault-of-plenty-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":60},{"id":"vault-of-plenty-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":10}],"reward":{"id":"vault-of-plenty","name":"Vault of Plenty","category":"bag","tier":10,"bonus":{"weightMultiplier":0.13}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('dimensional-vault','{"id":"dimensional-vault","name":"Dimensional Vault","category":"bag","moneyCost":20000000,"equipmentOverhaul":true,"requirements":[{"type":"equipment","equipmentId":"vault-of-plenty"},{"type":"gem-count","gem":"Black Diamond","amount":1},{"id":"dimensional-vault-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":100},{"id":"dimensional-vault-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":20},{"id":"dimensional-vault-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":2}],"reward":{"id":"dimensional-vault","name":"Dimensional Vault","category":"bag","tier":11,"bonus":{"weightMultiplier":0.15}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('tectonic-pickaxe','{"id":"tectonic-pickaxe","name":"Tectonic Pickaxe","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":150000000,"requirements":[{"type":"gem-count","gem":"Ringwoodite","amount":5},{"type":"gem-count","gem":"Paraershovite","amount":3},{"type":"gem-count","gem":"Vesuvianite","amount":2},{"type":"gem-count","gem":"Fluorcalciobritholite","amount":1},{"type":"gem-count","gem":"Singularity Shard","amount":1},{"id":"tectonic-pickaxe-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":750},{"id":"tectonic-pickaxe-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":200},{"id":"tectonic-pickaxe-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":10},{"id":"tectonic-specimen-5","type":"specimen-condition","minimumWeightMultiplier":5,"amount":40,"label":"40 specimens ≥5×"},{"id":"tectonic-specimen-6","type":"specimen-condition","minimumWeightMultiplier":6,"amount":15,"label":"15 specimens ≥6×"},{"id":"tectonic-specimen-7","type":"specimen-condition","minimumWeightMultiplier":7,"amount":4,"label":"4 specimens ≥7×"},{"id":"tectonic-specimen-8","type":"specimen-condition","minimumWeightMultiplier":8,"amount":1,"label":"1 specimens ≥8×"}],"reward":{"id":"tectonic-pickaxe","name":"Tectonic Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":19,"rollSpeed":1.6,"mutationChance":0,"weightLuck":6,"weightMultiplier":0.85}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('the-accelerator','{"id":"the-accelerator","name":"The Accelerator","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":175000000,"requirements":[{"type":"gem-count","gem":"Chronite","amount":3},{"id":"the-accelerator-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":1000},{"id":"the-accelerator-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":300},{"id":"the-accelerator-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":15},{"type":"lifetime-rolls","rolls":400000}],"reward":{"id":"the-accelerator","name":"The Accelerator","category":"pickaxe","tier":15,"bonus":{"luck":20,"rollSpeed":2.4,"mutationChance":-0.1,"weightLuck":2,"weightMultiplier":0.3}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('the-resonator','{"id":"the-resonator","name":"The Resonator","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":150000000,"requirements":[{"id":"the-resonator-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":750},{"id":"the-resonator-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":250},{"id":"the-resonator-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":10},{"type":"special-discoveries","classification":"daily_window","amount":5},{"type":"special-discoveries","classification":"global_event","amount":3},{"type":"special-discoveries","classification":"special","amount":10}],"reward":{"id":"the-resonator","name":"The Resonator","category":"pickaxe","tier":15,"bonus":{"luck":19,"rollSpeed":1.8,"mutationChance":0,"weightLuck":2.5,"weightMultiplier":0.35}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('the-excavator','{"id":"the-excavator","name":"The Excavator","category":"pickaxe","craftingTab":"pickaxe","horizontal":true,"equipmentOverhaul":true,"moneyCost":125000000,"requirements":[{"id":"the-excavator-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":750},{"id":"the-excavator-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":250},{"id":"the-excavator-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":10},{"type":"potion-tier","tier":1,"amount":100},{"type":"potion-tier","tier":2,"amount":75},{"type":"potion-tier","tier":3,"amount":40},{"type":"potion-tier","tier":4,"amount":15},{"type":"consumable","consumableId":"legendary-potion","amount":3},{"type":"consumable","consumableId":"mythic-potion","amount":1}],"reward":{"id":"the-excavator","name":"The Excavator","category":"pickaxe","tier":15,"bonus":{"luck":18,"rollSpeed":1.9,"mutationChance":-0.05,"weightLuck":2.25,"weightMultiplier":0.3}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('toy-shovel','{"id":"toy-shovel","name":"Toy Shovel","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":670000000.67,"requirements":[{"type":"equipment","equipmentId":"plastic-shopping-bag","consume":false},{"id":"toy-shovel-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":6700},{"id":"toy-shovel-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":2067},{"id":"toy-shovel-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":67},{"id":"toy-shovel-exalted","type":"gem-count","label":"Exalted","minimumRarity":1000000,"maximumRarity":9999999,"amount":6},{"type":"gem-count","gem":"random rock I found outside","amount":67},{"type":"gem-count","gem":"Quartz","amount":67},{"type":"consumable","consumableId":"plastic-bag","amount":67},{"id":"toy-shovel-specimens","type":"specimen-condition","minimumWeightMultiplier":6.7,"amount":67,"label":"67 specimens ≥6.7×"}],"reward":{"id":"toy-shovel","name":"Toy Shovel","category":"pickaxe","tier":15,"bonus":{"luck":16,"rollSpeed":1.4,"mutationChance":-0.2,"weightLuck":1.5,"weightMultiplier":0.2}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
insert into public.game_recipes(id,recipe) values('silly-fun-happy-pickaxe','{"id":"silly-fun-happy-pickaxe","name":"Silly Fun Happy Pickaxe","category":"pickaxe","craftingTab":"toys","horizontal":true,"equipmentOverhaul":true,"moneyCost":6767676.76,"requirements":[{"type":"gem-count","gem":"random rock I found outside","amount":10},{"type":"gem-count","gem":"Quartz","amount":50},{"id":"silly-fun-happy-pickaxe-rare","type":"gem-count","label":"Rare","minimumRarity":100,"maximumRarity":999,"amount":100},{"id":"silly-fun-happy-pickaxe-legendary","type":"gem-count","label":"Legendary","minimumRarity":1000,"maximumRarity":9999,"amount":67},{"id":"silly-fun-happy-pickaxe-mythic","type":"gem-count","label":"Mythic","minimumRarity":10000,"maximumRarity":99999,"amount":10},{"id":"silly-fun-happy-pickaxe-exotic","type":"gem-count","label":"Exotic","minimumRarity":100000,"maximumRarity":999999,"amount":1},{"id":"silly-light-specimens","type":"specimen-condition","maximumWeightMultiplier":0.6,"amount":10,"label":"10 specimens ≤0.6×"}],"reward":{"id":"silly-fun-happy-pickaxe","name":"Silly Fun Happy Pickaxe","category":"pickaxe","tier":15,"bonus":{"luck":10,"rollSpeed":-0.5,"mutationChance":-0.5,"weightLuck":1,"weightMultiplier":-0.5}}}'::jsonb) on conflict(id) do update set recipe=excluded.recipe;
update public.game_recipes set recipe=jsonb_set(recipe,'{reward,bonus}','{"luck":25,"rollSpeed":1.8,"mutationChance":0,"weightLuck":3.5,"weightMultiplier":0.5}'::jsonb)||'{"equipmentOverhaul":true}'::jsonb where id='celestial-pickaxe';
update public.game_recipes set recipe=jsonb_set(recipe,'{reward,bonus}','{"luck":23,"rollSpeed":2,"mutationChance":0,"weightLuck":2.5,"weightMultiplier":0.4}'::jsonb)||'{"equipmentOverhaul":true}'::jsonb where id='empyrean-pickaxe';
update public.game_recipes set recipe=jsonb_set(recipe,'{requirements}',(select jsonb_agg(r order by ord) from jsonb_array_elements(recipe->'requirements') with ordinality as x(r,ord) where r->>'type'<>'equipment'))||'{"horizontal":true}'::jsonb where id='empyrean-pickaxe';
update public.game_recipes set recipe=jsonb_set(recipe,'{reward,bonus}','{"luck":21,"rollSpeed":2,"mutationChance":0.1,"weightLuck":3,"weightMultiplier":0.45}'::jsonb)||'{"equipmentOverhaul":true}'::jsonb where id='eternity-pickaxe';
update public.game_recipes set recipe=jsonb_set(recipe,'{requirements}',(select jsonb_agg(r order by ord) from jsonb_array_elements(recipe->'requirements') with ordinality as x(r,ord) where r->>'type'<>'equipment'))||'{"horizontal":true}'::jsonb where id='eternity-pickaxe';
-- Preserve Plastic's entire recipe except presentation metadata.
update public.game_recipes set recipe=recipe||'{"craftingTab":"toys"}'::jsonb where id='plastic-shopping-bag';

-- Retired ownership is archived in full. Keep the best existing row/state per replacement.
do $$ declare target text; ids text[]; rec record; begin
 for target,ids in select * from (values
 ('gravitational-boots',array['neutron-boots','spacetime-walkers','reality-breakers']),
 ('dimensional-vault',array['singularity-vault','bottomless-singularity','event-horizon-vault','omnidimensional-vault'])) t(target,ids) loop
  for rec in select distinct player_id from public.player_equipment where equipment_id=any(ids) loop
   if not exists(select 1 from public.player_equipment where player_id=rec.player_id and equipment_id=target) then
    update public.player_equipment set equipment_id=target where id=(select id from public.player_equipment where player_id=rec.player_id and equipment_id=any(ids) order by equipped desc,masterwork_level desc nulls last,tier desc,id limit 1);
   elsif exists(select 1 from public.player_equipment where player_id=rec.player_id and equipment_id=any(ids) and equipped) then
    update public.player_equipment set equipped=true where player_id=rec.player_id and equipment_id=target;
   end if;
   delete from public.player_equipment where player_id=rec.player_id and equipment_id=any(ids);
  end loop;
  update public.player_crafting set active_auto_craft=null where active_auto_craft=any(ids);
  delete from public.game_recipes where id=any(ids);
 end loop;
end $$;

-- Upgrade saved stats in place; retain enchants, masterwork and crafting progress keys.
update public.player_equipment e set
 name=r.recipe->'reward'->>'name',tier=(r.recipe->'reward'->>'tier')::integer,
 luck_bonus=coalesce((r.recipe->'reward'->'bonus'->>'luck')::double precision,0),
 roll_speed_bonus=coalesce((r.recipe->'reward'->'bonus'->>'rollSpeed')::double precision,0),
 weight_luck_bonus=coalesce((r.recipe->'reward'->'bonus'->>'weightLuck')::double precision,0),
 weight_multiplier_bonus=coalesce((r.recipe->'reward'->'bonus'->>'weightMultiplier')::double precision,0),
 mutation_chance_bonus=coalesce((r.recipe->'reward'->'bonus'->>'mutationChance')::double precision,0)
from public.game_recipes r where r.id=e.equipment_id and r.recipe->>'equipmentOverhaul'='true';
update public.player_equipment set weight_luck_bonus=0,weight_multiplier_bonus=0 where category='pickaxe' and tier<15;

-- Grandfather already-started secondary crafts instead of guessing conversion rates
-- between unrelated named gems. Their reward is redesigned; all original deposits,
-- money cost and requirement keys remain usable. Future crafts use the new recipe.
do $$ declare p record; old_recipe jsonb; begin
 for p in select cp.*,r.recipe from public.crafting_progress cp join public.game_recipes r on r.id=cp.recipe_id
 where r.recipe->>'category' in ('clover','lantern','boots','bag') and r.recipe->>'equipmentOverhaul'='true'
 and cp.progress<>'{}'::jsonb and not cp.progress ? 'equipment-overhaul-v1' loop
  select snapshot->'recipe' into old_recipe from public.equipment_overhaul_archive where kind='recipe' and source_key=p.recipe_id;
  if old_recipe is not null and exists(select 1 from jsonb_each(p.progress) x where jsonb_typeof(x.value)='number' and (x.value::text)::numeric>0) then
   update public.crafting_progress set progress=progress||jsonb_build_object('_equipment_recipe',
    old_recipe||jsonb_build_object('reward',p.recipe->'reward','equipmentOverhaul',true,
     'description','Started before the equipment redesign. Original materials and progress are preserved; completing this craft grants the redesigned equipment.'))
    ||'{"equipment-overhaul-v1":true}'::jsonb where player_id=p.player_id and recipe_id=p.recipe_id;
  end if;
 end loop;
end $$;

-- All new writes normalize stats from the authoritative recipe. Old clients cannot restore retired bonuses.
create or replace function public.normalize_overhauled_equipment() returns trigger language plpgsql set search_path='' as $$
declare r jsonb; begin
 select recipe into r from public.game_recipes where id=new.equipment_id;
 if r->>'equipmentOverhaul'='true' then
  new.luck_bonus:=coalesce((r->'reward'->'bonus'->>'luck')::double precision,0);
  new.roll_speed_bonus:=coalesce((r->'reward'->'bonus'->>'rollSpeed')::double precision,0);
  new.weight_luck_bonus:=coalesce((r->'reward'->'bonus'->>'weightLuck')::double precision,0);
  new.weight_multiplier_bonus:=coalesce((r->'reward'->'bonus'->>'weightMultiplier')::double precision,0);
  new.mutation_chance_bonus:=coalesce((r->'reward'->'bonus'->>'mutationChance')::double precision,0);
 end if;
 return new;
end $$;
drop trigger if exists normalize_overhauled_equipment on public.player_equipment;
create trigger normalize_overhauled_equipment before insert or update on public.player_equipment for each row execute function public.normalize_overhauled_equipment();

-- Equipment changes serialize with the player's roll lease and reset only Accelerator spool.
create or replace function public.guard_equipment_switch() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid; expiry timestamptz; begin
 uid:=case when tg_op='DELETE' then old.player_id else new.player_id end;
 if tg_op='UPDATE' and new.equipped is not distinct from old.equipped then return new; end if;
 select roll_lease_expires_at into expiry from public.players where id=uid for update;
 if expiry>clock_timestamp() then raise exception 'roll_in_progress'; end if;
 if (tg_op<>'INSERT' and old.category='pickaxe' and old.equipped) or (tg_op<>'DELETE' and new.category='pickaxe' and new.equipped) then
  update public.players set equipment_state=jsonb_set(equipment_state,'{spool}','0') where id=uid;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
drop trigger if exists guard_equipment_switch on public.player_equipment;
create trigger guard_equipment_switch before insert or update of equipped or delete on public.player_equipment for each row execute function public.guard_equipment_switch();
revoke all on function public.guard_equipment_switch() from public,anon,authenticated;

create or replace function public.equipment_special_discoveries(p_player_id uuid,p_classification text) returns integer language sql stable security invoker set search_path='' as $$
 select count(distinct g.name)::integer from public.private_feature_gems g
 join public.player_gem_mutation_combinations d on d.gem_name=g.name and d.player_id=p_player_id
 where g.special_gem and g.enabled
 and not(g.availability_mode='date_range' and g.ends_at is not null and g.ends_at<=now())
 and case p_classification when 'daily_window' then g.availability_mode='daily' and g.name<>'the clock'
 when 'global_event' then g.availability_mode='global_event' when 'special' then true else false end;
$$;

-- Commit mechanics and extra loot once per accepted server lease. Never callable by a client.
create or replace function public.commit_equipment_roll(p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_state jsonb,p_loot text,p_bonus jsonb,p_capacity integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype; b public.inventory_gems%rowtype; n integer; begin
 select * into p from public.players where id=p_player_id for update;
 if not found or p.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
 if p.equipment_state_roll>=p_genuine_roll then return jsonb_build_object('duplicate',true); end if;
 if p_genuine_roll<>p.equipment_genuine_rolls+1 then raise exception 'invalid_genuine_roll'; end if;
 update public.players set equipment_state=p_state,equipment_state_roll=p_genuine_roll where id=p_player_id;
 if p_loot is not null then
  if p_loot not in ('lucky-potion-1','lucky-potion-2','lucky-potion-3','lucky-potion-4','speed-potion-1','speed-potion-2','speed-potion-3','speed-potion-4','fortune-potion-1','fortune-potion-2','fortune-potion-3','fortune-potion-4','mass-potion-1','mass-potion-2','mass-potion-3','mass-potion-4','legendary-potion','mythic-potion','relic-potion') then raise exception 'invalid_excavation_loot'; end if;
  insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(p_player_id,p_loot,1,now())
  on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+1,updated_at=now();
 end if;
 if p_bonus is not null then
  select count(*) into n from public.inventory_gems where player_id=p_player_id;
  if n<p_capacity then
   insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,mutation_id,mutation_ids,mutation_multiplier,mutation_multipliers,mutation_chance_multiplier,value,luck_at_roll,locked)
   values(p_player_id,p_bonus->>'gem_name',(p_bonus->>'rarity')::integer,(p_bonus->>'base_weight')::double precision,(p_bonus->>'value_per_gram')::double precision,(p_bonus->>'rolled_weight_multiplier')::double precision,(p_bonus->>'rolled_weight')::double precision,(p_bonus->>'final_weight')::double precision,p_bonus->>'mutation_id',array(select jsonb_array_elements_text(p_bonus->'mutation_ids')),(p_bonus->>'mutation_multiplier')::double precision,p_bonus->'mutation_multipliers',(p_bonus->>'mutation_chance_multiplier')::double precision,(p_bonus->>'value')::double precision,(p_bonus->>'luck_at_roll')::double precision,false) returning * into b;
  end if;
 end if;
 return jsonb_build_object('bonus',case when b.id is not null then to_jsonb(b) else null end,'loot',p_loot,'state',p_state);
end $$;
revoke all on function public.commit_equipment_roll(uuid,uuid,bigint,jsonb,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.commit_equipment_roll(uuid,uuid,bigint,jsonb,text,jsonb,integer) to service_role;

CREATE OR REPLACE FUNCTION public.craft_equipment_recipe(p_recipe_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_recipe jsonb; v_reward jsonb; v_bonus jsonb;
  v_money_cost double precision; v_progress jsonb; v_req jsonb; v_idx integer;
  v_key text; v_target numeric; v_have numeric; v_required_equipment text;
  v_new_money double precision; v_total_rolls bigint;
  v_potion record; v_remaining integer; v_take integer;
  v_best_100k double precision; v_best_1m double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(cp.progress->'_equipment_recipe',r.recipe) into v_recipe from public.game_recipes r left join public.crafting_progress cp on cp.recipe_id=r.id and cp.player_id=v_uid where r.id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  v_reward:=v_recipe->'reward';
  if v_reward is null or v_reward->>'type'='consumable' then raise exception 'recipe_not_found'; end if;
  v_bonus:=coalesce(v_reward->'bonus','{}'::jsonb);
  v_money_cost:=coalesce((v_recipe->>'moneyCost')::double precision,0);

  select money,total_rolls,best_rare_natural_weight_100k,best_rare_natural_weight_1m
  into v_new_money,v_total_rolls,v_best_100k,v_best_1m
  from public.players where id=v_uid for update;
  if not found then raise exception 'player_not_found'; end if;

  select progress into v_progress from public.crafting_progress
  where player_id=v_uid and recipe_id=p_recipe_id;
  v_progress:=coalesce(v_progress,'{}'::jsonb);

  for v_req,v_idx in
    select value,(ordinality-1)::integer
    from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) with ordinality
  loop
    if v_req->>'type'='equipment' then
      if not exists(select 1 from public.player_equipment where player_id=v_uid and (equipment_id=v_req->>'equipmentId' or (p_recipe_id='plastic-shopping-bag' and v_req->>'equipmentId'='omnidimensional-vault' and equipment_id='dimensional-vault')))
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='equipment-min-tier' then
      if not exists(select 1 from public.player_equipment where player_id=v_uid and category=v_req->>'category' and tier>=coalesce((v_req->>'tier')::integer,1)) then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='special-discoveries' then
      if public.equipment_special_discoveries(v_uid,v_req->>'classification')<(v_req->>'amount')::integer then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='potion-tier' then
      v_remaining:=(v_req->>'amount')::integer;
      for v_potion in select pc.consumable_id,pc.quantity from public.player_consumables pc
        join public.game_consumables c on c.id=pc.consumable_id
        where pc.player_id=v_uid and c.tier=(v_req->>'tier')::integer and c.duration_seconds>1
          and c.family in ('luck','rollSpeed','weightLuck','weightMultiplier')
        order by pc.consumable_id for update of pc loop
        v_take:=least(v_remaining,v_potion.quantity);
        update public.player_consumables set quantity=quantity-v_take,updated_at=now() where player_id=v_uid and consumable_id=v_potion.consumable_id;
        v_remaining:=v_remaining-v_take;
        exit when v_remaining=0;
      end loop;
      if v_remaining>0 then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='consumable' then
      update public.player_consumables set quantity=quantity-(v_req->>'amount')::integer,updated_at=now()
      where player_id=v_uid and consumable_id=v_req->>'consumableId' and quantity>=(v_req->>'amount')::integer;
      if not found then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='lifetime-rolls' then
      if coalesce(v_total_rolls,0)<coalesce((v_req->>'rolls')::bigint,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='roll-history-condition' then
      v_have:=case when coalesce((v_req->>'minimumRarity')::numeric,0)>=1000000
        then coalesce(v_best_1m,0) else coalesce(v_best_100k,0) end;
      if v_have<coalesce((v_req->>'minimumWeightMultiplier')::numeric,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='rarity-points' then
      v_key:=coalesce(v_req->>'id','rarity-points-'||v_idx::text);
      if coalesce((v_progress->v_key->>'points')::numeric,0)<coalesce((v_req->>'points')::numeric,0)
        or jsonb_array_length(coalesce(v_progress->v_key->'gemTypes','[]'::jsonb))<coalesce((v_req->>'minimumUniqueGemTypes')::integer,0)
      then raise exception 'requirements_not_met'; end if;
    elsif v_req->>'type'='gem-range' then
      v_key:=coalesce(v_req->>'id','gem-range-'||v_idx::text);
      if exists(select 1 from jsonb_array_elements_text(coalesce(v_req->'gems','[]'::jsonb)) gem
        where coalesce((v_progress->v_key->>gem.value)::numeric,0)<coalesce((v_req->>'amountEach')::numeric,1))
      then raise exception 'requirements_not_met'; end if;
    else
      v_key:=coalesce(v_req->>'id',case
        when v_req->>'type'='gem-count' then v_req->>'gem'
        when v_req->>'type'='consumable' then coalesce(v_req->>'consumableId','consumable-'||v_idx::text)
        else (v_req->>'type')||'-'||v_idx::text end);
      v_target:=case v_req->>'type'
        when 'gem-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-total-weight' then coalesce((v_req->>'totalWeight')::numeric,0)
        when 'specimen-value-total' then coalesce((v_req->>'totalValue')::numeric,0)
        else coalesce((v_req->>'amount')::numeric,1) end;
      v_have:=coalesce((v_progress->>v_key)::numeric,0);
      if v_have<v_target then raise exception 'requirements_not_met'; end if;
    end if;
  end loop;

  if v_new_money<v_money_cost then raise exception 'not_enough_money'; end if;
  select r->>'equipmentId' into v_required_equipment
  from jsonb_array_elements(coalesce(v_recipe->'requirements','[]'::jsonb)) r
  where r->>'type'='equipment' limit 1;
  -- Linear secondaries consume their preceding tier. Horizontal builds and ownership gates do not.
  if v_required_equipment is not null and not coalesce((v_recipe->>'includedSpecimens')::boolean,false)
     and not coalesce((v_recipe->>'horizontal')::boolean,false)
     and not exists(select 1 from jsonb_array_elements(v_recipe->'requirements') q where q->>'type'='equipment' and q->>'consume'='false') then
    delete from public.player_equipment where player_id=v_uid and equipment_id=v_required_equipment;
  end if;
  update public.player_equipment set equipped=false where player_id=v_uid and category=v_reward->>'category' and equipped;

  insert into public.player_equipment(
    player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,
    weight_luck_bonus,weight_multiplier_bonus,equipped
  ) values(
    v_uid,v_reward->>'id',v_reward->>'category',coalesce((v_reward->>'tier')::integer,1),
    v_reward->>'name',coalesce((v_bonus->>'luck')::double precision,0),
    coalesce((v_bonus->>'rollSpeed')::double precision,0),
    coalesce((v_bonus->>'weightLuck')::double precision,0),
    coalesce((v_bonus->>'weightMultiplier')::double precision,0),true
  ) on conflict(player_id,equipment_id) do update set
    category=excluded.category,tier=excluded.tier,name=excluded.name,
    luck_bonus=excluded.luck_bonus,roll_speed_bonus=excluded.roll_speed_bonus,
    weight_luck_bonus=excluded.weight_luck_bonus,
    weight_multiplier_bonus=excluded.weight_multiplier_bonus,equipped=true;

  update public.players set money=money-v_money_cost where id=v_uid returning money into v_new_money;
  delete from public.crafting_progress where player_id=v_uid and recipe_id=p_recipe_id;
  update public.player_crafting set
    active_auto_craft=case when active_auto_craft=p_recipe_id then null else active_auto_craft end,
    updated_at=now() where player_id=v_uid;
  return jsonb_build_object('money',v_new_money,'equipmentId',v_reward->>'id');
end;
$function$

;

CREATE OR REPLACE FUNCTION public.masterwork_equipment_beta(p_equipment_row_id bigint, p_action text, p_choice text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_item public.player_equipment%rowtype;
  v_pool text[];
  v_candidates text[];
  v_next integer;
  v_money_mult numeric;
  v_relic_mult numeric;
  v_ancient_mult numeric;
  v_money numeric := 0;
  v_enchant integer := 0;
  v_ancient integer := 0;
  v_base_reroll numeric;
  v_base_relic integer;
  v_new_passive text;
  v_choices text[];
  v_count integer;
  v_balance double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_action = 'convert_relics' then
    v_money := 2000000;
    v_enchant := 12;
  else
    select * into v_item from public.player_equipment
    where id = p_equipment_row_id and player_id = v_uid for update;
    if not found then raise exception 'equipment_not_found'; end if;
    if v_item.category<>'pickaxe' and v_item.equipment_id<>'plastic-shopping-bag' then raise exception 'secondary_masterwork_retired'; end if;
    if v_item.tier < 10 then raise exception 'masterwork_tier_locked'; end if;

    v_pool := case v_item.category
      when 'pickaxe' then array['deep_survey','mutation_resonance','careful_extraction','steady_hand']
      when 'lantern' then array['overclocked_flame','potion_afterglow','focused_beam','flashpoint']
      when 'boots' then array['heavy_step','sure_footing','fortune_walker','trailblazer']
      else null end;
    if v_pool is null then raise exception 'invalid_equipment'; end if;

    v_money_mult := case
      when v_item.tier >= 17 then 3 when v_item.tier = 16 then 2.5 when v_item.tier = 15 then 2.2 when v_item.tier = 14 then 1.9 when v_item.tier >= 13 then 1.65
      when v_item.tier = 12 then 1.4
      when v_item.tier = 11 then 1.2
      else 1
    end;
    v_relic_mult := case when v_item.tier >= 17 then 2.25 when v_item.tier = 16 then 2 when v_item.tier = 15 then 1.8 when v_item.tier = 14 then 1.65 when v_item.tier >= 13 then 1.5 when v_item.tier = 12 then 1.3 when v_item.tier = 11 then 1.15 else 1 end;
    v_ancient_mult := case when v_item.tier >= 17 then 2 when v_item.tier = 16 then 1.85 when v_item.tier = 15 then 1.7 when v_item.tier = 14 then 1.55 when v_item.tier >= 13 then 1.4 when v_item.tier = 12 then 1.2 else 1 end;

    if p_action = 'upgrade' then
      if v_item.masterwork_level >= 5 then raise exception 'masterwork_maxed'; end if;
      v_next := v_item.masterwork_level + 1;
      v_money := (array[1000000,2500000,6000000,15000000,25000000])[v_next] * v_money_mult;
      v_enchant := ceil((array[2,4,6,8,10])[v_next] * v_relic_mult);
      v_ancient := ceil((array[0,0,1,1,3])[v_next] * v_ancient_mult);
      if v_next = 3 then
        v_new_passive := v_pool[1 + floor(random() * array_length(v_pool, 1))::integer];
      end if;
    elsif p_action in ('reroll','insight','imprint') then
      if v_item.masterwork_level < 3 or v_item.masterwork_choices is not null then raise exception 'passive_unavailable'; end if;
      v_base_reroll := (array[2000000,3500000,6000000,10000000,15000000])[least(v_item.masterwork_rerolls + 1, 5)];
      v_base_relic := (array[2,3,4,5,6])[least(v_item.masterwork_rerolls + 1, 5)];
      v_money := v_base_reroll * least(2, v_money_mult) * case when p_action = 'imprint' then 5 else 1 end;
      v_enchant := ceil(v_base_relic * v_relic_mult);
      v_ancient := case when p_action = 'insight' then 1 when p_action = 'imprint' then 3 else 0 end;
      select array_agg(x order by random()) into v_candidates from unnest(v_pool) x where x <> v_item.masterwork_passive;
      if p_action = 'reroll' then v_new_passive := v_candidates[1];
      elsif p_action = 'insight' then v_choices := v_candidates[1:3];
      else
        if p_choice is null or not (p_choice = any(v_pool)) or p_choice = v_item.masterwork_passive then raise exception 'invalid_passive'; end if;
        v_new_passive := p_choice;
      end if;
    elsif p_action = 'choose' then
      if v_item.masterwork_choices is null or not (p_choice = any(v_item.masterwork_choices)) then raise exception 'invalid_passive'; end if;
      update public.player_equipment set masterwork_passive = p_choice, masterwork_choices = null where id = v_item.id;
      return jsonb_build_object('equipment', (select to_jsonb(e) from public.player_equipment e where e.id = v_item.id));
    elsif p_action = 'attune' then
      if v_item.category <> 'pickaxe' or v_item.masterwork_level < 4 then raise exception 'attunement_locked'; end if;
      if p_choice is null or p_choice not in ('amplified','resonant','specialized') or p_choice is not distinct from v_item.masterwork_attunement then raise exception 'invalid_attunement'; end if;
      v_money := 10000000 * v_money_mult;
      v_enchant := ceil(5 * v_relic_mult);
      v_ancient := ceil(1 * v_ancient_mult);
    else raise exception 'invalid_action'; end if;
  end if;

  update public.players set money = money - v_money where id = v_uid and money >= v_money returning money into v_balance;
  if not found then raise exception 'not_enough_money'; end if;

  if v_enchant > 0 then
    with spent as (select id from public.inventory_gems where player_id=v_uid and gem_name='Enchant Relic' and not locked order by id limit v_enchant for update),
    deleted as (delete from public.inventory_gems where id in (select id from spent) returning id)
    select count(*) into v_count from deleted;
    if v_count <> v_enchant then raise exception 'not_enough_enchant_relics'; end if;
  end if;
  if v_ancient > 0 then
    with spent as (select id from public.inventory_gems where player_id=v_uid and gem_name='Ancient Relic' and not locked order by id limit v_ancient for update),
    deleted as (delete from public.inventory_gems where id in (select id from spent) returning id)
    select count(*) into v_count from deleted;
    if v_count <> v_ancient then raise exception 'not_enough_ancient_relics'; end if;
  end if;

  if p_action = 'convert_relics' then
    insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,rolled_weight_multiplier,rolled_weight,final_weight,value,locked)
    values(v_uid,'Ancient Relic',1500,0,0,1,0,0,0,false);
    return jsonb_build_object('money',v_balance,'converted',true);
  elsif p_action = 'upgrade' then
    update public.player_equipment set masterwork_level=v_next,
      masterwork_passive=coalesce(v_new_passive,masterwork_passive),
      masterwork_passive_rank=case when v_next=3 then 1 when v_next>=4 then 2 else masterwork_passive_rank end,
      masterwork_perfected_at=case when v_next=5 then now() else masterwork_perfected_at end
    where id=v_item.id;
  elsif p_action in ('reroll','imprint') then
    update public.player_equipment set masterwork_passive=v_new_passive, masterwork_rerolls=masterwork_rerolls+1 where id=v_item.id;
  elsif p_action='insight' then
    update public.player_equipment set masterwork_choices=v_choices, masterwork_rerolls=masterwork_rerolls+1 where id=v_item.id;
  elsif p_action='attune' then
    update public.player_equipment set masterwork_attunement=p_choice where id=v_item.id;
  end if;

  return jsonb_build_object('money',v_balance,'spentMoney',v_money,'spentEnchantRelics',v_enchant,'spentAncientRelics',v_ancient,
    'equipment',(select to_jsonb(e) from public.player_equipment e where e.id=v_item.id));
end;
$function$

;

create or replace function public.plan_equipment_material(p_recipe jsonb, p_progress jsonb, p_gem jsonb, p_index integer default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  v_progress jsonb:=coalesce(p_progress,'{}'); v_req jsonb; v_slot jsonb; v_other jsonb;
  v_i integer; v_bulk_i integer; v_slot_i integer; v_key text; v_bulk_key text;
  v_rarity numeric:=(p_gem->>'rarity')::numeric;
  v_weight numeric:=case when (p_gem->>'base_weight')::numeric>0 then (p_gem->>'final_weight')::numeric/(p_gem->>'base_weight')::numeric else null end;
  v_needed numeric; v_space numeric; v_special boolean:=false;
begin
  if v_rarity is null then return null; end if;
  if p_recipe->>'equipmentOverhaul'='true' and not coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
    for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
      where value->>'type' in ('gem-count','specimen-condition')
      order by case when value->>'type'='specimen-condition' then 0 else 1 end,
        coalesce((value->>'minimumWeightMultiplier')::numeric,0) desc,
        coalesce((value->>'maximumWeightMultiplier')::numeric,1e100),ordinality loop
      if p_index is not null and p_index<>v_i then continue; end if;
      v_key:=coalesce(v_req->>'id',v_req->>'gem');
      if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue; end if;
      if (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
         or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
         or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
         or (v_req ? 'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric)) then continue; end if;
      return jsonb_build_object('progress',jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1)),
        'requirementIndex',v_i,'conservationEligible',v_req->>'type'='gem-count' and not(v_req ?| array['minimumWeightMultiplier','maximumWeightMultiplier']));
    end loop;
    return null;
  end if;

  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) and not coalesce((p_gem->>'base_weight')::numeric>0,false) then return null; end if;
  if p_index is not null then
    v_req:=p_recipe->'requirements'->p_index;
    if v_req is null or v_req->>'type' not in ('gem-count','specimen-condition') then return null; end if;
    if v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
       or (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
       or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric)) then return null; end if;
  end if;
  for v_req,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality loop
    if v_req->>'type'<>'gem-count' then continue; end if;
    if not coalesce((p_recipe->>'includedSpecimens')::boolean,false) and p_index is distinct from v_i then continue; end if;
    v_key:=coalesce(v_req->>'id',v_req->>'gem');
    if v_key is null or coalesce((v_progress->>v_key)::numeric,0)>=coalesce((v_req->>'amount')::numeric,1) then continue; end if;
    if (v_req ? 'gem' and v_req->>'gem'<>p_gem->>'gem_name')
      or v_rarity<coalesce((v_req->>'minimumRarity')::numeric,0) or v_rarity>coalesce((v_req->>'maximumRarity')::numeric,1e100)
      or (v_req ? 'minimumWeightMultiplier' and (v_weight is null or v_weight<(v_req->>'minimumWeightMultiplier')::numeric))
      or (v_req ? 'maximumWeightMultiplier' and (v_weight is null or v_weight>(v_req->>'maximumWeightMultiplier')::numeric)) then continue; end if;
    v_bulk_i:=v_i; v_bulk_key:=v_key;
    v_special:=v_req ?| array['minimumWeightMultiplier','maximumWeightMultiplier','mutation','mutationId','serial','serialNumber'];
    exit;
  end loop;
  if v_bulk_i is null then return null; end if;
  v_progress:=jsonb_set(v_progress,array[v_bulk_key],to_jsonb(coalesce((v_progress->>v_bulk_key)::numeric,0)+1));
  if coalesce((p_recipe->>'includedSpecimens')::boolean,false) then
    for v_slot,v_i in select value,(ordinality-1)::integer from jsonb_array_elements(p_recipe->'requirements') with ordinality
      where value->>'includedInBulk'='true'
        and (p_recipe->>'equipmentOverhaul' is distinct from 'true' or p_index is null
          or p_recipe->'requirements'->p_index->>'includedInBulk' is distinct from 'true' or ordinality-1=p_index)
      order by case when p_recipe->>'equipmentOverhaul'='true' then (value->>'minimumWeightMultiplier')::numeric else (value->>'minimumRarity')::numeric end desc,
        (value->>'minimumRarity')::numeric desc,(value->>'minimumWeightMultiplier')::numeric desc loop
      v_key:=v_slot->>'id';
      if coalesce((v_progress->>v_key)::numeric,0)<(v_slot->>'amount')::numeric
         and v_rarity>=(v_slot->>'minimumRarity')::numeric and v_weight>=(v_slot->>'minimumWeightMultiplier')::numeric then
        v_slot_i:=v_i;
        v_progress:=jsonb_set(v_progress,array[v_key],to_jsonb(coalesce((v_progress->>v_key)::numeric,0)+1));
        exit;
      end if;
    end loop;
    -- Clicking a specimen slot must actually advance that slot.
    if p_index is not null and p_recipe->'requirements'->p_index->>'includedInBulk'='true' and p_index is distinct from v_slot_i then return null; end if;
    -- Reserve enough unfilled bulk slots for every remaining specimen threshold.
    for v_slot in select value from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' loop
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_needed
        from jsonb_array_elements(p_recipe->'requirements') where value->>'includedInBulk'='true' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      select coalesce(sum(greatest(0,(value->>'amount')::numeric-coalesce((v_progress->>(value->>'id'))::numeric,0))),0) into v_space
        from jsonb_array_elements(p_recipe->'requirements') where value->>'type'='gem-count' and (value->>'minimumRarity')::numeric>=(v_slot->>'minimumRarity')::numeric;
      if v_needed>v_space then return null; end if;
    end loop;
  end if;
  return jsonb_build_object('progress',v_progress,'requirementIndex',coalesce(v_slot_i,v_bulk_i),'conservationEligible',v_slot_i is null and not v_special);
end;
$$;
revoke all on function public.plan_equipment_material(jsonb,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.plan_equipment_material(jsonb,jsonb,jsonb,integer) to service_role;

-- Service-only: generated rolls are trusted only from the authenticated Edge Function.
-- Manual deposits select and lock real inventory rows on the server, with no page cap.

create or replace function public.deposit_equipment_material(p_player_id uuid,p_recipe_id text,p_specimen jsonb default null,p_requirement_index integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_recipe jsonb; v_progress jsonb; v_plan jsonb; v_gem public.inventory_gems%rowtype;
  v_preserved boolean:=false; v_chance numeric:=0; v_manual boolean:=p_specimen is null;
begin
  perform 1 from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  select recipe into v_recipe from public.game_recipes where id=p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;
  insert into public.crafting_progress(player_id,recipe_id,progress) values(p_player_id,p_recipe_id,'{}') on conflict do nothing;
  select progress into v_progress from public.crafting_progress where player_id=p_player_id and recipe_id=p_recipe_id for update;
  v_recipe:=coalesce(v_progress->'_equipment_recipe',v_recipe);
  if v_manual then
    if p_requirement_index is null then raise exception 'requirement_required'; end if;
    for v_gem in select * from public.inventory_gems where player_id=p_player_id and not coalesce(locked,false)
      and (not coalesce((v_recipe->>'includedSpecimens')::boolean,false) or base_weight>0)
      and rarity>=coalesce((v_recipe->'requirements'->p_requirement_index->>'minimumRarity')::numeric,0)
      and rarity<=coalesce((v_recipe->'requirements'->p_requirement_index->>'maximumRarity')::numeric,1e100)
      and (not (v_recipe->'requirements'->p_requirement_index ? 'gem') or gem_name=v_recipe->'requirements'->p_requirement_index->>'gem')
      and (not (v_recipe->'requirements'->p_requirement_index ? 'minimumWeightMultiplier') or final_weight/nullif(base_weight,0) >= (v_recipe->'requirements'->p_requirement_index->>'minimumWeightMultiplier')::numeric)
      order by final_weight,id for update loop
      v_plan:=public.plan_equipment_material(v_recipe,v_progress,to_jsonb(v_gem),p_requirement_index);
      if v_plan is not null then exit; end if;
    end loop;
  else
    v_plan:=public.plan_equipment_material(v_recipe,v_progress,p_specimen,p_requirement_index);
  end if;
  if v_plan is null then return jsonb_build_object('deposited',false,'progress',v_progress); end if;
  if (v_plan->>'conservationEligible')::boolean then
    select coalesce(max(case equipment_id when 'plastic-shopping-bag' then 0.125 else 0 end),0)
      into v_chance from public.player_equipment where player_id=p_player_id and equipped and category='bag';
    v_preserved:=random()<v_chance;
  end if;
  update public.crafting_progress set progress=v_plan->'progress',updated_at=now() where player_id=p_player_id and recipe_id=p_recipe_id;
  if v_manual and not v_preserved then delete from public.inventory_gems where id=v_gem.id and player_id=p_player_id; end if;
  return v_plan || jsonb_build_object('deposited',true,'preserved',v_preserved,'consumedSpecimen',case when v_manual and not v_preserved then jsonb_build_object('id',v_gem.id,'gemName',v_gem.gem_name,'weight',v_gem.final_weight,'value',v_gem.value) else null end);
end;
$$;

create or replace function public.claim_equipment_roll(p_player_id uuid,p_cooldown_ms numeric,p_equipment_state jsonb,p_equipment_ids bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; ids bigint[]; begin
 select equipment_state into s from public.players where id=p_player_id for update;
 if not found then return '{"status":"not_found"}'; end if;
 select coalesce(array_agg(id order by id),'{}'::bigint[]) into ids from public.player_equipment where player_id=p_player_id and equipped;
 if s is distinct from p_equipment_state or ids is distinct from (select coalesce(array_agg(x order by x),'{}'::bigint[]) from unnest(p_equipment_ids) x) then
  return '{"status":"state_changed"}';
 end if;
 return public.claim_server_roll(p_player_id,p_cooldown_ms);
end $$;
revoke all on function public.claim_equipment_roll(uuid,numeric,jsonb,bigint[]) from public,anon,authenticated;
grant execute on function public.claim_equipment_roll(uuid,numeric,jsonb,bigint[]) to service_role;

create or replace function public.get_equipment_overhaul_progress() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'not_authenticated'; end if;
 return jsonb_build_object('daily_window',public.equipment_special_discoveries(uid,'daily_window'),
 'global_event',public.equipment_special_discoveries(uid,'global_event'),'special',public.equipment_special_discoveries(uid,'special'),
 'genuineRolls',(select equipment_genuine_rolls from public.players where id=uid),'state',(select equipment_state from public.players where id=uid));
end $$;
revoke all on function public.get_equipment_overhaul_progress() from public,anon;
grant execute on function public.get_equipment_overhaul_progress() to authenticated;

create or replace function public.set_overhaul_equipment_equipped(p_equipment_row_id bigint,p_equipped boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.player_equipment%rowtype; expiry timestamptz; begin
 if uid is null then raise exception 'not_authenticated'; end if;
 select roll_lease_expires_at into expiry from public.players where id=uid for update;
 if expiry>clock_timestamp() then raise exception 'roll_in_progress'; end if;
 select * into e from public.player_equipment where id=p_equipment_row_id and player_id=uid for update;
 if not found then raise exception 'equipment_not_found'; end if;
 if e.equipped=p_equipped then return jsonb_build_object('success',true,'equipmentRowId',e.id,'equipped',p_equipped); end if;
 if p_equipped then update public.player_equipment set equipped=false where player_id=uid and category=e.category and equipped; end if;
 update public.player_equipment set equipped=p_equipped where id=e.id;
 return jsonb_build_object('success',true,'equipmentRowId',e.id,'equipped',p_equipped);
end $$;
revoke all on function public.set_overhaul_equipment_equipped(bigint,boolean) from public,anon;
grant execute on function public.set_overhaul_equipment_equipped(bigint,boolean) to authenticated;

-- Fresh accounts cannot seed backend-owned specialist progress through the INSERT policy.
create or replace function public.initialize_equipment_state() returns trigger language plpgsql set search_path='' as $$
begin new.equipment_state:='{}';new.equipment_state_roll:=0;return new;end $$;
drop trigger if exists initialize_equipment_state on public.players;
create trigger initialize_equipment_state before insert on public.players for each row execute function public.initialize_equipment_state();

-- Discoveries are used as crafting gates: only the roll service may record them.
do $$ begin
 if to_regprocedure('public.record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric)') is not null then
  revoke all on function public.record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric) from public,anon,authenticated;
  grant execute on function public.record_gem_mutation_combination(uuid,text,text,text[],jsonb,numeric) to service_role;
 end if;
end $$;

-- Stats UI consumes the same backend artifact implementations as the roll service.
create or replace function public.get_equipment_roll_preview() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'not_authenticated'; end if;
 return jsonb_build_object('crystal',public.crystal_player_effects(uid),
  'expedition',public.player_expedition_artifact_effects(uid),
  'world',public.get_active_global_event(),
  'discoveries',(select count(distinct gem_name) from public.player_gem_mutation_combinations where player_id=uid));
end $$;
revoke all on function public.get_equipment_roll_preview() from public,anon;
grant execute on function public.get_equipment_roll_preview() to authenticated;

create or replace function public.get_my_equipment_recipe(p_recipe_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select coalesce(p.progress->'_equipment_recipe',g.recipe) into r from public.game_recipes g left join public.crafting_progress p on p.recipe_id=g.id and p.player_id=auth.uid() where g.id=p_recipe_id;
 return r;
end $$;
revoke all on function public.get_my_equipment_recipe(text) from public,anon;
grant execute on function public.get_my_equipment_recipe(text) to authenticated;
revoke all on function public.equipment_special_discoveries(uuid,text) from public,anon,authenticated;
grant execute on function public.equipment_special_discoveries(uuid,text) to service_role;
revoke all on function public.normalize_overhauled_equipment() from public,anon,authenticated;
revoke all on function public.initialize_equipment_state() from public,anon,authenticated;

commit;
