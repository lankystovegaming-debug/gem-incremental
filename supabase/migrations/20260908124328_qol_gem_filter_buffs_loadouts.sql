-- QoL preferences and equipment presets. No game stat formulas are replaced.
create table public.player_equipment_loadouts (
 player_id uuid not null references public.players(id) on delete cascade,
 slot smallint not null check(slot between 1 and 5),
 name text not null check(length(btrim(name)) between 1 and 40),
 selections jsonb not null default '{}' check(jsonb_typeof(selections)='object'),
 updated_at timestamptz not null default now(), primary key(player_id,slot)
);
alter table public.player_equipment_loadouts enable row level security;
create policy own_loadouts on public.player_equipment_loadouts for select to authenticated using(player_id=(select auth.uid()));
grant select on public.player_equipment_loadouts to authenticated;

-- Merge patches under a row lock; never overwrite unrelated settings from another tab.
create or replace function public.update_qol_settings(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; k text; v jsonb; legacy_missing boolean;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text)>200000 then raise exception 'invalid_settings'; end if;
 insert into public.player_settings(player_id) values(uid) on conflict do nothing;
 select settings into s from public.player_settings where player_id=uid for update;
 legacy_missing := not (s ? 'legacyAutoSell');
 for k,v in select * from jsonb_each(p_patch) loop
  if k='gemFilter' then
   if jsonb_typeof(v) is distinct from 'object' then raise exception 'invalid_filter'; end if;
   if exists(select 1 from jsonb_each_text(v) e where e.value is null or e.value not in ('DEFAULT','KEEP','SELL') or not exists(
    select 1 from public.player_gem_mutation_combinations d where d.player_id=uid and d.gem_name=e.key)) then raise exception 'invalid_or_undiscovered_gem'; end if;
   s:=jsonb_set(s,'{gemFilter}',coalesce(s->'gemFilter','{}')||v);
  elsif k in ('enableBuffs','discoveryKeep','autoRoll','autoKeep','rollAnimations','globalCash','cashGraph') then
   if jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
   s:=jsonb_set(s,array[k],v);
  elsif k in ('discoveryKeepRarity','autoKeepEffectiveRarity','cutsceneMinimumRarity') then
   if jsonb_typeof(v) is distinct from 'number' then raise exception 'invalid_threshold'; end if;
   if (v::text)::numeric<1 or (v::text)::numeric>9007199254740991 then raise exception 'invalid_threshold'; end if;
   s:=jsonb_set(s,array[k],v);
  elsif k='clearLegacyAutoSell' then
   if v is distinct from 'true'::jsonb then raise exception 'invalid_boolean'; end if;
   s:=jsonb_set(s,'{legacyAutoSell}','false');
  elsif k in ('legacyAutoSell','legacyAutoSellTier') then
   if k='legacyAutoSell' and jsonb_typeof(v) is distinct from 'boolean' then raise exception 'invalid_boolean'; end if;
   if k='legacyAutoSellTier' and v #>> '{}' not in ('common','uncommon','rare','epic','legendary','mythic') then raise exception 'invalid_tier'; end if;
   if legacy_missing then s:=jsonb_set(s,array[k],v); end if;
  elsif k='gemRealism' then s:=jsonb_set(s,array[k],v);
  else raise exception 'unknown_setting'; end if;
 end loop;
 update public.player_settings set settings=s,updated_at=now() where player_id=uid;
 return s;
end $$;
revoke all on function public.update_qol_settings(jsonb) from public,anon;
grant execute on function public.update_qol_settings(jsonb) to authenticated;

-- Existing tier rules remain a DEFAULT fallback, including future discoveries.
-- Explicit DEFAULT/KEEP/SELL entries override that fallback. Old clients may still
-- write autoSell fields, but the snapshot is immutable to those legacy writes.
update public.player_settings set settings=settings||jsonb_build_object(
 'enableBuffs',coalesce(settings->'enableBuffs','true'),
 'discoveryKeep',coalesce(settings->'discoveryKeep','true'),
 'discoveryKeepRarity',coalesce(settings->'discoveryKeepRarity','10000'),
 'gemFilter',coalesce(settings->'gemFilter','{}')
)||case when settings ? 'autoSell' or settings ? 'legacyAutoSell' then jsonb_build_object(
 'legacyAutoSell',coalesce(settings->'legacyAutoSell',settings->'autoSell','false'),
 'legacyAutoSellTier',coalesce(settings->'legacyAutoSellTier',settings->'autoSellTier','"common"')
) else '{}'::jsonb end;

