-- Deepcore Project 2026
-- Prepared for igrddscmrdrrwtvyspbf. Deploy manually; this migration is not
-- applied by the implementation branch.
begin;

create schema if not exists deepcore_private;
revoke all on schema deepcore_private from public, anon, authenticated;

create table public.deepcore_event_state (
  event_key text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  phase smallint not null default 1 check (phase in (1,2,3,4,51,52,6,7)),
  actual_funding numeric(24,2) not null default 0 check (actual_funding >= 0),
  effective_funding numeric(24,2) not null default 0 check (effective_funding >= 0),
  supply_spending numeric(24,2) not null default 0 check (supply_spending >= 0),
  legendary_sacrificed bigint not null default 0,
  mythic_sacrificed bigint not null default 0,
  sacrificed_value numeric(24,2) not null default 0,
  community_rolls bigint not null default 0,
  heavy_specimen_met boolean not null default false,
  crystalline_funding numeric(24,2) not null default 0,
  crystalline_specimens integer not null default 0,
  anomalous_funding numeric(24,2) not null default 0,
  anomalous_specimens integer not null default 0,
  route_winner text check (route_winner in ('crystalline','anomalous')),
  route_resolved_at timestamptz,
  route_loser_snapshot jsonb,
  keyholder_player_id uuid references public.players(id),
  key_specimen jsonb,
  breached_at timestamptz,
  first_heart_player_id uuid references public.players(id),
  first_heart_at timestamptz,
  archived_at timestamptz,
  final_report jsonb,
  updated_at timestamptz not null default now()
);

