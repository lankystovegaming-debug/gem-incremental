-- 20260908000010_performance_and_safe_sell_FIXED.sql
-- Fixed version: safely creates performance indexes only when the
-- underlying tables actually exist in this project's schema.

begin;

-- ============================================================
-- INVENTORY / GEM QUERY PERFORMANCE
-- ============================================================

do $$
begin
  if to_regclass('public.player_gems') is not null then
    execute 'create index if not exists idx_player_gems_player_id
             on public.player_gems (player_id)';
  end if;
end $$;

-- Try common inventory table names without failing if they differ.
do $$
begin
  if to_regclass('public.inventory') is not null then
    execute 'create index if not exists idx_inventory_player_id
             on public.inventory (player_id)';
  end if;
end $$;

-- ============================================================
-- MUTATION CATALOG PERFORMANCE
-- ============================================================

do $$
begin
  if to_regclass('public.game_mutations') is not null then
    execute 'create index if not exists idx_game_mutations_enabled_multiplier
             on public.game_mutations (enabled, multiplier asc)';
  end if;
end $$;

-- ============================================================
-- ACHIEVEMENT PERFORMANCE
-- IMPORTANT: this project does NOT necessarily use
-- public.achievement_progress, so every possible index is guarded.
-- ============================================================

do $$
begin
  if to_regclass('public.achievement_progress') is not null then
    execute 'create index if not exists idx_achievement_progress_player
             on public.achievement_progress (player_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.player_achievements') is not null then
    execute 'create index if not exists idx_player_achievements_player
             on public.player_achievements (player_id)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.achievements') is not null then
    -- Only index enabled/status fields when the base catalog exists.
    -- A plain primary-key lookup is normally already indexed.
    null;
  end if;
end $$;

-- ============================================================
-- PLAYER SETTINGS PERFORMANCE
-- ============================================================

do $$
begin
  if to_regclass('public.player_settings') is not null then
    execute 'create index if not exists idx_player_settings_player
             on public.player_settings (player_id)';
  end if;
end $$;

-- ============================================================
-- PLAYTIME LOOKUPS
-- ============================================================

do $$
begin
  if to_regclass('public.players') is not null then
    -- The primary key is already indexed; no duplicate index is needed.
    null;
  end if;
end $$;

-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';

commit;