create or replace function public.qol_roll_context(p_player_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('settings',coalesce((select settings from public.player_settings where player_id=p_player_id),'{}'),
 'discoveries',coalesce((select jsonb_agg(gem_name) from (select distinct gem_name from public.player_gem_mutation_combinations where player_id=p_player_id) d),'[]'));
$$;
revoke all on function public.qol_roll_context(uuid) from public,anon,authenticated;
grant execute on function public.qol_roll_context(uuid) to service_role;

create or replace function public.equipment_loadout(p_action text,p_slot integer,p_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); expiry timestamptz; saved public.player_equipment_loadouts; choices jsonb;
 category_name text; row_id text; missing text[]:='{}'; changed integer:=0;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_slot is null or p_slot not between 1 and 5 then raise exception 'invalid_slot'; end if;
 select roll_lease_expires_at into expiry from public.players where id=uid for update;
 if not found then raise exception 'player_not_found'; end if;
 if p_action='save' then
  if p_name is null or length(btrim(p_name)) not between 1 and 40 then raise exception 'invalid_name'; end if;
  select coalesce(jsonb_object_agg(c.category,e.id::text),'{}') into choices
   from (values('pickaxe'),('boots'),('bag'),('clover'),('lantern')) c(category)
   left join public.player_equipment e on e.player_id=uid and e.category=c.category and e.equipped;
  insert into public.player_equipment_loadouts values(uid,p_slot,btrim(p_name),choices,now())
   on conflict(player_id,slot) do update set name=excluded.name,selections=excluded.selections,updated_at=now();
 elsif p_action='delete' then delete from public.player_equipment_loadouts where player_id=uid and slot=p_slot;
 elsif p_action='equip' then
  if expiry>clock_timestamp() then raise exception 'roll_in_progress'; end if;
  select * into saved from public.player_equipment_loadouts where player_id=uid and slot=p_slot;
  if not found then raise exception 'loadout_not_found'; end if;
  for category_name,row_id in select * from jsonb_each_text(saved.selections) loop
   if row_id is null then
    update public.player_equipment set equipped=false where player_id=uid and category=category_name and equipped;
   elsif exists(select 1 from public.player_equipment where id::text=row_id and player_id=uid and category=category_name) then
    update public.player_equipment set equipped=false where player_id=uid and category=category_name and equipped and id::text<>row_id;
    update public.player_equipment set equipped=true where player_id=uid and category=category_name and id::text=row_id and not equipped;
    changed:=changed+1;
   else missing:=array_append(missing,category_name); end if;
  end loop;
 else raise exception 'invalid_action'; end if;
 return jsonb_build_object('success',true,'equipped',changed,'unavailable',missing);
end $$;
revoke all on function public.equipment_loadout(text,integer,text) from public,anon;
grant execute on function public.equipment_loadout(text,integer,text) to authenticated;
notify pgrst,'reload schema';

create or replace function public.get_qol_gem_catalog()
returns table(name text,rarity numeric) language sql stable security definer set search_path='' as $$
 select g.name,g.rarity::numeric from public.private_feature_gems g
 where exists(select 1 from public.player_gem_mutation_combinations d where d.player_id=(select auth.uid()) and d.gem_name=g.name)
 order by g.rarity,g.name;
$$;
revoke all on function public.get_qol_gem_catalog() from public,anon;
grant execute on function public.get_qol_gem_catalog() to authenticated;

-- Older clients replace the whole settings document. Preserve new keys and
-- independent per-gem edits they do not know about.
create or replace function public.preserve_qol_settings() returns trigger
language plpgsql set search_path='' as $$
begin
 new.settings:=old.settings||new.settings;
 new.settings:=jsonb_set(new.settings,'{gemFilter}',coalesce(old.settings->'gemFilter','{}')||coalesce(new.settings->'gemFilter','{}'));
 return new;
end $$;
revoke all on function public.preserve_qol_settings() from public,anon,authenticated;
create trigger preserve_qol_settings before update of settings on public.player_settings
 for each row execute function public.preserve_qol_settings();
