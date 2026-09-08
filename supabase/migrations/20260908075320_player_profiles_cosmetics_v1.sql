-- Player Profiles + Cosmetics v1. Prepared against live igrddscmrdrrwtvyspbf.
-- Local migration only: deploy manually. No economy or roll changes.
begin;
create schema if not exists cosmetics_private;
revoke all on schema cosmetics_private from public, anon, authenticated;

create table public.cosmetic_definitions (
 id text primary key,
 name text not null,
 slots text[] not null check (cardinality(slots)>0 and slots <@ array['title','frame','background','badge','decor','trophy']::text[]),
 description text not null default '',
 rarity text not null check (rarity in ('Common','Rare','Epic','Legendary','Mythic','Legacy')),
 visual_config jsonb not null default '{}' check (jsonb_typeof(visual_config)='object'),
 source text not null,
 legacy_after timestamptz,
 enabled boolean not null default true
);
create table public.player_cosmetics (
 player_id uuid not null references public.players(id) on delete cascade,
 cosmetic_id text not null references public.cosmetic_definitions(id),
 earned_at timestamptz not null default now(),
 source text not null,
 source_key text,
 primary key(player_id,cosmetic_id)
);
create index player_cosmetics_definition_idx on public.player_cosmetics(cosmetic_id);
create table public.player_cosmetic_loadouts (
 player_id uuid primary key references public.players(id) on delete cascade,
 equipment jsonb not null default '{}' check (jsonb_typeof(equipment)='object'),
 updated_at timestamptz not null default now()
);
alter table public.cosmetic_definitions enable row level security;
alter table public.player_cosmetics enable row level security;
alter table public.player_cosmetic_loadouts enable row level security;
revoke all on public.cosmetic_definitions,public.player_cosmetics,public.player_cosmetic_loadouts from public,anon,authenticated;
grant select on public.cosmetic_definitions,public.player_cosmetics,public.player_cosmetic_loadouts to authenticated;
grant all on public.cosmetic_definitions,public.player_cosmetics,public.player_cosmetic_loadouts to service_role;
create policy cosmetic_catalog_read on public.cosmetic_definitions for select to authenticated using(enabled);
create policy cosmetic_ownership_read on public.player_cosmetics for select to authenticated using(player_id=(select auth.uid()));
create policy cosmetic_loadout_read on public.player_cosmetic_loadouts for select to authenticated using(player_id=(select auth.uid()));

insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source) values
('achievement-novice','Achievement Novice',array['badge'],'Claim the 500 AP milestone.','Common','{"icon": "\ud83c\udfc5", "style": "bronze"}','achievement'),
('milestone-bronze','Milestone Bronze',array['frame'],'Claim the 2,000 AP milestone.','Rare','{"icon": "\u25c7", "style": "bronze"}','achievement'),
('achievement-hunter','Achievement Hunter',array['title'],'Claim the 5,000 AP milestone.','Epic','{"icon": "\ud83c\udfc6", "style": "gold"}','achievement'),
('milestone-diamond','Milestone Diamond',array['frame'],'Claim the 7,500 AP milestone.','Legendary','{"icon": "\u25c7", "style": "diamond"}','achievement'),
('master-gem-incremental','Master of Gem Incremental',array['badge','title'],'Claim the 10,000 AP milestone. One collectible, usable as both badge and title.','Mythic','{"icon": "\u2726", "style": "prismatic"}','achievement'),
('first-light','First Light',array['title'],'Earned from Season Zero.','Legendary','{"icon": "\u2600", "style": "sunrise"}','season'),
('season-zero','Season Zero',array['badge'],'Earned from Season Zero.','Epic','{"icon": "\u25c8 0", "style": "diamond"}','season'),
('mining-master','Mining Master',array['badge'],'Complete Mining Mastery research.','Rare','{"icon": "\u26cf", "style": "bronze"}','research'),
('grand-curator','Grand Curator',array['title'],'Complete Grand Curator research.','Legendary','{"icon": "\u25c6", "style": "gold"}','research'),
('master-engineer','Master Engineer',array['badge'],'Complete Master Engineer research.','Epic','{"icon": "\u2699", "style": "diamond"}','research'),
('master-explorer','Master Explorer',array['badge'],'Complete Master Explorer research.','Epic','{"icon": "\ud83e\udded", "style": "sunrise"}','research'),
('founding-curator','Founding Curator Plaque',array['trophy'],'Place your first Museum exhibit.','Rare','{"icon": "\ud83c\udfdb", "style": "bronze"}','museum'),
('mutation-gallery-trim','Mutation Gallery Trim',array['decor'],'Display four different mutations in the Museum.','Epic','{"icon": "\u2727", "style": "mutation"}','museum'),
('stone-curator','Stone Curator',array['title'],'Complete Polished Foundations.','Rare','{"icon": "\u25c6", "style": "stone"}','museum'),
('archive-display-case','Archive Display Case',array['decor'],'Complete Serial Archive.','Epic','{"icon": "\u25a3", "style": "archive"}','museum');
-- Derive legacy timing from the season that actually defines each reward.
update public.cosmetic_definitions d set legacy_after=(
 select max(s.ends_at) from public.season_definitions s
 where s.tiers::text like '%'||d.id||'%'
) where d.source='season';
-- Existing bundles become pinnable accomplishments, with no new gameplay reward.
insert into public.cosmetic_definitions(id,name,slots,description,rarity,visual_config,source)
select 'bundle-'||b.id,b.name,array['trophy'],'Completed the '||b.name||' bundle.',
 'Rare',jsonb_build_object('icon',b.icon,'style','gold'),'bundle' from public.game_bundles b;

