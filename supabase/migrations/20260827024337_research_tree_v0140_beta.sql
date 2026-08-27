-- Research Tree v0.14.0 Beta
-- All expensive graph work happens on purchase/reset. Core functions read one
-- precompiled row from player_research_effects.

update public.game_section_settings
set enabled=true,
    label='Research Tree',
    short_label='Research',
    description='Spend Research Points on permanent branching upgrades.',
    icon='⌬'
where id='research-tree';

create table if not exists public.research_nodes (
  id text primary key,
  branch text not null check (branch in ('root','mining','specimen','engineering','exploration')),
  stage smallint not null check (stage between 0 and 4),
  name text not null,
  description text not null,
  cost integer not null check (cost >= 0),
  required_ap integer not null default 0 check (required_ap >= 0),
  prerequisites text[] not null default '{}',
  effects jsonb not null default '{}',
  sort_order integer not null,
  enabled boolean not null default true
);

create table if not exists public.player_research_profiles (
  player_id uuid primary key references public.players(id) on delete cascade,
  points_available integer not null default 0 check (points_available >= 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  points_spent integer not null default 0 check (points_spent >= 0),
  reset_count integer not null default 0 check (reset_count >= 0),
  last_reset_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_research_purchases (
  player_id uuid not null references public.players(id) on delete cascade,
  node_id text not null references public.research_nodes(id) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key (player_id,node_id)
);

create table if not exists public.research_point_ledger (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (player_id,source_type,source_key)
);
create index if not exists research_point_ledger_player_created_idx on public.research_point_ledger(player_id,created_at desc);

create table if not exists public.player_research_effects (
  player_id uuid primary key references public.players(id) on delete cascade,
  luck_multiplier numeric not null default 1,
  legendary_luck_multiplier numeric not null default 1,
  extreme_luck_multiplier numeric not null default 1,
  window_luck_multiplier numeric not null default 1,
  roll_speed_multiplier numeric not null default 1,
  weight_luck_multiplier numeric not null default 1,
  gem_value_multiplier numeric not null default 1,
  mutation_chance_multiplier numeric not null default 1,
  mutated_value_multiplier numeric not null default 1,
  compound_value_per_mutation numeric not null default 0,
  potion_duration_multiplier numeric not null default 1,
  potion_strength_multiplier numeric not null default 1,
  potion_duplicate_chance numeric not null default 0,
  masterwork_discount numeric not null default 0,
  masterwork_effect_multiplier numeric not null default 1,
  inventory_bonus integer not null default 0,
  season_xp_multiplier numeric not null default 1,
  expedition_discount numeric not null default 0,
  statistical_breakthrough boolean not null default false,
  flags jsonb not null default '{}',
  compiled_at timestamptz not null default now()
);

alter table public.research_nodes enable row level security;
alter table public.player_research_profiles enable row level security;
alter table public.player_research_purchases enable row level security;
alter table public.research_point_ledger enable row level security;
alter table public.player_research_effects enable row level security;

drop policy if exists research_nodes_read on public.research_nodes;
create policy research_nodes_read on public.research_nodes for select to authenticated using (enabled);
drop policy if exists research_profile_read on public.player_research_profiles;
create policy research_profile_read on public.player_research_profiles for select to authenticated using (player_id=auth.uid());
drop policy if exists research_purchases_read on public.player_research_purchases;
create policy research_purchases_read on public.player_research_purchases for select to authenticated using (player_id=auth.uid());
drop policy if exists research_ledger_read on public.research_point_ledger;
create policy research_ledger_read on public.research_point_ledger for select to authenticated using (player_id=auth.uid());
drop policy if exists research_effects_read on public.player_research_effects;
create policy research_effects_read on public.player_research_effects for select to authenticated using (player_id=auth.uid());

revoke all on public.research_nodes,public.player_research_profiles,public.player_research_purchases,public.research_point_ledger,public.player_research_effects from public,anon,authenticated;
grant select on public.research_nodes,public.player_research_profiles,public.player_research_purchases,public.research_point_ledger,public.player_research_effects to authenticated;
grant all on public.research_nodes,public.player_research_profiles,public.player_research_purchases,public.research_point_ledger,public.player_research_effects to service_role;

insert into public.research_nodes(id,branch,stage,name,description,cost,required_ap,prerequisites,effects,sort_order) values
('research-fundamentals','root',0,'Research Fundamentals','Unlocks the four research branches.',0,0,'{}','{}',0),
('field-analysis-1','mining',1,'Field Analysis I','1% more Luck.',3,0,'{research-fundamentals}','{"luck":0.01}',101),
('field-analysis-2','mining',1,'Field Analysis II','1% more Luck.',4,0,'{field-analysis-1}','{"luck":0.01}',102),
('field-analysis-3','mining',1,'Field Analysis III','1% more Luck.',5,0,'{field-analysis-2}','{"luck":0.01}',103),
('efficient-motion-1','mining',1,'Efficient Motion I','1% faster rolls.',3,0,'{research-fundamentals}','{"speed":0.01}',104),
('efficient-motion-2','mining',1,'Efficient Motion II','1% faster rolls.',4,0,'{efficient-motion-1}','{"speed":0.01}',105),
('efficient-motion-3','mining',1,'Efficient Motion III','1% faster rolls.',5,0,'{efficient-motion-2}','{"speed":0.01}',106),
('mineral-density-1','mining',1,'Mineral Density I','2% more Weight Luck.',4,0,'{research-fundamentals}','{"weight":0.02}',107),
('mineral-density-2','mining',1,'Mineral Density II','2% more Weight Luck.',5,0,'{mineral-density-1}','{"weight":0.02}',108),
('rare-earth-survey','mining',2,'Rare Earth Survey','2% Luck for Legendary+ gems.',10,100,'{field-analysis-3}','{"legendaryLuck":0.02}',109),
('precision-extraction','mining',2,'Precision Extraction','2% more gem value.',10,100,'{field-analysis-2,mineral-density-1}','{"value":0.02}',110),
('weight-calibration-1','mining',2,'Weight Calibration I','1.5% more Weight Luck.',8,100,'{mineral-density-2}','{"weight":0.015}',111),
('weight-calibration-2','mining',2,'Weight Calibration II','1.5% more Weight Luck.',10,100,'{weight-calibration-1}','{"weight":0.015}',112),
('consistent-rhythm-1','mining',2,'Consistent Rhythm I','1% faster rolls.',8,100,'{efficient-motion-3}','{"speed":0.01}',113),
('consistent-rhythm-2','mining',2,'Consistent Rhythm II','1% faster rolls.',10,100,'{consistent-rhythm-1}','{"speed":0.01}',114),
('deep-site-analysis','mining',3,'Deep Site Analysis','3% Luck for 1-in-100,000+ gems.',18,400,'{rare-earth-survey}','{"extremeLuck":0.03}',115),
('refined-processing-1','mining',3,'Refined Processing I','1.5% more gem value.',12,400,'{precision-extraction}','{"value":0.015}',116),
('refined-processing-2','mining',3,'Refined Processing II','1.5% more gem value.',15,400,'{refined-processing-1}','{"value":0.015}',117),
('rapid-recovery-1','mining',3,'Rapid Recovery I','1% faster rolls.',12,400,'{consistent-rhythm-2}','{"speed":0.01}',118),
('rapid-recovery-2','mining',3,'Rapid Recovery II','1% faster rolls.',15,400,'{rapid-recovery-1}','{"speed":0.01}',119),
('heavy-specimen-handling','mining',3,'Heavy Specimen Handling','2% more Weight Luck.',18,400,'{weight-calibration-2}','{"weight":0.02}',120),
('statistical-breakthrough','mining',4,'Statistical Breakthrough','Every 250th genuine roll gains 1.2x Luck.',30,1000,'{deep-site-analysis,rapid-recovery-2}','{"statisticalBreakthrough":true}',121),
('perfect-calibration','mining',4,'Perfect Calibration','1% roll speed, Weight Luck and gem value.',31,1000,'{deep-site-analysis,refined-processing-2,rapid-recovery-2,heavy-specimen-handling}','{"speed":0.01,"weight":0.01,"value":0.01}',122),
('mining-mastery','mining',4,'Mining Mastery','Unlocks the Mining Master cosmetic.',10,1000,'{statistical-breakthrough,perfect-calibration}','{"cosmetic":"mining-master"}',123),

('mutation-sampling-1','specimen',1,'Mutation Sampling I','2% more mutation chance.',3,0,'{research-fundamentals}','{"mutationChance":0.02}',201),
('mutation-sampling-2','specimen',1,'Mutation Sampling II','2% more mutation chance.',4,0,'{mutation-sampling-1}','{"mutationChance":0.02}',202),
('mutation-sampling-3','specimen',1,'Mutation Sampling III','2% more mutation chance.',5,0,'{mutation-sampling-2}','{"mutationChance":0.02}',203),
('mutation-sampling-4','specimen',1,'Mutation Sampling IV','2% more mutation chance.',6,0,'{mutation-sampling-3}','{"mutationChance":0.02}',204),
('variant-appraisal','specimen',1,'Variant Appraisal','3% more value for mutated specimens.',5,0,'{mutation-sampling-1}','{"mutatedValue":0.03}',205),
('compound-appraisal','specimen',1,'Compound Appraisal','3% more value for specimens with 2+ mutations.',7,0,'{variant-appraisal}','{"compoundValue":0.03}',206),
('field-identification','specimen',1,'Field Identification','Marks new mutation combinations.',3,0,'{research-fundamentals}','{"flag":"fieldIdentification"}',207),
('research-focus','specimen',2,'Research Focus','Focus one mutation for 1.2x chance.',12,100,'{mutation-sampling-4}','{"flag":"researchFocus"}',208),
('controlled-reassignment','specimen',2,'Controlled Reassignment','Change mutation focus weekly.',6,100,'{research-focus}','{"flag":"controlledReassignment"}',209),
('unusual-samples','specimen',2,'Unusual Samples','First new mutation combination daily grants a Tier I potion.',8,100,'{field-identification}','{"flag":"unusualSamples"}',210),
('exceptional-samples','specimen',2,'Exceptional Samples','First new 3+ mutation combination daily grants ten 1.1x Luck rolls.',12,100,'{unusual-samples,compound-appraisal}','{"flag":"exceptionalSamples"}',211),
('variant-preservation','specimen',2,'Variant Preservation','Optionally auto-keep new mutation combinations.',7,100,'{field-identification}','{"flag":"variantPreservation"}',212),
('specimen-comparison','specimen',2,'Specimen Comparison','Shows detailed specimen comparisons.',5,100,'{variant-appraisal}','{"flag":"specimenComparison"}',213),
('museum-set-research','specimen',3,'Museum Set Research','Activate one completed museum set bonus.',20,400,'{specimen-comparison,variant-preservation}','{"museumSetSlots":1}',214),
('exhibition-research','specimen',3,'Exhibition Research','Activate a second set at 50% strength.',25,400,'{museum-set-research}','{"secondMuseumSet":true}',215),
('museum-expansion','specimen',3,'Museum Expansion','Unlocks one additional $25m exhibit slot.',30,400,'{museum-set-research}','{"museumExpansion":true}',216),
('curatorial-studies-1','specimen',3,'Curatorial Studies I','5% more Museum Prestige.',15,400,'{museum-set-research}','{"prestige":0.05}',217),
('curatorial-studies-2','specimen',3,'Curatorial Studies II','5% more Museum Prestige.',17,400,'{curatorial-studies-1}','{"prestige":0.05}',218),
('advanced-mutation-focus','specimen',4,'Advanced Mutation Focus','Focused mutation chance improves from 1.2x to 1.3x.',30,1000,'{controlled-reassignment}','{"advancedFocus":true}',219),
('compound-expertise','specimen',4,'Compound Expertise','1% value per mutation, up to 5%.',20,1000,'{exceptional-samples}','{"compoundPerMutation":0.01}',220),
('discovery-momentum','specimen',4,'Discovery Momentum','First new base gem daily grants twenty 1.1x Weight Luck rolls.',25,1000,'{unusual-samples,museum-set-research}','{"flag":"discoveryMomentum"}',221),
('grand-curator','specimen',4,'Grand Curator','Museum Prestige research totals 1.15x and unlocks cosmetics.',20,1000,'{advanced-mutation-focus,compound-expertise,discovery-momentum,curatorial-studies-2}','{"prestige":0.05,"cosmetic":"grand-curator"}',222),

('extended-brewing-1','engineering',1,'Extended Brewing I','2.5% longer potion duration.',3,0,'{research-fundamentals}','{"potionDuration":0.025}',301),
('extended-brewing-2','engineering',1,'Extended Brewing II','2.5% longer potion duration.',4,0,'{extended-brewing-1}','{"potionDuration":0.025}',302),
('extended-brewing-3','engineering',1,'Extended Brewing III','2.5% longer potion duration.',5,0,'{extended-brewing-2}','{"potionDuration":0.025}',303),
('extended-brewing-4','engineering',1,'Extended Brewing IV','2.5% longer potion duration.',6,0,'{extended-brewing-3}','{"potionDuration":0.025}',304),
('concentrated-mixtures-1','engineering',1,'Concentrated Mixtures I','2.5% stronger potions.',5,0,'{extended-brewing-2}','{"potionStrength":0.025}',305),
('concentrated-mixtures-2','engineering',1,'Concentrated Mixtures II','2.5% stronger potions.',7,0,'{concentrated-mixtures-1}','{"potionStrength":0.025}',306),
('efficient-brewing-1','engineering',1,'Efficient Brewing I','4% chance to duplicate a brewed potion.',5,0,'{extended-brewing-2}','{"potionDuplicate":0.04}',307),
('efficient-brewing-2','engineering',1,'Efficient Brewing II','Duplicate chance becomes 8%.',7,0,'{efficient-brewing-1}','{"potionDuplicate":0.04}',308),
('compound-storage','engineering',1,'Compound Storage','10 inventory slots.',5,0,'{research-fundamentals}','{"inventory":10}',309),
('efficient-masterworking-1','engineering',2,'Efficient Masterworking I','2.5% lower Masterwork cost.',6,100,'{research-fundamentals}','{"masterworkDiscount":0.025}',310),
('efficient-masterworking-2','engineering',2,'Efficient Masterworking II','2.5% lower Masterwork cost.',7,100,'{efficient-masterworking-1}','{"masterworkDiscount":0.025}',311),
('efficient-masterworking-3','engineering',2,'Efficient Masterworking III','2.5% lower Masterwork cost.',8,100,'{efficient-masterworking-2}','{"masterworkDiscount":0.025}',312),
('efficient-masterworking-4','engineering',2,'Efficient Masterworking IV','2.5% lower Masterwork cost.',9,100,'{efficient-masterworking-3}','{"masterworkDiscount":0.025}',313),
('precision-reinforcement-1','engineering',2,'Precision Reinforcement I','1% stronger Masterwork effects.',8,100,'{efficient-masterworking-2}','{"masterworkEffect":0.01}',314),
('precision-reinforcement-2','engineering',2,'Precision Reinforcement II','1% stronger Masterwork effects.',9,100,'{precision-reinforcement-1}','{"masterworkEffect":0.01}',315),
('precision-reinforcement-3','engineering',2,'Precision Reinforcement III','1% stronger Masterwork effects.',10,100,'{precision-reinforcement-2}','{"masterworkEffect":0.01}',316),
('material-recovery','engineering',2,'Material Recovery','5% chance to recover one eligible material.',12,100,'{efficient-masterworking-3}','{"flag":"materialRecovery"}',317),
('advanced-calibration','engineering',2,'Advanced Calibration','Preview the next Masterwork result.',4,100,'{precision-reinforcement-1}','{"flag":"advancedCalibration"}',318),
('reinforced-design','engineering',2,'Reinforced Design','10 inventory slots.',5,100,'{compound-storage,efficient-masterworking-2}','{"inventory":10}',319),
('relic-conservation','engineering',3,'Relic Conservation','5% chance not to consume an Enchant Relic.',12,400,'{reinforced-design}','{"relicConservation":0.05}',320),
('ancient-conservation','engineering',3,'Ancient Conservation','2% chance not to consume an Ancient Relic.',15,400,'{relic-conservation}','{"ancientConservation":0.02}',321),
('controlled-enchantment','engineering',3,'Controlled Enchantment','Spend two relics to choose between two enchants.',20,400,'{relic-conservation}','{"flag":"controlledEnchantment"}',322),
('enchant-stabilisation','engineering',3,'Enchant Stabilisation','Controlled choices exclude the current enchant and duplicates.',15,400,'{controlled-enchantment}','{"flag":"enchantStabilisation"}',323),
('state-analysis','engineering',3,'State Analysis','Shows detailed enchant state.',5,400,'{controlled-enchantment}','{"flag":"stateAnalysis"}',324),
('enchant-loadouts','engineering',3,'Enchant Loadouts','Save enchant loadout preferences.',8,400,'{state-analysis,reinforced-design}','{"flag":"enchantLoadouts"}',325),
('masterwork-expertise','engineering',4,'Masterwork Expertise','Masterwork effect bonus totals 5%.',25,1000,'{precision-reinforcement-3,material-recovery}','{"masterworkEffect":0.02}',326),
('alchemical-mastery','engineering',4,'Alchemical Mastery','Potion duration research totals 15%.',25,1000,'{extended-brewing-4,concentrated-mixtures-2}','{"potionDuration":0.05}',327),
('precision-manufacturing','engineering',4,'Precision Manufacturing','Potion duplicate chance becomes 10%.',20,1000,'{efficient-brewing-2}','{"potionDuplicate":0.02}',328),
('weekly-prototype','engineering',4,'Weekly Prototype','First Masterwork each week gains 10% effect strength.',25,1000,'{masterwork-expertise}','{"flag":"weeklyPrototype"}',329),
('master-engineer','engineering',4,'Master Engineer','Unlocks the Master Engineer cosmetic.',10,1000,'{masterwork-expertise,alchemical-mastery,precision-manufacturing,weekly-prototype}','{"cosmetic":"master-engineer"}',330),

('objective-tracker','exploration',1,'Objective Tracker','Adds clearer objective progress tracking.',4,0,'{research-fundamentals}','{"flag":"objectiveTracker"}',401),
('local-surveying','exploration',1,'Local Surveying','Shows local availability information.',3,0,'{research-fundamentals}','{"flag":"localSurveying"}',402),
('opportunity-alerts','exploration',1,'Opportunity Alerts','Alerts for active time-window opportunities.',3,0,'{local-surveying}','{"flag":"opportunityAlerts"}',403),
('progress-forecasting','exploration',1,'Progress Forecasting','Forecasts mission completion.',4,0,'{objective-tracker}','{"flag":"progressForecasting"}',404),
('expedition-records','exploration',1,'Expedition Records','Adds detailed expedition records.',6,0,'{research-fundamentals}','{"flag":"expeditionRecords"}',405),
('season-training-1','exploration',2,'Season Training I','2.5% more Season XP.',7,100,'{objective-tracker}','{"seasonXp":0.025}',406),
('season-training-2','exploration',2,'Season Training II','2.5% more Season XP.',8,100,'{season-training-1}','{"seasonXp":0.025}',407),
('mission-choice','exploration',2,'Mission Choice','Adds a mission choice where supported.',12,100,'{season-training-2}','{"flag":"missionChoice"}',408),
('expedition-intel','exploration',2,'Expedition Intel','Shows additional expedition information.',8,100,'{expedition-records}','{"flag":"expeditionIntel"}',409),
('prepared-reroll','exploration',2,'Prepared Reroll','Improves expedition objective rerolls.',15,100,'{expedition-intel}','{"flag":"preparedReroll"}',410),
('achievement-compass','exploration',2,'Achievement Compass','Tracks nearby achievement goals.',5,100,'{objective-tracker}','{"flag":"achievementCompass"}',411),
('merchant-contacts','exploration',3,'Merchant Contacts','Adds one personal Daily Shop offer.',22,400,'{mission-choice}','{"shopSlots":1}',412),
('merchant-favour','exploration',3,'Merchant Favour','One free personal-offer reroll daily.',10,400,'{merchant-contacts}','{"flag":"merchantFavour"}',413),
('second-look','exploration',3,'Second Look','Reroll one unselected cache reward daily.',15,400,'{merchant-contacts}','{"flag":"secondLook"}',414),
('flexible-planning','exploration',3,'Flexible Planning','Choose between two daily expedition objectives.',10,400,'{prepared-reroll}','{"flag":"flexiblePlanning"}',415),
('temporal-specialisation','exploration',3,'Temporal Specialisation','1.05x Luck for time-window gems.',23,400,'{local-surveying,opportunity-alerts}','{"windowLuck":0.05}',416),
('expedition-supplies','exploration',3,'Expedition Supplies','5% lower expedition entry fees.',20,400,'{expedition-intel}','{"expeditionDiscount":0.05}',417),
('seasoned-explorer','exploration',4,'Seasoned Explorer','Season XP research totals 1.10x.',30,1000,'{season-training-2,mission-choice}','{"seasonXp":0.05}',418),
('expedition-permit','exploration',4,'Expedition Permit','One additional daily Standard or Deep expedition.',40,1000,'{expedition-supplies,flexible-planning}','{"flag":"expeditionPermit"}',419),
('prepared-selection','exploration',4,'Prepared Selection','Choose a weekly expedition objective from three.',35,1000,'{prepared-reroll,flexible-planning}','{"flag":"preparedSelection"}',420),
('rare-opportunity','exploration',4,'Rare Opportunity','A second specialized personal shop offer.',30,1000,'{merchant-favour}','{"shopSlots":1,"flag":"rareOpportunity"}',421),
('master-explorer','exploration',4,'Master Explorer','Unlocks the Master Explorer cosmetic.',10,1000,'{seasoned-explorer,expedition-permit,prepared-selection,rare-opportunity}','{"cosmetic":"master-explorer"}',422)
on conflict(id) do update set branch=excluded.branch,stage=excluded.stage,name=excluded.name,description=excluded.description,cost=excluded.cost,required_ap=excluded.required_ap,prerequisites=excluded.prerequisites,effects=excluded.effects,sort_order=excluded.sort_order,enabled=true;

create or replace function public.ensure_research_profile_v014(p_player_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.player_research_profiles(player_id) values(p_player_id) on conflict do nothing;
  insert into public.player_research_purchases(player_id,node_id) values(p_player_id,'research-fundamentals') on conflict do nothing;
  insert into public.player_research_effects(player_id) values(p_player_id) on conflict do nothing;
end$$;

-- Reconcile sources only when the Research page is opened. In particular,
-- discovery RP is never awarded from the Roll Edge Function or a roll trigger.
-- This keeps the hot path free from another RPC/write while still making the
-- ledger idempotent and suitable for historical players.
create or replace function public.sync_research_sources_v014(p_player_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare total_earned integer;
begin
  perform public.ensure_research_profile_v014(p_player_id);

  insert into public.research_point_ledger(player_id,source_type,source_key,amount)
  select p_player_id,'achievement',p.feature_id::text,
    greatest(1,ceil(greatest(0,coalesce((d.metadata->>'ap')::integer,0))/20.0)::integer)
  from public.private_feature_progress p
  join public.private_feature_definitions d on d.id=p.feature_id
  where p.player_id=p_player_id and p.reward_granted and d.feature_kind='achievement'
  on conflict(player_id,source_type,source_key) do nothing;

  insert into public.research_point_ledger(player_id,source_type,source_key,amount)
  select p_player_id,'discovery',c.gem_name,
    case
      when max(g.rarity)>=1000000000 then 20
      when max(g.rarity)>=100000000 then 12
      when max(g.rarity)>=10000000 then 8
      when max(g.rarity)>=1000000 then 6
      when max(g.rarity)>=100000 then 4
      when max(g.rarity)>=10000 then 3
      when max(g.rarity)>=2300 then 2
      else 1
    end
  from public.player_gem_mutation_combinations c
  join public.private_feature_gems g on g.name=c.gem_name and g.enabled
  where c.player_id=p_player_id and c.combination_key='none'
  group by c.gem_name
  on conflict(player_id,source_type,source_key) do nothing;

  select coalesce(sum(amount),0)::integer into total_earned
  from public.research_point_ledger where player_id=p_player_id;
  update public.player_research_profiles
  set points_earned=total_earned,
      points_available=greatest(0,total_earned-points_spent),
      updated_at=now()
  where player_id=p_player_id;
end$$;

create or replace function public.award_research_points_v014(p_player_id uuid,p_source_type text,p_source_key text,p_amount integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  if p_amount<=0 then return false; end if;
  perform public.ensure_research_profile_v014(p_player_id);
  insert into public.research_point_ledger(player_id,source_type,source_key,amount)
  values(p_player_id,p_source_type,p_source_key,p_amount) on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count=1 then
    update public.player_research_profiles set points_available=points_available+p_amount,points_earned=points_earned+p_amount,updated_at=now() where player_id=p_player_id;
    return true;
  end if;
  return false;
end$$;

create or replace function public.compile_research_effects_v014(p_player_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb; f jsonb;
begin
  select coalesce(jsonb_agg(n.effects),'[]'::jsonb) into e
  from public.player_research_purchases p join public.research_nodes n on n.id=p.node_id
  where p.player_id=p_player_id and n.enabled;
  select coalesce(jsonb_object_agg(x.key,true),'{}'::jsonb) into f
  from (select distinct value#>>'{}' key from jsonb_array_elements(e) a cross join lateral jsonb_each(a) j(key,value) where key in('flag','cosmetic'))x;
  insert into public.player_research_effects(
    player_id,luck_multiplier,legendary_luck_multiplier,extreme_luck_multiplier,window_luck_multiplier,
    roll_speed_multiplier,weight_luck_multiplier,gem_value_multiplier,mutation_chance_multiplier,
    mutated_value_multiplier,compound_value_per_mutation,potion_duration_multiplier,potion_strength_multiplier,
    potion_duplicate_chance,masterwork_discount,masterwork_effect_multiplier,inventory_bonus,season_xp_multiplier,
    expedition_discount,statistical_breakthrough,flags,compiled_at)
  select p_player_id,
    1+coalesce(sum((v->>'luck')::numeric),0),1+coalesce(sum((v->>'legendaryLuck')::numeric),0),
    1+coalesce(sum((v->>'extremeLuck')::numeric),0),1+coalesce(sum((v->>'windowLuck')::numeric),0),
    1+coalesce(sum((v->>'speed')::numeric),0),1+coalesce(sum((v->>'weight')::numeric),0),
    1+coalesce(sum((v->>'value')::numeric),0),1+coalesce(sum((v->>'mutationChance')::numeric),0),
    1+coalesce(sum((v->>'mutatedValue')::numeric),0),coalesce(sum((v->>'compoundPerMutation')::numeric),0),
    1+coalesce(sum((v->>'potionDuration')::numeric),0),1+coalesce(sum((v->>'potionStrength')::numeric),0),
    coalesce(sum((v->>'potionDuplicate')::numeric),0),coalesce(sum((v->>'masterworkDiscount')::numeric),0),
    1+coalesce(sum((v->>'masterworkEffect')::numeric),0),coalesce(sum((v->>'inventory')::integer),0),
    1+coalesce(sum((v->>'seasonXp')::numeric),0),coalesce(sum((v->>'expeditionDiscount')::numeric),0),
    coalesce(bool_or((v->>'statisticalBreakthrough')::boolean),false),f,now()
  from jsonb_array_elements(e) v
  on conflict(player_id) do update set
    luck_multiplier=excluded.luck_multiplier,legendary_luck_multiplier=excluded.legendary_luck_multiplier,
    extreme_luck_multiplier=excluded.extreme_luck_multiplier,window_luck_multiplier=excluded.window_luck_multiplier,
    roll_speed_multiplier=excluded.roll_speed_multiplier,weight_luck_multiplier=excluded.weight_luck_multiplier,
    gem_value_multiplier=excluded.gem_value_multiplier,mutation_chance_multiplier=excluded.mutation_chance_multiplier,
    mutated_value_multiplier=excluded.mutated_value_multiplier,compound_value_per_mutation=excluded.compound_value_per_mutation,
    potion_duration_multiplier=excluded.potion_duration_multiplier,potion_strength_multiplier=excluded.potion_strength_multiplier,
    potion_duplicate_chance=excluded.potion_duplicate_chance,masterwork_discount=excluded.masterwork_discount,
    masterwork_effect_multiplier=excluded.masterwork_effect_multiplier,inventory_bonus=excluded.inventory_bonus,
    season_xp_multiplier=excluded.season_xp_multiplier,expedition_discount=excluded.expedition_discount,
    statistical_breakthrough=excluded.statistical_breakthrough,flags=excluded.flags,compiled_at=excluded.compiled_at;
end$$;

create or replace function public.get_research_tree_v014(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; ap integer; cooldown timestamptz; spent integer; resets integer;
begin
  perform public.sync_research_sources_v014(p_player_id);
  select coalesce(achievement_points,0) into ap from public.player_achievement_profiles where player_id=p_player_id;
  select points_spent,reset_count,last_reset_at+interval '7 days' into spent,resets,cooldown from public.player_research_profiles where player_id=p_player_id;
  select jsonb_build_object(
    'nodes',(select coalesce(jsonb_agg(to_jsonb(n) order by sort_order),'[]') from public.research_nodes n where enabled),
    'purchases',(select coalesce(jsonb_agg(node_id),'[]') from public.player_research_purchases where player_id=p_player_id),
    'profile',(select to_jsonb(p) from public.player_research_profiles p where player_id=p_player_id),
    'effects',(select to_jsonb(e)-'player_id' from public.player_research_effects e where player_id=p_player_id),
    'achievementPoints',coalesce(ap,0),
    'reset',jsonb_build_object('cost',least(50000000,greatest(2000000,spent*25000))*case when resets=0 then 1 when resets=1 then 1.5 else 2 end,'availableAt',cooldown)
  ) into result;
  return result;
end$$;

create or replace function public.purchase_research_node_v014(p_player_id uuid,p_node_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.research_nodes%rowtype; prof public.player_research_profiles%rowtype; ap integer; missing text;
begin
  -- A player may earn RP in another feature without opening this page first.
  -- Reconcile those idempotent sources here so a legitimate purchase is not
  -- rejected because the client has an older profile snapshot.
  perform public.sync_research_sources_v014(p_player_id);
  select * into n from public.research_nodes where id=p_node_id and enabled;
  if not found then raise exception 'research_node_not_found'; end if;
  select * into prof from public.player_research_profiles where player_id=p_player_id for update;
  if exists(select 1 from public.player_research_purchases where player_id=p_player_id and node_id=p_node_id) then raise exception 'research_node_owned'; end if;
  select coalesce(achievement_points,0) into ap from public.player_achievement_profiles where player_id=p_player_id;
  if coalesce(ap,0)<n.required_ap then raise exception 'research_ap_gate'; end if;
  select req into missing from unnest(n.prerequisites) req where not exists(select 1 from public.player_research_purchases where player_id=p_player_id and node_id=req) limit 1;
  if missing is not null then raise exception 'research_prerequisite_missing:%',missing; end if;
  if prof.points_available<n.cost then raise exception 'research_points_insufficient'; end if;
  insert into public.player_research_purchases(player_id,node_id) values(p_player_id,p_node_id);
  update public.player_research_profiles set points_available=points_available-n.cost,points_spent=points_spent+n.cost,updated_at=now() where player_id=p_player_id;
  perform public.compile_research_effects_v014(p_player_id);
  return public.get_research_tree_v014(p_player_id);
end$$;

create or replace function public.reset_research_tree_v014(p_player_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prof public.player_research_profiles%rowtype; price numeric; current_money numeric;
begin
  perform public.ensure_research_profile_v014(p_player_id);
  select * into prof from public.player_research_profiles where player_id=p_player_id for update;
  if prof.last_reset_at is not null and prof.last_reset_at>now()-interval '7 days' then raise exception 'research_reset_cooldown'; end if;
  price:=least(50000000,greatest(2000000,prof.points_spent*25000))*case when prof.reset_count=0 then 1 when prof.reset_count=1 then 1.5 else 2 end;
  select money into current_money from public.players where id=p_player_id for update;
  if coalesce(current_money,0)<price then raise exception 'research_reset_money_insufficient'; end if;
  update public.players set money=money-price where id=p_player_id;
  delete from public.player_research_purchases where player_id=p_player_id and node_id<>'research-fundamentals';
  update public.player_research_profiles set points_available=points_earned,points_spent=0,reset_count=reset_count+1,last_reset_at=now(),updated_at=now() where player_id=p_player_id;
  perform public.compile_research_effects_v014(p_player_id);
  return public.get_research_tree_v014(p_player_id);
end$$;

create or replace function public.research_points_from_achievement_claim_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare ap integer;
begin
  if new.reward_granted and not old.reward_granted then
    select greatest(0,coalesce((metadata->>'ap')::integer,0)) into ap from public.private_feature_definitions where id=new.feature_id and feature_kind='achievement';
    perform public.award_research_points_v014(new.player_id,'achievement',new.feature_id::text,greatest(1,ceil(ap/20.0)::integer));
  end if;
  return new;
end$$;
drop trigger if exists research_points_achievement_claim_v014_trg on public.private_feature_progress;
create trigger research_points_achievement_claim_v014_trg after update of reward_granted on public.private_feature_progress for each row execute function public.research_points_from_achievement_claim_v014();

-- Backfill already claimed achievement rewards. The ledger makes this safe to rerun.
select public.award_research_points_v014(p.player_id,'achievement',p.feature_id::text,greatest(1,ceil(coalesce((d.metadata->>'ap')::integer,0)/20.0)::integer))
from public.private_feature_progress p join public.private_feature_definitions d on d.id=p.feature_id
where p.reward_granted and d.feature_kind='achievement';

-- Expeditions, Museum collections, and Season milestone claims are outside
-- the Roll request, so these inexpensive, idempotent triggers do not add roll
-- latency.
create or replace function public.research_points_from_expedition_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    amount:=case
      when new.cadence='weekly' and new.difficulty='void' then 25
      when new.cadence='weekly' and new.difficulty='deep' then 15
      when new.cadence='weekly' then 8
      when new.difficulty='void' then 6
      when new.difficulty='deep' then 4
      else 2
    end;
    perform public.award_research_points_v014(new.player_id,'expedition',new.id::text,amount);
  end if;
  return new;
end$$;
drop trigger if exists research_points_expedition_v014_trg on public.player_expeditions;
create trigger research_points_expedition_v014_trg after update of status on public.player_expeditions
for each row execute function public.research_points_from_expedition_v014();

create or replace function public.research_points_from_museum_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
  select case when prestige_reward>=150 then 15 when prestige_reward>=75 then 10 else 5 end
  into amount from public.museum_collection_definitions where id=new.collection_id;
  perform public.award_research_points_v014(new.player_id,'museum_collection',new.collection_id,coalesce(amount,5));
  return new;
end$$;
drop trigger if exists research_points_museum_v014_trg on public.museum_collection_completions;
create trigger research_points_museum_v014_trg after insert on public.museum_collection_completions
for each row execute function public.research_points_from_museum_v014();

create or replace function public.research_points_from_season_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare claim text; tier_number integer; amount integer;
begin
  for claim in select value#>>'{}' from jsonb_array_elements(new.claimed_tiers) value
  loop
    if not old.claimed_tiers ? claim then
      begin tier_number:=split_part(claim,':',2)::integer; exception when others then tier_number:=0; end;
      amount:=case tier_number when 10 then 4 when 20 then 8 when 30 then 10 when 40 then 12 when 50 then 14 else 0 end;
      if amount>0 then
        perform public.award_research_points_v014(new.player_id,'season_milestone',new.season_id::text||':'||tier_number::text,amount);
      end if;
    end if;
  end loop;
  return new;
end$$;
drop trigger if exists research_points_season_v014_trg on public.player_seasons;
create trigger research_points_season_v014_trg after update of claimed_tiers on public.player_seasons
for each row execute function public.research_points_from_season_v014();

-- One specialist offer has an exact 25% weighted chance in the specialist
-- slot. Its single daily purchase awards RP through the central ledger.
insert into public.daily_shop_catalog(id,category,name,description,price,stock_min,stock_max,weight,contents)
values('research-notes','specialist','Research Notes','10 Research Points for the permanent Research Tree.',1500000,1,1,34,'[{"type":"research_points","quantity":10}]')
on conflict(id) do update set category=excluded.category,name=excluded.name,description=excluded.description,
price=excluded.price,stock_min=excluded.stock_min,stock_max=excluded.stock_max,weight=excluded.weight,contents=excluded.contents;

create or replace function public.research_points_daily_shop_guard_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_offer_id text; has_research boolean;
begin
  if new.quantity<=old.quantity then return new; end if;
  if new.rotation_kind='refresh' then
    select r.offer_id into v_offer_id from public.daily_shop_personal_rotations r
    where r.player_id=new.player_id and r.rotation_date=new.rotation_date and r.slot=new.slot;
  else
    select r.offer_id into v_offer_id from public.daily_shop_rotations r
    where r.rotation_date=new.rotation_date and r.slot=new.slot;
  end if;
  select exists(select 1 from jsonb_array_elements(c.contents) item where item->>'type'='research_points')
  into has_research from public.daily_shop_catalog c where c.id=v_offer_id;
  if coalesce(has_research,false) and exists(
    select 1 from public.research_point_ledger
    where player_id=new.player_id and source_type='daily_shop' and source_key=new.rotation_date::text
  ) then raise exception 'research_shop_daily_limit'; end if;
  return new;
end$$;
drop trigger if exists research_points_daily_shop_guard_v014_trg on public.daily_shop_purchases;
create trigger research_points_daily_shop_guard_v014_trg before update of quantity on public.daily_shop_purchases
for each row execute function public.research_points_daily_shop_guard_v014();

create or replace function public.research_points_daily_shop_award_v014() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_offer_id text; amount integer;
begin
  if new.quantity<=old.quantity then return new; end if;
  if new.rotation_kind='refresh' then
    select r.offer_id into v_offer_id from public.daily_shop_personal_rotations r
    where r.player_id=new.player_id and r.rotation_date=new.rotation_date and r.slot=new.slot;
  else
    select r.offer_id into v_offer_id from public.daily_shop_rotations r
    where r.rotation_date=new.rotation_date and r.slot=new.slot;
  end if;
  select coalesce(sum((item->>'quantity')::integer),0)::integer into amount
  from public.daily_shop_catalog c cross join lateral jsonb_array_elements(c.contents) item
  where c.id=v_offer_id and item->>'type'='research_points';
  if amount>0 then
    perform public.award_research_points_v014(new.player_id,'daily_shop',new.rotation_date::text,amount);
  end if;
  return new;
end$$;
drop trigger if exists research_points_daily_shop_award_v014_trg on public.daily_shop_purchases;
create trigger research_points_daily_shop_award_v014_trg after update of quantity on public.daily_shop_purchases
for each row execute function public.research_points_daily_shop_award_v014();

-- Season XP research is folded into the Season system's existing Roll RPC.
-- This replaces the implementation, not the signature, so Roll performs the
-- same number of network calls as it did before Research existed.
create or replace function public.record_season_roll(p_player_id uuid,p_rarity numeric,p_effective_rarity numeric,p_mutation_count integer,p_relic boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  sid uuid;
  base_xp numeric:=0;
  allowed numeric;
  mission_xp numeric;
  today date:=(now() at time zone 'UTC')::date;
  p public.player_seasons%rowtype;
  research_multiplier numeric:=1;
begin
  sid:=public.ensure_player_season(p_player_id);
  if sid is null then return null; end if;

  if not p_relic then
    base_xp:=case
      when p_rarity<10 then .1
      when p_rarity<50 then .25
      when p_rarity<100 then .5
      when p_rarity<1000 then 1
      when p_rarity<10000 then 3
      when p_rarity<100000 then 8
      when p_rarity<1000000 then 20
      else 50
    end + greatest(0,p_mutation_count)*2;
  end if;

  select greatest(1,coalesce(e.season_xp_multiplier,1))
  into research_multiplier
  from public.player_research_effects e
  where e.player_id=p_player_id;
  base_xp:=base_xp*coalesce(research_multiplier,1);

  select * into p from public.player_seasons
  where player_id=p_player_id and season_id=sid for update;
  if p.roll_xp_date is distinct from today then
    p.roll_xp_today:=0;
    p.roll_xp_date:=today;
  end if;
  allowed:=least(base_xp,greatest(0,1500-p.roll_xp_today));
  allowed:=least(allowed,greatest(0,59500-p.xp));
  update public.player_seasons
  set xp=least(59500,xp+allowed),roll_xp_date=today,
      roll_xp_today=p.roll_xp_today+allowed,updated_at=now()
  where id=p.id;
  mission_xp:=public.season_advance_missions(
    p_player_id,sid,'roll',
    case when p_relic then 0 else p_rarity end,
    case when p_relic then 0 else p_effective_rarity end,
    case when p_relic then 0 else p_mutation_count end
  );
  return jsonb_build_object('xp',allowed,'missionXp',mission_xp);
end$$;

revoke all on function public.record_season_roll(uuid,numeric,numeric,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_season_roll(uuid,numeric,numeric,integer,boolean) to service_role;

revoke all on function public.ensure_research_profile_v014(uuid),public.sync_research_sources_v014(uuid),public.award_research_points_v014(uuid,text,text,integer),public.compile_research_effects_v014(uuid),public.get_research_tree_v014(uuid),public.purchase_research_node_v014(uuid,text),public.reset_research_tree_v014(uuid),public.research_points_from_achievement_claim_v014(),public.research_points_from_expedition_v014(),public.research_points_from_museum_v014(),public.research_points_from_season_v014(),public.research_points_daily_shop_guard_v014(),public.research_points_daily_shop_award_v014() from public,anon,authenticated;
grant execute on function public.ensure_research_profile_v014(uuid),public.sync_research_sources_v014(uuid),public.award_research_points_v014(uuid,text,text,integer),public.compile_research_effects_v014(uuid),public.get_research_tree_v014(uuid),public.purchase_research_node_v014(uuid,text),public.reset_research_tree_v014(uuid),public.research_points_from_achievement_claim_v014(),public.research_points_from_expedition_v014(),public.research_points_from_museum_v014(),public.research_points_from_season_v014(),public.research_points_daily_shop_guard_v014(),public.research_points_daily_shop_award_v014() to service_role;
