-- v0.13.0 Beta: authoritative achievement snapshot/backfill.
-- This intentionally reads server-owned history/state instead of trusting the client.

create table if not exists public.player_achievement_cosmetics (
  player_id uuid not null references public.players(id) on delete cascade,
  cosmetic_id text not null,
  cosmetic_type text not null check (cosmetic_type in ('title','badge','border','background','decor','aura')),
  earned_at timestamptz not null default now(),
  primary key (player_id, cosmetic_id)
);
alter table public.player_achievement_cosmetics enable row level security;
revoke all on public.player_achievement_cosmetics from public,anon,authenticated;
grant all on public.player_achievement_cosmetics to service_role;

create or replace function public.achievement_set_progress_v013(p_uid uuid,p_name text,p_value numeric,p_target numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from public.private_feature_definitions
 where feature_kind='achievement' and enabled and name=p_name and metadata->>'catalogVersion'='v0.13.0-beta';
 if v_id is null then return; end if;
 update public.private_feature_definitions set
   metadata=jsonb_set(metadata,'{target}',to_jsonb(p_target),true),
   description=case when description like 'Complete this % milestone%' then
     'Reach '||trim(to_char(p_target,'FM999G999G999G999G999'))||' progress for '||p_name||' through genuine server-authoritative gameplay.'
     else description end,
   updated_at=now()
 where id=v_id;
 insert into public.private_feature_progress(player_id,feature_id,current_value,completed,completed_at,metadata)
 values(p_uid,v_id,greatest(0,p_value),p_value>=p_target,case when p_value>=p_target then now() end,
        jsonb_build_object('authoritativeSnapshot',true,'target',p_target))
 on conflict(player_id,feature_id) do update set
   current_value=greatest(public.private_feature_progress.current_value,excluded.current_value),
   completed=public.private_feature_progress.completed or excluded.completed,
   completed_at=coalesce(public.private_feature_progress.completed_at,excluded.completed_at),
   metadata=public.private_feature_progress.metadata||excluded.metadata,updated_at=now();
end$$;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.players%rowtype;v numeric;v2 numeric; names text[];targets numeric[];i integer;
begin
 if auth.uid() is not null and auth.uid() is distinct from p_uid then raise exception 'forbidden'; end if;
 select * into p from public.players where id=p_uid;if not found then raise exception 'player_not_found';end if;

 names:=array['First Spark','Getting Started','Finding Rhythm','Into the Mines','Seasoned Miner','Relentless','Deep Routine','Veteran Roller','Century Fortune','Endless Descent','Millionth Spark'];
 targets:=array[1,100,500,1000,5000,10000,25000,50000,100000,250000,1000000];
 for i in 1..cardinality(names) loop perform public.achievement_set_progress_v013(p_uid,names[i],coalesce(p.total_rolls,0),targets[i]);end loop;

 select coalesce(max(rarity*public.get_mutation_chance_product(coalesce(mutation_ids,'{}'))),0),coalesce(max(rarity),0) into v,v2 from public.best_roll_history where player_id=p_uid;
 names:=array['A Legendary Find','Mythic Discovery','Exotic Discovery','Exalted Discovery','Cosmic Discovery','Transcendent Discovery','One in a Billion'];targets:=array[2300,10000,100000,1000000,10000000,100000000,1000000000];
 for i in 1..cardinality(names) loop perform public.achievement_set_progress_v013(p_uid,names[i],v2,targets[i]);end loop;
 names:=array['Effective 100K','Effective Million','Effective Ten Million','Effective Hundred Million','Effective Billion','Effective Trillion'];targets:=array[100000,1000000,10000000,100000000,1000000000,1000000000000];
 for i in 1..cardinality(names) loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;
 select count(distinct gem_name) into v from public.best_roll_history where player_id=p_uid;
 names:=array['Index Apprentice','Index Explorer','Index Scholar','Index Expert','The Complete Index'];targets:=array[10,25,50,100,150];
 for i in 1..cardinality(names) loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;

 select coalesce(sum(cardinality(coalesce(mutation_ids,'{}'))),0),coalesce(max(cardinality(coalesce(mutation_ids,'{}'))),0) into v,v2 from public.best_roll_history where player_id=p_uid;
 names:=array['First Mutation','Mutation Collector','Mutation Researcher','Mutation Hoarder','Mutation Archive'];targets:=array[1,10,50,250,1000];for i in 1..5 loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;
 perform public.achievement_set_progress_v013(p_uid,'Double Mutation',v2,2);perform public.achievement_set_progress_v013(p_uid,'Triple Mutation',v2,3);perform public.achievement_set_progress_v013(p_uid,'Quadruple Mutation',v2,4);perform public.achievement_set_progress_v013(p_uid,'The Mutated',v2,5);
 select coalesce(max(public.get_mutation_chance_product(coalesce(mutation_ids,'{}'))),1) into v from public.best_roll_history where player_id=p_uid;
 names:=array['Mutation Odds 1K','Mutation Odds 100K','Mutation Odds 10M','Mutation Odds 1B','Mutation Odds 1T'];targets:=array[1000,100000,10000000,1000000000,1000000000000];for i in 1..5 loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;

 names:=array['First Hundred Thousand','First Million','Ten Million Earned','Fifty Million Earned','Hundred Million Earned','Gem Magnate','Billionaire'];targets:=array[100000,1000000,10000000,50000000,100000000,500000000,1000000000];for i in 1..7 loop perform public.achievement_set_progress_v013(p_uid,names[i],coalesce(p.lifetime_earnings,0),targets[i]);end loop;
 select coalesce(max(value),0) into v from public.best_roll_history where player_id=p_uid;names:=array['Valuable Specimen','Premium Specimen','Million-Dollar Gem','Priceless'];targets:=array[10000,100000,1000000,10000000];for i in 1..4 loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;
 perform public.achievement_set_progress_v013(p_uid,'Golden Vault',coalesce(p.money,0),100000000);

 select coalesce(max(tier),0),count(*) into v,v2 from public.player_equipment where player_id=p_uid;
 perform public.achievement_set_progress_v013(p_uid,'First Equipment',v2,1);perform public.achievement_set_progress_v013(p_uid,'Tier V Pickaxe',v,5);perform public.achievement_set_progress_v013(p_uid,'Tier X Pickaxe',v,10);perform public.achievement_set_progress_v013(p_uid,'Master Miner',v,13);
 select coalesce(max(masterwork_level),0) into v from public.player_equipment where player_id=p_uid;perform public.achievement_set_progress_v013(p_uid,'First Masterwork',v,1);perform public.achievement_set_progress_v013(p_uid,'Masterwork III',v,3);perform public.achievement_set_progress_v013(p_uid,'Masterwork V',v,5);
 select count(*) into v from public.player_equipment where player_id=p_uid and enchant_id is not null;perform public.achievement_set_progress_v013(p_uid,'First Enchantment',v,1);perform public.achievement_set_progress_v013(p_uid,'Enchant Collector',v,5);
 select count(*) into v from public.player_equipment where player_id=p_uid and enchant_grade='ancient';perform public.achievement_set_progress_v013(p_uid,'Ancient Enchantment',v,1);

 select coalesce(capacity,0),coalesce(prestige,0) into v,v2 from public.museum_profiles where player_id=p_uid;
 perform public.achievement_set_progress_v013(p_uid,'Opening Exhibit',(select count(*) from public.museum_exhibits where player_id=p_uid),1);perform public.achievement_set_progress_v013(p_uid,'Four Displays',v,4);perform public.achievement_set_progress_v013(p_uid,'Expanded Gallery',v,7);perform public.achievement_set_progress_v013(p_uid,'Grand Hall',v,10);
 select count(*) into v from public.museum_registrations where player_id=p_uid;names:=array['Registered Specimen','Ten Registered','Fifty Registered','Museum Curator','Museum Archivist'];targets:=array[1,10,50,100,250];for i in 1..5 loop perform public.achievement_set_progress_v013(p_uid,names[i],v,targets[i]);end loop;
 select count(*) into v from public.museum_collection_completions where player_id=p_uid;perform public.achievement_set_progress_v013(p_uid,'First Collection',v,1);perform public.achievement_set_progress_v013(p_uid,'Four Collections',v,4);perform public.achievement_set_progress_v013(p_uid,'Master Curator',v,8);
 names:=array['Prestige 250','Prestige 400','World-Class Curator','Museum Prestige 500','Museum Prestige 3500','Museum Prestige 12000','Prestige Gallery','Living Museum'];targets:=array[250,400,500,500,3500,12000,25000,75000];for i in 1..8 loop perform public.achievement_set_progress_v013(p_uid,names[i],v2,targets[i]);end loop;

 select count(*) into v from public.guild_members where player_id=p_uid;perform public.achievement_set_progress_v013(p_uid,'Guild Member',v,1);select count(*) into v from public.guild_members where player_id=p_uid and role='owner';perform public.achievement_set_progress_v013(p_uid,'Guild Founder',v,1);
 select coalesce(lifetime_contribution,0) into v from public.guild_members where player_id=p_uid;names:=array['Guild Contributor','Guild Regular','Guild Stalwart'];targets:=array[1000,10000,50000];for i in 1..3 loop perform public.achievement_set_progress_v013(p_uid,names[i],coalesce(v,0),targets[i]);end loop;
 select count(*) into v from public.mining_cache_opens where player_id=p_uid and claimed_at is not null;perform public.achievement_set_progress_v013(p_uid,'First Cache',v,1);perform public.achievement_set_progress_v013(p_uid,'Cache Collector',v,10);perform public.achievement_set_progress_v013(p_uid,'Cache Connoisseur',v,50);
 select coalesce(max((regexp_match(k,'(\\d+)$'))[1]::integer),0) into v from public.player_seasons ps cross join lateral jsonb_array_elements_text(ps.claimed_tiers) k where ps.player_id=p_uid;perform public.achievement_set_progress_v013(p_uid,'Season Tier 10',v,10);perform public.achievement_set_progress_v013(p_uid,'Season Tier 25',v,25);perform public.achievement_set_progress_v013(p_uid,'Season Tier 50',v,50);
 select count(*) into v from public.player_expeditions where player_id=p_uid and completed_at is not null;perform public.achievement_set_progress_v013(p_uid,'First Expedition',v,1);perform public.achievement_set_progress_v013(p_uid,'Expedition Regular',v,5);perform public.achievement_set_progress_v013(p_uid,'Expedition Veteran',v,20);perform public.achievement_set_progress_v013(p_uid,'Expedition Master',v,50);
end$$;

-- Give every claim a concrete, relic-free reward. Named cosmetic rewards remain on AP milestones.
update public.private_feature_definitions set rewards=case
 when (metadata->>'ap')::integer>=200 then jsonb_build_array(jsonb_build_object('type','potion','consumableId','mythic-potion','name','Mythic Potion','amount',1))
 when (metadata->>'ap')::integer>=100 then jsonb_build_array(jsonb_build_object('type','potion','consumableId','legendary-potion','name','Legendary Potion','amount',1))
 when (metadata->>'ap')::integer>=50 then jsonb_build_array(jsonb_build_object('type','potion','consumableId','fortune-potion-3','name','Fortune Potion III','amount',1))
 when (metadata->>'ap')::integer>=20 then jsonb_build_array(jsonb_build_object('type','potion','consumableId','fortune-potion-2','name','Fortune Potion II','amount',1))
 else jsonb_build_array(jsonb_build_object('type','money','amount',25000)) end
where feature_kind='achievement' and metadata->>'catalogVersion'='v0.13.0-beta';

create or replace function public.grant_achievement_rewards_v013(p_uid uuid,p_rewards jsonb)returns void language plpgsql security definer set search_path='' as $$declare r jsonb;q integer;begin for r in select value from jsonb_array_elements(coalesce(p_rewards,'[]'))loop q:=greatest(1,coalesce((r->>'amount')::integer,1));if r->>'type'='money'then update public.players set money=money+coalesce((r->>'amount')::numeric,0)where id=p_uid;elsif r->>'type'='potion'then perform public.expedition_grant_consumable(p_uid,r->>'consumableId',q);elsif r->>'type'='capacity'then update public.players set inventory_capacity=inventory_capacity+q where id=p_uid;elsif r->>'type'='cache_credit'then update public.players set legacy_cache_credits=legacy_cache_credits+q where id=p_uid;elsif r->>'type'='cosmetic'then insert into public.player_achievement_cosmetics(player_id,cosmetic_id,cosmetic_type)values(p_uid,r->>'id',r->>'cosmeticType')on conflict do nothing;end if;end loop;end$$;

-- Refresh immediately before returning the dashboard, so existing players are backfilled and
-- future authoritative state changes appear without trusting browser-supplied progress.
create or replace function public.get_player_achievements_v013(p_player_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare defs jsonb;prog jsonb;points integer;visible_total integer;visible_done integer;unclaimed integer;ranking bigint;milestones jsonb;begin if auth.uid()is distinct from p_player_id then raise exception 'forbidden';end if;perform public.ensure_private_feature_progress(p_player_id);perform public.refresh_player_achievements_v013(p_player_id);select coalesce(jsonb_agg(to_jsonb(d)order by d.sort_order),'[]')into defs from public.private_feature_definitions d where d.enabled and d.feature_kind='achievement';select coalesce(jsonb_agg(to_jsonb(p)),'[]')into prog from public.private_feature_progress p join public.private_feature_definitions d on d.id=p.feature_id where p.player_id=p_player_id and d.feature_kind='achievement';select coalesce(achievement_points,0)into points from public.player_achievement_profiles where player_id=p_player_id;select count(*)filter(where not coalesce((metadata->>'hidden')::boolean,false))into visible_total from public.private_feature_definitions where enabled and feature_kind='achievement';select count(*)filter(where p.completed and not coalesce((d.metadata->>'hidden')::boolean,false)),count(*)filter(where p.completed and not p.reward_granted)into visible_done,unclaimed from public.private_feature_progress p join public.private_feature_definitions d on d.id=p.feature_id where p.player_id=p_player_id and d.feature_kind='achievement';select rank into ranking from(select player_id,dense_rank()over(order by achievement_points desc)rank from public.player_achievement_profiles)x where player_id=p_player_id;select jsonb_agg(m||jsonb_build_object('unlocked',points>=(m->>'ap')::integer,'claimed',c.ap is not null)order by(m->>'ap')::integer)into milestones from jsonb_array_elements(public.achievement_milestones_v013())m left join public.player_achievement_milestones c on c.player_id=p_player_id and c.ap=(m->>'ap')::integer;return jsonb_build_object('definitions',defs,'progress',prog,'summary',jsonb_build_object('ap',points,'visibleCompleted',coalesce(visible_done,0),'visibleTotal',visible_total,'completionPercent',case when visible_total=0 then 0 else round(100.0*visible_done/visible_total,1)end,'rank',ranking,'unclaimed',coalesce(unclaimed,0)),'milestones',coalesce(milestones,'[]'));end$$;

revoke all on function public.achievement_set_progress_v013(uuid,text,numeric,numeric),public.refresh_player_achievements_v013(uuid),public.grant_achievement_rewards_v013(uuid,jsonb),public.get_player_achievements_v013(uuid) from public,anon,authenticated;
grant execute on function public.achievement_set_progress_v013(uuid,text,numeric,numeric),public.refresh_player_achievements_v013(uuid),public.grant_achievement_rewards_v013(uuid,jsonb) to service_role;
grant execute on function public.get_player_achievements_v013(uuid) to authenticated,service_role;
