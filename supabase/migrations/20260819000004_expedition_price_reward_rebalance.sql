-- v0.9.0 Beta follow-up: lower entry prices and player-selected guarantees.
alter table public.player_expeditions add column if not exists reward_choice text not null default 'default';

create or replace function public.expedition_fee(p_cadence text,p_difficulty text)
returns numeric language sql immutable set search_path='' as $$
 select case
  when p_cadence='daily' and p_difficulty='standard' then 100000
  when p_cadence='daily' and p_difficulty='deep' then 500000
  when p_cadence='daily' then 2000000
  when p_difficulty='standard' then 750000
  when p_difficulty='deep' then 3000000
  else 10000000 end;
$$;

create or replace function public.expedition_reward_choice_valid(p_cadence text,p_difficulty text,p_choice text)
returns boolean language sql immutable set search_path='' as $$
 select p_choice = any(case
  when p_cadence='daily' and p_difficulty='standard' then array['lucky','speed','fortune','mass','mixed']
  when p_cadence='daily' and p_difficulty='deep' then array['lucky','speed','fortune','mass','forge','balanced']
  when p_cadence='daily' then array['power','forge','ancient']
  when p_difficulty='standard' then array['legendary','enchant','lucky','speed','fortune','mass']
  when p_difficulty='deep' then array['ancient_forge','legendary_forge','mythic']
  else array['mythic_ancient','ancient_cache','legendary_forge'] end);
$$;

