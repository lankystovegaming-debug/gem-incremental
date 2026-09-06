-- Column types read from live Supabase on 2026-09-06. No player data.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.crafting_progress (player_id uuid, recipe_id text, progress jsonb, updated_at timestamp with time zone);
create table public.daily_shop_catalog (id text, category text, name text, description text, price numeric, stock_min integer, stock_max integer, weight numeric, contents jsonb);
create table public.game_recipes (id text, recipe jsonb);
create table public.inventory_gems (id bigint, player_id uuid, gem_name text, rarity integer, base_weight double precision, value_per_gram double precision, rolled_weight_multiplier double precision, rolled_weight double precision, final_weight double precision, value double precision, locked boolean, created_at timestamp with time zone, roll_number bigint, luck_at_roll numeric, mutation_id text, mutation_multiplier numeric, mutation_ids text[], mutation_multipliers jsonb, mutation_chance_multiplier numeric, serial_number bigint, museum_locked boolean, source_event_occurrence_id uuid, source_event_key text, event_properties jsonb, value_multiplier_at_roll numeric);
create table public.player_consumables (player_id uuid, consumable_id text, quantity integer, updated_at timestamp with time zone);
create table public.player_crafting (player_id uuid, active_auto_craft text, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.player_equipment (id bigint, player_id uuid, equipment_id text, category text, tier integer, name text, luck_bonus double precision, roll_speed_bonus double precision, weight_luck_bonus double precision, weight_multiplier_bonus double precision, equipped boolean, created_at timestamp with time zone, enchant_id text, enchant_grade text, enchant_state jsonb, masterwork_level integer, masterwork_passive text, masterwork_passive_rank integer, masterwork_attunement text, masterwork_rerolls integer, masterwork_choices text[], masterwork_perfected_at timestamp with time zone, original_t13_legacy boolean);
create table public.players (id uuid, created_at timestamp with time zone, last_seen timestamp with time zone, next_roll_at timestamp with time zone, inventory_capacity integer, money double precision, crafting_migrated boolean, total_rolls bigint, rarest_gem_name text, rarest_gem_rarity integer, stats_migrated boolean, legacy_save_migrated boolean, username text, lifetime_earnings numeric, coins bigint, mutation_luck double precision, gems_found_score numeric, showcase jsonb, leaderboard_hidden boolean, current_island_id uuid, max_equipment_tier integer, pickaxe_tier integer, bag_tier integer, display_title text, display_title_color text, legacy_cache_credits bigint, lifetime_money_burned double precision, rarity_resonance integer, gravitational_surge_progress integer, gravitational_surge_ready boolean, bag_compression_progress integer, best_rare_natural_weight_100k double precision, best_rare_natural_weight_1m double precision, roll_lease_id uuid, roll_lease_expires_at timestamp with time zone);
alter table players add primary key(id);
alter table player_equipment add primary key(id), add unique(player_id,equipment_id);
alter table inventory_gems add primary key(id);
alter table game_recipes add primary key(id);
alter table daily_shop_catalog add primary key(id);
alter table player_consumables add unique(player_id,consumable_id);
alter table crafting_progress add unique(player_id,recipe_id);
alter table player_crafting add unique(player_id);
create sequence equipment_test_ids start 100;
alter table player_equipment alter column id set default nextval('equipment_test_ids');
alter table player_equipment alter column masterwork_level set default 0;
alter table player_equipment alter column masterwork_rerolls set default 0;
alter table player_equipment alter column masterwork_passive_rank set default 0;
create sequence gem_test_ids start 100;
alter table inventory_gems alter column id set default nextval('gem_test_ids');

