-- =========================================================
-- ADMIN NAVIGATION / WORKBENCH / LIMITED EVENTS
-- FULL FIXED MIGRATION
-- =========================================================

-- =========================================================
-- 1. PLAYER NAVIGATION SETTINGS
-- =========================================================

create or replace function public.update_qol_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s jsonb;
  k text;
  v jsonb;
  legacy_missing boolean;
  nav_limit integer;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(p_patch) is distinct from 'object'
     or octet_length(p_patch::text) > 200000 then
    raise exception 'invalid_settings';
  end if;

  insert into public.player_settings(player_id)
  values(uid)
  on conflict do nothing;

  select settings
  into s
  from public.player_settings
  where player_id = uid
  for update;

  s := coalesce(s, '{}'::jsonb);

  legacy_missing := not (s ? 'legacyAutoSell');

  for k, v in
    select key, value
    from jsonb_each(p_patch)
  loop

    -- =====================================================
    -- TOP BAR NAVIGATION
    -- =====================================================
    if k in ('topBarMain', 'topBarExploreHidden') then

      if jsonb_typeof(v) is distinct from 'array' then
        raise exception 'invalid_navigation_settings';
      end if;

      /*
        Main bar:
          maximum 12 entries

        Explore:
          maximum 40 entries

        We deliberately avoid a CASE expression here because
        PostgreSQL's PL/pgSQL parser can produce a confusing
        "syntax error at end of input" with the previous form.
      */
      if k = 'topBarMain' then
        nav_limit := 12;
      else
        nav_limit := 40;
      end if;

      if jsonb_array_length(v) > nav_limit then
        raise exception 'invalid_navigation_settings';
      end if;

      s := jsonb_set(
        s,
        array[k],
        v,
        true
      );

    -- =====================================================
    -- GEM FILTER
    -- =====================================================
    elsif k = 'gemFilter' then

      if jsonb_typeof(v) is distinct from 'object' then
        raise exception 'invalid_filter';
      end if;

      if exists (
        select 1
        from jsonb_each_text(v) e
        where e.value is null
          or e.value not in ('DEFAULT', 'KEEP', 'SELL')
          or not exists (
            select 1
            from public.player_gem_mutation_combinations d
            where d.player_id = uid
              and d.gem_name = e.key
          )
      ) then
        raise exception 'invalid_or_undiscovered_gem';
      end if;

      s := jsonb_set(
        s,
        '{gemFilter}',
        coalesce(s->'gemFilter', '{}'::jsonb) || v,
        true
      );

    -- =====================================================
    -- MAX LUCK
    -- =====================================================
    elsif k = 'maxLuck' then

      if v = 'null'::jsonb
         or (
           jsonb_typeof(v) = 'string'
           and btrim(v #>> '{}') = ''
         ) then

        s := jsonb_set(
          s,
          '{maxLuck}',
          'null'::jsonb,
          true
        );

      else

        if jsonb_typeof(v) is distinct from 'number' then
          raise exception 'invalid_max_luck';
        end if;

        if (v::text)::numeric < 1
           or (v::text)::numeric > 9007199254740991 then
          raise exception 'invalid_max_luck';
        end if;

        s := jsonb_set(
          s,
          '{maxLuck}',
          v,
          true
        );

      end if;

    -- =====================================================
    -- BOOLEAN SETTINGS
    -- =====================================================
    elsif k in (
      'enableBuffs',
      'discoveryKeep',
      'autoRoll',
      'autoKeep',
      'rollAnimations',
      'globalCash',
      'cashGraph'
    ) then

      if jsonb_typeof(v) is distinct from 'boolean' then
        raise exception 'invalid_boolean';
      end if;

      s := jsonb_set(
        s,
        array[k],
        v,
        true
      );

    -- =====================================================
    -- BATCH SIZE
    -- =====================================================
    elsif k = 'batchSize' then

      if jsonb_typeof(v) is distinct from 'number'
         or (v::text)::numeric <> trunc((v::text)::numeric)
         or (v::text)::numeric < 1
         or (v::text)::numeric > 100 then

        raise exception 'invalid_batch_size';

      end if;

      s := jsonb_set(
        s,
        '{batchSize}',
        v,
        true
      );

    -- =====================================================
    -- NUMERIC THRESHOLDS
    -- =====================================================
    elsif k in (
      'discoveryKeepRarity',
      'autoKeepEffectiveRarity',
      'cutsceneMinimumRarity'
    ) then

      if jsonb_typeof(v) is distinct from 'number' then
        raise exception 'invalid_threshold';
      end if;

      if (v::text)::numeric < 1
         or (v::text)::numeric > 9007199254740991 then
        raise exception 'invalid_threshold';
      end if;

      s := jsonb_set(
        s,
        array[k],
        v,
        true
      );

    -- =====================================================
    -- CLEAR LEGACY AUTO SELL
    -- =====================================================
    elsif k = 'clearLegacyAutoSell' then

      if v is distinct from 'true'::jsonb then
        raise exception 'invalid_boolean';
      end if;

      s := jsonb_set(
        s,
        '{legacyAutoSell}',
        'false'::jsonb,
        true
      );

    -- =====================================================
    -- LEGACY AUTO SELL
    -- =====================================================
    elsif k in ('legacyAutoSell', 'legacyAutoSellTier') then

      if k = 'legacyAutoSell'
         and jsonb_typeof(v) is distinct from 'boolean' then
        raise exception 'invalid_boolean';
      end if;

      if k = 'legacyAutoSellTier'
         and v #>> '{}' not in (
           'common',
           'uncommon',
           'rare',
           'epic',
           'legendary',
           'mythic'
         ) then
        raise exception 'invalid_tier';
      end if;

      if legacy_missing then
        s := jsonb_set(
          s,
          array[k],
          v,
          true
        );
      end if;

    -- =====================================================
    -- GEM REALISM
    -- =====================================================
    elsif k = 'gemRealism' then

      s := jsonb_set(
        s,
        array[k],
        v,
        true
      );

    -- =====================================================
    -- UNKNOWN
    -- =====================================================
    else

      raise exception 'unknown_setting';

    end if;

  end loop;

  update public.player_settings
  set
    settings = s,
    updated_at = now()
  where player_id = uid;

  return s;