create or replace function public.enter_expedition_v2(p_cadence text,p_difficulty text,p_reward_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_id bigint;
begin
 if not public.expedition_reward_choice_valid(p_cadence,p_difficulty,p_reward_choice) then raise exception 'invalid_reward_choice'; end if;
 result:=public.enter_expedition(p_cadence,p_difficulty); v_id:=(result->>'id')::bigint;
 update public.player_expeditions set reward_choice=p_reward_choice where id=v_id and player_id=auth.uid();
 return result||jsonb_build_object('rewardChoice',p_reward_choice);
end; $$;
revoke all on function public.enter_expedition_v2(text,text,text) from public;
grant execute on function public.enter_expedition_v2(text,text,text) to authenticated;

create or replace function public.expedition_grant_selected_reward(p_uid uuid,p_cadence text,p_difficulty text,p_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb:='[]'; cid text; family_id text; v_choice text:=p_choice;
begin
 if v_choice='default' then
  v_choice:=case
   when p_cadence='daily' and p_difficulty='standard' then 'mixed'
   when p_cadence='daily' and p_difficulty='deep' then 'balanced'
   when p_cadence='daily' then 'power'
   when p_difficulty='standard' then 'legendary'
   else 'legendary_forge' end;
 end if;
 family_id:=case v_choice when 'lucky' then 'lucky' when 'speed' then 'speed' when 'fortune' then 'fortune' when 'mass' then 'mass' end;
 if p_cadence='daily' and p_difficulty='standard' then
  if family_id is not null then cid:=family_id||'-potion-2'; perform public.expedition_grant_consumable(p_uid,cid,3); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',3));
  else
   for cid in select x from unnest(array['lucky-potion-2','speed-potion-2','fortune-potion-2','mass-potion-2'])x order by random() limit 2 loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
   select x into cid from unnest(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])x order by random() limit 1; perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1));
  end if;
 elsif p_cadence='daily' and p_difficulty='deep' then
  if family_id is not null then cid:=family_id||'-potion-3'; perform public.expedition_grant_consumable(p_uid,cid,2); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',2));
  elsif v_choice='forge' then perform public.expedition_grant_relic(p_uid,'Enchant Relic',1); select x into cid from unnest(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])x order by random() limit 1; perform public.expedition_grant_consumable(p_uid,cid,1); items:='[{"type":"relic","id":"Enchant Relic","quantity":1}]'::jsonb||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1));
  else for cid in select x from unnest(array['lucky-potion-2','speed-potion-2','fortune-potion-2','mass-potion-2'])x loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
  end if;
 elsif p_cadence='daily' then
  if v_choice='power' then perform public.expedition_grant_consumable(p_uid,'legendary-potion',1); items:='[{"type":"consumable","id":"legendary-potion","quantity":1}]'::jsonb; for cid in select x from unnest(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])x order by random() limit 2 loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
  elsif v_choice='forge' then perform public.expedition_grant_relic(p_uid,'Enchant Relic',2); items:='[{"type":"relic","id":"Enchant Relic","quantity":2}]'::jsonb; for cid in select x from unnest(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])x order by random() limit 2 loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
  else perform public.expedition_grant_relic(p_uid,'Ancient Relic',1); items:='[{"type":"relic","id":"Ancient Relic","quantity":1}]'::jsonb; end if;
 elsif p_difficulty='standard' then
  if v_choice='legendary' then perform public.expedition_grant_consumable(p_uid,'legendary-potion',1); items:='[{"type":"consumable","id":"legendary-potion","quantity":1}]'::jsonb;
  elsif v_choice='enchant' then perform public.expedition_grant_relic(p_uid,'Enchant Relic',2); items:='[{"type":"relic","id":"Enchant Relic","quantity":2}]'::jsonb;
  else cid:=family_id||'-potion-3'; perform public.expedition_grant_consumable(p_uid,cid,6); items:=jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',6)); end if;
 elsif p_difficulty='deep' then
  if v_choice='ancient_forge' then perform public.expedition_grant_relic(p_uid,'Ancient Relic',1); perform public.expedition_grant_relic(p_uid,'Enchant Relic',2); items:='[{"type":"relic","id":"Ancient Relic","quantity":1},{"type":"relic","id":"Enchant Relic","quantity":2}]'::jsonb;
  elsif v_choice='legendary_forge' then perform public.expedition_grant_consumable(p_uid,'legendary-potion',2); perform public.expedition_grant_relic(p_uid,'Enchant Relic',2); items:='[{"type":"consumable","id":"legendary-potion","quantity":2},{"type":"relic","id":"Enchant Relic","quantity":2}]'::jsonb;
  else perform public.expedition_grant_consumable(p_uid,'mythic-potion',1); items:='[{"type":"consumable","id":"mythic-potion","quantity":1}]'::jsonb; end if;
 else
  if v_choice='mythic_ancient' then perform public.expedition_grant_consumable(p_uid,'mythic-potion',1); perform public.expedition_grant_relic(p_uid,'Ancient Relic',1); items:='[{"type":"consumable","id":"mythic-potion","quantity":1},{"type":"relic","id":"Ancient Relic","quantity":1}]'::jsonb;
  elsif v_choice='ancient_cache' then perform public.expedition_grant_relic(p_uid,'Ancient Relic',3); items:='[{"type":"relic","id":"Ancient Relic","quantity":3}]'::jsonb;
  else perform public.expedition_grant_consumable(p_uid,'legendary-potion',2); perform public.expedition_grant_relic(p_uid,'Enchant Relic',5); items:='[{"type":"consumable","id":"legendary-potion","quantity":2},{"type":"relic","id":"Enchant Relic","quantity":5}]'::jsonb; end if;
 end if;
 return items;
end; $$;

