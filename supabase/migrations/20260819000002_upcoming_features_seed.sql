-- =========================================================
-- Hidden Upcoming Features: default achievement + quest definitions
--
-- IMPORTANT:
-- 20260819000001 creates the tables but intentionally did not insert rows.
-- This migration is the missing seed step. It is safe to run once or again:
-- every INSERT is guarded by feature_kind + name, so it will not duplicate.
-- =========================================================

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'achievement', null, 'First Spark', 'Complete your first real roll.', '✦', 0,
  true, null, null, '{}',
  '{"type":"rolls","amount":1}'::jsonb,
  '[{"type":"potion","consumableId":"lucky-potion-1","amount":2}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='achievement' and name='First Spark'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'achievement', null, 'Twin Crowns', 'Roll two Legendary-tier gems back-to-back.', '♛', 0,
  true, null, null, '{}',
  '{"type":"consecutive","amount":2,"match":{"gemRarityGte":10000}}'::jsonb,
  '[{"type":"coins","amount":10}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='achievement' and name='Twin Crowns'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'achievement', null, 'Mythic by Fate', 'Find a Mythic-tier gem without using a Legendary or Mythic one-roll potion.', '☄', 0,
  true, null, null, '{}',
  '{"type":"single","match":{"gemRarityGte":1000000,"noLegendaryOrMythicPotion":true}}'::jsonb,
  '[{"type":"potion","consumableId":"mythic-potion","amount":1}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='achievement' and name='Mythic by Fate'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'achievement', null, 'Five Thousand Deep', 'Roll 5,000 times.', '∞', 0,
  true, null, null, '{}',
  '{"type":"rolls","amount":5000}'::jsonb,
  '[{"type":"money","amount":1000000},{"type":"coins","amount":25}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='achievement' and name='Five Thousand Deep'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'achievement', null, 'Mythic Storm', 'Roll 20 Mythics within any 500-roll window.', '⚡', 0,
  true, null, null, '{}',
  '{"type":"count","amount":20,"windowRolls":500,"match":{"gemRarityGte":1000000}}'::jsonb,
  '[{"type":"potion","consumableId":"mythic-potion","amount":3}]'::jsonb,
  '[]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='achievement' and name='Mythic Storm'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'main', 'Astral Ascension 1', 'Begin the main progression.', 'Ⅰ', 10,
  true, null, null, '{}',
  '{"type":"rolls","amount":100}'::jsonb,
  '[{"type":"potion","consumableId":"lucky-potion-1","amount":5}]'::jsonb,
  '["pickaxe_t5"]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Astral Ascension 1'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'main', 'Astral Ascension 2', 'Push deeper into the gem ladder.', 'Ⅱ', 20,
  true, null, null, '{}',
  '{"all":[{"type":"rolls","amount":500},{"type":"count","amount":3,"match":{"gemRarityGte":100}}]}'::jsonb,
  '[{"type":"money","amount":250000}]'::jsonb,
  '["pickaxe_t8"]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Astral Ascension 2'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'main', 'Astral Ascension 3', 'Prove you can survive the rare tier.', 'Ⅲ', 30,
  true, null, null, '{}',
  '{"all":[{"type":"rolls","amount":1500},{"type":"count","amount":5,"match":{"gemRarityGte":1000}}]}'::jsonb,
  '[{"type":"coins","amount":20}]'::jsonb,
  '["pickaxe_t11","bag_t8"]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Astral Ascension 3'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'main', 'Astral Ascension 4', 'Reach the endgame gates.', 'Ⅳ', 40,
  true, null, null, '{}',
  '{"all":[{"type":"rolls","amount":5000},{"type":"count","amount":10,"match":{"gemRarityGte":10000}}]}'::jsonb,
  '[{"type":"potion","consumableId":"legendary-potion","amount":2}]'::jsonb,
  '["pickaxe_t14","bag_t11"]'::jsonb, '{}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Astral Ascension 4'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'event', 'Eclipse Rush', 'A limited-time event hunt.', '☾', 100,
  true, now(), now() + interval '7 days', '{}',
  '{"count":3,"match":{"gemRarityGte":100000}}'::jsonb,
  '[{"type":"coins","amount":50}]'::jsonb,
  '[]'::jsonb, '{"seeded":true,"limitedTime":true}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Eclipse Rush'
);

insert into public.private_feature_definitions (
  feature_kind, quest_type, name, description, icon, sort_order,
  enabled, starts_at, ends_at, prerequisites, requirements, rewards, unlocks, metadata
)
select
  'quest', 'special', 'Designer Playground', 'A fully customizable special quest template.', '✹', 200,
  true, null, null, '{}',
  '{"any":[{"type":"single","match":{"hasMutation":"corrupted"}},{"type":"single","match":{"valueGte":100000}}]}'::jsonb,
  '[{"type":"money","amount":500000}]'::jsonb,
  '[]'::jsonb, '{"seeded":true,"customizable":true}'::jsonb
where not exists (
  select 1 from public.private_feature_definitions
  where feature_kind='quest' and name='Designer Playground'
);

-- Make sure the seeded rows are immediately visible to the service-role Edge Function.
-- RLS remains service-role-only by design.
