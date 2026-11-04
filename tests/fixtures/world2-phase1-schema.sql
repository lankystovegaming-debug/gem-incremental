-- Isolated fixture only. Never execute on the hosted project.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
-- Reproduce Supabase's broad defaults to catch incomplete REVOKEs.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
create table public.players (
 id uuid primary key, total_rolls bigint not null default 0,
 equipment_genuine_rolls bigint not null default 0,
 equipment_state jsonb not null default '{}', money numeric not null default 0
);
create table public.inventory_gems (
 id bigint primary key,player_id uuid references players(id),gem_name text,value numeric,final_weight numeric
);
create table public.player_equipment (
 id bigint primary key,player_id uuid references players(id),equipment_id text,enchant_state jsonb
);
-- Legacy API sentinel demonstrates signatures, rows and definition survive.
create function public.world1_legacy_roll(p_player uuid,p_rolls integer default 1)
returns bigint language sql as $$ select total_rolls from public.players where id=p_player $$;
insert into public.players values
 ('00000000-0000-0000-0000-000000000001',300000,800,'{"charged":100}',9000000),
 ('00000000-0000-0000-0000-000000000002',1000,5,'{}',123);
insert into public.inventory_gems values(1,'00000000-0000-0000-0000-000000000001','Quartz',123,0.8);
insert into public.player_equipment values(1,'00000000-0000-0000-0000-000000000001','celestial-pickaxe','{"charge":100}');
