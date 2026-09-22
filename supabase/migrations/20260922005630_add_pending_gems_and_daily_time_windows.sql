begin;

alter table public.private_feature_gems
  add column if not exists daily_time_windows jsonb;

comment on column public.private_feature_gems.daily_time_windows is
  'Optional ordered array of {"start":"HH:MM","end":"HH:MM"} daily availability windows. The legacy daily_start_time/daily_end_time pair remains the fallback.';

alter table public.private_feature_gems
  drop constraint if exists private_feature_gems_daily_time_windows_check;

alter table public.private_feature_gems
  add constraint private_feature_gems_daily_time_windows_check
  check (daily_time_windows is null or jsonb_typeof(daily_time_windows) = 'array');

insert into public.private_feature_gems (
  name, rarity, base_weight, value_per_gram, description, metadata,
  hide_rarity_until_discovered, affected_by_luck, enabled, sort_order,
  availability_mode, daily_start_time, daily_end_time, daily_time_windows,
  availability_timezone, special_gem
)
values
  (
    'Heat Death', 1500000000, 0.000001, 250000000000000,
    'There is no light left inside it. Given enough time, there won''t be anywhere else either.',
    '{}'::jsonb, true, true, true, 1,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'sutoronchiumushahouhoakinseki', 750000000, 10, 3000000,
    'A rare strontium-bearing cyclosilicate mineral found near Itoigawa, Japan, known for its unusual yellow crystals. Its extreme rarity and exceptionally long Japanese name make it a prized collector''s specimen.',
    '{}'::jsonb, true, true, true, 5,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'Serpentite', 500000000, 5, 4000000,
    'A metamorphic rock formed when ultramafic rocks are altered by water, giving it its characteristic green, serpent-like appearance. Its swirling patterns and smooth texture have made serpentite a distinctive ornamental stone.',
    '{}'::jsonb, true, true, true, 10,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'False Vacuum', 480000000, 0.000001, 100000000000000,
    'An impossibly small defect in reality trapped within a crystal shell. Physicists strongly recommend that you leave it exactly where you found it.',
    '{}'::jsonb, true, true, true, 11,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'Aurorium', 300000000, 999, 200000,
    'Aurorium can only be found during the two hours of dawn and dusk, when sunlight and moonlight exist at once. It shifts between gold and silver depending on the angle, glowing with both warmth and chill. (by @Kei)',
    '{"creator":"@Kei","creatorLocked":true}'::jsonb, true, true, true, 19,
    'daily', '05:00:00', '07:00:00',
    '[{"start":"05:00","end":"07:00"},{"start":"17:00","end":"19:00"}]'::jsonb,
    'Asia/Singapore', true
  ),
  (
    'Seraphite', 277777777, 250, 777777.77,
    'Seraphite is a deep green variety of clinochlore whose silvery, feather-like patterns shimmer as light moves across its surface. Its distinctive plumes resemble celestial wings, inspiring the name Seraphinite.',
    '{}'::jsonb, true, true, true, 20,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'Asterism', 185000000, 6, 5000000,
    'Light entering the gem separates into brilliant rays that form a perfect star across its surface. The pattern remains centred regardless of where the gem is viewed from.',
    '{}'::jsonb, true, true, true, 26,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'touch grass', 100000000, 1, 100000000,
    'Buddy it’s time to touch grass (by @Kei)',
    '{"creator":"@Kei","creatorLocked":true}'::jsonb, true, false, true, 37,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'π', 3141592, 314, 15926,
    '🥧 (by @Ispyboi)',
    '{"creator":"@Ispyboi","creatorLocked":true}'::jsonb, false, true, true, 96,
    'always', null, null, null, 'Asia/Singapore', false
  ),
  (
    'Zephyrion', 1000, 6000, 4000,
    'Mythicized from Ancient Greek, Zephyrion is an ore said to exist only at the highest and lowest reaches of the universe. It vanishes and reappears without warning, almost as though the ore itself decides when it wishes to be found. (by @Hydrogenbomb1)',
    '{"rarityClass":"anomalous","sourceExclusive":true,"sourceType":"potion","sourceId":"mythic-potion","sourceLabel":"Mythic Potion","rawChanceDenominator":1000,"creator":"@Hydrogenbomb1","creatorLocked":true}'::jsonb,
    false, false, true, 9400,
    'always', null, null, null, 'Asia/Singapore', true
  )
on conflict (name) do update set
  rarity = excluded.rarity,
  base_weight = excluded.base_weight,
  value_per_gram = excluded.value_per_gram,
  description = excluded.description,
  metadata = excluded.metadata,
  hide_rarity_until_discovered = excluded.hide_rarity_until_discovered,
  affected_by_luck = excluded.affected_by_luck,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  availability_mode = excluded.availability_mode,
  daily_start_time = excluded.daily_start_time,
  daily_end_time = excluded.daily_end_time,
  daily_time_windows = excluded.daily_time_windows,
  availability_timezone = excluded.availability_timezone,
  special_gem = excluded.special_gem,
  updated_at = now();

-- Preserve the optimized production snapshot function and add exactly one
-- catalog field rather than replacing the rest of its hot-path implementation.
do $migration$
declare
  v_function regprocedure := 'public.roll_prepare_context(uuid,timestamptz,bigint,bigint)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_old constant text := 'daily_start_time, daily_end_time,' || chr(10) ||
    '          availability_timezone';
  v_new constant text := 'daily_start_time, daily_end_time, daily_time_windows,' || chr(10) ||
    '          availability_timezone';
begin
  select pg_get_functiondef(v_function) into v_definition;
  v_rewritten := replace(v_definition, v_old, v_new);

  if v_rewritten = v_definition then
    raise exception 'daily availability catalog projection not found in %', v_function;
  end if;

  execute v_rewritten;
end;
$migration$;

revoke all on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.roll_prepare_context(uuid, timestamptz, bigint, bigint)
  to service_role;

drop function if exists public.get_public_gem_catalog();

create function public.get_public_gem_catalog()
returns table (
  id uuid,
  title text,
  name text,
  rarity numeric,
  base_weight numeric,
  value_per_gram numeric,
  description text,
  metadata jsonb,
  hide_rarity_until_discovered boolean,
  affected_by_luck boolean,
  enabled boolean,
  sort_order integer,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz,
  availability_mode text,
  daily_start_time time,
  daily_end_time time,
  daily_time_windows jsonb,
  availability_timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.title, g.name, g.rarity, g.base_weight, g.value_per_gram,
    g.description, g.metadata, g.hide_rarity_until_discovered,
    g.affected_by_luck, g.enabled, g.sort_order, g.starts_at, g.ends_at,
    g.updated_at, g.availability_mode, g.daily_start_time,
    g.daily_end_time, g.daily_time_windows, g.availability_timezone
  from public.private_feature_gems g
  where g.enabled = true
    and (g.starts_at is null or g.starts_at <= now())
    and (g.ends_at is null or g.ends_at > now())
  order by g.sort_order asc, g.rarity desc, g.name asc;
$$;

revoke all on function public.get_public_gem_catalog() from public;
grant execute on function public.get_public_gem_catalog() to anon, authenticated;

commit;
