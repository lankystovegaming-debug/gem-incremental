-- Late-game Boots and Bags: durable passive state, historical roll gates,
-- original T13 recognition, and server-authoritative recipe definitions.
alter table public.players
  add column if not exists gravitational_surge_progress integer not null default 0,
  add column if not exists gravitational_surge_ready boolean not null default false,
  add column if not exists bag_compression_progress integer not null default 0,
  add column if not exists best_rare_natural_weight_100k double precision not null default 0,
  add column if not exists best_rare_natural_weight_1m double precision not null default 0;

alter table public.players drop constraint if exists players_gravitational_surge_progress_range;
alter table public.players add constraint players_gravitational_surge_progress_range
  check (gravitational_surge_progress between 0 and 99);
alter table public.players drop constraint if exists players_bag_compression_progress_range;
alter table public.players add constraint players_bag_compression_progress_range
  check (bag_compression_progress between 0 and 49);

-- Backfill the strongest still-owned natural specimens. Future real rolls are
-- recorded directly by the roll function, so selling/depositing cannot erase them.
update public.players p set
  best_rare_natural_weight_100k = greatest(p.best_rare_natural_weight_100k, coalesce((
    select max(g.rolled_weight_multiplier) from public.inventory_gems g
    where g.player_id = p.id and g.rarity >= 100000
  ), 0)),
  best_rare_natural_weight_1m = greatest(p.best_rare_natural_weight_1m, coalesce((
    select max(g.rolled_weight_multiplier) from public.inventory_gems g
    where g.player_id = p.id and g.rarity >= 1000000
  ), 0));

alter table public.player_equipment
  add column if not exists original_t13_legacy boolean not null default false;

create or replace function public.preserve_original_bottomless_singularity_legacy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.equipment_id = 'bottomless-singularity' then
    new.original_t13_legacy := true;
  elsif tg_op = 'UPDATE' then
    new.original_t13_legacy := old.original_t13_legacy;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_original_bottomless_singularity_legacy on public.player_equipment;
create trigger preserve_original_bottomless_singularity_legacy
before insert or update on public.player_equipment
for each row execute function public.preserve_original_bottomless_singularity_legacy();