insert into public.deepcore_event_state(event_key,starts_at,ends_at)
values ('deepcore-2026','2026-09-20T00:00:00Z','2026-10-04T00:00:00Z')
on conflict(event_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;

create table public.deepcore_players (
  player_id uuid primary key references public.players(id) on delete cascade,
  actual_funding numeric(24,2) not null default 0,
  effective_funding numeric(24,2) not null default 0,
  supply_level smallint not null default 0 check (supply_level between 0 and 6),
  supply_spending numeric(24,2) not null default 0,
  event_rolls bigint not null default 0,
  sacrificed_value numeric(24,2) not null default 0,
  specimens_sacrificed bigint not null default 0,
  research_data integer not null default 0,
  deepcore_gems_found integer not null default 0,
  best_weight_multiplier numeric not null default 0,
  mutated_gems integer not null default 0,
  route_participated boolean not null default false,
  auto_contribute boolean not null default false,
  auto_min_rarity numeric not null default 1,
  auto_max_rarity numeric,
  auto_max_value numeric,
  eligible_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deepcore_contributions (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  player_id uuid not null references public.players(id),
  target text not null check (target in ('global','crystalline','anomalous')),
  actual_amount numeric(24,2) not null check (actual_amount > 0),
  efficiency numeric(6,3) not null,
  effective_amount numeric(24,2) not null check (effective_amount > 0),
  created_at timestamptz not null default now(),
  unique(player_id,request_id)
);
create index deepcore_contributions_player_idx on public.deepcore_contributions(player_id,created_at);
create index deepcore_players_actual_rank_idx on public.deepcore_players(actual_funding desc) where actual_funding>0;
create index deepcore_players_effective_rank_idx on public.deepcore_players(effective_funding desc) where effective_funding>0;
create index deepcore_players_eligible_idx on public.deepcore_players(eligible_at) where eligible_at is not null;

create table public.deepcore_sacrifices (
  id bigint generated always as identity primary key,
  request_id uuid,
  player_id uuid not null references public.players(id),
  specimen_id bigint,
  objective text not null,
  gem_name text not null,
  rarity numeric not null,
  value numeric(24,2) not null,
  final_weight numeric not null,
  weight_multiplier numeric not null,
  automatic boolean not null default false,
  created_at timestamptz not null default now(),
  unique(player_id,request_id)
);

create table public.deepcore_rewards (
  reward_key text primary key,
  label text not null,
  payload jsonb not null,
  unlocked_at timestamptz not null default now(),
  threshold numeric,
  sort_order numeric not null
);
create table public.deepcore_reward_claims (
  player_id uuid not null references public.players(id),
  reward_key text not null references public.deepcore_rewards(reward_key),
  claimed_at timestamptz not null default now(),
  primary key(player_id,reward_key)
);
create index deepcore_reward_claims_reward_idx on public.deepcore_reward_claims(reward_key);

create table public.deepcore_supply_purchases (
  player_id uuid not null references public.players(id),
  level smallint not null,
  request_id uuid not null,
  cost numeric(24,2) not null,
  purchased_at timestamptz not null default now(),
  primary key(player_id,level),
  unique(player_id,request_id)
);
create table public.deepcore_shop_purchases (
  player_id uuid not null references public.players(id),
  item_id text not null,
  shop_day date not null,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(player_id,item_id,shop_day)
);
create table public.deepcore_player_effects (
  player_id uuid not null references public.players(id) on delete cascade,
  effect_id text not null,
  expires_at timestamptz,
  rolls_remaining integer,
  updated_at timestamptz not null default now(),
  primary key(player_id,effect_id),
  check (expires_at is not null or rolls_remaining is not null)
);
create table public.deepcore_item_actions (
  player_id uuid not null references public.players(id),
  request_id uuid not null,
  action text not null,
  item_id text not null,
  created_at timestamptz not null default now(),
  primary key(player_id,request_id)
);
create table public.deepcore_crate_openings (
  player_id uuid not null references public.players(id),
  request_id uuid not null,
  primary_reward jsonb not null,
  roll_card_awarded boolean not null default false,
  opened_at timestamptz not null default now(),
  primary key(player_id,request_id)
);

create table public.deepcore_daily_progress (
  player_id uuid not null references public.players(id),
  shop_day date not null,
  rolls integer not null default 0,
  mutated_gems integer not null default 0,
  deepcore_gems integer not null default 0,
  max_weight numeric not null default 0,
  actual_funding numeric(24,2) not null default 0,
  sacrificed_value numeric(24,2) not null default 0,
  primary key(player_id,shop_day)
);
create table public.deepcore_quest_claims (
  player_id uuid not null references public.players(id),
  quest_key text not null,
  data_awarded integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key(player_id,quest_key)
);
create table public.deepcore_research_claims (
  player_id uuid not null references public.players(id),
  milestone integer not null,
  claimed_at timestamptz not null default now(),
  primary key(player_id,milestone)
);

create table public.deepcore_project_log (
  id bigint generated always as identity primary key,
  event_key text not null default 'deepcore-2026',
  entry_key text not null unique,
  title text not null,
  body jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create table public.deepcore_final_leaderboard (
  board text not null check(board in ('actual','effective')),
  rank integer not null,
  player_id uuid not null references public.players(id),
  username text not null,
  amount numeric(24,2) not null,
  primary key(board,rank),
  unique(board,player_id)
);
create index deepcore_final_leaderboard_player_idx on public.deepcore_final_leaderboard(player_id);

alter table public.deepcore_event_state enable row level security;
alter table public.deepcore_players enable row level security;
alter table public.deepcore_contributions enable row level security;
alter table public.deepcore_sacrifices enable row level security;
alter table public.deepcore_rewards enable row level security;
alter table public.deepcore_reward_claims enable row level security;
alter table public.deepcore_supply_purchases enable row level security;
alter table public.deepcore_shop_purchases enable row level security;
alter table public.deepcore_player_effects enable row level security;
alter table public.deepcore_item_actions enable row level security;
alter table public.deepcore_crate_openings enable row level security;
alter table public.deepcore_daily_progress enable row level security;
alter table public.deepcore_quest_claims enable row level security;
alter table public.deepcore_research_claims enable row level security;
alter table public.deepcore_project_log enable row level security;
alter table public.deepcore_final_leaderboard enable row level security;
revoke all on public.deepcore_event_state,public.deepcore_players,public.deepcore_contributions,
 public.deepcore_sacrifices,public.deepcore_rewards,public.deepcore_reward_claims,
 public.deepcore_supply_purchases,public.deepcore_shop_purchases,public.deepcore_player_effects,public.deepcore_item_actions,
 public.deepcore_crate_openings,public.deepcore_daily_progress,public.deepcore_quest_claims,
 public.deepcore_research_claims,public.deepcore_project_log,public.deepcore_final_leaderboard
 from anon, authenticated;
grant all on public.deepcore_event_state,public.deepcore_players,public.deepcore_contributions,
 public.deepcore_sacrifices,public.deepcore_rewards,public.deepcore_reward_claims,
 public.deepcore_supply_purchases,public.deepcore_shop_purchases,public.deepcore_player_effects,public.deepcore_item_actions,
 public.deepcore_crate_openings,public.deepcore_daily_progress,public.deepcore_quest_claims,
 public.deepcore_research_claims,public.deepcore_project_log,public.deepcore_final_leaderboard
 to service_role;

-- Catalog entries. Deepcore phase eligibility remains enforced in the Roll
-- Edge Function; these date bounds are an additional non-bypassable expiry.
insert into public.private_feature_gems
  (id,name,rarity,base_weight,value_per_gram,sort_order,enabled,starts_at,ends_at,metadata,description,hide_rarity_until_discovered,availability_mode,affected_by_luck,special_gem)
values
  (gen_random_uuid(),'Core Sample',400,2500,.102,9201,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":1}','A cylindrical sample extracted during the Deepcore Project''s initial survey. Nothing unusual. Yet.',false,'date_range',true,false),
  (gen_random_uuid(),'Drillstone',4500,8000,.1545,9202,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":1}','Rock subjected to immense pressure between the Deepcore drill and the surrounding formation.',false,'date_range',true,false),
  (gen_random_uuid(),'Compression Quartz',45000,4500,2.08,9203,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":1}','Quartz compressed into an unusually dense formation.',false,'date_range',true,false),
  (gen_random_uuid(),'Seismic Crystal',450000,900,210,9204,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":2}','A crystal that resonates with vibrations originating far beneath the excavation.',false,'date_range',true,false),
  (gen_random_uuid(),'Borealite',4500000,2400,636,9205,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":3}','Discovered growing along the walls of the primary borehole.',false,'date_range',true,false),
  (gen_random_uuid(),'Mantleheart',45000000,12000,668.75,9206,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":4}','A dense incandescent mineral that remains warm indefinitely.',false,'date_range',true,false),
  (gen_random_uuid(),'Deepcore Geode',145000000,35000,540,9207,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":51,"deepcore_cutscene":"pressure"}','A geode formed under pressures that should have destroyed its hollow interior.',true,'date_range',true,false),
  (gen_random_uuid(),'Blacksite Crystal',345000000,6000,6540,9208,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":52,"deepcore_cutscene":"redacted"}','Project records contain no geological explanation for this specimen.',true,'date_range',true,false),
  (gen_random_uuid(),'Crystalline Singularity',250000000,750,43600,9209,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":6,"deepcore_route":"crystalline","deepcore_cutscene":"convergence"}','An impossibly ordered crystal structure compressed around a single brilliant point.',true,'date_range',true,false),
  (gen_random_uuid(),'Ontological Shard',250000000,750,43600,9210,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":6,"deepcore_route":"anomalous","deepcore_cutscene":"absence"}','Instruments can describe its properties, but cannot agree that the specimen exists.',true,'date_range',true,false),
  (gen_random_uuid(),'Heart of the Deep',1000000000,25000,13200,9211,true,'2026-09-20T00:00:00Z','2026-10-04T00:00:00Z','{"deepcore_stage":7,"deepcore_cutscene":"heartbeat"}','We thought we were digging toward the centre of the Earth. Something was digging back.',true,'date_range',true,false)
on conflict(name) do update set rarity=excluded.rarity,base_weight=excluded.base_weight,value_per_gram=excluded.value_per_gram,
  sort_order=excluded.sort_order,enabled=excluded.enabled,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  metadata=excluded.metadata,description=excluded.description,hide_rarity_until_discovered=excluded.hide_rarity_until_discovered,
  availability_mode=excluded.availability_mode,affected_by_luck=excluded.affected_by_luck,special_gem=excluded.special_gem;

insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price)
values
 ('deepcore-catalyst','Deepcore Catalyst','weightLuck',4,.5,1,false,null),
 ('pressurized-catalyst','Pressurized Catalyst','weightLuck',4,1,60,false,null),
 ('seismic-potion','Seismic Potion','luck',4,4,60,false,null),
 ('unstable-core','Unstable Core','luck',4,25,1,false,null),
 ('deepcore-crate','Deepcore Crate','material',1,1,1,false,null)
on conflict(id) do update set name=excluded.name,family=excluded.family,tier=excluded.tier,effect_value=excluded.effect_value,
 duration_seconds=excluded.duration_seconds,purchasable=false,shop_price=null;

insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source)
values
 ('deepcore-researcher','Deepcore Researcher',array['title'],'Completed 30 Research Data during Deepcore.','Epic','{"icon":"⌁","style":"deepcore"}','deepcore'),
 ('deepcore-field-research','Deepcore Field Research',array['background','badge'],'Completed the Deepcore research programme.','Legendary','{"icon":"🔬","style":"deepcore-field"}','deepcore'),
 ('deepcore-breached','Deepcore Breached',array['title','badge'],'Helped breach the Deepcore chamber.','Legendary','{"icon":"⛏","style":"deepcore"}','deepcore'),
 ('deepcore-keyholder','Deepcore Keyholder',array['title','trophy'],'Sacrificed the Transcendent specimen that breached the Deepcore.','Mythic','{"icon":"🔑","style":"deepcore-heart"}','deepcore'),
 ('deepcore-beyond-bedrock','Beyond Bedrock',array['badge'],'Participated in the $20B Deepcore milestone.','Legendary','{"icon":"⬇","style":"deepcore"}','deepcore'),
 ('deepcore-deepest','The Deepest We Went',array['badge','trophy'],'Participated in the $25B maximum research milestone.','Mythic','{"icon":"♥","style":"deepcore-heart"}','deepcore'),
 ('deepcore-benefactor','Deepcore Benefactor',array['title','background'],'Top-five actual funder in Deepcore 2026.','Mythic','{"icon":"◆","style":"benefactor"}','deepcore'),
 ('deepcore-benefactor-first','Benefactor''s Depths — #1',array['background'],'The top actual funder in Deepcore 2026.','Mythic','{"icon":"◆","style":"benefactor-first","animated":true}','deepcore'),
 ('deepcore-architect','Deepcore Architect',array['title','background'],'Top-five project impact in Deepcore 2026.','Mythic','{"icon":"⚙","style":"architect"}','deepcore'),
 ('deepcore-architect-first','Architect''s Excavation — #1',array['background'],'The top project impact in Deepcore 2026.','Mythic','{"icon":"⚙","style":"architect-first","animated":true}','deepcore'),
 ('deepcore-magnate','Deepcore Magnate',array['title','trophy'],'Placed top five on both Deepcore leaderboards.','Mythic','{"icon":"♛","style":"deepcore"}','deepcore'),
 ('deepcore-roll-card','Deepcore Roll Card',array['decor'],'A crate-exclusive limited roll card treatment.','Mythic','{"icon":"🎴","style":"deepcore-roll-card"}','deepcore')
 ,('deepcore-pathfinder','Pathfinder',array['badge'],'Recovered the winning passage specimen.','Legendary','{"icon":"◇","style":"deepcore"}','deepcore')
 ,('deepcore-blacksite','Blacksite Clearance',array['badge'],'Recovered Blacksite Crystal.','Mythic','{"icon":"▰","style":"deepcore"}','deepcore')
 ,('deepcore-from-the-deep','From the Deep',array['badge'],'Recovered Heart of the Deep.','Mythic','{"icon":"♥","style":"deepcore-heart"}','deepcore')
on conflict(id) do update set name=excluded.name,slots=excluded.slots,description=excluded.description,rarity=excluded.rarity,
 visual_config=excluded.visual_config,source=excluded.source,enabled=true;

create or replace function deepcore_private.status(p_now timestamptz default clock_timestamp()) returns text
language sql stable set search_path='' as $$
 select case when p_now < starts_at then 'preview' when p_now < ends_at then 'active' else 'archived' end
 from public.deepcore_event_state where event_key='deepcore-2026';
$$;
create or replace function deepcore_private.efficiency(p_level integer) returns numeric
language sql immutable set search_path='' as $$
 select case p_level when 1 then 1.05 when 2 then 1.10 when 3 then 1.15 when 4 then 1.20 when 5 then 1.25 when 6 then 1.30 else 1 end;
$$;
create or replace function deepcore_private.grant_consumable(p_player uuid,p_id text,p_quantity integer) returns void
language sql security definer set search_path='' as $$
 insert into public.player_consumables(player_id,consumable_id,quantity) values(p_player,p_id,greatest(0,p_quantity))
 on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=now();
$$;
create or replace function deepcore_private.grant_cosmetic(p_player uuid,p_id text,p_key text) returns void
language sql security definer set search_path='' as $$
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key)
 select p_player,id,'deepcore',p_key from public.cosmetic_definitions where id=p_id
 on conflict(player_id,cosmetic_id) do nothing;
$$;

create or replace function deepcore_private.unlock_reward(p_key text,p_label text,p_payload jsonb,p_sort numeric,p_threshold numeric default null) returns void
language sql security definer set search_path='' as $$
 insert into public.deepcore_rewards(reward_key,label,payload,sort_order,threshold)
 values(p_key,p_label,p_payload,p_sort,p_threshold) on conflict(reward_key) do nothing;
$$;

create or replace function deepcore_private.advance_state() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; idx integer; cycle integer;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 select coalesce(sum(event_rolls),0) into e.community_rolls from public.deepcore_players;
 if deepcore_private.status() <> 'active' then return; end if;
 loop
  if e.phase=1 and e.effective_funding>=500000000 then
   perform deepcore_private.unlock_reward('phase-1','Survey Complete','[{"id":"deepcore-catalyst","quantity":2}]',1);
   update public.deepcore_event_state set phase=2,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-1','SURVEY COMPLETE',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; e.phase:=2;
  elsif e.phase=2 and e.effective_funding>=1500000000 and e.legendary_sacrificed>=50000 then
   perform deepcore_private.unlock_reward('phase-2','Construction Complete','[{"id":"pressurized-catalyst","quantity":2},{"id":"deepcore-catalyst","quantity":3}]',2);
   update public.deepcore_event_state set phase=3,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-2','CONSTRUCTION COMPLETE',jsonb_build_object('legendarySacrificed',e.legendary_sacrificed)) on conflict do nothing; e.phase:=3;
  elsif e.phase=3 and e.effective_funding>=3000000000 and e.community_rolls>=250000 and e.sacrificed_value>=1000000000 then
   perform deepcore_private.unlock_reward('phase-3','Descent Complete','[{"id":"mythic-potion","quantity":1},{"id":"seismic-potion","quantity":1},{"id":"pressurized-catalyst","quantity":3}]',3);
   update public.deepcore_event_state set phase=4,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-3','DESCENT COMPLETE',jsonb_build_object('communityRolls',e.community_rolls,'sacrificedValue',e.sacrificed_value)) on conflict do nothing; e.phase:=4;
  elsif e.phase=4 and e.effective_funding>=5000000000 and e.mythic_sacrificed>=5000 and e.heavy_specimen_met then
   perform deepcore_private.unlock_reward('phase-4','Bedrock Complete','[{"id":"deepcore-crate","quantity":1}]',4);
   update public.deepcore_event_state set phase=51,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-4','BEDROCK REACHED','{}') on conflict do nothing; e.phase:=51;
  elsif e.phase=51 and e.effective_funding>=6000000000 then
   perform deepcore_private.unlock_reward('phase-5-1','Structure Complete','[{"id":"mythic-potion","quantity":1},{"id":"lucky-potion-4","quantity":1},{"id":"speed-potion-4","quantity":1},{"id":"fortune-potion-4","quantity":1},{"id":"mass-potion-4","quantity":1},{"id":"deepcore-crate","quantity":2}]',5.1);
   update public.deepcore_event_state set phase=52,updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-5-1','STRUCTURE ENCOUNTERED','{}') on conflict do nothing; e.phase:=52;
  elsif e.phase=52 and e.route_winner is not null then
   update public.deepcore_event_state set phase=6,updated_at=now() where event_key=e.event_key; e.phase:=6;
  elsif e.phase=6 and e.effective_funding>=10000000000 and e.keyholder_player_id is not null then
   perform deepcore_private.unlock_reward('phase-6','Deepcore Breached','[{"id":"unstable-core","quantity":1},{"id":"seismic-potion","quantity":2},{"id":"deepcore-crate","quantity":2},{"cosmetic":"deepcore-breached"}]',6);
   update public.deepcore_event_state set phase=7,breached_at=coalesce(breached_at,now()),updated_at=now() where event_key=e.event_key;
   insert into public.deepcore_project_log(entry_key,title,body) values('phase-6','THE DEEPCORE KEY',coalesce(e.key_specimen,'{}')) on conflict do nothing; e.phase:=7;
  else exit;
  end if;
  select * into e from public.deepcore_event_state where event_key='deepcore-2026';
 end loop;
 if e.phase=7 then
  for idx in 1..greatest(0,floor((e.effective_funding-10000000000)/500000000)::integer) loop
   cycle:=mod(idx-1,4)+1;
   perform deepcore_private.unlock_reward('stretch-'||idx,'Stretch supply drop',case cycle
    when 1 then '[{"id":"deepcore-catalyst","quantity":1}]'::jsonb
    when 2 then '[{"id":"pressurized-catalyst","quantity":1}]'::jsonb
    when 3 then '[{"id":"deepcore-catalyst","quantity":1},{"id":"pressurized-catalyst","quantity":1}]'::jsonb
    else '[{"id":"deepcore-crate","quantity":1}]'::jsonb end,100+idx,10000000000::numeric+idx::numeric*500000000::numeric);
  end loop;
  if e.effective_funding>=15000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-15b','SEISMIC RESEARCH COMPLETED',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
  if e.effective_funding>=20000000000 then perform deepcore_private.unlock_reward('major-20b','Beyond Bedrock','[{"cosmetic":"deepcore-beyond-bedrock"}]',200,20000000000); end if;
  if e.effective_funding>=25000000000 then perform deepcore_private.unlock_reward('major-25b','Maximum Research Depth','[{"cosmetic":"deepcore-deepest"}]',250,25000000000); end if;
  if e.effective_funding>=20000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-20b','BEYOND BEDROCK',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
  if e.effective_funding>=25000000000 then insert into public.deepcore_project_log(entry_key,title,body) values('major-25b','MAXIMUM RESEARCH DEPTH',jsonb_build_object('effectiveFunding',e.effective_funding)) on conflict do nothing; end if;
 end if;
 update public.deepcore_players set auto_contribute=false where auto_contribute and e.phase not in (2,3,4);
end $$;

create or replace function deepcore_private.mark_eligible(p_player uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.deepcore_players set eligible_at=coalesce(eligible_at,clock_timestamp()),updated_at=now()
 where player_id=p_player and eligible_at is null and actual_funding>=1000000 and event_rolls>=1000
 and deepcore_private.status()='active';
end $$;

create or replace function deepcore_private.track_rolls() returns trigger
language plpgsql security definer set search_path='' as $$
declare d bigint; day date; phase_three boolean;
begin
 if deepcore_private.status()<>'active' then return new; end if;
 d:=greatest(0,new.total_rolls-old.total_rolls); if d=0 then return new; end if;
 select phase=3 into phase_three from public.deepcore_event_state where event_key='deepcore-2026';
 if phase_three then perform 1 from public.deepcore_event_state where event_key='deepcore-2026' for update; end if;
 day:=(clock_timestamp() at time zone 'Asia/Singapore')::date;
 insert into public.deepcore_players(player_id,event_rolls) values(new.id,d)
 on conflict(player_id) do update set event_rolls=public.deepcore_players.event_rolls+d,updated_at=now();
 insert into public.deepcore_daily_progress(player_id,shop_day,rolls) values(new.id,day,d)
 on conflict(player_id,shop_day) do update set rolls=public.deepcore_daily_progress.rolls+d;
 update public.deepcore_player_effects set rolls_remaining=greatest(0,rolls_remaining-d),updated_at=now()
 where player_id=new.id and effect_id in ('deepcore-catalyst','unstable-core') and rolls_remaining>0;
 delete from public.deepcore_player_effects where player_id=new.id and rolls_remaining is not null and rolls_remaining<=0;
 perform deepcore_private.mark_eligible(new.id);
 if phase_three then perform deepcore_private.advance_state(); end if;
 return new;
end $$;
drop trigger if exists deepcore_track_rolls on public.players;
create trigger deepcore_track_rolls after update of total_rolls on public.players for each row
 when(new.total_rolls>old.total_rolls) execute function deepcore_private.track_rolls();

create or replace function deepcore_private.track_specimen() returns trigger
language plpgsql security definer set search_path='' as $$
declare day date; is_dc boolean;
begin
 if deepcore_private.status()<>'active' then return new; end if;
 if new.gem_name='Heart of the Deep' then perform 1 from public.deepcore_event_state where event_key='deepcore-2026' for update; end if;
 day:=(clock_timestamp() at time zone 'Asia/Singapore')::date;
 is_dc:=new.gem_name in ('Core Sample','Drillstone','Compression Quartz','Seismic Crystal','Borealite','Mantleheart','Deepcore Geode','Blacksite Crystal','Crystalline Singularity','Ontological Shard','Heart of the Deep');
 insert into public.deepcore_players(player_id,deepcore_gems_found,best_weight_multiplier,mutated_gems)
 values(new.player_id,case when is_dc then 1 else 0 end,new.rolled_weight_multiplier,case when cardinality(new.mutation_ids)>0 then 1 else 0 end)
 on conflict(player_id) do update set deepcore_gems_found=public.deepcore_players.deepcore_gems_found+excluded.deepcore_gems_found,
 best_weight_multiplier=greatest(public.deepcore_players.best_weight_multiplier,excluded.best_weight_multiplier),
 mutated_gems=public.deepcore_players.mutated_gems+excluded.mutated_gems,updated_at=now();
 insert into public.deepcore_daily_progress(player_id,shop_day,mutated_gems,deepcore_gems,max_weight)
 values(new.player_id,day,case when cardinality(new.mutation_ids)>0 then 1 else 0 end,case when is_dc then 1 else 0 end,new.rolled_weight_multiplier)
 on conflict(player_id,shop_day) do update set mutated_gems=public.deepcore_daily_progress.mutated_gems+excluded.mutated_gems,
 deepcore_gems=public.deepcore_daily_progress.deepcore_gems+excluded.deepcore_gems,max_weight=greatest(public.deepcore_daily_progress.max_weight,excluded.max_weight);
 if new.gem_name='Heart of the Deep' then
  perform deepcore_private.grant_cosmetic(new.player_id,'deepcore-from-the-deep','discovery-heart');
  update public.deepcore_event_state set first_heart_player_id=coalesce(first_heart_player_id,new.player_id),first_heart_at=coalesce(first_heart_at,now()) where event_key='deepcore-2026';
  insert into public.deepcore_project_log(entry_key,title,body) values('first-heart','SIGNAL RECOVERED',jsonb_build_object('playerId',new.player_id,'username',(select username from public.players where id=new.player_id))) on conflict do nothing;
 end if;
 if new.gem_name in ('Crystalline Singularity','Ontological Shard') then perform deepcore_private.grant_cosmetic(new.player_id,'deepcore-pathfinder','discovery-route'); end if;
 if new.gem_name='Blacksite Crystal' then perform deepcore_private.grant_cosmetic(new.player_id,'deepcore-blacksite','discovery-blacksite'); end if;
 return new;
end $$;
drop trigger if exists deepcore_track_specimen on public.inventory_gems;
create trigger deepcore_track_specimen after insert on public.inventory_gems for each row execute function deepcore_private.track_specimen();

create or replace function public.deepcore_contribute(p_amount numeric,p_target text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.deepcore_event_state%rowtype; dp public.deepcore_players%rowtype; eff numeric; mult numeric;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
 if deepcore_private.status()<>'active' then raise exception 'deepcore_not_active'; end if;
 if p_amount is null or p_amount<1 or p_amount>1000000000000 or p_request_id is null then raise exception 'invalid_contribution'; end if;
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if p_target not in ('global','crystalline','anomalous') then raise exception 'invalid_target'; end if;
 if e.phase=52 and p_target='global' then raise exception 'choose_route'; end if;
 if e.phase<>52 and p_target<>'global' then raise exception 'route_not_active'; end if;
 if e.route_winner is not null and p_target<> 'global' then raise exception 'route_closed'; end if;
 insert into public.deepcore_players(player_id) values(uid) on conflict do nothing;
 select * into dp from public.deepcore_players where player_id=uid for update;
 mult:=deepcore_private.efficiency(dp.supply_level); eff:=round(p_amount*mult,2);
 update public.players set money=money-p_amount where id=uid and money>=p_amount;
 if not found then raise exception 'insufficient_funds'; end if;
 insert into public.deepcore_contributions(request_id,player_id,target,actual_amount,efficiency,effective_amount)
 values(p_request_id,uid,p_target,p_amount,mult,eff);
 update public.deepcore_players set actual_funding=actual_funding+p_amount,effective_funding=effective_funding+eff,updated_at=now() where player_id=uid;
 update public.deepcore_event_state set actual_funding=actual_funding+p_amount,effective_funding=effective_funding+eff,
  crystalline_funding=crystalline_funding+case when p_target='crystalline' then eff else 0 end,
  anomalous_funding=anomalous_funding+case when p_target='anomalous' then eff else 0 end,updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_daily_progress(player_id,shop_day,actual_funding) values(uid,(clock_timestamp() at time zone 'Asia/Singapore')::date,p_amount)
 on conflict(player_id,shop_day) do update set actual_funding=public.deepcore_daily_progress.actual_funding+p_amount;
 if p_target<>'global' then update public.deepcore_players set route_participated=true where player_id=uid; end if;
 perform deepcore_private.mark_eligible(uid); perform deepcore_private.advance_state(); perform deepcore_private.resolve_route();
 return public.get_deepcore_snapshot();
exception when unique_violation then return public.get_deepcore_snapshot();
end $$;

create or replace function deepcore_private.resolve_route() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; winner text;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if e.phase<>52 or e.route_winner is not null then return; end if;
 if e.crystalline_funding>=1500000000 and e.crystalline_specimens>=4000 then winner:='crystalline';
 elsif e.anomalous_funding>=1500000000 and e.anomalous_specimens>=10 then winner:='anomalous'; else return; end if;
 update public.deepcore_event_state set route_winner=winner,route_resolved_at=now(),route_loser_snapshot=jsonb_build_object(
  'crystallineFunding',e.crystalline_funding,'crystallineSpecimens',e.crystalline_specimens,
  'anomalousFunding',e.anomalous_funding,'anomalousSpecimens',e.anomalous_specimens),updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_project_log(entry_key,title,body) values('route-winner','ROUTE BREAKTHROUGH',jsonb_build_object('winner',winner,'snapshot',jsonb_build_object('crystallineFunding',e.crystalline_funding,'crystallineSpecimens',e.crystalline_specimens,'anomalousFunding',e.anomalous_funding,'anomalousSpecimens',e.anomalous_specimens))) on conflict do nothing;
 perform deepcore_private.advance_state();
end $$;

create or replace function public.deepcore_sacrifice(p_specimen_id bigint,p_objective text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.deepcore_event_state%rowtype; g public.inventory_gems%rowtype; valid boolean:=false;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
 if deepcore_private.status()<>'active' then raise exception 'deepcore_not_active'; end if;
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 select * into g from public.inventory_gems where id=p_specimen_id and player_id=uid for update;
 if not found then raise exception 'specimen_not_found'; end if;
 if g.locked or g.museum_locked then raise exception 'specimen_locked'; end if;
 valid:=case
  when e.phase=2 and p_objective='legendary' then g.rarity between 1000 and 9999
  when e.phase=3 and p_objective='value' then true
  when e.phase=4 and p_objective='mythic' then g.rarity between 10000 and 99999
  when e.phase=52 and p_objective='crystalline' then g.rarity>=100000
  when e.phase=52 and p_objective='anomalous' then g.rarity>=1000000 and exists(select 1 from public.private_feature_gems f where f.name=g.gem_name and f.special_gem)
  when e.phase=6 and p_objective='key' then e.effective_funding>=10000000000 and g.rarity>=100000000
  else false end;
 if not valid then raise exception 'specimen_not_eligible'; end if;
 delete from public.inventory_gems where id=g.id;
 insert into public.deepcore_sacrifices(request_id,player_id,specimen_id,objective,gem_name,rarity,value,final_weight,weight_multiplier)
 values(p_request_id,uid,g.id,p_objective,g.gem_name,g.rarity,g.value,g.final_weight,g.rolled_weight_multiplier);
 insert into public.deepcore_players(player_id,sacrificed_value,specimens_sacrificed,route_participated) values(uid,g.value,1,p_objective in ('crystalline','anomalous'))
 on conflict(player_id) do update set sacrificed_value=public.deepcore_players.sacrificed_value+g.value,
 specimens_sacrificed=public.deepcore_players.specimens_sacrificed+1,route_participated=public.deepcore_players.route_participated or excluded.route_participated,updated_at=now();
 update public.deepcore_event_state set
  legendary_sacrificed=legendary_sacrificed+case when p_objective='legendary' then 1 else 0 end,
  mythic_sacrificed=mythic_sacrificed+case when p_objective='mythic' then 1 else 0 end,
  sacrificed_value=sacrificed_value+case when p_objective='value' then g.value else 0 end,
  heavy_specimen_met=heavy_specimen_met or (e.phase=4 and g.rolled_weight_multiplier>=10),
  crystalline_specimens=crystalline_specimens+case when p_objective='crystalline' then 1 else 0 end,
  anomalous_specimens=anomalous_specimens+case when p_objective='anomalous' then 1 else 0 end,
  keyholder_player_id=case when p_objective='key' then uid else keyholder_player_id end,
  key_specimen=case when p_objective='key' then jsonb_build_object('playerId',uid,'username',(select username from public.players where id=uid),'gemName',g.gem_name,'rarity',g.rarity,'finalWeight',g.final_weight,'weightMultiplier',g.rolled_weight_multiplier,'timestamp',now()) else key_specimen end,
  updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_daily_progress(player_id,shop_day,sacrificed_value) values(uid,(clock_timestamp() at time zone 'Asia/Singapore')::date,g.value)
 on conflict(player_id,shop_day) do update set sacrificed_value=public.deepcore_daily_progress.sacrificed_value+g.value;
 if p_objective='key' then perform deepcore_private.grant_cosmetic(uid,'deepcore-keyholder','phase-6-key'); end if;
 perform deepcore_private.resolve_route(); perform deepcore_private.advance_state(); return public.get_deepcore_snapshot();
exception when unique_violation then return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_buy_supply(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.deepcore_event_state%rowtype; dp public.deepcore_players%rowtype; next_level integer; cost numeric;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if; if deepcore_private.status()<>'active' then raise exception 'deepcore_not_active'; end if;
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 insert into public.deepcore_players(player_id) values(uid) on conflict do nothing; select * into dp from public.deepcore_players where player_id=uid for update;
 next_level:=dp.supply_level+1; cost:=(array[5000000,10000000,20000000,30000000,50000000,75000000])[next_level];
 if next_level>6 or (next_level<=3 and e.phase<2) or (next_level>3 and e.phase<3) then raise exception 'supply_locked'; end if;
 update public.players set money=money-cost where id=uid and money>=cost; if not found then raise exception 'insufficient_funds'; end if;
 if p_request_id is null then raise exception 'invalid_request'; end if;
 insert into public.deepcore_supply_purchases(player_id,level,request_id,cost) values(uid,next_level,p_request_id,cost);
 update public.deepcore_players set supply_level=next_level,supply_spending=supply_spending+cost,updated_at=now() where player_id=uid;
 update public.deepcore_event_state set supply_spending=supply_spending+cost,updated_at=now() where event_key=e.event_key;
 return public.get_deepcore_snapshot();
exception when unique_violation then return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_buy_consumable(p_item text,p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.deepcore_event_state%rowtype; price numeric; lim integer; bought integer; day date;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if; if deepcore_private.status()<>'active' then raise exception 'deepcore_not_active'; end if;
 if p_quantity<1 or p_request_id is null then raise exception 'invalid_quantity'; end if; select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if p_item='deepcore-catalyst' and e.phase in (51,52,6,7) then price:=5000000;lim:=5;
 elsif p_item='pressurized-catalyst' and e.phase in (6,7) then price:=15000000;lim:=3;
 elsif p_item='seismic-potion' and e.phase=7 and e.effective_funding>=15000000000 then price:=40000000;lim:=2;
 elsif p_item='unstable-core' and e.phase=7 and e.effective_funding>=25000000000 then price:=100000000;lim:=1;
 else raise exception 'consumable_locked'; end if;
 day:=(clock_timestamp() at time zone 'Asia/Singapore')::date;
 select quantity into bought from public.deepcore_shop_purchases where player_id=uid and item_id=p_item and shop_day=day for update; bought:=coalesce(bought,0);
 if bought+p_quantity>lim then raise exception 'daily_limit'; end if;
 insert into public.deepcore_item_actions(player_id,request_id,action,item_id) values(uid,p_request_id,'buy',p_item);
 update public.players set money=money-price*p_quantity where id=uid and money>=price*p_quantity; if not found then raise exception 'insufficient_funds'; end if;
 insert into public.deepcore_shop_purchases(player_id,item_id,shop_day,quantity) values(uid,p_item,day,p_quantity)
 on conflict(player_id,item_id,shop_day) do update set quantity=public.deepcore_shop_purchases.quantity+excluded.quantity,updated_at=now();
 perform deepcore_private.grant_consumable(uid,p_item,p_quantity); return public.get_deepcore_snapshot();
exception when unique_violation then return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_use_consumable(p_item text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); charges integer; expiry timestamptz;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'invalid_request'; end if;
 if p_item not in ('deepcore-catalyst','pressurized-catalyst','seismic-potion','unstable-core') then raise exception 'invalid_consumable'; end if;
 insert into public.deepcore_item_actions(player_id,request_id,action,item_id) values(uid,p_request_id,'use',p_item);
 update public.player_consumables set quantity=quantity-1,updated_at=now() where player_id=uid and consumable_id=p_item and quantity>0;
 if not found then raise exception 'not_owned'; end if;
 if p_item='deepcore-catalyst' then charges:=25; elsif p_item='unstable-core' then charges:=10; else expiry:=now()+interval '60 seconds'; end if;
 insert into public.deepcore_player_effects(player_id,effect_id,expires_at,rolls_remaining) values(uid,p_item,expiry,charges)
 on conflict(player_id,effect_id) do update set expires_at=case when excluded.expires_at is null then public.deepcore_player_effects.expires_at else greatest(coalesce(public.deepcore_player_effects.expires_at,now()),now())+interval '60 seconds' end,
 rolls_remaining=case when excluded.rolls_remaining is null then public.deepcore_player_effects.rolls_remaining else coalesce(public.deepcore_player_effects.rolls_remaining,0)+excluded.rolls_remaining end,updated_at=now();
 return public.deepcore_get_roll_context(uid);
exception when unique_violation then return public.deepcore_get_roll_context(uid);
end $$;

create or replace function public.deepcore_set_auto_contribute(p_enabled boolean,p_min_rarity numeric default 1,p_max_rarity numeric default null,p_max_value numeric default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ph integer;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if; select phase into ph from public.deepcore_event_state where event_key='deepcore-2026';
 if p_enabled and (deepcore_private.status()<>'active' or ph not in (2,3,4)) then raise exception 'auto_contribute_unavailable'; end if;
 insert into public.deepcore_players(player_id,auto_contribute,auto_min_rarity,auto_max_rarity,auto_max_value)
 values(uid,p_enabled,greatest(1,coalesce(p_min_rarity,1)),p_max_rarity,p_max_value)
 on conflict(player_id) do update set auto_contribute=excluded.auto_contribute,auto_min_rarity=excluded.auto_min_rarity,
 auto_max_rarity=excluded.auto_max_rarity,auto_max_value=excluded.auto_max_value,updated_at=now(); return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_auto_contribute_roll(p_player_id uuid,p_specimen jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; dp public.deepcore_players%rowtype; objective text; rarity numeric:=coalesce((p_specimen->>'rarity')::numeric,0); val numeric:=coalesce((p_specimen->>'value')::numeric,0); wm numeric:=coalesce((p_specimen->>'rolled_weight_multiplier')::numeric,0); is_dc boolean; mutated integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update; select * into dp from public.deepcore_players where player_id=p_player_id for update;
 if deepcore_private.status()<>'active' or not coalesce(dp.auto_contribute,false) or e.phase not in (2,3,4) then return jsonb_build_object('contributed',false); end if;
 if rarity<dp.auto_min_rarity or (dp.auto_max_rarity is not null and rarity>dp.auto_max_rarity) or (dp.auto_max_value is not null and val>dp.auto_max_value) then return jsonb_build_object('contributed',false); end if;
 if e.phase=2 and rarity between 1000 and 9999 then objective:='legendary'; elsif e.phase=3 then objective:='value'; elsif e.phase=4 and rarity between 10000 and 99999 then objective:='mythic'; else return jsonb_build_object('contributed',false); end if;
 is_dc:=(p_specimen->>'gem_name') in ('Core Sample','Drillstone','Compression Quartz','Seismic Crystal','Borealite','Mantleheart','Deepcore Geode','Blacksite Crystal','Crystalline Singularity','Ontological Shard','Heart of the Deep');
 mutated:=case when jsonb_array_length(coalesce(p_specimen->'mutation_ids','[]'::jsonb))>0 then 1 else 0 end;
 insert into public.deepcore_sacrifices(player_id,objective,gem_name,rarity,value,final_weight,weight_multiplier,automatic)
 values(p_player_id,objective,p_specimen->>'gem_name',rarity,val,coalesce((p_specimen->>'final_weight')::numeric,0),wm,true);
 update public.deepcore_players set sacrificed_value=sacrificed_value+val,specimens_sacrificed=specimens_sacrificed+1,
 deepcore_gems_found=deepcore_gems_found+case when is_dc then 1 else 0 end,best_weight_multiplier=greatest(best_weight_multiplier,wm),mutated_gems=mutated_gems+mutated,updated_at=now() where player_id=p_player_id;
 insert into public.deepcore_daily_progress(player_id,shop_day,mutated_gems,deepcore_gems,max_weight,sacrificed_value)
 values(p_player_id,(clock_timestamp() at time zone 'Asia/Singapore')::date,mutated,case when is_dc then 1 else 0 end,wm,val)
 on conflict(player_id,shop_day) do update set mutated_gems=public.deepcore_daily_progress.mutated_gems+excluded.mutated_gems,
 deepcore_gems=public.deepcore_daily_progress.deepcore_gems+excluded.deepcore_gems,max_weight=greatest(public.deepcore_daily_progress.max_weight,excluded.max_weight),sacrificed_value=public.deepcore_daily_progress.sacrificed_value+excluded.sacrificed_value;
 update public.deepcore_event_state set legendary_sacrificed=legendary_sacrificed+case when objective='legendary' then 1 else 0 end,
 mythic_sacrificed=mythic_sacrificed+case when objective='mythic' then 1 else 0 end,sacrificed_value=sacrificed_value+case when objective='value' then val else 0 end,
 heavy_specimen_met=heavy_specimen_met or (e.phase=4 and wm>=10),updated_at=now() where event_key=e.event_key;
 perform deepcore_private.advance_state(); return jsonb_build_object('contributed',true,'objective',objective);
end $$;

create or replace function public.deepcore_get_roll_context(p_player_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with e as (select * from public.deepcore_event_state where event_key='deepcore-2026'), p as (select * from public.deepcore_players where player_id=p_player_id), fx as (
  select coalesce(jsonb_object_agg(effect_id,jsonb_build_object('expiresAt',expires_at,'rollsRemaining',rolls_remaining)),'{}') effects
  from public.deepcore_player_effects where player_id=p_player_id and (expires_at>now() or rolls_remaining>0)
 ) select jsonb_build_object('status',deepcore_private.status(),'phase',e.phase,'routeWinner',e.route_winner,
  'effectiveFunding',e.effective_funding,'heartMultiplier',least(1.75,1+greatest(0,floor((e.effective_funding-10000000000)/1000000000))*.05),
  'autoContribute',coalesce(p.auto_contribute,false),'effects',fx.effects,
  'rollCard',exists(select 1 from public.player_cosmetics where player_id=p_player_id and cosmetic_id='deepcore-roll-card')) from e,p right join fx on true;
$$;
create or replace function public.deepcore_consume_roll_effects(p_player_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 update public.deepcore_player_effects set rolls_remaining=rolls_remaining-1,updated_at=now() where player_id=p_player_id and effect_id in ('deepcore-catalyst','unstable-core') and rolls_remaining>0;
 delete from public.deepcore_player_effects where player_id=p_player_id and rolls_remaining is not null and rolls_remaining<=0;
end $$;

create or replace function public.deepcore_claim_reward(p_reward_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item jsonb; reward public.deepcore_rewards%rowtype;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
 if not exists(select 1 from public.deepcore_players where player_id=uid and eligible_at is not null and eligible_at<'2026-10-04T00:00:00Z') then raise exception 'not_eligible'; end if;
 select * into reward from public.deepcore_rewards where reward_key=p_reward_key; if not found then raise exception 'reward_locked'; end if;
 insert into public.deepcore_reward_claims(player_id,reward_key) values(uid,p_reward_key);
 for item in select value from jsonb_array_elements(reward.payload) loop
  if item ? 'id' then perform deepcore_private.grant_consumable(uid,item->>'id',(item->>'quantity')::integer); end if;
  if item ? 'cosmetic' then perform deepcore_private.grant_cosmetic(uid,item->>'cosmetic',p_reward_key); end if;
 end loop; return public.get_deepcore_snapshot();
exception when unique_violation then return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_open_crate(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r double precision; item text; qty integer; bonus boolean;
begin
 if uid is null then raise exception 'auth_required' using errcode='42501'; end if;
 if exists(select 1 from public.deepcore_crate_openings where player_id=uid and request_id=p_request_id) then return (select jsonb_build_object('primary',primary_reward,'rollCard',roll_card_awarded) from public.deepcore_crate_openings where player_id=uid and request_id=p_request_id); end if;
 update public.player_consumables set quantity=quantity-1,updated_at=now() where player_id=uid and consumable_id='deepcore-crate' and quantity>0; if not found then raise exception 'not_owned'; end if;
 r:=random();
 if r<.30 then item:='deepcore-catalyst';qty:=2; elsif r<.50 then item:='deepcore-catalyst';qty:=3; elsif r<.75 then item:='pressurized-catalyst';qty:=1;
 elsif r<.87 then item:='pressurized-catalyst';qty:=2; elsif r<.94 then item:='legendary-potion';qty:=1; elsif r<.97 then item:='mythic-potion';qty:=1;
 elsif r<.99 then item:='seismic-potion';qty:=1; else item:='unstable-core';qty:=1; end if;
 perform deepcore_private.grant_consumable(uid,item,qty); bonus:=random()<1.0/250.0;
 if bonus then perform deepcore_private.grant_cosmetic(uid,'deepcore-roll-card','deepcore-crate'); end if;
 insert into public.deepcore_crate_openings(player_id,request_id,primary_reward,roll_card_awarded) values(uid,p_request_id,jsonb_build_object('id',item,'quantity',qty),bonus);
 return jsonb_build_object('primary',jsonb_build_object('id',item,'quantity',qty),'rollCard',bonus);
end $$;

create or replace function deepcore_private.quest_rows(p_player uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with p as (select * from public.deepcore_players where player_id=p_player), d as (select * from public.deepcore_daily_progress where player_id=p_player and shop_day=(clock_timestamp() at time zone 'Asia/Singapore')::date),
 q(k,label,progress,target,data) as (values
  ('project-roll-1k','Clocking In',(select event_rolls from p),1000,3),('project-roll-5k','Another Day Underground',(select event_rolls from p),5000,4),
  ('project-roll-10k','Deepcore Employee',(select event_rolls from p),10000,5),('project-roll-25k','Overtime',(select event_rolls from p),25000,6),('project-roll-50k','No Sunlight Required',(select event_rolls from p),50000,8),
  ('project-fund-10m','Project Backer',(select actual_funding from p),10000000,3),('project-fund-50m','Investor',(select actual_funding from p),50000000,5),('project-fund-100m','Benefactor',(select actual_funding from p),100000000,7),
  ('project-supply-4','Industrialisation',(select supply_level from p),4,4),('project-supply-6','Maximum Capacity',(select supply_level from p),6,6),
  ('project-weight-5','Getting Heavy',(select best_weight_multiplier from p),5,4),('project-weight-10','Under Pressure',(select best_weight_multiplier from p),10,8),
  ('project-gems-3','Field Research',(select deepcore_gems_found from p),3,3),('project-gems-5','Deepcore Researcher',(select deepcore_gems_found from p),5,5),
  ('project-route','Into the Unknown',case when (select route_participated from p) then 1 else 0 end,1,3)
 ), daily(k,label,progress,target,data) as (values
  ('daily-'||(clock_timestamp() at time zone 'Asia/Singapore')::date||'-roll','Another Shift',coalesce((select rolls from d),0),case when extract(day from clock_timestamp() at time zone 'Asia/Singapore')::int%2=0 then 500 else 250 end,case when extract(day from clock_timestamp() at time zone 'Asia/Singapore')::int%2=0 then 2 else 1 end),
  ('daily-'||(clock_timestamp() at time zone 'Asia/Singapore')::date||'-gameplay','Pressure Study',greatest(coalesce((select mutated_gems from d),0),case when coalesce((select max_weight from d),0)>=3 then 5 else 0 end),5,2),
  ('daily-'||(clock_timestamp() at time zone 'Asia/Singapore')::date||'-project','Project Funding',coalesce((select actual_funding from d),0),1000000,2)
 ) select jsonb_build_object('project',coalesce((select jsonb_agg(jsonb_build_object('key',k,'label',label,'progress',progress,'target',target,'data',data,'claimed',exists(select 1 from public.deepcore_quest_claims c where c.player_id=p_player and c.quest_key=k))) from q),'[]'),
 'daily',coalesce((select jsonb_agg(jsonb_build_object('key',k,'label',label,'progress',progress,'target',target,'data',data,'claimed',exists(select 1 from public.deepcore_quest_claims c where c.player_id=p_player and c.quest_key=k))) from daily),'[]'));
$$;

create or replace function public.deepcore_claim_quest(p_quest_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); quests jsonb; q jsonb; award integer;
begin
 if uid is null or deepcore_private.status()<>'active' then raise exception 'deepcore_not_active'; end if;
 quests:=deepcore_private.quest_rows(uid);
 select value into q from jsonb_array_elements((quests->'daily')||(quests->'project')) where value->>'key'=p_quest_key;
 if q is null or (q->>'claimed')::boolean or (q->>'progress')::numeric<(q->>'target')::numeric then raise exception 'quest_incomplete'; end if;
 award:=(q->>'data')::integer; insert into public.deepcore_quest_claims(player_id,quest_key,data_awarded) values(uid,p_quest_key,award);
 update public.deepcore_players set research_data=least(75,research_data+award),updated_at=now() where player_id=uid; return public.get_deepcore_snapshot();
end $$;

create or replace function public.deepcore_claim_research(p_milestone integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); data integer; item text; qty integer;
begin
 if uid is null or p_milestone not in (5,10,20,30,40,50,60,70,75) then raise exception 'invalid_milestone'; end if;
 select research_data into data from public.deepcore_players where player_id=uid; if coalesce(data,0)<p_milestone then raise exception 'milestone_locked'; end if;
 insert into public.deepcore_research_claims(player_id,milestone) values(uid,p_milestone);
 if p_milestone=5 then perform deepcore_private.grant_consumable(uid,'deepcore-catalyst',2);
 elsif p_milestone=10 then perform deepcore_private.grant_consumable(uid,'pressurized-catalyst',1);
 elsif p_milestone=20 then perform deepcore_private.grant_consumable(uid,'deepcore-catalyst',2); perform deepcore_private.grant_consumable(uid,'pressurized-catalyst',1);
 elsif p_milestone=30 then perform deepcore_private.grant_cosmetic(uid,'deepcore-researcher','research-30');
 elsif p_milestone in (40,60) then perform deepcore_private.grant_consumable(uid,'deepcore-crate',1);
 elsif p_milestone=50 then perform deepcore_private.grant_consumable(uid,'seismic-potion',1);
 elsif p_milestone=70 then perform deepcore_private.grant_consumable(uid,'mythic-potion',1);
 elsif p_milestone=75 then perform deepcore_private.grant_cosmetic(uid,'deepcore-field-research','research-75'); end if;
 return public.get_deepcore_snapshot();
end $$;

create or replace function deepcore_private.finalize() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; r record;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if clock_timestamp()<e.ends_at or e.archived_at is not null then return; end if;
 insert into public.deepcore_final_leaderboard(board,rank,player_id,username,amount)
 select 'actual',row_number() over(order by d.actual_funding desc,d.player_id),d.player_id,coalesce(p.username,'Unknown'),d.actual_funding from public.deepcore_players d join public.players p on p.id=d.player_id where d.actual_funding>0 order by d.actual_funding desc limit 100;
 insert into public.deepcore_final_leaderboard(board,rank,player_id,username,amount)
 select 'effective',row_number() over(order by d.effective_funding desc,d.player_id),d.player_id,coalesce(p.username,'Unknown'),d.effective_funding from public.deepcore_players d join public.players p on p.id=d.player_id where d.effective_funding>0 order by d.effective_funding desc limit 100;
 for r in select * from public.deepcore_final_leaderboard where rank<=5 loop
  perform deepcore_private.grant_cosmetic(r.player_id,case when r.board='actual' then 'deepcore-benefactor' else 'deepcore-architect' end,'leaderboard-'||r.board||'-'||r.rank);
  if r.rank=1 then perform deepcore_private.grant_cosmetic(r.player_id,case when r.board='actual' then 'deepcore-benefactor-first' else 'deepcore-architect-first' end,'leaderboard-'||r.board||'-1'); end if;
 end loop;
 for r in select a.player_id from public.deepcore_final_leaderboard a join public.deepcore_final_leaderboard b using(player_id) where a.board='actual' and b.board='effective' and a.rank<=5 and b.rank<=5 loop
  perform deepcore_private.grant_cosmetic(r.player_id,'deepcore-magnate','leaderboard-double-top-five'); end loop;
 update public.deepcore_event_state set archived_at=clock_timestamp(),community_rolls=(select coalesce(sum(event_rolls),0) from public.deepcore_players),final_report=jsonb_build_object('effectiveFunding',effective_funding,'actualFunding',actual_funding,'supplySpending',supply_spending,'phase',phase,'participants',(select count(*) from public.deepcore_players),'eligibleParticipants',(select count(*) from public.deepcore_players where eligible_at is not null),'communityRolls',(select coalesce(sum(event_rolls),0) from public.deepcore_players),'routeWinner',route_winner,'heartMultiplier',least(1.75,1+greatest(0,floor((effective_funding-10000000000)/1000000000))*.05)),updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_project_log(entry_key,title,body) select 'final-report','DEEPCORE PROJECT — FINAL REPORT',final_report from public.deepcore_event_state where event_key=e.event_key on conflict do nothing;
end $$;

create or replace function public.get_deepcore_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; e public.deepcore_event_state%rowtype;
begin
 perform deepcore_private.finalize(); select * into e from public.deepcore_event_state where event_key='deepcore-2026';
 if uid is not null then insert into public.deepcore_players(player_id) values(uid) on conflict do nothing; end if;
 select jsonb_build_object(
  'serverNow',clock_timestamp(),'status',deepcore_private.status(),'event',jsonb_set(to_jsonb(e),'{community_rolls}',to_jsonb((select coalesce(sum(event_rolls),0) from public.deepcore_players))),
  'player',case when uid is null then null else (select to_jsonb(p)||jsonb_build_object('efficiency',deepcore_private.efficiency(p.supply_level),'inventory',coalesce((select jsonb_object_agg(consumable_id,quantity) from public.player_consumables where player_id=uid and consumable_id in ('deepcore-catalyst','pressurized-catalyst','seismic-potion','unstable-core','deepcore-crate')),'{}'),'effects',coalesce((select jsonb_agg(to_jsonb(x)) from public.deepcore_player_effects x where player_id=uid and (expires_at>now() or rolls_remaining>0)),'[]')) from public.deepcore_players p where p.player_id=uid) end,
  'rewards',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('claimed',uid is not null and exists(select 1 from public.deepcore_reward_claims c where c.player_id=uid and c.reward_key=r.reward_key)) order by sort_order) from public.deepcore_rewards r),'[]'),
  'quests',case when uid is null then null else deepcore_private.quest_rows(uid) end,
  'researchClaims',case when uid is null then '[]'::jsonb else coalesce((select jsonb_agg(milestone) from public.deepcore_research_claims where player_id=uid),'[]') end,
  'discoveries',case when uid is null then '{}'::jsonb else jsonb_build_object('pathfinder',exists(select 1 from public.player_cosmetics where player_id=uid and cosmetic_id='deepcore-pathfinder'),'blacksite',exists(select 1 from public.player_cosmetics where player_id=uid and cosmetic_id='deepcore-blacksite'),'heart',exists(select 1 from public.player_cosmetics where player_id=uid and cosmetic_id='deepcore-from-the-deep')) end,
  'leaderboards',case when e.archived_at is not null then jsonb_build_object('actual',coalesce((select jsonb_agg(to_jsonb(f) order by rank) from public.deepcore_final_leaderboard f where board='actual'),'[]'),'effective',coalesce((select jsonb_agg(to_jsonb(f) order by rank) from public.deepcore_final_leaderboard f where board='effective'),'[]')) else jsonb_build_object('actual',coalesce((select jsonb_agg(x) from (select row_number() over(order by d.actual_funding desc,d.player_id) rank,p.username,d.player_id,d.actual_funding amount from public.deepcore_players d join public.players p on p.id=d.player_id where d.actual_funding>0 order by d.actual_funding desc limit 100)x),'[]'),'effective',coalesce((select jsonb_agg(x) from (select row_number() over(order by d.effective_funding desc,d.player_id) rank,p.username,d.player_id,d.effective_funding amount from public.deepcore_players d join public.players p on p.id=d.player_id where d.effective_funding>0 order by d.effective_funding desc limit 100)x),'[]')) end,
  'log',coalesce((select jsonb_agg(to_jsonb(l) order by occurred_at) from public.deepcore_project_log l),'[]')) into result;
 return result;
end $$;

revoke all on function public.deepcore_contribute(numeric,text,uuid),public.deepcore_sacrifice(bigint,text,uuid),public.deepcore_buy_supply(uuid),public.deepcore_buy_consumable(text,integer,uuid),public.deepcore_use_consumable(text,uuid),public.deepcore_set_auto_contribute(boolean,numeric,numeric,numeric),public.deepcore_claim_reward(text),public.deepcore_open_crate(uuid),public.deepcore_claim_quest(text),public.deepcore_claim_research(integer),public.get_deepcore_snapshot() from public,anon,authenticated;
grant execute on function public.deepcore_contribute(numeric,text,uuid),public.deepcore_sacrifice(bigint,text,uuid),public.deepcore_buy_supply(uuid),public.deepcore_buy_consumable(text,integer,uuid),public.deepcore_use_consumable(text,uuid),public.deepcore_set_auto_contribute(boolean,numeric,numeric,numeric),public.deepcore_claim_reward(text),public.deepcore_open_crate(uuid),public.deepcore_claim_quest(text),public.deepcore_claim_research(integer),public.get_deepcore_snapshot() to authenticated;
revoke all on function public.deepcore_auto_contribute_roll(uuid,jsonb),public.deepcore_get_roll_context(uuid),public.deepcore_consume_roll_effects(uuid) from public,anon,authenticated;
grant execute on function public.deepcore_auto_contribute_roll(uuid,jsonb),public.deepcore_get_roll_context(uuid),public.deepcore_consume_roll_effects(uuid) to service_role;

commit;