create or replace function public.expedition_grant_bonus_reward(p_uid uuid,p_cadence text,p_difficulty text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r numeric:=random(); bonus text; items jsonb:='[]'; cid text;
begin
 if p_cadence='daily' and p_difficulty='standard' then if r<.65 then bonus:='tier2x2'; elsif r<.90 then bonus:='tier3'; elsif r<.98 then bonus:='enchant1'; else bonus:='legendary'; end if;
 elsif p_cadence='daily' and p_difficulty='deep' then if r<.45 then bonus:='tier3x2'; elsif r<.70 then bonus:='legendary'; elsif r<.90 then bonus:='enchant1'; elsif r<.98 then bonus:='enchant2'; else bonus:='ancient1'; end if;
 elsif p_cadence='daily' then if r<.35 then bonus:='legendary'; elsif r<.60 then bonus:='enchant2'; elsif r<.80 then bonus:='tier3x3'; elsif r<.95 then bonus:='ancient1'; else bonus:='mythic'; end if;
 elsif p_difficulty='standard' then if r<.60 then bonus:='enchant1'; elsif r<.90 then bonus:='legendary'; else bonus:='ancient1'; end if;
 elsif p_difficulty='deep' then if r<.45 then bonus:='enchant2'; elsif r<.75 then bonus:='legendary'; elsif r<.95 then bonus:='ancient1'; else bonus:='mythic'; end if;
 else if r<.35 then bonus:='enchant3'; elsif r<.65 then bonus:='ancient1'; elsif r<.85 then bonus:='ancient2'; elsif r<.95 then bonus:='mythic'; else bonus:='mythic_ancient'; end if; end if;
 if bonus like 'tier2%' then for cid in select x from unnest(array['lucky-potion-2','speed-potion-2','fortune-potion-2','mass-potion-2'])x order by random() limit 2 loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
 elsif bonus like 'tier3%' then for cid in select x from unnest(array['lucky-potion-3','speed-potion-3','fortune-potion-3','mass-potion-3'])x order by random() limit case when bonus='tier3' then 1 when bonus='tier3x2' then 2 else 3 end loop perform public.expedition_grant_consumable(p_uid,cid,1); items:=items||jsonb_build_array(jsonb_build_object('type','consumable','id',cid,'quantity',1)); end loop;
 elsif bonus='legendary' then perform public.expedition_grant_consumable(p_uid,'legendary-potion',1); items:='[{"type":"consumable","id":"legendary-potion","quantity":1}]'::jsonb;
 elsif bonus='mythic' then perform public.expedition_grant_consumable(p_uid,'mythic-potion',1); items:='[{"type":"consumable","id":"mythic-potion","quantity":1}]'::jsonb;
 elsif bonus like 'enchant%' then perform public.expedition_grant_relic(p_uid,'Enchant Relic',substring(bonus from '[0-9]+')::int); items:=jsonb_build_array(jsonb_build_object('type','relic','id','Enchant Relic','quantity',substring(bonus from '[0-9]+')::int));
 elsif bonus like 'ancient%' then perform public.expedition_grant_relic(p_uid,'Ancient Relic',substring(bonus from '[0-9]+')::int); items:=jsonb_build_array(jsonb_build_object('type','relic','id','Ancient Relic','quantity',substring(bonus from '[0-9]+')::int));
 else perform public.expedition_grant_consumable(p_uid,'mythic-potion',1); perform public.expedition_grant_relic(p_uid,'Ancient Relic',1); items:='[{"type":"consumable","id":"mythic-potion","quantity":1},{"type":"relic","id":"Ancient Relic","quantity":1}]'::jsonb; end if;
 return jsonb_build_object('name',bonus,'items',items);
end; $$;

create or replace function public.expedition_finish_if_ready(p_expedition_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare e public.player_expeditions%rowtype; guaranteed jsonb; bonus jsonb;
begin
 if exists(select 1 from public.player_expedition_quests where expedition_id=p_expedition_id and completed_at is null) then return; end if;
 update public.player_expeditions set status='completed',completed_at=now(),ended_at=now() where id=p_expedition_id and status='active' returning * into e;
 if not found then return; end if;
 guaranteed:=public.expedition_grant_selected_reward(e.player_id,e.cadence,e.difficulty,e.reward_choice);
 bonus:=public.expedition_grant_bonus_reward(e.player_id,e.cadence,e.difficulty);
 update public.player_expeditions set reward=jsonb_build_object('choice',e.reward_choice,'guaranteed',guaranteed,'bonus',bonus) where id=e.id;
end; $$;

create or replace function public.get_expedition_dashboard_v2()
returns jsonb language sql security definer set search_path='' as $$
 select public.get_expedition_dashboard()||jsonb_build_object('fees',jsonb_build_object(
  'daily',jsonb_build_object('standard',100000,'deep',500000,'void',2000000),
  'weekly',jsonb_build_object('standard',750000,'deep',3000000,'void',10000000)));
$$;

revoke all on function public.expedition_reward_choice_valid(text,text,text),public.expedition_grant_selected_reward(uuid,text,text,text),public.expedition_grant_bonus_reward(uuid,text,text),public.get_expedition_dashboard_v2() from public;
grant execute on function public.get_expedition_dashboard_v2() to authenticated;