end;
$$;

grant execute on function public.update_qol_settings(jsonb)
to authenticated;


-- =========================================================
-- 2. ADMIN PET READ RPC
-- =========================================================

create or replace function public.admin_list_pets()
returns setof public.game_pets
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  return query
  select *
  from public.game_pets
  order by name;

end;
$$;

grant execute on function public.admin_list_pets()
to authenticated;


-- =========================================================
-- 3. ADMIN EQUIPMENT READ RPC
-- =========================================================

create or replace function public.admin_list_equipment()
returns setof public.admin_content_catalog
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  return query
  select *
  from public.admin_content_catalog
  where content_type = 'equipment'
  order by name;

end;
$$;

grant execute on function public.admin_list_equipment()
to authenticated;


-- =========================================================
-- 4. WORKBENCH DEFAULT
-- =========================================================

update public.forge_config
set enabled = false
where id = true;

update public.game_section_settings
set
  enabled = false,
  admin_only = true
where id = 'workbench';


-- =========================================================
-- 5. EQUIPMENT TABS
-- =========================================================

insert into public.game_section_settings
(
  id,
  label,
  short_label,
  icon,
  description,
  enabled,
  sort_order,
  admin_only
)
values
(
  'equipment-armory',
  'Armory',
  'Armory',
  '🛡',
  'Future combat armour equipment.',
  false,
  126,
  false
),
(
  'equipment-weapons',
  'Weapons',
  'Weapons',
  '⚔',
  'Future combat weapons.',
  false,
  127,
  false
)
on conflict (id)
do update set
  enabled = excluded.enabled,
  admin_only = false,
  updated_at = now();


