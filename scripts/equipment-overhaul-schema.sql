-- Prepared from live Supabase igrddscmrdrrwtvyspbf, roll v137, 2026-09-07.
-- Manual deployment only. Archive before changing any existing ownership/recipe.
begin;
create table if not exists public.equipment_overhaul_archive (
 kind text not null, source_key text not null, snapshot jsonb not null,
 archived_at timestamptz not null default now(), primary key(kind,source_key)
);
alter table public.equipment_overhaul_archive enable row level security;
revoke all on public.equipment_overhaul_archive from public,anon,authenticated;
grant all on public.equipment_overhaul_archive to service_role;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'recipe',id,to_jsonb(r) from public.game_recipes r where recipe->>'category' in ('pickaxe','clover','lantern','boots','bag') on conflict do nothing;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'equipment',id::text,to_jsonb(e) from public.player_equipment e on conflict do nothing;
insert into public.equipment_overhaul_archive(kind,source_key,snapshot)
select 'progress',player_id::text||':'||recipe_id,to_jsonb(p) from public.crafting_progress p on conflict do nothing;

alter table public.player_equipment add column if not exists mutation_chance_bonus double precision not null default 0;
alter table public.players add column if not exists equipment_state jsonb not null default '{}';
alter table public.players add column if not exists equipment_state_roll bigint not null default 0;
alter table public.private_feature_gems add column if not exists special_gem boolean not null default false;
-- Classification is explicit and independent of rarity. Future special releases must set this tag.
update public.private_feature_gems set special_gem=true where availability_mode in ('daily','global_event','date_range') or name='the clock';
alter table public.game_consumables drop constraint if exists game_consumables_family_check;
alter table public.game_consumables add constraint game_consumables_family_check check(family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic'));
alter table public.player_boosts drop constraint if exists player_boosts_family_check;
alter table public.player_boosts add constraint player_boosts_family_check check(family in ('luck','rollSpeed','weightLuck','weightMultiplier','relic'));
insert into public.game_consumables(id,name,family,tier,effect_value,duration_seconds,purchasable,shop_price)
values('relic-potion','Relic Potion','relic',1,1.5,60,false,null)
on conflict(id) do update set family='relic',effect_value=1.5,duration_seconds=60,purchasable=false,shop_price=null;

-- Fail before installing recipes if live ingredient identity or availability has changed.
do $$ declare missing text; begin
 select string_agg(n,', ') into missing from unnest(array['Chronite','Ringwoodite','Paraershovite','Vesuvianite','Fluorcalciobritholite','Singularity Shard','random rock I found outside','Quartz','Peridot','Pyrite','Opal','Aventurine','Bloodstone','Sapphire','Emerald','Diamond','Black Opal','Mythril','Demantoid','Lodestone','Titanite','Diaspore','Tsavorite','Void Pearl','Red Diamond','Chambersite','Kyawthuite','Carletonite','Natural Moissanite','Aether Quartz','Hibonite','Black Diamond','Magnesiochloritoid','Void Opal']) n
 where not exists(select 1 from public.private_feature_gems g where g.name=n and g.enabled and g.availability_mode='always' and (g.starts_at is null or g.starts_at<=now()) and (g.ends_at is null or g.ends_at>now()));
 if missing is not null then raise exception 'Equipment overhaul ingredients unavailable: %',missing; end if;
end $$;
