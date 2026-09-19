-- Deep Sea limited event. Prepared against igrddscmrdrrwtvyspbf on 2026-09-19.
-- This migration is intentionally not deployed by this change set.
begin;

create schema if not exists deep_sea_private;
revoke all on schema deep_sea_private from public, anon, authenticated;

create table public.deep_sea_gems (
  id bigint generated always as identity primary key,
  name text not null unique,
  rarity numeric not null check (rarity >= 1),
  base_weight numeric not null check (base_weight > 0),
  value_per_gram numeric not null check (value_per_gram >= 0),
  description text not null,
  sort_order integer not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.deep_sea_gems enable row level security;
revoke all on public.deep_sea_gems from public, anon, authenticated;
grant select on public.deep_sea_gems to authenticated;
grant all on public.deep_sea_gems to service_role;
create policy deep_sea_catalog_read on public.deep_sea_gems for select to authenticated using (enabled);

insert into public.deep_sea_gems(name,rarity,base_weight,value_per_gram,description,sort_order) values
('Water',1,1000,0.00000324,'There''s nothing here. At least you didn''t come back completely empty-handed.',0),
('Clay',1000,250,0.4,'Soft sediment dredged from the ocean floor. There is an awful lot of it down here.',1),
('Salt Crystal',2500,100,2,'A crystal formed where ancient seawater once gathered. Somehow, it''s still salty.',2),
('Seaweed',6000,500,1,'It survived where sunlight barely reaches. You''re not sure why you brought it back.',3),
('Sand Rock',15000,750,2,'Layers of seabed compressed into a surprisingly sturdy rock. It''s mostly sand pretending to be important.',4),
('Sea Salt Rock',40000,400,10,'A chunk of mineral-rich salt hardened beneath the waves. Do not lick the specimen.',5),
('Prismarine Fragment',100000,125,80,'A strange blue-green crystal recovered from the depths. It seems to shimmer differently underwater.',6),
('Ancient Coin',250000,30,1000,'A weathered coin from something long since swallowed by the sea. Whatever bought it originally is probably gone too.',7),
('Pearl',600000,20,4000,'A near-perfect pearl formed far beneath the surface. Simple, valuable, and surprisingly difficult to find.',8),
('Pearl of the Sea',1500000,100,2500,'A pearl infused with the colour of the deepest ocean. Holding it feels strangely like hearing distant waves.',9),
('Nautilii',4000000,600,1000,'An ancient shell carrying patterns that seem almost deliberate. The ocean has been working on this one for a very long time.',10),
('Sunken Treasure',10000000,2500,600,'Riches recovered from a vessel forgotten beneath the waves. Apparently nobody else found the map.',11),
('Abyssal Coral',25000000,750,4000,'Coral that somehow flourished far below the reach of sunlight. Its branches glow faintly in the darkness.',12),
('Trenchstone',60000000,5000,1500,'A stone shaped under the crushing pressure of an ocean trench. Bringing it to the surface feels like disturbing something.',13),
('Coral',125000000,1250,12000,'An extraordinary colony preserved from the deepest reaches of the sea. It seems almost too perfect to have formed naturally.',14),
('Leviathan Scale',250000000,4000,7500,'A colossal scale belonging to something you would rather not meet. Whatever shed it is probably still down there.',15),
('Heart of the Sea',500000000,500,120000,'The ocean seems to pulse within this crystal. For a moment, the waves around you feel perfectly still.',16),
('Neptune''s Tear',1000000000,50,2500000,'A single tear said to have fallen from Neptune himself. Even outside the ocean, it never seems to dry.',17),
('Soul of the Sea God',2500000000,2500,100000,'The depths fall silent around it. You have found something the ocean was never supposed to surrender.',18);

insert into public.private_feature_gems(name,rarity,base_weight,value_per_gram,sort_order,enabled,metadata,description,affected_by_luck,special_gem,required_event_key)
values
('Hadopelagic',100,6000,850,9398,true,'{"abyssalPotionExclusive":true}','Light has never reached this place. Neither were you supposed to. Obtained exclusively from an Abyssal Potion.',false,true,'abyssal_potion'),
('The Bottom',2000,11000,100000,9399,true,'{"abyssalPotionExclusive":true}','There is nothing beneath you anymore. Whatever brought you here has nowhere deeper to go. Obtained exclusively from an Abyssal Potion.',false,true,'abyssal_potion')
on conflict(name) do update set rarity=excluded.rarity,base_weight=excluded.base_weight,value_per_gram=excluded.value_per_gram,metadata=excluded.metadata,description=excluded.description,affected_by_luck=false,special_gem=true,required_event_key='abyssal_potion';

create table public.deep_sea_event_runs (
 id text primary key,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 redemption_ends_at timestamptz not null,
 tidal_wave_occurrence_id uuid,
 check(starts_at < ends_at and ends_at < redemption_ends_at)
);
insert into public.deep_sea_event_runs(id,starts_at,ends_at,redemption_ends_at)
values('deep-sea-2026','2026-10-10 00:00:00+00','2026-10-24 00:00:00+00','2026-10-31 00:00:00+00');
alter table public.deep_sea_event_runs enable row level security;
revoke all on public.deep_sea_event_runs from public,anon,authenticated;
grant select on public.deep_sea_event_runs to authenticated;
grant all on public.deep_sea_event_runs to service_role;
create policy deep_sea_run_read on public.deep_sea_event_runs for select to authenticated using(true);

create table public.player_deep_sea_state (
 player_id uuid not null references public.players(id) on delete cascade,
 run_id text not null references public.deep_sea_event_runs(id),
 tide_tokens bigint not null default 0 check(tide_tokens >= 0),
 depth_step integer not null default 0 check(depth_step between 0 and 30),
 neptune_owned boolean not null default false,
 neptune_auto_feed boolean not null default false,
 depths_auto_feed boolean not null default false,
 offering_charges bigint not null default 0 check(offering_charges >= 0),
 treasure_tonic_rolls bigint not null default 0 check(treasure_tonic_rolls >= 0),
 diver_until timestamptz,
 tidal_rush_until timestamptz,
 pressure_until timestamptz,
 legacy_gem_name text references public.deep_sea_gems(name),
 legacy_claimed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(player_id,run_id)
);
create table public.player_deep_sea_progress (
 player_id uuid not null references public.players(id) on delete cascade,
 run_id text not null references public.deep_sea_event_runs(id),
 target text not null,
 gem_name text not null references public.deep_sea_gems(name),
 quantity bigint not null default 0 check(quantity >= 0),
 primary key(player_id,run_id,target,gem_name)
);
create table public.deep_sea_depth_requirements (
 step integer not null check(step between 1 and 30), gem_name text not null references public.deep_sea_gems(name), quantity bigint not null check(quantity > 0), primary key(step,gem_name)
);
create table public.deep_sea_depth_rewards (
 step integer primary key check(step between 1 and 30), reward_id text not null, quantity integer not null check(quantity > 0)
);
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price) values
('diver','Diver','luck',4,0.5,300,false,null),
('tidal-rush','Tidal Rush','rollSpeed',4,0.5,300,false,null),
('pressure','Pressure','weightLuck',4,1,300,false,null),
('treasure-tonic','Treasure Tonic','material',4,100,1,false,null),
('offering','Offering to Neptune','material',4,1,1,false,null),
('supply-crate','Deep Sea Supply Crate','material',4,1,1,false,null),
('abyssal-potion','Abyssal Potion','material',4,1,1,false,null)
on conflict(id) do update set name=excluded.name,family=excluded.family,tier=excluded.tier,effect_value=excluded.effect_value,duration_seconds=excluded.duration_seconds,purchasable=false,shop_price=null;
create table public.deep_sea_shop_items (
 item_id text primary key, price bigint not null check(price > 0), item_type text not null check(item_type in ('consumable','cosmetic')), enabled boolean not null default true
);
create table public.player_deep_sea_purchases (
 player_id uuid not null references public.players(id) on delete cascade, run_id text not null references public.deep_sea_event_runs(id), item_id text not null references public.deep_sea_shop_items(item_id), quantity bigint not null default 1, purchased_at timestamptz not null default now(), primary key(player_id,run_id,item_id)
);
create table deep_sea_private.roll_commits (
 player_id uuid not null, run_id text not null, lease_id uuid not null, genuine_roll bigint not null, result jsonb not null, committed_at timestamptz not null default clock_timestamp(), primary key(player_id,run_id,lease_id,genuine_roll)
);