insert into public.game_recipes(id, recipe) values
('event-horizon-boots', '{"id":"event-horizon-boots","name":"Event Horizon Boots","category":"boots","requirements":[{"type":"equipment","equipmentId":"singularity-striders"},{"type":"gem-count","gem":"Aquamarine","amount":500},{"type":"gem-count","gem":"Tourmaline","amount":300},{"type":"gem-count","gem":"Opal","amount":200},{"type":"gem-count","gem":"Ringwoodite","amount":1},{"type":"lifetime-rolls","rolls":30000}],"moneyCost":15000000,"reward":{"id":"event-horizon-boots","name":"Event Horizon Boots","category":"boots","tier":11,"bonus":{"weightLuck":6.5}}}'::jsonb),
('gravitational-boots', '{"id":"gravitational-boots","name":"Gravitational Boots","category":"boots","requirements":[{"type":"equipment","equipmentId":"event-horizon-boots"},{"type":"gem-count","gem":"Opal","amount":400},{"type":"gem-count","gem":"Zircon","amount":250},{"type":"gem-count","gem":"Moonstone","amount":150},{"type":"gem-count","gem":"Pallasite Crystal","amount":1},{"type":"lifetime-rolls","rolls":50000},{"id":"gravitational-heavy-rare","type":"roll-history-condition","label":"Rolled a 1/100,000+ base-rarity specimen at ≥5× natural weight","minimumRarity":100000,"minimumWeightMultiplier":5}],"moneyCost":40000000,"reward":{"id":"gravitational-boots","name":"Gravitational Boots","category":"boots","tier":12,"bonus":{"weightLuck":7.25}}}'::jsonb),
('riftwoven-bag', '{"id":"riftwoven-bag","name":"Riftwoven Bag","category":"bag","requirements":[{"type":"equipment","equipmentId":"dimensional-bag"},{"type":"gem-count","gem":"Sapphire","amount":250},{"type":"gem-count","gem":"Ruby","amount":175},{"type":"gem-count","gem":"Emerald","amount":125},{"type":"lifetime-rolls","rolls":20000}],"moneyCost":10000000,"reward":{"id":"riftwoven-bag","name":"Riftwoven Bag","category":"bag","tier":9,"bonus":{"weightMultiplier":0.75}}}'::jsonb),
('vault-of-plenty', '{"id":"vault-of-plenty","name":"Vault of Plenty","category":"bag","requirements":[{"type":"equipment","equipmentId":"riftwoven-bag"},{"type":"gem-count","gem":"Tanzanite","amount":150},{"type":"gem-count","gem":"Alexandrite","amount":100},{"type":"gem-count","gem":"Benitoite","amount":75},{"type":"gem-count","gem":"Ringwoodite","amount":1},{"type":"lifetime-rolls","rolls":35000}],"moneyCost":35000000,"reward":{"id":"vault-of-plenty","name":"Vault of Plenty","category":"bag","tier":10,"bonus":{"weightMultiplier":0.85}}}'::jsonb),
('dimensional-vault', '{"id":"dimensional-vault","name":"Dimensional Vault","category":"bag","requirements":[{"type":"equipment","equipmentId":"vault-of-plenty"},{"type":"gem-count","gem":"Black Opal","amount":100},{"type":"gem-count","gem":"Grandidierite","amount":75},{"type":"gem-count","gem":"Taaffeite","amount":50},{"type":"gem-count","gem":"Pallasite Crystal","amount":1},{"type":"lifetime-rolls","rolls":50000}],"moneyCost":90000000,"reward":{"id":"dimensional-vault","name":"Dimensional Vault","category":"bag","tier":11,"bonus":{"weightMultiplier":0.95}}}'::jsonb),
('singularity-vault', '{"id":"singularity-vault","name":"Singularity Vault","category":"bag","requirements":[{"type":"equipment","equipmentId":"dimensional-vault"},{"type":"gem-count","gem":"Musgravite","amount":75},{"type":"gem-count","gem":"Painite","amount":50},{"type":"gem-count","gem":"Unlucky Gem","amount":1},{"type":"gem-count","gem":"Antimatter Crystal","amount":1},{"type":"lifetime-rolls","rolls":75000},{"id":"singularity-vault-heavy-rare","type":"roll-history-condition","label":"Rolled a 1/1,000,000+ base-rarity specimen at ≥6× natural weight","minimumRarity":1000000,"minimumWeightMultiplier":6}],"moneyCost":200000000,"reward":{"id":"singularity-vault","name":"Singularity Vault","category":"bag","tier":12,"bonus":{"weightMultiplier":1.05}}}'::jsonb),
('bottomless-singularity', '{"id":"bottomless-singularity","name":"Bottomless Singularity","category":"bag","description":"At some point, calling this a bag stopped making sense.","requirements":[{"type":"equipment","equipmentId":"singularity-vault"},{"type":"gem-count","gem":"Sapphire","amount":10000},{"type":"gem-count","gem":"Diamond","amount":5000},{"type":"gem-count","gem":"Alexandrite","amount":2500},{"type":"gem-count","gem":"Black Opal","amount":1000},{"type":"gem-count","gem":"Grandidierite","amount":750},{"type":"gem-count","gem":"Taaffeite","amount":500},{"type":"gem-count","gem":"Musgravite","amount":350},{"type":"gem-count","gem":"Painite","amount":250},{"type":"gem-count","gem":"Ringwoodite","amount":10},{"type":"gem-count","gem":"Pallasite Crystal","amount":7},{"type":"gem-count","gem":"Antimatter Crystal","amount":5},{"type":"gem-count","gem":"Unlucky Gem","amount":10},{"type":"lifetime-rolls","rolls":400000},{"id":"bottomless-singularity-heavy-rare","type":"roll-history-condition","label":"Rolled a 1/1,000,000+ base-rarity specimen at ≥8× natural weight","minimumRarity":1000000,"minimumWeightMultiplier":8}],"moneyCost":750000000,"reward":{"id":"bottomless-singularity","name":"Bottomless Singularity","category":"bag","tier":13,"bonus":{"weightMultiplier":2}}}'::jsonb)
on conflict (id) do update set recipe = excluded.recipe;
