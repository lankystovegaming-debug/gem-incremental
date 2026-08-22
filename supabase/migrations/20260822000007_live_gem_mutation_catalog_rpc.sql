-- Live public catalog RPCs for Gem Index.
-- These are intentionally narrow: only enabled, currently available entries are exposed.
begin;

alter table if exists public.private_feature_gems
  add column if not exists title text not null default '';

-- Keep RLS as a defense-in-depth layer for direct reads.
alter table if exists public.game_mutations enable row level security;
drop policy if exists game_mutations_enabled_public_read on public.game_mutations;
create policy game_mutations_enabled_public_read
  on public.game_mutations for select to anon, authenticated
  using (enabled = true);
grant select on public.game_mutations to anon, authenticated;

alter table if exists public.private_feature_gems enable row level security;
drop policy if exists private_feature_gems_enabled_catalog_read on public.private_feature_gems;
create policy private_feature_gems_enabled_catalog_read
  on public.private_feature_gems for select to anon, authenticated
  using (enabled = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
grant select on public.private_feature_gems to anon, authenticated;

create or replace function public.get_public_mutation_catalog()
returns table (
  id text, name text, chance numeric, multiplier numeric, description text, icon text, color text, enabled boolean, sort_order integer, updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select m.id, m.name, m.chance, m.multiplier, m.description, m.icon, m.color, m.enabled, m.sort_order, m.updated_at
  from public.game_mutations m
  where m.enabled = true
  order by m.sort_order asc, m.name asc, m.id asc;
$$;

create or replace function public.get_public_gem_catalog()
returns table (
  id uuid, title text, name text, rarity numeric, base_weight numeric, value_per_gram numeric, description text, metadata jsonb, hide_rarity_until_discovered boolean, enabled boolean, sort_order integer, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select g.id, g.title, g.name, g.rarity, g.base_weight, g.value_per_gram, g.description, g.metadata, g.hide_rarity_until_discovered, g.enabled, g.sort_order, g.starts_at, g.ends_at, g.updated_at
  from public.private_feature_gems g
  where g.enabled = true
    and (g.starts_at is null or g.starts_at <= now())
    and (g.ends_at is null or g.ends_at > now())
  order by g.sort_order asc, g.rarity asc, g.name asc;
$$;

revoke all on function public.get_public_mutation_catalog() from public;
grant execute on function public.get_public_mutation_catalog() to anon, authenticated;
revoke all on function public.get_public_gem_catalog() from public;
grant execute on function public.get_public_gem_catalog() to anon, authenticated;

commit;