alter table public.player_deep_sea_state enable row level security;
alter table public.player_deep_sea_progress enable row level security;
alter table public.deep_sea_depth_requirements enable row level security;
alter table public.deep_sea_depth_rewards enable row level security;
alter table public.deep_sea_shop_items enable row level security;
alter table public.player_deep_sea_purchases enable row level security;
revoke all on public.player_deep_sea_state,public.player_deep_sea_progress,public.deep_sea_depth_requirements,public.deep_sea_depth_rewards,public.deep_sea_shop_items,public.player_deep_sea_purchases from public,anon,authenticated;
grant select on public.player_deep_sea_state,public.player_deep_sea_progress,public.deep_sea_depth_requirements,public.deep_sea_depth_rewards,public.deep_sea_shop_items,public.player_deep_sea_purchases to authenticated;
grant all on public.player_deep_sea_state,public.player_deep_sea_progress,public.deep_sea_depth_requirements,public.deep_sea_depth_rewards,public.deep_sea_shop_items,public.player_deep_sea_purchases to service_role;
create policy deep_sea_own_state on public.player_deep_sea_state for select to authenticated using(player_id=(select auth.uid()));
create policy deep_sea_own_progress on public.player_deep_sea_progress for select to authenticated using(player_id=(select auth.uid()));
create policy deep_sea_requirements_read on public.deep_sea_depth_requirements for select to authenticated using(true);
create policy deep_sea_rewards_read on public.deep_sea_depth_rewards for select to authenticated using(true);
create policy deep_sea_shop_read on public.deep_sea_shop_items for select to authenticated using(enabled);
create policy deep_sea_own_purchases on public.player_deep_sea_purchases for select to authenticated using(player_id=(select auth.uid()));

