-- =========================================================
-- Workbench runtime + guild creation reliability repair
--
-- Workbench gameplay no longer depends on the historical forge_sessions /
-- forge_items material-id schema. The old tables remain untouched for
-- backwards compatibility, while these dedicated tables use bigint[]
-- because inventory_gems.id is bigint.
-- =========================================================

create table if not exists public.workbench_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  item_type text not null check (item_type in ('weapon','armor')),
  material_ids bigint[] not null default '{}',
  material_summary jsonb not null default '[]'::jsonb,
  stage integer not null default 1 check (stage between 1 and 3),
  stage_scores numeric[] not null default '{}',
  quality numeric not null default 1,
  result jsonb,
  status text not null default 'active'
    check (status in ('active','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workbench_items (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  item_type text not null check (item_type in ('weapon','armor')),
  item_name text not null,
  rarity text not null default 'Common',
  quality numeric not null default 1,
  ore_count integer not null,
  multiplier numeric not null default 1,
  stats jsonb not null default '{}'::jsonb,
  traits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workbench_sessions_player_status_idx
  on public.workbench_sessions(player_id,status,created_at desc);
create index if not exists workbench_items_player_created_idx
  on public.workbench_items(player_id,created_at desc);

alter table public.workbench_sessions enable row level security;
alter table public.workbench_items enable row level security;

revoke all on public.workbench_sessions, public.workbench_items from anon, authenticated;
grant all on public.workbench_sessions, public.workbench_items to service_role;

-- Make enabled admin-created gems visible to the normal Gem Index without
-- exposing disabled, future, or unreleased definitions.
alter table if exists public.private_feature_gems enable row level security;
drop policy if exists private_feature_gems_enabled_catalog_read on public.private_feature_gems;
create policy private_feature_gems_enabled_catalog_read
  on public.private_feature_gems
  for select
  to anon, authenticated
  using (
    enabled = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

grant select on public.private_feature_gems to anon, authenticated;

-- Guild creation is transactional. If the guild row succeeds but the member
-- insert fails, the caller no longer gets stuck with an ownerless guild.
create or replace function public.create_guild_for_player(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(left(coalesce(p_name,''),50));
  v_guild public.guilds%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if length(v_name) < 2 then
    raise exception 'invalid_name';
  end if;

  if exists (select 1 from public.guild_members where player_id=v_uid) then
    raise exception 'already_in_guild';
  end if;

  insert into public.guilds(name,owner_id)
  values(v_name,v_uid)
  returning * into v_guild;

  insert into public.guild_members(guild_id,player_id,role)
  values(v_guild.id,v_uid,'owner');

  return jsonb_build_object('guild',to_jsonb(v_guild));
exception
  when unique_violation then
    raise exception 'guild_name_taken';
end;
$$;

revoke all on function public.create_guild_for_player(text) from public;
grant execute on function public.create_guild_for_player(text) to authenticated;

-- Keep analytics RPC independent of any optional column/table that may be
-- absent in older deployments. inventory_gems.mutation_ids is text[] in the
-- current schema, so cardinality is safe here.