create function cosmetics_private.grant_item(p_player uuid,p_id text,p_source text,p_key text,p_earned timestamptz default now())
returns void language sql security definer set search_path='' as $$
 insert into public.player_cosmetics(player_id,cosmetic_id,source,source_key,earned_at)
 select p_player,d.id,p_source,p_key,coalesce(p_earned,now()) from public.cosmetic_definitions d where d.id=p_id
 on conflict(player_id,cosmetic_id) do update set earned_at=least(public.player_cosmetics.earned_at,excluded.earned_at);
$$;
revoke all on function cosmetics_private.grant_item(uuid,text,text,text,timestamptz) from public,anon,authenticated;
-- Legacy reward writers stay compatible; the unified table is the only inventory/equip authority.
create function cosmetics_private.reward_bridge() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new); cid text; src text;
begin
 if tg_table_name in ('player_achievement_cosmetics','player_season_cosmetics') then
  cid:=r->>'cosmetic_id'; src:=case when tg_table_name='player_achievement_cosmetics' then 'achievement' else 'season' end;
 elsif tg_table_name='player_research_purchases' then
  select effects->>'cosmetic' into cid from public.research_nodes where id=r->>'node_id'; src:='research';
 elsif tg_table_name='museum_collection_completions' then
  cid:=case r->>'collection_id' when 'first-exhibit' then 'founding-curator' when 'mutation-symphony' then 'mutation-gallery-trim' when 'polished-foundations' then 'stone-curator' when 'serial-archive' then 'archive-display-case' end; src:='museum';
 elsif tg_table_name='player_bundle_completions' then cid:='bundle-'||(r->>'bundle_id'); src:='bundle';
 end if;
 if cid is not null then
  perform cosmetics_private.grant_item((r->>'player_id')::uuid,cid,src,coalesce(r->>'node_id',r->>'collection_id',r->>'bundle_id',r->>'season_id',cid),coalesce((r->>'earned_at')::timestamptz,(r->>'purchased_at')::timestamptz,(r->>'completed_at')::timestamptz,now()));
 end if;
 return new;
end $$;
revoke all on function cosmetics_private.reward_bridge() from public,anon,authenticated;
create trigger cosmetics_achievement after insert or update on public.player_achievement_cosmetics for each row execute function cosmetics_private.reward_bridge();
create trigger cosmetics_season after insert or update on public.player_season_cosmetics for each row execute function cosmetics_private.reward_bridge();
create trigger cosmetics_research after insert or update on public.player_research_purchases for each row execute function cosmetics_private.reward_bridge();
create trigger cosmetics_museum after insert or update on public.museum_collection_completions for each row execute function cosmetics_private.reward_bridge();
create trigger cosmetics_bundle after insert or update on public.player_bundle_completions for each row execute function cosmetics_private.reward_bridge();