insert into public.deep_sea_depth_requirements(step,gem_name,quantity) values
(1,'Clay',100),(2,'Clay',150),(2,'Salt Crystal',50),(3,'Salt Crystal',100),(3,'Seaweed',30),(4,'Clay',250),(4,'Seaweed',50),(4,'Sand Rock',20),(5,'Salt Crystal',150),(5,'Sand Rock',30),(5,'Sea Salt Rock',10),
(6,'Clay',400),(6,'Sea Salt Rock',20),(6,'Prismarine Fragment',5),(7,'Salt Crystal',250),(7,'Prismarine Fragment',10),(7,'Ancient Coin',2),(8,'Clay',600),(8,'Seaweed',150),(8,'Sand Rock',75),(9,'Salt Crystal',400),(9,'Sea Salt Rock',40),(9,'Prismarine Fragment',15),(10,'Clay',800),(10,'Ancient Coin',5),(10,'Pearl',1),
(11,'Seaweed',300),(11,'Prismarine Fragment',25),(11,'Pearl',2),(12,'Salt Crystal',700),(12,'Sea Salt Rock',75),(12,'Ancient Coin',10),(13,'Clay',1200),(13,'Sand Rock',200),(13,'Pearl',3),(14,'Prismarine Fragment',35),(14,'Pearl',4),(14,'Pearl of the Sea',1),(15,'Clay',1500),(15,'Seaweed',500),(15,'Ancient Coin',15),(15,'Pearl',5),
(16,'Salt Crystal',1000),(16,'Pearl',5),(16,'Pearl of the Sea',1),(16,'Nautilii',1),(17,'Clay',2000),(17,'Sea Salt Rock',100),(17,'Ancient Coin',20),(17,'Pearl of the Sea',2),(18,'Seaweed',700),(18,'Prismarine Fragment',50),(18,'Pearl',6),(18,'Nautilii',1),(19,'Salt Crystal',1300),(19,'Sand Rock',300),(19,'Pearl of the Sea',2),(19,'Sunken Treasure',1),(20,'Clay',2500),(20,'Ancient Coin',25),(20,'Pearl',7),(20,'Nautilii',1),
(21,'Seaweed',900),(21,'Sea Salt Rock',150),(21,'Prismarine Fragment',60),(21,'Pearl of the Sea',3),(22,'Salt Crystal',1600),(22,'Ancient Coin',25),(22,'Nautilii',1),(22,'Sunken Treasure',1),(23,'Clay',3000),(23,'Sand Rock',400),(23,'Pearl',8),(23,'Pearl of the Sea',3),(24,'Sea Salt Rock',175),(24,'Prismarine Fragment',70),(24,'Nautilii',1),(24,'Abyssal Coral',1),(25,'Clay',3500),(25,'Seaweed',1100),(25,'Ancient Coin',30),(25,'Pearl',8),(25,'Sunken Treasure',1),
(26,'Salt Crystal',2200),(26,'Sea Salt Rock',200),(26,'Pearl of the Sea',4),(26,'Nautilii',1),(27,'Clay',4000),(27,'Sand Rock',500),(27,'Prismarine Fragment',75),(27,'Pearl',8),(28,'Seaweed',1400),(28,'Ancient Coin',30),(28,'Pearl of the Sea',4),(28,'Nautilii',1),(29,'Salt Crystal',3000),(29,'Sand Rock',600),(29,'Sea Salt Rock',250),(29,'Pearl',8),
(30,'Clay',22000),(30,'Salt Crystal',8250),(30,'Seaweed',2870),(30,'Sand Rock',1075),(30,'Sea Salt Rock',180),(30,'Prismarine Fragment',105),(30,'Ancient Coin',18),(30,'Pearl',5),(30,'Pearl of the Sea',5),(30,'Nautilii',1);
insert into public.deep_sea_depth_rewards(step,reward_id,quantity) values
(1,'lucky-potion-1',2),(2,'speed-potion-1',2),(3,'fortune-potion-1',2),(4,'mass-potion-1',2),(5,'diver',1),(6,'lucky-potion-2',2),(7,'speed-potion-2',2),(8,'fortune-potion-2',2),(9,'mass-potion-2',2),(10,'supply-crate',1),(11,'diver',1),(12,'pressure',1),(13,'tidal-rush',1),(14,'lucky-potion-3',2),(15,'supply-crate',2),(16,'diver',2),(17,'pressure',1),(18,'tidal-rush',2),(19,'treasure-tonic',1),(20,'offering',1),(21,'diver',3),(22,'pressure',2),(23,'tidal-rush',3),(24,'treasure-tonic',2),(25,'offering',2),(26,'diver',5),(27,'pressure',3),(28,'treasure-tonic',3),(29,'offering',3),(30,'abyssal-potion',1);
insert into public.deep_sea_shop_items(item_id,price,item_type) values
('lucky-potion-2',1000,'consumable'),('fortune-potion-2',1000,'consumable'),('speed-potion-2',1000,'consumable'),('mass-potion-2',1250,'consumable'),('lucky-potion-3',2500,'consumable'),('fortune-potion-3',2500,'consumable'),('speed-potion-3',2500,'consumable'),('mass-potion-3',3000,'consumable'),('offering',5000,'consumable'),('diver',7500,'consumable'),('pressure',8500,'consumable'),('tidal-rush',10000,'consumable'),('supply-crate',12500,'consumable'),('treasure-tonic',1250,'consumable'),('abyssal-potion',750000,'consumable'),
('deep-diver-title',25000,'cosmetic'),('tidal-frame',50000,'cosmetic'),('prismarine-card',75000,'cosmetic'),('neptune-roll-button',125000,'cosmetic'),('abyssal-background',200000,'cosmetic'),('chosen-by-the-sea-title',250000,'cosmetic');

insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source,legacy_after) values
('deep-diver-title','Deep Diver',array['title'],'A permanent title from Deep Sea.','Epic','{"style":"deep-sea"}','deep-sea','2026-10-31 00:00:00+00'),
('tidal-frame','Tidal Frame',array['frame'],'An animated ocean frame.','Epic','{"style":"tidal"}','deep-sea','2026-10-31 00:00:00+00'),
('prismarine-card','Prismarine Gem Card',array['decor'],'Prismarine styling for gem cards.','Legendary','{"style":"prismarine-card"}','deep-sea','2026-10-31 00:00:00+00'),
('neptune-roll-button','Neptune Roll Button',array['decor'],'Neptune styling for the roll button.','Legendary','{"style":"neptune-roll"}','deep-sea','2026-10-31 00:00:00+00'),
('abyssal-background','Abyssal Background',array['background'],'A view into the abyss.','Mythic','{"style":"abyssal"}','deep-sea','2026-10-31 00:00:00+00'),
('chosen-by-the-sea-title','Chosen by the Sea',array['title'],'The sea remembers your name.','Mythic','{"style":"sea-chosen"}','deep-sea','2026-10-31 00:00:00+00')
on conflict(id) do nothing;

create or replace function deep_sea_private.phase(p_now timestamptz default clock_timestamp()) returns text language sql stable set search_path='' as $$
 select case when p_now<r.starts_at then 'teaser' when p_now<r.ends_at then 'active' when p_now<r.redemption_ends_at then 'redemption' else 'archived' end from public.deep_sea_event_runs r where id='deep-sea-2026'
$$;

