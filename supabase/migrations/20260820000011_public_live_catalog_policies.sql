-- =========================================================
-- Live catalog visibility + safe index performance
-- =========================================================

-- GRANT does not bypass RLS. The live Gem Index and leaderboard client both
-- need to be able to read enabled mutations as normal authenticated players.
alter table if exists public.game_mutations enable row level security;
drop policy if exists game_mutations_enabled_public_read on public.game_mutations;
create policy game_mutations_enabled_public_read
  on public.game_mutations
  for select
  to anon, authenticated
  using (enabled = true);
grant select on public.game_mutations to anon, authenticated;

-- The Gem Index reads active custom gems through the same public catalog rule.
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

create index if not exists game_mutations_enabled_sort_idx
  on public.game_mutations(enabled, sort_order, id);

create index if not exists private_feature_gems_enabled_sort_idx
  on public.private_feature_gems(enabled, sort_order, rarity);