-- =========================================================
-- 6. LIMITED EVENT DEFINITIONS
-- =========================================================

create table if not exists public.limited_event_definitions
(
  id text primary key,
  name text not null,
  introduction text not null default '',
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.limited_event_definitions
enable row level security;

revoke all
on public.limited_event_definitions
from anon, authenticated;

grant select
on public.limited_event_definitions
to service_role;


-- =========================================================
-- 7. ADMIN LIST LIMITED EVENTS
-- =========================================================

create or replace function public.admin_list_limited_events()
returns setof public.limited_event_definitions
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  return query
  select *
  from public.limited_event_definitions
  order by
    starts_at nulls last,
    name;

end;
$$;


-- =========================================================
-- 8. ADMIN SAVE LIMITED EVENT
-- =========================================================

create or replace function public.admin_save_limited_event(
  p_id text,
  p_name text,
  p_introduction text,
  p_enabled boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_config jsonb
)
returns public.limited_event_definitions
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.limited_event_definitions;
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  if p_id is null
     or btrim(p_id) = ''
     or p_name is null
     or btrim(p_name) = '' then
    raise exception 'invalid_event';
  end if;

  if p_starts_at is not null
     and p_ends_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'invalid_event_window';
  end if;

  insert into public.limited_event_definitions
  (
    id,
    name,
    introduction,
    enabled,
    starts_at,
    ends_at,
    config,
    created_by,
    updated_at
  )
  values
  (
    btrim(p_id),
    btrim(p_name),
    coalesce(p_introduction, ''),
    coalesce(p_enabled, false),
    p_starts_at,
    p_ends_at,
    coalesce(p_config, '{}'::jsonb),
    auth.uid(),
    now()
  )
  on conflict (id)
  do update set
    name = excluded.name,
    introduction = excluded.introduction,
    enabled = excluded.enabled,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    config = excluded.config,
    updated_at = now()
  returning *
  into r;

  return r;

end;
$$;


-- =========================================================
-- 9. ADMIN DELETE LIMITED EVENT
-- =========================================================

create or replace function public.admin_delete_limited_event(
  p_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  delete from public.limited_event_definitions
  where id = p_id;

end;
$$;


grant execute on function public.admin_list_limited_events()
to authenticated;

grant execute on function public.admin_save_limited_event(
  text,
  text,
  text,
  boolean,
  timestamptz,
  timestamptz,
  jsonb
)
to authenticated;

grant execute on function public.admin_delete_limited_event(text)
to authenticated;


-- =========================================================
-- 10. DEEP SEA EVENT SEED
-- DISABLED BY DEFAULT
-- =========================================================

insert into public.limited_event_definitions
(
  id,
  name,
  introduction,
  enabled,
  starts_at,
  ends_at,
  config
)
values
(
  'deep-sea',
  'Deep Sea',
  'Descend through the depths, collect Tide Tokens, craft the Pickaxe of Neptune and complete the Depths Demand.',
  false,
  null,
  null,
  '{
    "rollCost": 5,
    "baseCooldownSeconds": 2.5,

    "pools": [
      "normal",
      "deep-sea"
    ],

    "deepSeaLadder": [
      ["Water",1],
      ["Clay",1000],
      ["Salt Crystal",2500],
      ["Seaweed",6000],
      ["Sand Rock",15000],
      ["Sea Salt Rock",40000],
      ["Prismarine Fragment",100000],
      ["Ancient Coin",250000],
      ["Pearl",600000],
      ["Pearl of the Sea",1500000],
      ["Nautilii",4000000],
      ["Sunken Treasure",10000000],
      ["Abyssal Coral",25000000],
      ["Trenchstone",60000000],
      ["Coral",125000000],
      ["Leviathan Scale",250000000],
      ["Heart of the Sea",500000000],
      ["Neptune’s Tear",1000000000],
      ["Soul of the Sea God",2500000000]
    ],

    "neptune": {
      "luck": 30,
      "rollSpeed": 0.7,
      "mutationChance": 1.5,
      "weightLuck": 1.2,
      "weightMultiplier": 1.2,
      "deepSeaRarityDivider": 10
    },

    "neptuneRecipe": [
      ["Clay",500],
      ["Salt Crystal",250],
      ["Seaweed",100],
      ["Sand Rock",50],
      ["Sea Salt Rock",25],
      ["Prismarine Fragment",10],
      ["Ancient Coin",5],
      ["Pearl",5],
      ["Pearl of the Sea",1]
    ],

    "neptuneMoneyCost": 250000,

    "tidalWave": {
      "name": "Tidal Wave",
      "type": "legendary-global",
      "statMultiplier": 1.1
    },

    "tideTokens": {
      "formula": "floor(baseRarity^0.4)",
      "water": 0
    },

    "depthsDemand": {
      "offerings": 30,
      "depths": [
        "Shallows",
        "Reef",
        "Open Ocean",
        "Deep Sea",
        "Abyss",
        "Ocean Floor"
      ],
      "mandatoryRarest": "Abyssal Coral",
      "reward30": "Abyssal Potion x1"
    },

    "abyssalPotion": {
      "normalLuck": 100000,
      "ultimateExclusive": "1/2000",
      "lesserExclusive": "1/100",
      "ttPrice": 750000,
      "unlimited": true,
      "persistsAfterEvent": true
    },

    "legacy": {
      "ttPrice": 3000000,
      "choice": "one-deep-sea-gem",
      "permanentNormalPool": true
    },

    "consumables": [
      {
        "name": "Diver’s Potion",
        "effect": "+50% Deep Sea Luck",
        "durationMinutes": 5
      },
      {
        "name": "Tidal Rush",
        "effect": "+50% Deep Sea Roll Speed",
        "durationMinutes": 5
      },
      {
        "name": "Pressure Flask",
        "effect": "+100% Weight Luck and +50% Weight Multiplier",
        "durationMinutes": 5
      },
      {
        "name": "Treasure Hunter’s Tonic",
        "effect": "+50% Tide Tokens",
        "durationMinutes": 10
      },
      {
        "name": "Offering to Neptune",
        "effect": "next Neptune roll uses /20 instead of /10"
      }
    ],

    "presentation": {
      "backgroundColor": "#071923",
      "fontStyle": "normal",
      "fontWeight": 600,
      "fontSize": "16px"
    }
  }'::jsonb
)
on conflict (id)
do nothing;


-- =========================================================
-- 11. LIMITED-TIME EQUIPMENT TAB
-- =========================================================

insert into public.game_section_settings
(
  id,
  label,
  short_label,
  icon,
  description,
  enabled,
  sort_order,
  admin_only
)
values
(
  'equipment-limited-time',
  'Limited Time',
  'Limited Time',
  '⏳',
  'Limited-time event equipment and recipes.',
  true,
  125,
  false
)
on conflict (id)
do update set
  enabled = true,
  admin_only = false,
  updated_at = now();


-- =========================================================
-- 12. ADMIN EQUIPMENT TAB LIST
-- =========================================================

create or replace function public.admin_list_equipment_tabs()
returns setof public.game_section_settings
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  return query
  select *
  from public.game_section_settings
  where id in (
    'equipment-armory',
    'equipment-weapons',
    'equipment-limited-time'
  )
  order by sort_order;

end;
$$;


-- =========================================================
-- 13. ADMIN ENABLE/DISABLE EQUIPMENT TAB
-- =========================================================

create or replace function public.admin_set_equipment_tab(
  p_tab text,
  p_enabled boolean
)
returns public.game_section_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_section_settings;
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  if p_tab not in ('armory', 'weapons') then
    raise exception 'invalid_equipment_tab';
  end if;

  update public.game_section_settings
  set
    enabled = coalesce(p_enabled, false),
    updated_at = now()
  where id = 'equipment-' || p_tab
  returning *
  into r;

  return r;

end;
$$;


grant execute on function public.admin_list_equipment_tabs()
to authenticated;

grant execute on function public.admin_set_equipment_tab(text, boolean)
to authenticated;


-- =========================================================
-- 14. ADMIN WORKBENCH GET
-- =========================================================

create or replace function public.admin_get_workbench_config()
returns public.forge_config
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.forge_config;
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  select *
  into r
  from public.forge_config
  where id = true;

  return r;

end;
$$;


-- =========================================================
-- 15. ADMIN WORKBENCH SAVE
-- =========================================================

create or replace function public.admin_save_workbench_config(
  p_config jsonb
)
returns public.forge_config
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.forge_config;
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  update public.forge_config
  set
    enabled = coalesce(
      (p_config->>'enabled')::boolean,
      false
    ),

    display_name = coalesce(
      nullif(p_config->>'display_name',''),
      'Workbench [BETA]'
    ),

    beta_label = coalesce(
      nullif(p_config->>'display_name',''),
      'Workbench [BETA]'
    ),

    min_materials = coalesce(
      (p_config->>'min_materials')::integer,
      min_materials
    ),

    max_materials = coalesce(
      (p_config->>'max_materials')::integer,
      max_materials
    ),

    stage_time_seconds = coalesce(
      (p_config->>'stage_time_seconds')::numeric,
      stage_time_seconds
    ),

    trait_threshold_minor = coalesce(
      (p_config->>'trait_threshold_minor')::numeric,
      trait_threshold_minor
    ),

    trait_threshold_full = coalesce(
      (p_config->>'trait_threshold_full')::numeric,
      trait_threshold_full
    ),

    quality_broken = coalesce(
      (p_config->>'quality_broken')::numeric,
      quality_broken
    ),

    quality_poor = coalesce(
      (p_config->>'quality_poor')::numeric,
      quality_poor
    ),

    quality_average = coalesce(
      (p_config->>'quality_average')::numeric,
      quality_average
    ),

    quality_good = coalesce(
      (p_config->>'quality_good')::numeric,
      quality_good
    ),

    quality_excellent = coalesce(
      (p_config->>'quality_excellent')::numeric,
      quality_excellent
    ),

    quality_masterwork = coalesce(
      (p_config->>'quality_masterwork')::numeric,
      quality_masterwork
    ),

    updated_at = now()

  where id = true

  returning *
  into r;

  update public.game_section_settings
  set
    enabled = r.enabled,
    admin_only = true,
    updated_at = now()
  where id = 'workbench';

  return r;

end;
$$;


grant execute on function public.admin_get_workbench_config()
to authenticated;

grant execute on function public.admin_save_workbench_config(jsonb)
to authenticated;


-- =========================================================
-- 16. ACTIVE LIMITED EVENTS
-- =========================================================

create or replace function public.get_active_limited_events()
returns setof public.limited_event_definitions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.limited_event_definitions
  where enabled = true
    and (
      starts_at is null
      or starts_at <= now()
    )
    and (
      ends_at is null
      or ends_at > now()
    )
  order by
    starts_at nulls last,
    name;
$$;


grant execute on function public.get_active_limited_events()
to anon, authenticated;


-- =========================================================
-- 17. ADMIN SAVE EQUIPMENT
-- =========================================================

create or replace function public.admin_save_equipment(
  p_id text,
  p_name text,
  p_category text,
  p_tier integer,
  p_boost_mode text,
  p_boost_value numeric,
  p_money_cost numeric,
  p_requirements jsonb,
  p_description text default '',
  p_enabled boolean default true
)
returns public.admin_content_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.admin_content_catalog;
  bonus jsonb := '{}'::jsonb;
  recipe jsonb;
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  if p_id is null
     or btrim(p_id) = ''
     or p_name is null
     or btrim(p_name) = '' then
    raise exception 'invalid_equipment';
  end if;

  if p_category is null
     or p_category not in (
       'pickaxe',
       'clover',
       'lantern',
       'boots',
       'bag',
       'petGear',
       'armory',
       'weapons',
       'limited-time'
     ) then
    raise exception 'invalid_equipment_category';
  end if;

  if p_boost_mode not in (
    'rollSpeed',
    'rollBulk',
    'petLuck'
  ) then
    raise exception 'invalid_equipment_boost';
  end if;

  if coalesce(p_boost_value, 0) < 0 then
    raise exception 'invalid_equipment_boost';
  end if;

  if p_boost_mode = 'rollSpeed' then
    bonus := jsonb_build_object(
      'rollSpeed',
      p_boost_value
    );
  end if;

  if p_boost_mode = 'rollBulk' then
    bonus := jsonb_build_object(
      'rollBulk',
      greatest(0, trunc(p_boost_value))
    );
  end if;

  if p_boost_mode = 'petLuck' then
    bonus := jsonb_build_object(
      'petLuck',
      p_boost_value
    );
  end if;


  recipe := jsonb_build_object(
    'id',
    p_id,

    'name',
    p_name,

    'category',
    p_category,

    'craftingTab',
    p_category,

    'horizontal',
    true,

    'equipmentOverhaul',
    true,

    'moneyCost',
    greatest(
      0,
      coalesce(p_money_cost, 0)
    ),

    'description',
    coalesce(p_description, ''),

    'requirements',
    coalesce(
      p_requirements,
      '[]'::jsonb
    ),

    'reward',
    jsonb_build_object(
      'id',
      p_id,

      'name',
      p_name,

      'category',
      p_category,

      'tier',
      greatest(
        1,
        coalesce(p_tier, 1)
      ),

      'bonus',
      bonus
    )
  );


  insert into public.admin_content_catalog
  (
    content_type,
    content_key,
    name,
    enabled,
    config,
    updated_by
  )
  values
  (
    'equipment',
    p_id,
    p_name,
    coalesce(p_enabled, true),

    jsonb_build_object(
      'category',
      p_category,

      'tier',
      greatest(
        1,
        coalesce(p_tier, 1)
      ),

      'boostMode',
      p_boost_mode,

      'boostValue',
      p_boost_value,

      'rollSpeed',
      coalesce(
        bonus->>'rollSpeed',
        '0'
      )::numeric,

      'rollBulk',
      coalesce(
        bonus->>'rollBulk',
        '0'
      )::numeric,

      'petLuck',
      coalesce(
        bonus->>'petLuck',
        '0'
      )::numeric,

      'moneyCost',
      greatest(
        0,
        coalesce(p_money_cost, 0)
      ),

      'requirements',
      coalesce(
        p_requirements,
        '[]'::jsonb
      ),

      'description',
      coalesce(
        p_description,
        ''
      )
    ),

    auth.uid()
  )

  on conflict (
    content_type,
    content_key
  )

  do update set
    name = excluded.name,
    enabled = excluded.enabled,
    config = excluded.config,
    updated_at = now(),
    updated_by = auth.uid()

  returning *
  into r;


  insert into public.game_recipes(
    id,
    recipe
  )
  values(
    p_id,
    recipe
  )

  on conflict(id)
  do update set
    recipe = excluded.recipe;


  return r;

end;
$$;


-- =========================================================
-- 18. ADMIN DELETE EQUIPMENT
-- =========================================================

create or replace function public.admin_delete_equipment(
  p_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then
    raise exception 'not_admin';
  end if;

  delete from public.admin_content_catalog
  where content_type = 'equipment'
    and content_key = p_id;

  delete from public.game_recipes
  where id = p_id
    and recipe->>'equipmentOverhaul' = 'true';

end;
$$;


grant execute on function public.admin_save_equipment(
  text,
  text,
  text,
  integer,
  text,
  numeric,
  numeric,
  jsonb,
  text,
  boolean
)
to authenticated;

grant execute on function public.admin_delete_equipment(text)
to authenticated;


-- =========================================================
-- 19. REFRESH POSTGREST SCHEMA
-- =========================================================

notify pgrst, 'reload schema';