create or replace function public.deep_sea_get_roll_context(p_player_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.player_deep_sea_state; result jsonb;
begin
 insert into public.player_deep_sea_state(player_id,run_id) values(p_player_id,'deep-sea-2026') on conflict do nothing;
 select * into s from public.player_deep_sea_state where player_id=p_player_id and run_id='deep-sea-2026';
 select jsonb_build_object('phase',deep_sea_private.phase(),'serverNow',clock_timestamp(),'gems',coalesce(jsonb_agg(to_jsonb(g) order by g.rarity desc),'[]'::jsonb),'state',to_jsonb(s),
  'neptuneNeeded',(select coalesce(jsonb_agg(r.name),'[]'::jsonb) from (values('Clay',500),('Salt Crystal',250),('Seaweed',100),('Sand Rock',50),('Sea Salt Rock',25),('Prismarine Fragment',10),('Ancient Coin',5),('Pearl',5),('Pearl of the Sea',1)) r(name,qty) where coalesce((select quantity from public.player_deep_sea_progress p where p.player_id=p_player_id and p.run_id='deep-sea-2026' and p.target='neptune' and p.gem_name=r.name),0)<r.qty),
  'depthsNeeded',(select coalesce(jsonb_agg(r.gem_name),'[]'::jsonb) from public.deep_sea_depth_requirements r where r.step=s.depth_step+1 and coalesce((select quantity from public.player_deep_sea_progress p where p.player_id=p_player_id and p.run_id='deep-sea-2026' and p.target='depths:'||(s.depth_step+1)::text and p.gem_name=r.gem_name),0)<r.quantity)
 ) into result from public.deep_sea_gems g where g.enabled;
 return result;
end $$;
revoke all on function public.deep_sea_get_roll_context(uuid) from public,anon,authenticated;
grant execute on function public.deep_sea_get_roll_context(uuid) to service_role;

create or replace function public.deep_sea_consume_abyssal(p_player_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.player_consumables set quantity=quantity-1,updated_at=clock_timestamp() where player_id=p_player_id and consumable_id='abyssal-potion' and quantity>=1;
 if not found then raise exception 'not_owned' using errcode='P0001'; end if;
end $$;
revoke all on function public.deep_sea_consume_abyssal(uuid) from public,anon,authenticated;
grant execute on function public.deep_sea_consume_abyssal(uuid) to service_role;

create or replace function public.deep_sea_commit_roll(p_player_id uuid,p_lease_id uuid,p_genuine_roll bigint,p_specimen jsonb,p_neptune boolean,p_inventory_required boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.player_deep_sea_state; g public.deep_sea_gems; first_discovery boolean; token_base bigint; token_award bigint; fed text; next_step int; req_count int; met_count int; reward public.deep_sea_depth_rewards; result jsonb; offering_used boolean:=false;
begin
 if deep_sea_private.phase() <> 'active' then raise exception 'deep_sea_event_ended' using errcode='P0001'; end if;
 select c.result into result from deep_sea_private.roll_commits c where c.player_id=p_player_id and c.run_id='deep-sea-2026' and c.lease_id=p_lease_id and c.genuine_roll=p_genuine_roll;
 if result is not null then return result; end if;
 select * into g from public.deep_sea_gems where name=p_specimen->>'gem_name' and enabled for share;
 if not found then raise exception 'invalid_deep_sea_gem'; end if;
 select exists(select 1 from public.player_gem_mutation_combinations c where c.player_id=p_player_id and c.gem_name=g.name) = false into first_discovery;
 select * into s from public.player_deep_sea_state where player_id=p_player_id and run_id='deep-sea-2026' for update;
 if not found then insert into public.player_deep_sea_state(player_id,run_id) values(p_player_id,'deep-sea-2026') returning * into s; end if;
 update public.players set money=money-5 where id=p_player_id and money>=5;
 if not found then raise exception 'insufficient_funds' using errcode='P0001'; end if;
 token_base:=case when g.name='Water' then 0 else floor(power(g.rarity::numeric,0.4))::bigint end;
 token_award:=token_base * case when s.treasure_tonic_rolls>0 then 2 else 1 end;
 if s.treasure_tonic_rolls>0 then s.treasure_tonic_rolls:=s.treasure_tonic_rolls-1; end if;
 if not first_discovery and s.neptune_auto_feed and not s.neptune_owned and exists(
   select 1 from (values('Clay',500),('Salt Crystal',250),('Seaweed',100),('Sand Rock',50),('Sea Salt Rock',25),('Prismarine Fragment',10),('Ancient Coin',5),('Pearl',5),('Pearl of the Sea',1)) r(name,qty)
   where r.name=g.name and coalesce((select quantity from public.player_deep_sea_progress where player_id=p_player_id and run_id='deep-sea-2026' and target='neptune' and gem_name=g.name),0)<r.qty
 ) then fed:='neptune';
 elsif not first_discovery and s.depths_auto_feed and exists(select 1 from public.deep_sea_depth_requirements r where r.step=s.depth_step+1 and r.gem_name=g.name and coalesce((select quantity from public.player_deep_sea_progress where player_id=p_player_id and run_id='deep-sea-2026' and target='depths:'||(s.depth_step+1)::text and gem_name=g.name),0)<r.quantity) then fed:='depths';
 end if;
 if p_inventory_required and fed is null then
   if (select count(*) from public.inventory_gems where player_id=p_player_id) >= (select inventory_capacity+coalesce((select inventory_bonus from public.player_research_effects where player_id=p_player_id),0) from public.players where id=p_player_id) then raise exception 'inventory_full' using errcode='P0001'; end if;
 end if;
 if fed is not null then insert into public.player_deep_sea_progress(player_id,run_id,target,gem_name,quantity) values(p_player_id,'deep-sea-2026',case when fed='depths' then 'depths:'||(s.depth_step+1)::text else fed end,g.name,1) on conflict(player_id,run_id,target,gem_name) do update set quantity=public.player_deep_sea_progress.quantity+1; end if;
 if p_neptune and s.offering_charges>0 then s.offering_charges:=s.offering_charges-1; offering_used:=true; end if;
 s.tide_tokens:=s.tide_tokens+token_award;
 loop
   next_step:=s.depth_step+1; exit when next_step>30;
   select count(*),count(*) filter(where coalesce(p.quantity,0)>=r.quantity) into req_count,met_count from public.deep_sea_depth_requirements r left join public.player_deep_sea_progress p on p.player_id=p_player_id and p.run_id='deep-sea-2026' and p.target='depths:'||next_step::text and p.gem_name=r.gem_name where r.step=next_step;
   exit when req_count=0 or met_count<>req_count;
   s.depth_step:=next_step; select * into reward from public.deep_sea_depth_rewards where step=next_step;
   insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(p_player_id,reward.reward_id,reward.quantity,clock_timestamp()) on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=excluded.updated_at;
 end loop;
 update public.player_deep_sea_state set tide_tokens=s.tide_tokens,depth_step=s.depth_step,offering_charges=s.offering_charges,treasure_tonic_rolls=s.treasure_tonic_rolls,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026';
 result:=jsonb_build_object('tideTokens',s.tide_tokens,'awarded',token_award,'firstDiscovery',first_discovery,'fed',fed,'depthStep',s.depth_step,'offeringConsumed',offering_used);
 insert into deep_sea_private.roll_commits values(p_player_id,'deep-sea-2026',p_lease_id,p_genuine_roll,result,clock_timestamp());
 return result;
end $$;
revoke all on function public.deep_sea_commit_roll(uuid,uuid,bigint,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.deep_sea_commit_roll(uuid,uuid,bigint,jsonb,boolean,boolean) to service_role;

-- Browser-facing snapshot and mutations are deliberately narrow; the edge function
-- authenticates the user and invokes these with the caller's uid.
create or replace function public.deep_sea_snapshot(p_player_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s public.player_deep_sea_state;
begin
 if uid is null or uid<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 insert into public.player_deep_sea_state(player_id,run_id) values(uid,'deep-sea-2026') on conflict do nothing;
 select * into s from public.player_deep_sea_state where player_id=uid and run_id='deep-sea-2026';
 if deep_sea_private.phase()='teaser' then
  return jsonb_build_object('phase','teaser','serverNow',clock_timestamp(),'run',(select to_jsonb(r) from public.deep_sea_event_runs r where id='deep-sea-2026'));
 end if;
 return jsonb_build_object('phase',deep_sea_private.phase(),'serverNow',clock_timestamp(),'run',(select to_jsonb(r) from public.deep_sea_event_runs r where id='deep-sea-2026'),'state',to_jsonb(s),'gems',(select jsonb_agg(to_jsonb(g) order by sort_order) from public.deep_sea_gems g where enabled),'requirements',(select jsonb_agg(to_jsonb(r) order by step,gem_name) from public.deep_sea_depth_requirements r),'rewards',(select jsonb_agg(to_jsonb(r) order by step) from public.deep_sea_depth_rewards r),'progress',(select coalesce(jsonb_agg(jsonb_set(to_jsonb(p),'{target}',to_jsonb(case when p.target like 'depths:%' then 'depths' else p.target end))),'[]'::jsonb) from public.player_deep_sea_progress p where player_id=uid and run_id='deep-sea-2026' and (p.target='neptune' or p.target='depths:'||(s.depth_step+1)::text)),'shop',(select jsonb_agg(to_jsonb(i) order by price) from public.deep_sea_shop_items i where enabled),'purchases',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.player_deep_sea_purchases p where player_id=uid and run_id='deep-sea-2026'),'consumables',(select coalesce(jsonb_object_agg(c.consumable_id,c.quantity),'{}'::jsonb) from public.player_consumables c where c.player_id=uid and c.consumable_id in ('diver','tidal-rush','pressure','treasure-tonic','offering','supply-crate','abyssal-potion')));
end $$;
revoke all on function public.deep_sea_snapshot(uuid) from public,anon;
grant execute on function public.deep_sea_snapshot(uuid) to authenticated;

create or replace function public.deep_sea_set_feed(p_player_id uuid,p_target text,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 if p_target not in ('neptune','depths') then raise exception 'invalid_target'; end if;
 insert into public.player_deep_sea_state(player_id,run_id) values(p_player_id,'deep-sea-2026') on conflict do nothing;
 if p_target='neptune' then update public.player_deep_sea_state set neptune_auto_feed=p_enabled,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026'; else update public.player_deep_sea_state set depths_auto_feed=p_enabled,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026'; end if;
 return public.deep_sea_snapshot(p_player_id);
end $$;
revoke all on function public.deep_sea_set_feed(uuid,text,boolean) from public,anon;
grant execute on function public.deep_sea_set_feed(uuid,text,boolean) to authenticated;

create or replace function deep_sea_private.consume_gems(p_player uuid,p_requirements jsonb) returns void language plpgsql security definer set search_path='' as $$
declare requirement jsonb; needed int; available int;
begin
 for requirement in select value from jsonb_array_elements(p_requirements) loop
  needed:=(requirement->>'quantity')::int;
  select count(*) into available from public.inventory_gems where player_id=p_player and gem_name=requirement->>'gem' and not locked;
  if available<needed then raise exception 'missing_recipe_gems:%',requirement->>'gem' using errcode='P0001'; end if;
 end loop;
 for requirement in select value from jsonb_array_elements(p_requirements) loop
  delete from public.inventory_gems where id in (select id from public.inventory_gems where player_id=p_player and gem_name=requirement->>'gem' and not locked order by id limit (requirement->>'quantity')::int);
 end loop;
end $$;

create or replace function public.deep_sea_craft_neptune(p_player_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare remaining jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 if deep_sea_private.phase() not in ('active','redemption') then raise exception 'wrong_phase' using errcode='P0001'; end if;
 insert into public.player_deep_sea_state(player_id,run_id) values(p_player_id,'deep-sea-2026') on conflict do nothing;
 if (select neptune_owned from public.player_deep_sea_state where player_id=p_player_id and run_id='deep-sea-2026' for update) then raise exception 'already_owned'; end if;
 update public.players set money=money-250000 where id=p_player_id and money>=250000; if not found then raise exception 'insufficient_funds' using errcode='P0001'; end if;
 select jsonb_agg(jsonb_build_object('gem',r.name,'quantity',greatest(0,r.qty-coalesce(p.quantity,0)))) into remaining
 from (values('Clay',500),('Salt Crystal',250),('Seaweed',100),('Sand Rock',50),('Sea Salt Rock',25),('Prismarine Fragment',10),('Ancient Coin',5),('Pearl',5),('Pearl of the Sea',1)) r(name,qty)
 left join public.player_deep_sea_progress p on p.player_id=p_player_id and p.run_id='deep-sea-2026' and p.target='neptune' and p.gem_name=r.name;
 perform deep_sea_private.consume_gems(p_player_id,remaining);
 delete from public.player_deep_sea_progress where player_id=p_player_id and run_id='deep-sea-2026' and target='neptune';
 update public.player_equipment set equipped=false where player_id=p_player_id and category='pickaxe' and equipped;
 insert into public.player_equipment(player_id,equipment_id,category,tier,name,luck_bonus,roll_speed_bonus,mutation_chance_bonus,weight_luck_bonus,weight_multiplier_bonus,equipped)
 values(p_player_id,'neptune','pickaxe',18,'Neptune',30,0.7,1.5,1.2,1.2,true) on conflict(player_id,equipment_id) do update set equipped=true;
 update public.player_deep_sea_state set neptune_owned=true,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026';
 return public.deep_sea_snapshot(p_player_id);
end $$;
revoke all on function public.deep_sea_craft_neptune(uuid) from public,anon;
grant execute on function public.deep_sea_craft_neptune(uuid) to authenticated;

create or replace function public.deep_sea_buy(p_player_id uuid,p_item_id text,p_quantity int default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.deep_sea_shop_items; total bigint; phase text:=deep_sea_private.phase();
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 if phase not in ('active','redemption') then raise exception 'wrong_phase' using errcode='P0001'; end if;
 if p_quantity<1 or p_quantity>100 then raise exception 'invalid_quantity'; end if;
 select * into item from public.deep_sea_shop_items where item_id=p_item_id and enabled; if not found then raise exception 'unknown_item'; end if;
 if item.item_type='cosmetic' and exists(select 1 from public.player_deep_sea_purchases where player_id=p_player_id and run_id='deep-sea-2026' and item_id=p_item_id) then raise exception 'already_owned'; end if;
 total:=item.price*p_quantity;
 update public.player_deep_sea_state set tide_tokens=tide_tokens-total,updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026' and tide_tokens>=total; if not found then raise exception 'insufficient_tide_tokens' using errcode='P0001'; end if;
 if item.item_type='consumable' then insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(p_player_id,p_item_id,p_quantity,clock_timestamp()) on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+excluded.quantity,updated_at=excluded.updated_at;
 else insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key) values(p_player_id,p_item_id,'deep-sea','deep-sea-2026') on conflict do nothing; end if;
 insert into public.player_deep_sea_purchases(player_id,run_id,item_id,quantity) values(p_player_id,'deep-sea-2026',p_item_id,p_quantity) on conflict(player_id,run_id,item_id) do update set quantity=public.player_deep_sea_purchases.quantity+excluded.quantity,purchased_at=clock_timestamp();
 return public.deep_sea_snapshot(p_player_id);
end $$;
revoke all on function public.deep_sea_buy(uuid,text,int) from public,anon;
grant execute on function public.deep_sea_buy(uuid,text,int) to authenticated;

create or replace function public.deep_sea_use(p_player_id uuid,p_item_id text,p_quantity int default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); family text; magnitude numeric; duration int;
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 if p_quantity<1 then raise exception 'invalid_quantity'; end if;
 update public.player_consumables set quantity=quantity-p_quantity,updated_at=now_at where player_id=p_player_id and consumable_id=p_item_id and quantity>=p_quantity; if not found then raise exception 'not_owned'; end if;
 if p_item_id='offering' then update public.player_deep_sea_state set offering_charges=offering_charges+p_quantity,updated_at=now_at where player_id=p_player_id and run_id='deep-sea-2026';
 elsif p_item_id='treasure-tonic' then update public.player_deep_sea_state set treasure_tonic_rolls=treasure_tonic_rolls+100*p_quantity,updated_at=now_at where player_id=p_player_id and run_id='deep-sea-2026';
 elsif p_item_id in ('diver','tidal-rush','pressure') then
  duration:=300*p_quantity;
  if p_item_id='diver' then update public.player_deep_sea_state set diver_until=greatest(coalesce(diver_until,now_at),now_at)+make_interval(secs=>duration),updated_at=now_at where player_id=p_player_id and run_id='deep-sea-2026';
  elsif p_item_id='tidal-rush' then update public.player_deep_sea_state set tidal_rush_until=greatest(coalesce(tidal_rush_until,now_at),now_at)+make_interval(secs=>duration),updated_at=now_at where player_id=p_player_id and run_id='deep-sea-2026';
  else update public.player_deep_sea_state set pressure_until=greatest(coalesce(pressure_until,now_at),now_at)+make_interval(secs=>duration),updated_at=now_at where player_id=p_player_id and run_id='deep-sea-2026'; end if;
 else raise exception 'item_requires_special_action'; end if;
 return public.deep_sea_snapshot(p_player_id);
end $$;
revoke all on function public.deep_sea_use(uuid,text,int) from public,anon;
grant execute on function public.deep_sea_use(uuid,text,int) to authenticated;

create or replace function public.deep_sea_open_crate(p_player_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare bonus text; roll numeric:=random()*100;
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 update public.player_consumables set quantity=quantity-1,updated_at=clock_timestamp() where player_id=p_player_id and consumable_id='supply-crate' and quantity>=1; if not found then raise exception 'not_owned'; end if;
 insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) select p_player_id,id,1,clock_timestamp() from unnest(array['lucky-potion-3','fortune-potion-3','mass-potion-3','speed-potion-3','diver']) id on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+1,updated_at=excluded.updated_at;
 bonus:=case when roll<.1 then 'abyssal-potion' when roll<2.1 then 'offering' when roll<8.1 then 'treasure-tonic' when roll<18.1 then 'pressure' when roll<30.1 then 'tidal-rush' when roll<50.1 then 'diver' end;
 if bonus is not null then insert into public.player_consumables(player_id,consumable_id,quantity,updated_at) values(p_player_id,bonus,1,clock_timestamp()) on conflict(player_id,consumable_id) do update set quantity=public.player_consumables.quantity+1,updated_at=excluded.updated_at; end if;
 return jsonb_build_object('bonus',bonus,'snapshot',public.deep_sea_snapshot(p_player_id));
end $$;
revoke all on function public.deep_sea_open_crate(uuid) from public,anon;
grant execute on function public.deep_sea_open_crate(uuid) to authenticated;

create or replace function public.deep_sea_claim_legacy(p_player_id uuid,p_gem_name text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid()<>p_player_id then raise exception 'not_authorized' using errcode='42501'; end if;
 if deep_sea_private.phase()<>'redemption' then raise exception 'wrong_phase' using errcode='P0001'; end if;
 if not exists(select 1 from public.deep_sea_gems where name=p_gem_name and enabled) then raise exception 'unknown_gem'; end if;
 update public.player_deep_sea_state set tide_tokens=tide_tokens-3000000,legacy_gem_name=p_gem_name,legacy_claimed_at=clock_timestamp(),updated_at=clock_timestamp() where player_id=p_player_id and run_id='deep-sea-2026' and tide_tokens>=3000000 and legacy_gem_name is null;
 if not found then raise exception 'legacy_unavailable' using errcode='P0001'; end if;
 return public.deep_sea_snapshot(p_player_id);
end $$;
revoke all on function public.deep_sea_claim_legacy(uuid,text) from public,anon;
grant execute on function public.deep_sea_claim_legacy(uuid,text) to authenticated;

-- Tidal Wave is scheduled through the existing global-event scheduler; every
-- stat multiplier is 1.1 and its exact occurrences remain an operator choice.
insert into public.global_event_definitions(event_key,name,icon,tier,duration_seconds,selection_weight,description,enabled,config)
values('tidal-wave','Tidal Wave','🌊','legendary',900,1,'All mining stats are multiplied by 1.1.',false,'{"luckMultiplier":1.1,"mutationMultiplier":1.1,"rollSpeedMultiplier":1.1,"weightLuckMultiplier":1.1,"weightMultiplier":1.1,"valueMultiplier":1.1,"deepSeaOnly":false}'::jsonb)
on conflict(event_key) do update set name=excluded.name,config=excluded.config;

comment on table public.deep_sea_gems is 'Authoritative, rerun-safe Deep Sea roll catalogue. Water is the explicit fallback.';
comment on function public.deep_sea_commit_roll(uuid,uuid,bigint,jsonb,boolean,boolean) is 'Idempotent per-subroll Deep Sea economy commit; uses clock_timestamp so a batch cannot cross the event cutoff.';
commit;
