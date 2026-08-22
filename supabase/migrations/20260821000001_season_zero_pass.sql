-- Season Zero: a server-authoritative 50-tier pass.

alter table public.player_seasons
  add column if not exists roll_xp_date date,
  add column if not exists roll_xp_today numeric not null default 0;

create table if not exists public.player_season_cosmetics (
  player_id uuid not null references public.players(id) on delete cascade,
  cosmetic_id text not null,
  cosmetic_type text not null check (cosmetic_type in ('title','badge')),
  season_id uuid references public.season_definitions(id) on delete set null,
  earned_at timestamptz not null default now(),
  primary key(player_id,cosmetic_id)
);
alter table public.player_season_cosmetics enable row level security;
revoke all on public.player_season_cosmetics from anon,authenticated;
grant all on public.player_season_cosmetics to service_role;

create or replace function public.season_zero_tiers()
returns jsonb language sql immutable set search_path='' as $$
select jsonb_agg(jsonb_build_object('tier',tier,'xp',xp,'free',free_reward,'premium',premium_reward) order by tier)
from (values
 (1,0,'[{"type":"money","amount":25000}]'::jsonb,'[{"type":"consumable","id":"lucky-potion-1","quantity":2}]'::jsonb),
 (2,500,'[{"type":"consumable","id":"speed-potion-1","quantity":1}]','[{"type":"consumable","id":"mass-potion-1","quantity":2}]'),
 (3,1000,'[{"type":"consumable","id":"fortune-potion-1","quantity":1}]','[{"type":"consumable","id":"lucky-potion-2","quantity":1}]'),
 (4,1500,'[{"type":"money","amount":25000}]','[{"type":"money","amount":50000}]'),
 (5,2000,'[{"type":"consumable","id":"lucky-potion-1","quantity":2}]','[{"type":"relic","id":"Enchant Relic","quantity":1}]'),
 (6,2500,'[{"type":"consumable","id":"mass-potion-1","quantity":1}]','[{"type":"consumable","id":"speed-potion-2","quantity":1}]'),
 (7,3000,'[{"type":"money","amount":50000}]','[{"type":"consumable","id":"fortune-potion-2","quantity":1}]'),
 (8,3500,'[{"type":"consumable","id":"speed-potion-1","quantity":2}]','[{"type":"consumable","id":"lucky-potion-2","quantity":1}]'),
 (9,4000,'[{"type":"consumable","id":"fortune-potion-2","quantity":1}]','[{"type":"money","amount":75000}]'),
 (10,4500,'[{"type":"relic","id":"Enchant Relic","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":2}]'),
 (11,5250,'[{"type":"money","amount":50000}]','[{"type":"consumable","id":"mass-potion-2","quantity":1}]'),
 (12,6000,'[{"type":"consumable","id":"lucky-potion-2","quantity":1}]','[{"type":"consumable","id":"speed-potion-3","quantity":1}]'),
 (13,6750,'[{"type":"consumable","id":"mass-potion-2","quantity":1}]','[{"type":"money","amount":75000}]'),
 (14,7500,'[{"type":"consumable","id":"fortune-potion-2","quantity":1}]','[{"type":"consumable","id":"lucky-potion-3","quantity":1}]'),
 (15,8250,'[{"type":"money","amount":75000}]','[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
 (16,9000,'[{"type":"consumable","id":"speed-potion-2","quantity":1}]','[{"type":"consumable","id":"mass-potion-3","quantity":1}]'),
 (17,9750,'[{"type":"consumable","id":"lucky-potion-2","quantity":1}]','[{"type":"money","amount":100000}]'),
 (18,10500,'[{"type":"money","amount":100000}]','[{"type":"consumable","id":"fortune-potion-3","quantity":1}]'),
 (19,11250,'[{"type":"consumable","id":"mass-potion-2","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":2}]'),
 (20,12000,'[{"type":"relic","id":"Enchant Relic","quantity":1}]','[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
 (21,13000,'[{"type":"money","amount":100000}]','[{"type":"consumable","id":"speed-potion-3","quantity":2}]'),
 (22,14000,'[{"type":"consumable","id":"fortune-potion-3","quantity":1}]','[{"type":"money","amount":150000}]'),
 (23,15000,'[{"type":"consumable","id":"lucky-potion-3","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":2}]'),
 (24,16000,'[{"type":"money","amount":125000}]','[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
 (25,17000,'[{"type":"consumable","id":"legendary-potion","quantity":1}]','[{"type":"relic","id":"Ancient Relic","quantity":1}]'),
 (26,18000,'[{"type":"money","amount":150000}]','[{"type":"consumable","id":"mass-potion-3","quantity":2}]'),
 (27,19000,'[{"type":"relic","id":"Enchant Relic","quantity":1}]','[{"type":"money","amount":200000}]'),
 (28,20000,'[{"type":"consumable","id":"speed-potion-3","quantity":1}]','[{"type":"consumable","id":"lucky-potion-3","quantity":2}]'),
 (29,21000,'[{"type":"money","amount":175000}]','[{"type":"relic","id":"Enchant Relic","quantity":2}]'),
 (30,22000,'[{"type":"relic","id":"Enchant Relic","quantity":2}]','[{"type":"consumable","id":"legendary-potion","quantity":2}]'),
 (31,23500,'[{"type":"consumable","id":"fortune-potion-3","quantity":1}]','[{"type":"money","amount":250000}]'),
 (32,25000,'[{"type":"money","amount":200000}]','[{"type":"consumable","id":"speed-potion-3","quantity":2}]'),
 (33,26500,'[{"type":"consumable","id":"lucky-potion-3","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":2}]'),
 (34,28000,'[{"type":"money","amount":225000}]','[{"type":"consumable","id":"legendary-potion","quantity":1}]'),
 (35,29500,'[{"type":"consumable","id":"legendary-potion","quantity":1}]','[{"type":"consumable","id":"legendary-potion","quantity":3}]'),
 (36,31000,'[{"type":"relic","id":"Enchant Relic","quantity":1}]','[{"type":"money","amount":300000}]'),
 (37,32500,'[{"type":"money","amount":250000}]','[{"type":"consumable","id":"mass-potion-3","quantity":2}]'),
 (38,34000,'[{"type":"consumable","id":"speed-potion-3","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":3}]'),
 (39,35500,'[{"type":"money","amount":300000}]','[{"type":"consumable","id":"legendary-potion","quantity":2}]'),
 (40,37000,'[{"type":"consumable","id":"legendary-potion","quantity":1}]','[{"type":"relic","id":"Ancient Relic","quantity":1}]'),
 (41,39000,'[{"type":"money","amount":300000}]','[{"type":"consumable","id":"fortune-potion-3","quantity":2}]'),
 (42,41000,'[{"type":"relic","id":"Enchant Relic","quantity":1}]','[{"type":"money","amount":400000}]'),
 (43,43000,'[{"type":"consumable","id":"lucky-potion-3","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":3}]'),
 (44,45000,'[{"type":"money","amount":350000}]','[{"type":"consumable","id":"legendary-potion","quantity":2}]'),
 (45,47000,'[{"type":"relic","id":"Enchant Relic","quantity":3}]','[{"type":"relic","id":"Enchant Relic","quantity":5}]'),
 (46,49500,'[{"type":"consumable","id":"fortune-potion-3","quantity":1}]','[{"type":"money","amount":500000}]'),
 (47,52000,'[{"type":"money","amount":400000}]','[{"type":"consumable","id":"legendary-potion","quantity":2}]'),
 (48,54500,'[{"type":"consumable","id":"legendary-potion","quantity":1}]','[{"type":"relic","id":"Enchant Relic","quantity":5}]'),
 (49,57000,'[{"type":"money","amount":500000}]','[{"type":"money","amount":750000}]'),
 (50,59500,'[{"type":"relic","id":"Ancient Relic","quantity":1},{"type":"cosmetic","id":"first-light","cosmeticType":"title"}]','[{"type":"consumable","id":"mythic-potion","quantity":1},{"type":"cosmetic","id":"season-zero","cosmeticType":"badge"}]')
) as x(tier,xp,free_reward,premium_reward);
$$;

update public.season_definitions set
 description='Fifty milestones charting the first light beyond the mine.',
 enabled=true, starts_at=null, ends_at=null, xp_per_roll=0, tier_xp=0,
 tiers=public.season_zero_tiers(),
 challenges='[]'::jsonb,
 metadata='{"premiumPrice":5000000,"durationDays":30,"claimGraceDays":7,"rollXpDailyCap":1500,"version":"season-zero"}'::jsonb,
 updated_at=now()
where name='Season Zero — First Light';

create or replace function public.season_start_if_needed()
returns public.season_definitions language plpgsql security definer set search_path='' as $$
declare s public.season_definitions%rowtype;
begin
 if not exists(select 1 from public.game_section_settings where id='seasons' and enabled) then return null; end if;
 select * into s from public.season_definitions where name='Season Zero — First Light' and enabled for update;
 if not found then return null; end if;
 if s.starts_at is null then
  update public.season_definitions set starts_at=now(),ends_at=now()+interval '30 days',updated_at=now() where id=s.id returning * into s;
 end if;
 return s;
end; $$;

create or replace function public.season_grant_reward(p_uid uuid,p_season uuid,p_reward jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r jsonb; q integer;
begin
 for r in select value from jsonb_array_elements(coalesce(p_reward,'[]')) loop
  q:=greatest(1,coalesce((r->>'quantity')::integer,1));
  if r->>'type'='money' then update public.players set money=money+coalesce((r->>'amount')::numeric,0) where id=p_uid;
  elsif r->>'type'='consumable' then perform public.expedition_grant_consumable(p_uid,r->>'id',q);
  elsif r->>'type'='relic' then perform public.expedition_grant_relic(p_uid,r->>'id',q);
  elsif r->>'type'='cosmetic' then
   insert into public.player_season_cosmetics(player_id,cosmetic_id,cosmetic_type,season_id)
   values(p_uid,r->>'id',r->>'cosmeticType',p_season) on conflict do nothing;
  end if;
 end loop;
end; $$;

create or replace function public.purchase_season_premium(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.season_definitions%rowtype; p public.player_seasons%rowtype; price numeric;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 select * into s from public.season_definitions where id=p_season_id and enabled for update;
 if not found or now()<s.starts_at or now()>=s.ends_at then raise exception 'season_not_active'; end if;
 insert into public.player_seasons(season_id,player_id) values(s.id,u) on conflict do nothing;
 select * into p from public.player_seasons where season_id=s.id and player_id=u for update;
 if p.premium then return jsonb_build_object('premium',true,'alreadyOwned',true); end if;
 price:=coalesce((s.metadata->>'premiumPrice')::numeric,5000000);
 update public.players set money=money-price where id=u and money>=price;
 if not found then raise exception 'not_enough_money'; end if;
 update public.player_seasons set premium=true,updated_at=now() where id=p.id;
 return jsonb_build_object('premium',true,'price',price);
end; $$;

create or replace function public.claim_season_tier(p_season_id uuid,p_tier integer,p_lane text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.season_definitions%rowtype; p public.player_seasons%rowtype; t jsonb; key text; reward jsonb;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 if p_lane not in ('free','premium') then raise exception 'invalid_lane'; end if;
 select * into s from public.season_definitions where id=p_season_id and enabled for update;
 if not found or now()>=s.ends_at+interval '7 days' then raise exception 'claim_period_ended'; end if;
 select * into p from public.player_seasons where season_id=s.id and player_id=u for update;
 if not found then raise exception 'season_progress_not_found'; end if;
 if p_lane='premium' and not p.premium then raise exception 'premium_required'; end if;
 select value into t from jsonb_array_elements(s.tiers) where (value->>'tier')::integer=p_tier;
 if t is null then raise exception 'tier_not_configured'; end if;
 if p.xp<(t->>'xp')::numeric then raise exception 'tier_locked'; end if;
 key:=p_lane||':'||p_tier;
 if p.claimed_tiers ? key then raise exception 'already_claimed'; end if;
 reward:=t->p_lane;
 perform public.season_grant_reward(u,s.id,reward);
 update public.player_seasons set claimed_tiers=claimed_tiers||jsonb_build_array(key),updated_at=now() where id=p.id;
 return jsonb_build_object('tier',p_tier,'lane',p_lane,'reward',reward);
end; $$;

revoke all on function public.purchase_season_premium(uuid),public.claim_season_tier(uuid,integer,text) from public;
grant execute on function public.purchase_season_premium(uuid),public.claim_season_tier(uuid,integer,text) to authenticated;

create table if not exists public.player_season_missions (
 id bigint generated by default as identity primary key,
 season_id uuid not null references public.season_definitions(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 cadence text not null check(cadence in ('daily','weekly')),
 period_start timestamptz not null,
 period_end timestamptz not null,
 slot integer not null,
 category text not null,
 title text not null,
 thresholds numeric[] not null,
 xp_rewards numeric[] not null,
 progress numeric not null default 0,
 awarded_tiers integer not null default 0,
 item_reward jsonb not null,
 unique(player_id,season_id,cadence,period_start,slot)
);
create table if not exists public.player_season_rerolls (
 player_id uuid not null references public.players(id) on delete cascade,
 season_id uuid not null references public.season_definitions(id) on delete cascade,
 period_start timestamptz not null,
 used boolean not null default false,
 primary key(player_id,season_id,period_start)
);
alter table public.player_season_missions enable row level security;
alter table public.player_season_rerolls enable row level security;
revoke all on public.player_season_missions,public.player_season_rerolls from anon,authenticated;
grant all on public.player_season_missions,public.player_season_rerolls to service_role;

create or replace function public.season_period(p_cadence text,p_now timestamptz default now())
returns table(period_start timestamptz,period_end timestamptz) language sql stable set search_path='' as $$
 select case when p_cadence='daily' then date_trunc('day',p_now at time zone 'UTC') at time zone 'UTC' else date_trunc('week',p_now at time zone 'UTC') at time zone 'UTC' end,
        case when p_cadence='daily' then (date_trunc('day',p_now at time zone 'UTC')+interval '1 day') at time zone 'UTC' else (date_trunc('week',p_now at time zone 'UTC')+interval '1 week') at time zone 'UTC' end;
$$;

create or replace function public.season_mission_spec(p_category text,p_cadence text)
returns jsonb language plpgsql volatile set search_path='' as $$
declare th numeric[]; ttl text; potion text; ids text[]:=array['lucky','speed','fortune','mass']; family text:=ids[1+floor(random()*4)::integer];
begin
 if p_category='rolls' then ttl:='Persistent Miner'; th:=case when p_cadence='daily' then array[150,400,800] else array[2000,5000,10000,15000] end;
 elsif p_category='sold' then ttl:='Clear the Cart'; th:=case when p_cadence='daily' then array[100,300,600] else array[1500,4000,8000,12000] end;
 elsif p_category='legendary' then ttl:='Legendary Survey'; th:=case when p_cadence='daily' then array[10,30,60] else array[100,300,700,1200] end;
 elsif p_category='mythic' then ttl:='Mythic Pursuit'; th:=case when p_cadence='daily' then array[1,3,7] else array[10,30,75,150] end;
 elsif p_category='exotic' then ttl:='Exotic Evidence'; th:=array[1,2,4,8];
 elsif p_category='mutated' then ttl:='Altered Matter'; th:=case when p_cadence='daily' then array[1,3,7] else array[10,30,75,150] end;
 elsif p_category='effective100k' then ttl:='Against the Odds'; th:=case when p_cadence='daily' then array[1,3,6] else array[10,30,75,150] end;
 else ttl:='Million-to-One'; th:=array[1,3,6,12]; end if;
 potion:=family||'-potion-'||case when p_cadence='daily' then '2' else '3' end;
 return jsonb_build_object('title',ttl,'thresholds',to_jsonb(th),'xp',case when p_cadence='daily' then '[50,100,150]'::jsonb else '[250,400,600,850]'::jsonb end,'item',jsonb_build_object('type','consumable','id',potion,'quantity',1));
end; $$;

create or replace function public.ensure_player_season(p_uid uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.season_definitions%rowtype; ps timestamptz; pe timestamptz; cat text; spec jsonb; pos integer; cats text[];
begin
 select * into s from public.season_start_if_needed(); if s.id is null or now()>=s.ends_at then return null; end if;
 insert into public.player_seasons(season_id,player_id) values(s.id,p_uid) on conflict do nothing;
 for cat,ps,pe in select cadence,period_start,period_end from (select 'daily' cadence,* from public.season_period('daily') union all select 'weekly',* from public.season_period('weekly')) q loop
  if not exists(select 1 from public.player_season_missions where player_id=p_uid and season_id=s.id and cadence=cat and period_start=ps) then
   cats:=case when cat='daily' then array['rolls','sold','legendary','mythic','mutated','effective100k'] else array['rolls','sold','legendary','mythic','exotic','mutated','effective100k','effective1m'] end;
   pos:=0;
   for spec in select public.season_mission_spec(x,cat)||jsonb_build_object('category',x) from unnest(cats) x order by random() limit case when cat='daily' then 2 else 3 end loop
    pos:=pos+1;
    insert into public.player_season_missions(season_id,player_id,cadence,period_start,period_end,slot,category,title,thresholds,xp_rewards,item_reward)
    values(s.id,p_uid,cat,ps,pe,pos,spec->>'category',spec->>'title',array(select jsonb_array_elements_text(spec->'thresholds')::numeric),array(select jsonb_array_elements_text(spec->'xp')::numeric),spec->'item');
   end loop;
  end if;
 end loop;
 return s.id;
end; $$;

create or replace function public.season_advance_missions(p_uid uuid,p_sid uuid,p_event text,p_rarity numeric default 0,p_effective numeric default 0,p_mutations integer default 0)
returns numeric language plpgsql security definer set search_path='' as $$
declare m public.player_season_missions%rowtype; inc numeric; reached integer; addxp numeric:=0;
begin
 for m in select * from public.player_season_missions where player_id=p_uid and season_id=p_sid and now()>=period_start and now()<period_end for update loop
  inc:=case when m.category='rolls' and p_event='roll' then 1 when m.category='sold' and p_event='sale' then 1 when p_event='roll' and m.category='legendary' and p_rarity>=1000 then 1 when p_event='roll' and m.category='mythic' and p_rarity>=10000 then 1 when p_event='roll' and m.category='exotic' and p_rarity>=100000 then 1 when p_event='roll' and m.category='mutated' and p_mutations>0 then 1 when p_event='roll' and m.category='effective100k' and p_effective>=100000 then 1 when p_event='roll' and m.category='effective1m' and p_effective>=1000000 then 1 else 0 end;
  if inc=0 then continue; end if;
  m.progress:=m.progress+inc;
  reached:=m.awarded_tiers;
  while reached<cardinality(m.thresholds) and m.progress>=m.thresholds[reached+1] loop reached:=reached+1; addxp:=addxp+m.xp_rewards[reached]; end loop;
  if reached=cardinality(m.thresholds) and m.awarded_tiers<reached then perform public.season_grant_reward(p_uid,p_sid,jsonb_build_array(m.item_reward)); end if;
  update public.player_season_missions set progress=m.progress,awarded_tiers=reached where id=m.id;
 end loop;
 if addxp>0 then update public.player_seasons set xp=least(59500,xp+addxp),updated_at=now() where player_id=p_uid and season_id=p_sid; end if;
 return addxp;
end; $$;

create or replace function public.record_season_roll(p_player_id uuid,p_rarity numeric,p_effective_rarity numeric,p_mutation_count integer,p_relic boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; base_xp numeric:=0; allowed numeric; mission_xp numeric; today date:=(now() at time zone 'UTC')::date; p public.player_seasons%rowtype;
begin
 sid:=public.ensure_player_season(p_player_id); if sid is null then return null; end if;
 if not p_relic then base_xp:=case when p_rarity<10 then .1 when p_rarity<50 then .25 when p_rarity<100 then .5 when p_rarity<1000 then 1 when p_rarity<10000 then 3 when p_rarity<100000 then 8 when p_rarity<1000000 then 20 else 50 end + greatest(0,p_mutation_count)*2; end if;
 select * into p from public.player_seasons where player_id=p_player_id and season_id=sid for update;
 if p.roll_xp_date is distinct from today then p.roll_xp_today:=0; p.roll_xp_date:=today; end if;
 allowed:=least(base_xp,greatest(0,1500-p.roll_xp_today));
 allowed:=least(allowed,greatest(0,59500-p.xp));
 update public.player_seasons set xp=least(59500,xp+allowed),roll_xp_date=today,roll_xp_today=p.roll_xp_today+allowed,updated_at=now() where id=p.id;
 mission_xp:=public.season_advance_missions(p_player_id,sid,'roll',case when p_relic then 0 else p_rarity end,case when p_relic then 0 else p_effective_rarity end,case when p_relic then 0 else p_mutation_count end);
 return jsonb_build_object('xp',allowed,'missionXp',mission_xp);
end; $$;

create or replace function public.record_season_sale(p_player_id uuid)
returns numeric language plpgsql security definer set search_path='' as $$
declare sid uuid; gained numeric;
begin sid:=public.ensure_player_season(p_player_id); if sid is null then return 0; end if; gained:=public.season_advance_missions(p_player_id,sid,'sale'); return gained; end; $$;

create or replace function public.reroll_daily_season_mission(p_season_id uuid,p_slot integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m public.player_season_missions%rowtype; ps timestamptz; spec jsonb; cat text;
begin
 if u is null then raise exception 'not_authenticated'; end if;
 select * into m from public.player_season_missions where player_id=u and season_id=p_season_id and cadence='daily' and slot=p_slot and now()>=period_start and now()<period_end for update;
 if not found then raise exception 'mission_not_found'; end if; if m.progress>0 or m.awarded_tiers>0 then raise exception 'mission_in_progress'; end if;
 ps:=m.period_start;
 insert into public.player_season_rerolls(player_id,season_id,period_start,used) values(u,p_season_id,ps,true) on conflict do nothing;
 if not found or (select used from public.player_season_rerolls where player_id=u and season_id=p_season_id and period_start=ps) is not true then raise exception 'reroll_used'; end if;
 select x into cat from unnest(array['rolls','sold','legendary','mythic','mutated','effective100k']) x where x<>m.category and not exists(select 1 from public.player_season_missions z where z.player_id=u and z.season_id=p_season_id and z.period_start=ps and z.category=x) order by random() limit 1;
 spec:=public.season_mission_spec(cat,'daily');
 update public.player_season_missions set category=cat,title=spec->>'title',thresholds=array(select jsonb_array_elements_text(spec->'thresholds')::numeric),xp_rewards=array(select jsonb_array_elements_text(spec->'xp')::numeric),item_reward=spec->'item' where id=m.id;
 return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.reroll_daily_season_mission(uuid,integer) from public;
grant execute on function public.reroll_daily_season_mission(uuid,integer) to authenticated;

revoke all on function public.season_start_if_needed(),public.season_grant_reward(uuid,uuid,jsonb),public.season_advance_missions(uuid,uuid,text,numeric,numeric,integer),public.record_season_roll(uuid,numeric,numeric,integer,boolean),public.record_season_sale(uuid),public.ensure_player_season(uuid) from public;
grant execute on function public.season_start_if_needed(),public.season_grant_reward(uuid,uuid,jsonb),public.season_advance_missions(uuid,uuid,text,numeric,numeric,integer),public.record_season_roll(uuid,numeric,numeric,integer,boolean),public.record_season_sale(uuid),public.ensure_player_season(uuid) to service_role;
