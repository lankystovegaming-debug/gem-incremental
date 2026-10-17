-- Season 1: The Interlude. Audited against live backend on 2026-10-15.
-- Local only; user deploys. Does not alter Season Zero data or the optimized roll Edge Function.
begin;
alter table public.player_season_cosmetics drop constraint if exists player_season_cosmetics_cosmetic_type_check;
alter table public.player_season_cosmetics add constraint player_season_cosmetics_cosmetic_type_check check(cosmetic_type in ('title','badge','frame','background'));
insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source,legacy_after) values
('between-the-lights','Between the Lights',array['title'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "sunrise", "icon": "\u2727"}','season','2026-11-23 00:00:00+00'),
('quiet-miner','Quiet Miner',array['title'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "stone", "icon": "\u26cf"}','season','2026-11-23 00:00:00+00'),
('silver-horizon','Silver Horizon',array['frame'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "silver-horizon", "icon": "\u25c7"}','season','2026-11-23 00:00:00+00'),
('crystal-reverie','Crystal Reverie',array['background'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "crystal-reverie", "icon": "\u2726"}','season','2026-11-23 00:00:00+00'),
('the-interlude','The Interlude',array['title'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "prismatic", "icon": "\u2726"}','season','2026-11-23 00:00:00+00'),
('season-one','Season 1',array['badge'],'Season 1 exclusive. Claim before 23 November 2026 08:00 SGT.','Legendary','{"style": "diamond", "icon": "\u25c8 1"}','season','2026-11-23 00:00:00+00')
on conflict(id) do nothing;
-- Fail closed if a catalogue ID is already used for a different cosmetic.
do $$ begin
 if exists(select 1 from (values ('between-the-lights','title'),('quiet-miner','title'),('silver-horizon','frame'),('crystal-reverie','background'),('the-interlude','title'),('season-one','badge')) x(id,slot) join public.cosmetic_definitions d using(id) where d.source<>'season' or d.slots<>array[x.slot]) then raise exception 'season_cosmetic_catalog_conflict'; end if;
end $$;
insert into public.season_definitions(name,description,enabled,starts_at,ends_at,tiers,metadata) values ('Season 1 — The Interlude','A quiet horizon between adventures.',true,'2026-10-17 00:00:00+00','2026-11-16 00:00:00+00','[{"tier":1,"xp":0,"free":[{"type":"money","amount":5000}],"premium":[{"type":"consumable","id":"lucky-potion-1","quantity":1}]},{"tier":2,"xp":200,"free":[{"type":"consumable","id":"speed-potion-1","quantity":1}],"premium":[{"type":"consumable","id":"mass-potion-1","quantity":1}]},{"tier":3,"xp":400,"free":[{"type":"consumable","id":"fortune-potion-1","quantity":1}],"premium":[{"type":"consumable","id":"lucky-potion-2","quantity":1}]},{"tier":4,"xp":650,"free":[{"type":"money","amount":5000}],"premium":[{"type":"money","amount":15000}]},{"tier":5,"xp":850,"free":[{"type":"consumable","id":"lucky-potion-1","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":1}]},{"tier":6,"xp":1050,"free":[{"type":"consumable","id":"mass-potion-1","quantity":1}],"premium":[{"type":"consumable","id":"speed-potion-2","quantity":1}]},{"tier":7,"xp":1250,"free":[{"type":"money","amount":15000}],"premium":[{"type":"consumable","id":"fortune-potion-2","quantity":1}]},{"tier":8,"xp":1450,"free":[{"type":"consumable","id":"speed-potion-1","quantity":1}],"premium":[{"type":"consumable","id":"lucky-potion-2","quantity":1}]},{"tier":9,"xp":1700,"free":[{"type":"consumable","id":"fortune-potion-2","quantity":1}],"premium":[{"type":"money","amount":25000}]},{"tier":10,"xp":1900,"free":[{"type":"relic","id":"Enchant Relic","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":11,"xp":2200,"free":[{"type":"money","amount":15000}],"premium":[{"type":"consumable","id":"mass-potion-2","quantity":1}]},{"tier":12,"xp":2500,"free":[{"type":"consumable","id":"lucky-potion-2","quantity":1}],"premium":[{"type":"consumable","id":"speed-potion-3","quantity":1}]},{"tier":13,"xp":2850,"free":[{"type":"consumable","id":"mass-potion-2","quantity":1}],"premium":[{"type":"money","amount":25000}]},{"tier":14,"xp":3150,"free":[{"type":"consumable","id":"fortune-potion-2","quantity":1}],"premium":[{"type":"consumable","id":"lucky-potion-3","quantity":1}]},{"tier":15,"xp":3450,"free":[{"type":"money","amount":20000}],"premium":[{"type":"consumable","id":"mass-potion-1","quantity":1},{"type":"cosmetic","id":"between-the-lights","name":"Between the Lights","cosmeticType":"title"}]},{"tier":16,"xp":3800,"free":[{"type":"consumable","id":"speed-potion-2","quantity":1}],"premium":[{"type":"consumable","id":"mass-potion-3","quantity":1}]},{"tier":17,"xp":4100,"free":[{"type":"consumable","id":"lucky-potion-2","quantity":1}],"premium":[{"type":"money","amount":35000}]},{"tier":18,"xp":4400,"free":[{"type":"money","amount":30000}],"premium":[{"type":"consumable","id":"fortune-potion-3","quantity":1}]},{"tier":19,"xp":4750,"free":[{"type":"consumable","id":"mass-potion-2","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":20,"xp":5050,"free":[{"type":"relic","id":"Enchant Relic","quantity":2}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":21,"xp":5450,"free":[{"type":"money","amount":30000}],"premium":[{"type":"consumable","id":"speed-potion-3","quantity":1}]},{"tier":22,"xp":5900,"free":[{"type":"consumable","id":"fortune-potion-3","quantity":1}],"premium":[{"type":"money","amount":50000}]},{"tier":23,"xp":6300,"free":[{"type":"consumable","id":"lucky-potion-3","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":24,"xp":6700,"free":[{"type":"money","amount":35000}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":25,"xp":7150,"free":[{"type":"consumable","id":"legendary-potion","quantity":1},{"type":"cosmetic","id":"quiet-miner","name":"Quiet Miner","cosmeticType":"title"}],"premium":[{"type":"relic","id":"Ancient Relic","quantity":2}]},{"tier":26,"xp":7550,"free":[{"type":"money","amount":40000}],"premium":[{"type":"consumable","id":"mass-potion-3","quantity":1}]},{"tier":27,"xp":8000,"free":[{"type":"relic","id":"Enchant Relic","quantity":2}],"premium":[{"type":"money","amount":65000}]},{"tier":28,"xp":8400,"free":[{"type":"consumable","id":"speed-potion-3","quantity":1}],"premium":[{"type":"consumable","id":"lucky-potion-3","quantity":1}]},{"tier":29,"xp":8800,"free":[{"type":"money","amount":50000}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":30,"xp":9250,"free":[{"type":"relic","id":"Enchant Relic","quantity":3},{"type":"cosmetic","id":"silver-horizon","name":"Silver Horizon","cosmeticType":"frame"}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":31,"xp":9850,"free":[{"type":"consumable","id":"fortune-potion-3","quantity":1}],"premium":[{"type":"money","amount":80000}]},{"tier":32,"xp":10500,"free":[{"type":"money","amount":55000}],"premium":[{"type":"consumable","id":"speed-potion-3","quantity":1}]},{"tier":33,"xp":11150,"free":[{"type":"consumable","id":"lucky-potion-3","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":34,"xp":11750,"free":[{"type":"money","amount":65000}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":35,"xp":12400,"free":[{"type":"consumable","id":"legendary-potion","quantity":1}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":2}]},{"tier":36,"xp":13050,"free":[{"type":"relic","id":"Enchant Relic","quantity":2}],"premium":[{"type":"money","amount":100000}]},{"tier":37,"xp":13650,"free":[{"type":"money","amount":70000}],"premium":[{"type":"consumable","id":"mass-potion-3","quantity":1}]},{"tier":38,"xp":14300,"free":[{"type":"consumable","id":"speed-potion-3","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":2}]},{"tier":39,"xp":14900,"free":[{"type":"money","amount":85000}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":40,"xp":15550,"free":[{"type":"consumable","id":"legendary-potion","quantity":1},{"type":"relic","id":"Ancient Relic","quantity":1}],"premium":[{"type":"relic","id":"Ancient Relic","quantity":2},{"type":"cosmetic","id":"crystal-reverie","name":"Crystal Reverie","cosmeticType":"background"}]},{"tier":41,"xp":16400,"free":[{"type":"money","amount":85000}],"premium":[{"type":"consumable","id":"fortune-potion-3","quantity":1}]},{"tier":42,"xp":17250,"free":[{"type":"relic","id":"Enchant Relic","quantity":3}],"premium":[{"type":"money","amount":130000}]},{"tier":43,"xp":18050,"free":[{"type":"consumable","id":"legendary-potion","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":3}]},{"tier":44,"xp":18900,"free":[{"type":"money","amount":95000}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":45,"xp":19750,"free":[{"type":"relic","id":"Enchant Relic","quantity":4}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":3}]},{"tier":46,"xp":20800,"free":[{"type":"consumable","id":"fortune-potion-3","quantity":1}],"premium":[{"type":"money","amount":165000}]},{"tier":47,"xp":21850,"free":[{"type":"money","amount":110000}],"premium":[{"type":"consumable","id":"legendary-potion","quantity":1}]},{"tier":48,"xp":22900,"free":[{"type":"consumable","id":"legendary-potion","quantity":1}],"premium":[{"type":"relic","id":"Enchant Relic","quantity":3}]},{"tier":49,"xp":23950,"free":[{"type":"money","amount":135000}],"premium":[{"type":"money","amount":250000}]},{"tier":50,"xp":25000,"free":[{"type":"relic","id":"Enchant Relic","quantity":3},{"type":"relic","id":"Ancient Relic","quantity":1},{"type":"cosmetic","id":"the-interlude","name":"The Interlude","cosmeticType":"title"}],"premium":[{"type":"consumable","id":"mythic-potion","quantity":1},{"type":"cosmetic","id":"season-one","name":"Season 1","cosmeticType":"badge"}]}]'::jsonb,'{"version":"season-one","premiumPrice":10000000,"claimGraceDays":7,"rollXpDailyCap":1500,"catchUp":false,"prestige":false}'::jsonb) on conflict(name) do nothing;

create or replace function public.season_xp_limit(p_sid uuid) returns numeric language sql stable set search_path='' as $$
 select max((t->>'xp')::numeric) from public.season_definitions s cross join lateral jsonb_array_elements(s.tiers) t where s.id=p_sid;
$$;
revoke all on function public.season_xp_limit(uuid) from public,anon,authenticated;
grant execute on function public.season_xp_limit(uuid) to service_role;
create or replace function public.season_start_if_needed() returns public.season_definitions language plpgsql security definer set search_path='' as $$
declare s public.season_definitions%rowtype;
begin
 if not exists(select 1 from public.game_section_settings where id='seasons' and enabled) then return null; end if;
 select * into s from public.season_definitions where enabled and starts_at<=clock_timestamp() and ends_at>clock_timestamp() order by starts_at desc,id limit 1;
 return s;
end $$;
-- Season Zero's two-argument mission spec remains available for historical configurations.
create or replace function public.season_mission_spec(p_category text,p_cadence text,p_sid uuid)
returns jsonb language plpgsql volatile set search_path='' as $$
declare spec jsonb; th jsonb;
begin
 spec:=public.season_mission_spec(p_category,p_cadence);
 if not exists(select 1 from public.season_definitions where id=p_sid and metadata->>'version'='season-one') then return spec; end if;
 if p_cadence='daily' then
  th:=case p_category when 'rolls' then '[75,200,400]' when 'sold' then '[40,100,200]' when 'legendary' then '[5,15,30]' when 'mythic' then '[1,2,4]' when 'mutated' then '[1,3,6]' when 'effective100k' then '[1,2,4]' else null end;
 else
  th:=case p_category when 'rolls' then '[750,1750,3500,6000]' when 'sold' then '[300,800,1750,3000]' when 'legendary' then '[50,150,350,600]' when 'mythic' then '[5,15,40,80]' when 'exotic' then '[1,2,3,5]' when 'mutated' then '[10,30,75,150]' when 'effective100k' then '[3,8,20,40]' when 'effective1m' then '[1,2,3,5]' else null end;
 end if;
 if th is null or p_cadence not in ('daily','weekly') then raise exception 'invalid_mission'; end if;
 return spec||jsonb_build_object('thresholds',th,'xp',case when p_cadence='daily' then '[50,100,150]'::jsonb else '[100,150,250,350]'::jsonb end);
end $$;
revoke all on function public.season_mission_spec(text,text,uuid) from public,anon,authenticated;
grant execute on function public.season_mission_spec(text,text,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.ensure_player_season(p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.season_definitions%rowtype; ps timestamptz; pe timestamptz; cat text; spec jsonb; pos integer; cats text[];
begin
 select * into s from public.season_start_if_needed(); if s.id is null or clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at then return null; end if;
 insert into public.player_seasons(season_id,player_id) values(s.id,p_uid) on conflict do nothing;
 perform 1 from public.player_seasons where season_id=s.id and player_id=p_uid for update;
 for cat,ps,pe in select cadence,period_start,period_end from (select 'daily' cadence,* from public.season_period('daily') union all select 'weekly',* from public.season_period('weekly')) q loop
  if not exists(select 1 from public.player_season_missions where player_id=p_uid and season_id=s.id and cadence=cat and period_start=ps) then
   cats:=case when cat='daily' then array['rolls','sold','legendary','mythic','mutated','effective100k'] else array['rolls','sold','legendary','mythic','exotic','mutated','effective100k','effective1m'] end;
   pos:=0;
   for spec in select public.season_mission_spec(x,cat,s.id)||jsonb_build_object('category',x) from unnest(cats) x order by random() limit case when cat='daily' then 2 else 3 end loop
    pos:=pos+1;
    insert into public.player_season_missions(season_id,player_id,cadence,period_start,period_end,slot,category,title,thresholds,xp_rewards,item_reward)
    values(s.id,p_uid,cat,ps,pe,pos,spec->>'category',spec->>'title',array(select jsonb_array_elements_text(spec->'thresholds')::numeric),array(select jsonb_array_elements_text(spec->'xp')::numeric),spec->'item');
   end loop;
  end if;
 end loop;
 return s.id;
end; $function$
;
CREATE OR REPLACE FUNCTION public.season_advance_missions(p_uid uuid, p_sid uuid, p_event text, p_rarity numeric DEFAULT 0, p_effective numeric DEFAULT 0, p_mutations integer DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.player_season_missions%rowtype; inc numeric; reached integer; addxp numeric:=0;
begin
 if not exists(select 1 from public.season_definitions where id=p_sid and enabled and starts_at<=clock_timestamp() and clock_timestamp()<ends_at) then return 0; end if;
 perform 1 from public.player_seasons where player_id=p_uid and season_id=p_sid for update;
 if not exists(select 1 from public.season_definitions where id=p_sid and starts_at<=clock_timestamp() and clock_timestamp()<ends_at) then return 0; end if;
 for m in select * from public.player_season_missions where player_id=p_uid and season_id=p_sid and clock_timestamp()>=period_start and clock_timestamp()<period_end for update loop
  inc:=case when m.category='rolls' and p_event='roll' then 1 when m.category='sold' and p_event='sale' then 1 when p_event='roll' and m.category='legendary' and p_rarity>=1000 then 1 when p_event='roll' and m.category='mythic' and p_rarity>=10000 then 1 when p_event='roll' and m.category='exotic' and p_rarity>=100000 then 1 when p_event='roll' and m.category='mutated' and p_mutations>0 then 1 when p_event='roll' and m.category='effective100k' and p_effective>=100000 then 1 when p_event='roll' and m.category='effective1m' and p_effective>=1000000 then 1 else 0 end;
  if inc=0 then continue; end if;
  m.progress:=m.progress+inc;
  reached:=m.awarded_tiers;
  while reached<cardinality(m.thresholds) and m.progress>=m.thresholds[reached+1] loop reached:=reached+1; addxp:=addxp+m.xp_rewards[reached]; end loop;
  if reached=cardinality(m.thresholds) and m.awarded_tiers<reached then perform public.season_grant_reward(p_uid,p_sid,jsonb_build_array(m.item_reward)); end if;
  update public.player_season_missions set progress=m.progress,awarded_tiers=reached where id=m.id;
 end loop;
 if addxp>0 then update public.player_seasons set xp=least(public.season_xp_limit(p_sid),xp+addxp),updated_at=clock_timestamp() where player_id=p_uid and season_id=p_sid; end if;
 return addxp;
end; $function$
;
CREATE OR REPLACE FUNCTION public.record_season_roll(p_player_id uuid, p_rarity numeric, p_effective_rarity numeric, p_mutation_count integer, p_relic boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sid uuid;
  max_xp numeric;
  base_xp numeric:=0;
  allowed numeric;
  mission_xp numeric;
  today date:=(clock_timestamp() at time zone 'UTC')::date;
  p public.player_seasons%rowtype;
  research_multiplier numeric:=1;
begin
  sid:=public.ensure_player_season(p_player_id);
  if sid is null then return null; end if;
  max_xp:=public.season_xp_limit(sid);

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
  if not exists(select 1 from public.season_definitions where id=sid and starts_at<=clock_timestamp() and clock_timestamp()<ends_at) then return null; end if;
  today:=(clock_timestamp() at time zone 'UTC')::date;
  if p.roll_xp_date is distinct from today then
    p.roll_xp_today:=0;
    p.roll_xp_date:=today;
  end if;
  allowed:=least(base_xp,greatest(0,1500-p.roll_xp_today));
  allowed:=least(allowed,greatest(0,max_xp-p.xp));
  update public.player_seasons
  set xp=least(max_xp,xp+allowed),roll_xp_date=today,
      roll_xp_today=p.roll_xp_today+allowed,updated_at=clock_timestamp()
  where id=p.id;
  mission_xp:=public.season_advance_missions(
    p_player_id,sid,'roll',
    case when p_relic then 0 else p_rarity end,
    case when p_relic then 0 else p_effective_rarity end,
    case when p_relic then 0 else p_mutation_count end
  );
  return jsonb_build_object('xp',allowed,'missionXp',mission_xp);
end$function$
;
CREATE OR REPLACE FUNCTION public.reroll_daily_season_mission(p_season_id uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); m public.player_season_missions%rowtype; ps timestamptz; spec jsonb; cat text;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.season_definitions where id=p_season_id and enabled and starts_at<=clock_timestamp() and clock_timestamp()<ends_at) then raise exception 'season_not_active'; end if;
 perform 1 from public.player_seasons where season_id=p_season_id and player_id=u for update;
 select * into m from public.player_season_missions where player_id=u and season_id=p_season_id and cadence='daily' and slot=p_slot and clock_timestamp()>=period_start and clock_timestamp()<period_end for update;
 if not found then raise exception 'mission_not_found'; end if;
 if not exists(select 1 from public.season_definitions where id=p_season_id and starts_at<=clock_timestamp() and clock_timestamp()<ends_at) then raise exception 'season_not_active'; end if; if m.progress>0 or m.awarded_tiers>0 then raise exception 'mission_in_progress'; end if;
 ps:=m.period_start;
 insert into public.player_season_rerolls(player_id,season_id,period_start,used) values(u,p_season_id,ps,true) on conflict do nothing;
 if not found or (select used from public.player_season_rerolls where player_id=u and season_id=p_season_id and period_start=ps) is not true then raise exception 'reroll_used'; end if;
 select x into cat from unnest(array['rolls','sold','legendary','mythic','mutated','effective100k']) x where x<>m.category and not exists(select 1 from public.player_season_missions z where z.player_id=u and z.season_id=p_season_id and z.period_start=ps and z.category=x) order by random() limit 1;
 spec:=public.season_mission_spec(cat,'daily',p_season_id);
 update public.player_season_missions set category=cat,title=spec->>'title',thresholds=array(select jsonb_array_elements_text(spec->'thresholds')::numeric),xp_rewards=array(select jsonb_array_elements_text(spec->'xp')::numeric),item_reward=spec->'item' where id=m.id;
 return jsonb_build_object('ok',true);
end; $function$
;
CREATE OR REPLACE FUNCTION public.claim_season_tier(p_season_id uuid, p_tier integer, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); s public.season_definitions%rowtype; p public.player_seasons%rowtype; t jsonb; key text; reward jsonb;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 if p_lane is null or p_lane not in ('free','premium') then raise exception 'invalid_lane'; end if;
 select * into s from public.season_definitions where id=p_season_id and enabled for update;
 if not found or s.starts_at is null or clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at+interval '7 days' then raise exception 'claim_period_ended'; end if;
 select * into p from public.player_seasons where season_id=s.id and player_id=u for update;
 if not found then raise exception 'season_progress_not_found'; end if;
 if clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at+interval '7 days' then raise exception 'claim_period_ended'; end if;
 if p_lane='premium' and not p.premium then raise exception 'premium_required'; end if;
 select value into t from jsonb_array_elements(s.tiers) where (value->>'tier')::integer=p_tier;
 if t is null then raise exception 'tier_not_configured'; end if;
 if p.xp<(t->>'xp')::numeric then raise exception 'tier_locked'; end if;
 key:=p_lane||':'||p_tier;
 if p.claimed_tiers ? key then raise exception 'already_claimed'; end if;
 reward:=t->p_lane;
 perform public.season_grant_reward(u,s.id,reward);
 update public.player_seasons set claimed_tiers=claimed_tiers||jsonb_build_array(key),updated_at=clock_timestamp() where id=p.id;
 return jsonb_build_object('tier',p_tier,'lane',p_lane,'reward',reward);
end; $function$
;
CREATE OR REPLACE FUNCTION public.purchase_season_premium(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); s public.season_definitions%rowtype; p public.player_seasons%rowtype; price numeric;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 select * into s from public.season_definitions where id=p_season_id and enabled for update;
 if not found or s.starts_at is null or clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at then raise exception 'season_not_active'; end if;
 insert into public.player_seasons(season_id,player_id) values(s.id,u) on conflict do nothing;
 select * into p from public.player_seasons where season_id=s.id and player_id=u for update;
 if clock_timestamp()<s.starts_at or clock_timestamp()>=s.ends_at then raise exception 'season_not_active'; end if;
 if p.premium then return jsonb_build_object('premium',true,'alreadyOwned',true); end if;
 price:=coalesce((s.metadata->>'premiumPrice')::numeric,5000000);
 update public.players set money=money-price where id=u and money>=price;
 if not found then raise exception 'not_enough_money'; end if;
 update public.player_seasons set premium=true,updated_at=clock_timestamp() where id=p.id;
 return jsonb_build_object('premium',true,'price',price);
end; $function$
;
commit;
