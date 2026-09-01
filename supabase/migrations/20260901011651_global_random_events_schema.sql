-- Global random mining events: durable catalog, occurrence state, public
-- snapshots, roll provenance, and activity counters. This migration is safe to
-- deploy before the scheduler and Edge Function: no event starts until the cron
-- migration is applied and the singleton scheduler is enabled.

create table if not exists public.global_event_definitions (
  event_key text primary key,
  name text not null,
  icon text not null default '✦',
  tier text not null check (tier in ('common', 'uncommon', 'rare', 'legendary')),
  duration_seconds integer not null check (duration_seconds between 60 and 3600),
  selection_weight numeric not null default 1 check (selection_weight > 0),
  description text not null,
  config jsonb not null default '{}'::jsonb,
  definition_version integer not null default 1 check (definition_version > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_key text not null references public.global_event_definitions(event_key),
  definition_version integer not null,
  tier text not null check (tier in ('common', 'uncommon', 'rare', 'legendary')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  config jsonb not null default '{}'::jsonb,
  mass bigint not null default 0 check (mass >= 0),
  mass_target bigint,
  collapsed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (mass_target is null or mass_target > 0)
);

create unique index if not exists global_event_one_active_idx
  on public.global_event_occurrences ((status)) where status = 'active';
create index if not exists global_event_occurrence_window_idx
  on public.global_event_occurrences (status, starts_at, ends_at);
create index if not exists global_event_occurrence_history_idx
  on public.global_event_occurrences (event_key, starts_at desc);

create table if not exists public.global_event_runtime (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  active_occurrence_id uuid references public.global_event_occurrences(id) on delete set null,
  next_start_at timestamptz,
  recent_event_keys text[] not null default '{}'::text[],
  schedule_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.global_event_runtime(singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

create table if not exists public.global_roll_activity_minute (
  bucket timestamptz primary key,
  roll_count bigint not null default 0 check (roll_count >= 0)
);

alter table public.global_event_definitions enable row level security;
alter table public.global_event_occurrences enable row level security;
alter table public.global_event_runtime enable row level security;
alter table public.global_roll_activity_minute enable row level security;

revoke all on public.global_event_definitions from public, anon, authenticated;
revoke all on public.global_event_occurrences from public, anon, authenticated;
revoke all on public.global_event_runtime from public, anon, authenticated;
revoke all on public.global_roll_activity_minute from public, anon, authenticated;
grant select, insert, update, delete on public.global_event_definitions to service_role;
grant select, insert, update, delete on public.global_event_occurrences to service_role;
grant select, insert, update, delete on public.global_event_runtime to service_role;
grant select, insert, update, delete on public.global_roll_activity_minute to service_role;

insert into public.global_event_definitions
  (event_key, name, icon, tier, duration_seconds, description, config)
values
  ('lucky_hour','Lucky Hour','🍀','common',300,'1.20× effective Luck.', '{"luckMultiplier":1.2}'),
  ('overdrive','Overdrive','⚡','common',300,'1.10× Roll Speed.', '{"rollSpeedMultiplier":1.1}'),
  ('heavy_veins','Heavy Veins','🪨','common',300,'1.25× Weight Luck.', '{"weightLuckMultiplier":1.25}'),
  ('mutation_surge','Mutation Surge','✨','common',300,'1.25× mutation chance.', '{"mutationMultiplier":1.25}'),
  ('prospectors_eye','Prospector''s Eye','🔍','common',300,'One 1/100–1/25,000 gem receives 2× Luck.', '{"targetRarityMin":100,"targetRarityMax":25000,"targetGemLuckMultiplier":2}'),
  ('quality_ore','Quality Ore','⚒️','common',300,'Sub-1× weight results have a 50% chance for one reroll.', '{"poorWeightRerollChance":0.5}'),
  ('gilded_veins','Gilded Veins','💰','common',300,'Gilded mutations are twice as likely.', '{"mutationFactors":{"gilded":2}}'),
  ('lucky_roll','Lucky Roll','🎲','common',300,'5% of rolls receive 2× Luck.', '{"luckyRollChance":0.05,"luckyRollMultiplier":2}'),
  ('gem_rush','Gem Rush','💎','uncommon',420,'Gems at 1/1,000 or rarer receive 1.35× Luck.', '{"rarityMin":1000,"rarityLuckMultiplier":1.35}'),
  ('polished_world','Polished World','🌟','uncommon',360,'Mutations worth 2× or less are 1.75× as likely.', '{"maxMutationValue":2,"mutationFactor":1.75}'),
  ('golden_touch','Golden Touch','🤑','uncommon',300,'New specimens permanently receive 1.20× value.', '{"valueMultiplier":1.2}'),
  ('rapid_excavation','Rapid Excavation','💨','uncommon',300,'1.25× Roll Speed.', '{"rollSpeedMultiplier":1.25}'),
  ('narrowed_veins','Narrowed Veins','🎯','uncommon',420,'One rarity band receives 1.75× Luck.', '{"bands":[[1000,10000],[10000,100000],[100000,1000000],[1000000,10000000],[10000000,100000000]],"rarityLuckMultiplier":1.75}'),
  ('unstable_luck','Unstable Luck','🎰','uncommon',420,'Global Luck changes every 30 seconds.', '{"phaseSeconds":30,"phases":[{"value":0.8,"weight":10},{"value":1,"weight":15},{"value":1.2,"weight":25},{"value":1.4,"weight":25},{"value":1.6,"weight":15},{"value":2,"weight":10}]}'),
  ('heavy_favorites','Heavy Favorites','⚖️','uncommon',360,'Five selected 1/100+ gems receive 2× Weight Luck.', '{"targetCount":5,"targetRarityMin":100,"targetWeightLuckMultiplier":2}'),
  ('second_chance','Second Chance','🔁','uncommon',360,'10% chance to roll twice and keep the rarer base gem.', '{"secondChanceChance":0.1}'),
  ('meteor_shower','Meteor Shower','☄️','rare',600,'A separate meteor gem pool becomes available.', '{}'),
  ('cosmic_alignment','Cosmic Alignment','🌌','rare',480,'Luck rises with the gem rarity tier.', '{"rarityFactors":[[1000000000,2],[100000000,1.75],[10000000,1.5],[1000000,1.15]]}'),
  ('mutation_storm','Mutation Storm','💫','rare',480,'All mutations receive 2× chance and Charged becomes available.', '{"mutationMultiplier":2}'),
  ('titans_vein','Titan''s Vein','🏔️','rare',420,'The extreme natural-weight tail becomes more likely.', '{"tailEntryChance":0.363636,"tailContinuationChance":0.54}'),
  ('falling_stars','Falling Stars','🌠','rare',360,'Eight non-overlapping 15-second Starfalls occur.', '{"windowCount":8,"windowSeconds":15}'),
  ('volatile_veins','Volatile Veins','🔥','rare',420,'Each roll receives a shared-strength roll state.', '{"states":[{"key":"normal","weight":60,"luck":1,"weightLuck":1,"mutation":1},{"key":"unstable","weight":30,"luck":1.5,"weightLuck":1,"mutation":1},{"key":"critical","weight":9,"luck":2.5,"weightLuck":1.5,"mutation":1},{"key":"volatile","weight":1,"luck":5,"weightLuck":2,"mutation":2}]}'),
  ('reality_fracture','Reality Fracture','❓','legendary',600,'Rare gems receive progressively stronger rarity compression.', '{"rarityFactors":[[1000000000,4],[100000000,3],[10000000,2],[1000000,1.5],[100000,1.25]]}'),
  ('total_eclipse','Total Eclipse','🌑','legendary',720,'Every roll enters Light, Shadow, or Totality.', '{"states":[{"key":"light","weight":40,"luck":1,"weightLuck":1.75},{"key":"shadow","weight":40,"luck":1.75,"weightLuck":1},{"key":"totality","weight":20,"luck":1.75,"weightLuck":1.75}]}'),
  ('singularity','Singularity','👁️','legendary',420,'Escalating global boosts and a community Mass target.', '{"participationFactor":0.8,"minimumMassTarget":500,"maximumMassTarget":500000}')
on conflict (event_key) do update set
  name=excluded.name, icon=excluded.icon, tier=excluded.tier,
  duration_seconds=excluded.duration_seconds, description=excluded.description,
  config=excluded.config, updated_at=now();

-- Event eligibility is a typed property. Catalog visibility remains separate
-- from roll eligibility so the Gem Index can show undiscovered event content.
alter table public.private_feature_gems
  add column if not exists required_event_key text
    references public.global_event_definitions(event_key) on delete restrict;

alter table public.private_feature_gems
  drop constraint if exists private_feature_gems_availability_mode_check;
alter table public.private_feature_gems
  add constraint private_feature_gems_availability_mode_check
  check (availability_mode in ('always','date_range','daily','date_range_daily','global_event'));

create index if not exists private_feature_gems_event_roll_idx
  on public.private_feature_gems(required_event_key, enabled, rarity desc);

-- Values are intentionally ordinary economy values for their rarity; the
-- balance-critical acquisition denominator is the rarity column.
insert into public.private_feature_gems
  (name, rarity, base_weight, value_per_gram, sort_order, enabled, description,
   hide_rarity_until_discovered, availability_mode, affected_by_luck, required_event_key, metadata)
values
  ('Meteorite Fragment',350,360,0.95,20000,true,'A warm fragment carried down by a meteor shower.',false,'global_event',true,'meteor_shower','{"eventExclusive":true}'),
  ('Tektite',3500,620,5.1,20001,true,'Impact glass formed beneath the falling sky.',false,'global_event',true,'meteor_shower','{"eventExclusive":true}'),
  ('Pallasite',35000,1050,34,20002,true,'Olivine crystals suspended inside meteoric metal.',false,'global_event',true,'meteor_shower','{"eventExclusive":true}'),
  ('Stardust Crystal',500000,1900,180,20003,true,'Ancient stellar dust compressed into crystal.',true,'global_event',true,'meteor_shower','{"eventExclusive":true}'),
  ('Star Fragment',25000,900,27,20004,true,'A brief shard left behind by a Starfall.',false,'global_event',true,'falling_stars','{"eventExclusive":true}'),
  ('Fractured Reality',35000000,6500,4100,20005,true,'A mineral that occupies several incompatible realities.',true,'global_event',true,'reality_fracture','{"eventExclusive":true,"ignoreEventRarityFactor":true}'),
  ('Eclipse Stone',750,450,2.1,20006,true,'A stone divided between sunlight and shadow.',false,'global_event',true,'total_eclipse','{"eventExclusive":true}'),
  ('Moonlit Quartz',7500,760,12,20007,true,'Quartz saturated with cold lunar light.',false,'global_event',true,'total_eclipse','{"eventExclusive":true}'),
  ('Umbrium',75000,1250,61,20008,true,'A dense mineral condensed from perfect shadow.',true,'global_event',true,'total_eclipse','{"eventExclusive":true}'),
  ('Corona Shard',750000,2300,270,20009,true,'A burning sliver from the eclipse corona.',true,'global_event',true,'total_eclipse','{"eventExclusive":true}'),
  ('Totality',25000000,6000,3600,20010,true,'Light and shadow held in impossible equilibrium.',true,'global_event',true,'total_eclipse','{"eventExclusive":true,"requiredRollState":"totality"}'),
  ('Event Horizon',10000000,5200,1800,20011,true,'The boundary from which no light returns.',true,'global_event',true,'singularity','{"eventExclusive":true,"requiresCollapse":true,"finalSeconds":30}')
on conflict (name) do update set
  rarity=excluded.rarity, base_weight=excluded.base_weight,
  value_per_gram=excluded.value_per_gram, enabled=excluded.enabled,
  description=excluded.description, hide_rarity_until_discovered=excluded.hide_rarity_until_discovered,
  availability_mode=excluded.availability_mode, affected_by_luck=excluded.affected_by_luck,
  required_event_key=excluded.required_event_key,
  metadata=public.private_feature_gems.metadata || excluded.metadata,
  updated_at=now();

insert into public.game_mutations
  (id,name,chance,multiplier,description,icon,color,enabled,sort_order,updated_at)
values ('charged','Charged',2000,2.5,'A storm-charged mutation available only during Mutation Storm.','⚡','#8ad9ff',true,1000,now())
on conflict (id) do update set
  name=excluded.name, chance=excluded.chance, multiplier=excluded.multiplier,
  description=excluded.description, icon=excluded.icon, color=excluded.color,
  enabled=excluded.enabled, updated_at=now();

alter table public.inventory_gems
  add column if not exists source_event_occurrence_id uuid
    references public.global_event_occurrences(id) on delete set null,
  add column if not exists source_event_key text,
  add column if not exists event_properties jsonb not null default '{}'::jsonb,
  add column if not exists value_multiplier_at_roll numeric not null default 1;

create index if not exists inventory_gems_event_source_idx
  on public.inventory_gems(source_event_key, created_at desc)
  where source_event_key is not null;

create or replace function public.get_active_global_event()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id', o.id, 'eventKey', o.event_key, 'name', d.name, 'icon', d.icon,
      'tier', o.tier, 'description', d.description,
      'startsAt', o.starts_at, 'endsAt', o.ends_at,
      'config', o.config,
      'mass', o.mass, 'massTarget', o.mass_target,
      'collapsedAt', o.collapsed_at,
      'serverNow', clock_timestamp()
    )
    from public.global_event_occurrences o
    join public.global_event_definitions d on d.event_key=o.event_key
    where o.status='active' and o.starts_at <= clock_timestamp() and o.ends_at > clock_timestamp()
    order by o.starts_at desc limit 1
  ), 'null'::jsonb);
$$;

revoke all on function public.get_active_global_event() from public;
grant execute on function public.get_active_global_event() to anon, authenticated, service_role;

create or replace function public.record_global_event_roll(p_occurrence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_event public.global_event_occurrences; v_bucket timestamptz;
begin
  v_bucket := date_trunc('minute', clock_timestamp());
  insert into public.global_roll_activity_minute(bucket,roll_count) values(v_bucket,1)
  on conflict(bucket) do update set roll_count=public.global_roll_activity_minute.roll_count+1;
  if p_occurrence_id is not null then
    update public.global_event_occurrences set
      mass = case when event_key='singularity' then mass+1 else mass end,
      collapsed_at = case when event_key='singularity' and collapsed_at is null
        and mass+1 >= coalesce(mass_target,9223372036854775807) then clock_timestamp() else collapsed_at end,
      updated_at=clock_timestamp()
    where id=p_occurrence_id and status='active' and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
    returning * into v_event;
  end if;
  return jsonb_build_object('mass',v_event.mass,'massTarget',v_event.mass_target,'collapsedAt',v_event.collapsed_at);
end;
$$;

revoke all on function public.record_global_event_roll(uuid) from public, anon, authenticated;
grant execute on function public.record_global_event_roll(uuid) to service_role;