-- Showcase collections have no historical completion rows. Grant from authoritative
-- current exhibits on deployment and on each exhibit change, then retain permanently.
create function cosmetics_private.grant_museum_showcase(p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare specimens jsonb; d record;
begin
 select coalesce(jsonb_agg(e.snapshot),'[]') into specimens from public.museum_exhibits e where e.player_id=p_player;
 for d in select * from public.museum_collection_definitions where enabled and kind='showcase' and id in ('first-exhibit','mutation-symphony') loop
  if public.museum_collection_matches(d.requirements,specimens) then
   perform cosmetics_private.grant_item(p_player,case d.id when 'first-exhibit' then 'founding-curator' else 'mutation-gallery-trim' end,'museum',d.id);
  end if;
 end loop;
end $$;
revoke all on function cosmetics_private.grant_museum_showcase(uuid) from public,anon,authenticated;
create function cosmetics_private.museum_showcase_bridge() returns trigger language plpgsql security definer set search_path='' as $$
begin perform cosmetics_private.grant_museum_showcase(new.player_id); return new; end $$;
revoke all on function cosmetics_private.museum_showcase_bridge() from public,anon,authenticated;
create trigger cosmetics_museum_exhibit after insert or update on public.museum_exhibits for each row execute function cosmetics_private.museum_showcase_bridge();

-- Preserve unknown legacy records too (disabled catalogue entry until art/slot is defined).
-- This prevents silently discarding ownership if live rewards expand before deployment.
insert into public.cosmetic_definitions(id,name,slots,description,rarity,source,enabled)
select cosmetic_id,cosmetic_id,array['trophy'],'Preserved legacy reward.','Common','legacy',false
from (select cosmetic_id from public.player_achievement_cosmetics union select cosmetic_id from public.player_season_cosmetics) x
on conflict(id) do nothing;
insert into public.player_cosmetics(player_id,cosmetic_id,earned_at,source,source_key)
select player_id,cosmetic_id,min(earned_at),min(source),cosmetic_id from (
 select player_id,cosmetic_id,earned_at,'achievement' source from public.player_achievement_cosmetics
 union all select player_id,cosmetic_id,earned_at,'season' from public.player_season_cosmetics
) x group by player_id,cosmetic_id
on conflict(player_id,cosmetic_id) do update set earned_at=least(public.player_cosmetics.earned_at,excluded.earned_at);
-- Also recover claimed AP milestones if a legacy duplicate ID suppressed one treatment.
select cosmetics_private.grant_item(m.player_id,r->>'id','achievement',m.ap::text,m.claimed_at)
from public.player_achievement_milestones m,
jsonb_array_elements(public.achievement_milestones_v013()) milestone,
jsonb_array_elements(milestone->'rewards') r
where (milestone->>'ap')::int=m.ap and r->>'type'='cosmetic';
select cosmetics_private.grant_item(p.player_id,n.effects->>'cosmetic','research',n.id,p.purchased_at)
from public.player_research_purchases p join public.research_nodes n on n.id=p.node_id where n.effects ? 'cosmetic';
select cosmetics_private.grant_item(c.player_id,case c.collection_id when 'first-exhibit' then 'founding-curator' when 'mutation-symphony' then 'mutation-gallery-trim' when 'polished-foundations' then 'stone-curator' when 'serial-archive' then 'archive-display-case' end,'museum',c.collection_id,c.completed_at)
from public.museum_collection_completions c;
select cosmetics_private.grant_museum_showcase(player_id) from (select distinct player_id from public.museum_exhibits) p;
select cosmetics_private.grant_item(c.player_id,'bundle-'||c.bundle_id,'bundle',c.bundle_id,c.completed_at) from public.player_bundle_completions c;

-- Resolve only server-owned, enabled cosmetics; raw loadout IDs are never public identity.
create function cosmetics_private.item(p_player uuid,p_id text,p_slot text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'name',d.name,'slots',d.slots,'description',d.description,
 'rarity',case when d.legacy_after<=now() then 'Legacy' else d.rarity end,'visual_config',d.visual_config,'source',d.source,'earned_at',o.earned_at)
 from public.player_cosmetics o join public.cosmetic_definitions d on d.id=o.cosmetic_id
 where o.player_id=p_player and d.id=p_id and d.enabled and (p_slot is null or p_slot=any(d.slots));
$$;
revoke all on function cosmetics_private.item(uuid,text,text) from public,anon,authenticated;
create function cosmetics_private.resolved_loadout(p_player uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare eq jsonb; result jsonb:='{}'; slot text; items jsonb;
begin
 select equipment into eq from public.player_cosmetic_loadouts where player_id=p_player;
 if eq is null then
  select jsonb_build_object('trophies',coalesce(jsonb_agg(cosmetic_id),'[]')) into eq from (
   select o.cosmetic_id from public.player_cosmetics o join public.cosmetic_definitions d on d.id=o.cosmetic_id
   where o.player_id=p_player and d.enabled and 'trophy'=any(d.slots) order by o.earned_at desc,o.cosmetic_id limit 5
  ) t;
 end if;
 foreach slot in array array['title','frame','background','decor'] loop
  result:=result||jsonb_build_object(slot,cosmetics_private.item(p_player,eq->>slot,slot));
 end loop;
 foreach slot in array array['badges','trophies'] loop
  select coalesce(jsonb_agg(item order by ord) filter(where item is not null),'[]') into items from (
   select cosmetics_private.item(p_player,id,case when slot='badges' then 'badge' else null end) item,ord
   from jsonb_array_elements_text(coalesce(eq->slot,'[]')) with ordinality x(id,ord)
   where ord<=case when slot='badges' then 3 else 5 end
  ) t;
  result:=result||jsonb_build_object(slot,items);
 end loop;
 return result||jsonb_build_object('showcase_labels',coalesce(eq->'showcase_labels','[]'));
end $$;
revoke all on function cosmetics_private.resolved_loadout(uuid) from public,anon,authenticated;

create function public.get_my_cosmetics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Sign in to customize your profile.' using errcode='42501'; end if;
 select jsonb_build_object('owned',coalesce(jsonb_agg(cosmetics_private.item(uid,o.cosmetic_id) order by d.source,d.name) filter(where d.enabled),'[]'),
 'equipment',(select equipment from public.player_cosmetic_loadouts where player_id=uid),'resolved',cosmetics_private.resolved_loadout(uid)) into result
 from public.player_cosmetics o join public.cosmetic_definitions d on d.id=o.cosmetic_id where o.player_id=uid;
 return result;
end $$;
revoke all on function public.get_my_cosmetics() from public,anon,authenticated;
grant execute on function public.get_my_cosmetics() to authenticated;

create function public.set_my_cosmetic_loadout(p_equipment jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); k text; v jsonb; cid text; ids text[]; allowed_slot text;
begin
 if uid is null then raise exception 'Sign in to customize your profile.' using errcode='42501'; end if;
 if p_equipment is null or jsonb_typeof(p_equipment)<>'object' or octet_length(p_equipment::text)>8192 then raise exception 'Invalid profile equipment.'; end if;
 -- Serialize concurrent saves. The grant tables have no browser write privileges.
 perform 1 from public.players where id=uid for update;
 if not found then raise exception 'Player not found.'; end if;
 for k,v in select * from jsonb_each(p_equipment) loop
  if k not in ('title','frame','background','decor','badges','trophies','showcase_labels') then raise exception 'Unknown profile slot.'; end if;
  if k in ('badges','trophies','showcase_labels') then
   if jsonb_typeof(v)<>'array' then raise exception 'Invalid profile selection.'; end if;
   if jsonb_array_length(v)>(case when k='trophies' then 5 else 3 end) then raise exception 'Too many profile selections.'; end if;
   if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string') then raise exception 'Invalid profile selection.'; end if;
   select coalesce(array_agg(x),'{}') into ids from jsonb_array_elements_text(v) x;
   if k='showcase_labels' then
    if exists(select 1 from unnest(ids) x where length(x)>32 or x ~ '[[:cntrl:]]') then raise exception 'Showcase labels must be 32 characters or fewer.'; end if;
    continue;
   end if;
   if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select each collectible only once per section.'; end if;
   allowed_slot:=case when k='badges' then 'badge' else null end;
  else
   if v='null'::jsonb then continue; end if;
   if jsonb_typeof(v)<>'string' then raise exception 'Invalid profile selection.'; end if;
   ids:=array[v#>>'{}']; allowed_slot:=k;
  end if;
  foreach cid in array ids loop
   if cosmetics_private.item(uid,cid,allowed_slot) is null then raise exception 'You do not own an enabled cosmetic for this slot.' using errcode='42501'; end if;
  end loop;
 end loop;
 insert into public.player_cosmetic_loadouts(player_id,equipment) values(uid,p_equipment)
 on conflict(player_id) do update set equipment=excluded.equipment,updated_at=now();
 return cosmetics_private.resolved_loadout(uid);
end $$;
revoke all on function public.set_my_cosmetic_loadout(jsonb) from public,anon,authenticated;
grant execute on function public.set_my_cosmetic_loadout(jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'id', p.id::text,
      'username', coalesce(nullif(p.username,''), 'Guest Player'),
      'avatar_url', coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ),
      'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
      'title_color', coalesce(
        nullif(t.color,''),
        nullif(p.display_title_color,''),
        '#ffd166'
      ),
      'created_at', p.created_at,
      'cosmetics', cosmetics_private.resolved_loadout(p.id),
      'bundles', public.bundle_public_summary(p.id) || jsonb_build_object('total',(select count(*) from public.game_bundles),'catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'icon',b.icon) order by b.sort_order),'[]') from public.game_bundles b)),
      'gems_discovered', (select count(distinct c.gem_name) from public.player_gem_mutation_combinations c where c.player_id=p.id),
      'achievement_count', (select count(*) from public.private_feature_progress fp join public.private_feature_definitions fd on fd.id=fp.feature_id where fp.player_id=p.id and fp.completed and fd.feature_kind='achievement' and fd.enabled),
      'raw_roll_rarity', (select max(greatest(1::numeric,h.rarity/greatest(0.000001::numeric,coalesce(h.raw_luck,1::numeric)))) from public.best_roll_history h where h.player_id=p.id and h.gem_name not in ('Enchant Relic','Ancient Relic')),
      'total_rolls', coalesce(p.total_rolls,0),
      'lifetime_earnings', coalesce(p.lifetime_earnings,0),
      'inventory_count', (
        select count(*) from public.inventory_gems ig
        where ig.player_id = p.id
      ),
      'inventory_capacity', coalesce(p.inventory_capacity,0),
      'rarest_gem_name', p.rarest_gem_name,
      'rarest_gem_rarity', p.rarest_gem_rarity,
      'mutation_luck', coalesce(p.mutation_luck,1),
      'showcase', coalesce(p.showcase,'[]'::jsonb),
      'best_roll', (
        select jsonb_build_object(
          'gem_name',g.gem_name,
          'rarity',g.rarity,
          'final_weight',g.final_weight,
          'value',g.value,
          'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])
        )
        from public.inventory_gems g
        where g.player_id=p.id
        order by g.rarity desc,g.value desc,g.id desc
        limit 1
      )
    )
  end
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = p_user_id;
$function$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon,authenticated;

-- Keep role titles intact and publish the collectible in a separate field for chat.
create or replace function public.get_public_player_titles(p_user_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object(
 'title',coalesce(nullif(t.title,''),nullif(p.display_title,''),''),
 'title_color',coalesce(nullif(t.color,''),nullif(p.display_title_color,''),'#ffd166'),
 'collectible_title',cosmetics_private.item(p.id,l.equipment->>'title','title'))),'{}')
 from public.players p left join public.player_titles t on t.player_id=p.id
 left join public.player_cosmetic_loadouts l on l.player_id=p.id
 where p.id=any(coalesce(p_user_ids,'{}'::uuid[]));
$$;
revoke all on function public.get_public_player_titles(uuid[]) from public;
grant execute on function public.get_public_player_titles(uuid[]) to anon,authenticated;
commit;
