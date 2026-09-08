-- Bulk potion consumption, admin-configurable content catalogs and storage/index housekeeping.

create or replace function public.use_consumables_bulk(p_consumable_id text, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_qty integer := greatest(1,least(coalesce(p_quantity,1),1000000));
  v_owned bigint;
  v_i integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select quantity into v_owned from public.player_consumables
    where player_id=v_user and consumable_id=p_consumable_id for update;
  if coalesce(v_owned,0) < v_qty then raise exception 'none_owned'; end if;
  -- Reuse the authoritative single-use rules inside one database request.
  for v_i in 1..v_qty loop
    perform public.use_consumable(p_consumable_id);
  end loop;
  select quantity into v_owned from public.player_consumables
    where player_id=v_user and consumable_id=p_consumable_id;
  return jsonb_build_object('quantity',coalesce(v_owned,0),'quantity_used',v_qty);
end $$;
grant execute on function public.use_consumables_bulk(text,integer) to authenticated;

-- Generic editable catalogs. These are deliberately compact JSON rows so new potion/equipment
-- properties can be added without schema churn.
create table if not exists public.admin_content_catalog (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('potion','equipment','recipe')),
  content_key text not null,
  name text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique(content_type,content_key)
);
create index if not exists admin_content_catalog_type_enabled_idx on public.admin_content_catalog(content_type,enabled);

create table if not exists public.admin_feature_catalog (
  id uuid primary key default gen_random_uuid(),
  feature_key text unique not null,
  name text not null,
  description text not null default '',
  category text not null default 'content',
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.admin_feature_catalog(feature_key,name,description,category,enabled) values
('seasonal_potions','Seasonal Potions','Rotating limited-time potion families.','content',false),
('equipment_sets','Equipment Sets','Set bonuses and collection rewards.','content',false),
('equipment_rerolls','Equipment Rerolls','Optional equipment stat rerolling.','content',false),
('mutation_events_plus','Mutation Events+','Event-specific mutation pools and boosted chances.','events',false),
('world_contracts','World Contracts','Server-wide objectives with shared rewards.','events',false),
('dynamic_recipes','Dynamic Recipes','Recipes activated from the admin catalog.','content',false),
('potion_mastery','Potion Mastery','Long-term potion progression.','content',false)
on conflict(feature_key) do nothing;

-- Admin-only RPCs keep the browser from writing arbitrary catalog rows.
create or replace function public.admin_save_content_catalog(p_content_type text,p_content_key text,p_name text,p_enabled boolean,p_config jsonb)
returns public.admin_content_catalog
language plpgsql security definer set search_path=public
as $$
declare r public.admin_content_catalog;
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  insert into public.admin_content_catalog(content_type,content_key,name,enabled,config,updated_by)
  values(p_content_type,p_content_key,p_name,coalesce(p_enabled,true),coalesce(p_config,'{}'::jsonb),auth.uid())
  on conflict(content_type,content_key) do update set name=excluded.name,enabled=excluded.enabled,config=excluded.config,updated_at=now(),updated_by=auth.uid()
  returning * into r;
  return r;
end $$;

create or replace function public.admin_delete_content_catalog(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
delete from public.admin_content_catalog where id=p_id; end $$;

create or replace function public.admin_save_feature_catalog(p_id uuid,p_enabled boolean,p_config jsonb)
returns public.admin_feature_catalog language plpgsql security definer set search_path=public as $$
declare r public.admin_feature_catalog;
begin if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
update public.admin_feature_catalog set enabled=p_enabled,config=coalesce(p_config,'{}'::jsonb),updated_at=now() where id=p_id returning * into r; return r; end $$;

grant select on public.admin_content_catalog,public.admin_feature_catalog to authenticated;
grant execute on function public.admin_save_content_catalog(text,text,text,boolean,jsonb), public.admin_delete_content_catalog(uuid), public.admin_save_feature_catalog(uuid,boolean,jsonb) to authenticated;

-- Storage/query housekeeping: indexes reduce repeated full scans for the inventory and catalogs.
create index if not exists player_consumables_player_idx on public.player_consumables(player_id,consumable_id);
create index if not exists player_boosts_player_expiry_idx on public.player_boosts(player_id,expires_at desc);
notify pgrst,'reload schema';
