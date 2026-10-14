begin;

-- Boss and treasure headers contain these values, but the original structured
-- import left both fields blank for all 60 special rooms.
with special_keys(room_number, key_chance) as (values
  (25,'0.54%'),(50,'0.57%'),(75,'0.61%'),(100,'0.65%'),(125,'0.69%'),(150,'0.72%'),(175,'0.76%'),(200,'0.8%'),(225,'0.84%'),(250,'0.88%'),
  (275,'0.91%'),(300,'0.95%'),(325,'0.99%'),(350,'1.02%'),(375,'1.06%'),(400,'1.1%'),(425,'1.14%'),(450,'1.18%'),(475,'1.21%'),(500,'1.25%'),
  (525,'1.29%'),(550,'1.33%'),(575,'1.36%'),(600,'1.4%'),(625,'1.44%'),(650,'1.48%'),(675,'1.51%'),(700,'1.55%'),(725,'1.59%'),(750,'1.62%'),
  (775,'1.66%'),(800,'1.7%'),(825,'1.74%'),(850,'1.78%'),(875,'1.81%'),(900,'1.85%'),(925,'1.89%'),(950,'1.93%'),(975,'1.96%'),(1000,'2%'),
  (1025,'2.04%'),(1050,'2.08%'),(1075,'2.11%'),(1100,'2.15%'),(1125,'2.19%'),(1150,'2.23%'),(1175,'2.26%'),(1200,'2.3%'),(1225,'2.34%'),(1250,'2.38%'),
  (1275,'2.41%'),(1300,'2.45%'),(1325,'2.49%'),(1350,'2.53%'),(1375,'2.56%'),(1400,'2.6%'),(1425,'2.64%'),(1450,'2.68%'),(1475,'2.71%'),(1500,'2.75%')
)
update public.dungeon_catalog_rooms r
set room_key_chance = s.key_chance,
    fog_chance = '10%'
from special_keys s
where r.room_number = s.room_number;

-- The original importer retained only the first five add-count rows. Restore
-- the exact 5-9 add tails published by each boss room's catalog sheet.
with boss_tails(room_number, tail) as (values
  (50, '[{"kind":"5 adds","chance":"14.2%"},{"kind":"6 adds","chance":"1.52%"},{"kind":"7 adds","chance":"0.455%"},{"kind":"8 adds","chance":"0.136%"},{"kind":"9 adds","chance":"0.041%"}]'::jsonb),
  (100, '[{"kind":"5 adds","chance":"14.2%"},{"kind":"6 adds","chance":"1.62%"},{"kind":"7 adds","chance":"0.486%"},{"kind":"8 adds","chance":"0.146%"},{"kind":"9 adds","chance":"0.044%"}]'::jsonb),
  (150, '[{"kind":"5 adds","chance":"14.2%"},{"kind":"6 adds","chance":"1.73%"},{"kind":"7 adds","chance":"0.518%"},{"kind":"8 adds","chance":"0.155%"},{"kind":"9 adds","chance":"0.047%"}]'::jsonb),
  (200, '[{"kind":"5 adds","chance":"14.1%"},{"kind":"6 adds","chance":"1.83%"},{"kind":"7 adds","chance":"0.550%"},{"kind":"8 adds","chance":"0.165%"},{"kind":"9 adds","chance":"0.049%"}]'::jsonb),
  (250, '[{"kind":"5 adds","chance":"14.1%"},{"kind":"6 adds","chance":"1.94%"},{"kind":"7 adds","chance":"0.582%"},{"kind":"8 adds","chance":"0.175%"},{"kind":"9 adds","chance":"0.052%"}]'::jsonb),
  (300, '[{"kind":"5 adds","chance":"14.1%"},{"kind":"6 adds","chance":"2.05%"},{"kind":"7 adds","chance":"0.614%"},{"kind":"8 adds","chance":"0.184%"},{"kind":"9 adds","chance":"0.055%"}]'::jsonb),
  (350, '[{"kind":"5 adds","chance":"14.1%"},{"kind":"6 adds","chance":"2.15%"},{"kind":"7 adds","chance":"0.645%"},{"kind":"8 adds","chance":"0.194%"},{"kind":"9 adds","chance":"0.058%"}]'::jsonb),
  (400, '[{"kind":"5 adds","chance":"14.1%"},{"kind":"6 adds","chance":"2.26%"},{"kind":"7 adds","chance":"0.677%"},{"kind":"8 adds","chance":"0.203%"},{"kind":"9 adds","chance":"0.061%"}]'::jsonb),
  (450, '[{"kind":"5 adds","chance":"14.0%"},{"kind":"6 adds","chance":"2.36%"},{"kind":"7 adds","chance":"0.709%"},{"kind":"8 adds","chance":"0.213%"},{"kind":"9 adds","chance":"0.064%"}]'::jsonb),
  (500, '[{"kind":"5 adds","chance":"14.0%"},{"kind":"6 adds","chance":"2.47%"},{"kind":"7 adds","chance":"0.741%"},{"kind":"8 adds","chance":"0.222%"},{"kind":"9 adds","chance":"0.067%"}]'::jsonb),
  (550, '[{"kind":"5 adds","chance":"14.0%"},{"kind":"6 adds","chance":"2.57%"},{"kind":"7 adds","chance":"0.772%"},{"kind":"8 adds","chance":"0.232%"},{"kind":"9 adds","chance":"0.070%"}]'::jsonb),
  (600, '[{"kind":"5 adds","chance":"14.0%"},{"kind":"6 adds","chance":"2.68%"},{"kind":"7 adds","chance":"0.804%"},{"kind":"8 adds","chance":"0.241%"},{"kind":"9 adds","chance":"0.072%"}]'::jsonb),
  (650, '[{"kind":"5 adds","chance":"13.9%"},{"kind":"6 adds","chance":"2.79%"},{"kind":"7 adds","chance":"0.836%"},{"kind":"8 adds","chance":"0.251%"},{"kind":"9 adds","chance":"0.075%"}]'::jsonb),
  (700, '[{"kind":"5 adds","chance":"13.9%"},{"kind":"6 adds","chance":"2.89%"},{"kind":"7 adds","chance":"0.868%"},{"kind":"8 adds","chance":"0.260%"},{"kind":"9 adds","chance":"0.078%"}]'::jsonb),
  (750, '[{"kind":"5 adds","chance":"13.9%"},{"kind":"6 adds","chance":"3.00%"},{"kind":"7 adds","chance":"0.900%"},{"kind":"8 adds","chance":"0.270%"},{"kind":"9 adds","chance":"0.081%"}]'::jsonb),
  (800, '[{"kind":"5 adds","chance":"13.9%"},{"kind":"6 adds","chance":"3.10%"},{"kind":"7 adds","chance":"0.931%"},{"kind":"8 adds","chance":"0.279%"},{"kind":"9 adds","chance":"0.084%"}]'::jsonb),
  (850, '[{"kind":"5 adds","chance":"13.9%"},{"kind":"6 adds","chance":"3.21%"},{"kind":"7 adds","chance":"0.963%"},{"kind":"8 adds","chance":"0.289%"},{"kind":"9 adds","chance":"0.087%"}]'::jsonb),
  (900, '[{"kind":"5 adds","chance":"13.8%"},{"kind":"6 adds","chance":"3.32%"},{"kind":"7 adds","chance":"0.995%"},{"kind":"8 adds","chance":"0.298%"},{"kind":"9 adds","chance":"0.090%"}]'::jsonb),
  (950, '[{"kind":"5 adds","chance":"13.8%"},{"kind":"6 adds","chance":"3.42%"},{"kind":"7 adds","chance":"1.03%"},{"kind":"8 adds","chance":"0.308%"},{"kind":"9 adds","chance":"0.092%"}]'::jsonb),
  (1000, '[{"kind":"5 adds","chance":"13.8%"},{"kind":"6 adds","chance":"3.53%"},{"kind":"7 adds","chance":"1.06%"},{"kind":"8 adds","chance":"0.318%"},{"kind":"9 adds","chance":"0.095%"}]'::jsonb),
  (1050, '[{"kind":"5 adds","chance":"13.8%"},{"kind":"6 adds","chance":"3.63%"},{"kind":"7 adds","chance":"1.09%"},{"kind":"8 adds","chance":"0.327%"},{"kind":"9 adds","chance":"0.098%"}]'::jsonb),
  (1100, '[{"kind":"5 adds","chance":"13.7%"},{"kind":"6 adds","chance":"3.74%"},{"kind":"7 adds","chance":"1.12%"},{"kind":"8 adds","chance":"0.337%"},{"kind":"9 adds","chance":"0.101%"}]'::jsonb),
  (1150, '[{"kind":"5 adds","chance":"13.7%"},{"kind":"6 adds","chance":"3.85%"},{"kind":"7 adds","chance":"1.15%"},{"kind":"8 adds","chance":"0.346%"},{"kind":"9 adds","chance":"0.104%"}]'::jsonb),
  (1200, '[{"kind":"5 adds","chance":"13.7%"},{"kind":"6 adds","chance":"3.95%"},{"kind":"7 adds","chance":"1.19%"},{"kind":"8 adds","chance":"0.356%"},{"kind":"9 adds","chance":"0.107%"}]'::jsonb),
  (1250, '[{"kind":"5 adds","chance":"13.7%"},{"kind":"6 adds","chance":"4.06%"},{"kind":"7 adds","chance":"1.22%"},{"kind":"8 adds","chance":"0.365%"},{"kind":"9 adds","chance":"0.110%"}]'::jsonb),
  (1300, '[{"kind":"5 adds","chance":"13.7%"},{"kind":"6 adds","chance":"4.16%"},{"kind":"7 adds","chance":"1.25%"},{"kind":"8 adds","chance":"0.375%"},{"kind":"9 adds","chance":"0.112%"}]'::jsonb),
  (1350, '[{"kind":"5 adds","chance":"13.6%"},{"kind":"6 adds","chance":"4.27%"},{"kind":"7 adds","chance":"1.28%"},{"kind":"8 adds","chance":"0.384%"},{"kind":"9 adds","chance":"0.115%"}]'::jsonb),
  (1400, '[{"kind":"5 adds","chance":"13.6%"},{"kind":"6 adds","chance":"4.38%"},{"kind":"7 adds","chance":"1.31%"},{"kind":"8 adds","chance":"0.394%"},{"kind":"9 adds","chance":"0.118%"}]'::jsonb),
  (1450, '[{"kind":"5 adds","chance":"13.6%"},{"kind":"6 adds","chance":"4.48%"},{"kind":"7 adds","chance":"1.34%"},{"kind":"8 adds","chance":"0.403%"},{"kind":"9 adds","chance":"0.121%"}]'::jsonb),
  (1500, '[{"kind":"5 adds","chance":"13.6%"},{"kind":"6 adds","chance":"4.59%"},{"kind":"7 adds","chance":"1.38%"},{"kind":"8 adds","chance":"0.413%"},{"kind":"9 adds","chance":"0.124%"}]'::jsonb)
)
update public.dungeon_catalog_rooms r
set encounters = coalesce((
  select jsonb_agg(entry)
  from jsonb_array_elements(r.encounters) entry
  where (entry->>'kind') !~ '^[5-9] adds?$'
), '[]'::jsonb) || b.tail
from boss_tails b
where r.room_number = b.room_number;

update public.dungeon_definitions
set max_enemies = 14,
    updated_at = now()
where name = 'The 1,500-Room Dungeon';

-- Calibrated from the published Room 1188 mutation table. Dividing the Rft
-- and universal entries by their documented 6x native boost recovers each
-- mutation's unrounded base selection weight.
alter table public.dungeon_mutations
  add column if not exists selection_weight numeric;

update public.dungeon_mutations
set native_regions = array_replace(native_regions, '', 'Gen')
where name = 'Eternal';

with weights(name, selection_weight) as (values
  ('Smooth',0.122),('Glossy',0.0943),('Clear',0.0667),('Lustrous',0.0544),
  ('Flawless',0.0471),('Polished',0.0298),('Gilded',0.0211),('Moldy',0.0149),
  ('Prismatic',0.0373),('Habitable',0.0295),('Radiant',0.0264),('Misty',0.0264),
  ('Enchanted',0.008566666667),('Lit',0.0256),('Celestial',0.0186),('Amalgamated',0.03366666667),
  ('Enlightened',0.0164),('Fake',0.0152),('Enlarged',0.0132),('Shiny',0.00824),
  ('Metallic',0.00752),('Heated',0.00717),('Chaotic',0.01413333333),('Frozen',0.00652),
  ('Corrupted',0.00583),('Translucent',0.0098),('Radioactive',0.00476),('Kawaii',0.0047),
  ('Edible',0.00464),('Shattered',0.008233333333),('Sparkling',0.00412),('Crystallised',0.00116),
  ('Discombobulated',0.002316666667),('Ancient',0.002293333333),('Bloody',0.00112),('Golden',0.00104),
  ('Carved',0.002013333333),('Mysterious',0.001916666667),('Starstruck',0.0009),('Still Life',0.001793333333),
  ('Aquatic',0.00086),('Acidic',0.00085),('Zombified',0.00082),('Eternal',0.001613333333),
  ('Cosmic',0.001533333333),('Spiky',0.00074),('Shadowed',0.0007),('Rotten',0.00062),
  ('Poisonous',0.0006),('Fossilised',0.001193333333),('Verdant',0.00057),('Aurora',0.00081),
  ('Devilish',0.00074),('67',0.00073),('Angelic',0.00068),('Abyssal',0.00067),
  ('Alive',0.00063),('Chocolate',0.0006),('Soulbound',0.00059),('Withered',0.00059),
  ('Blazing',0.00059),('Voidtouched',0.00054),('Mirrored',0.001016666667),('Godlike',0.00043),
  ('Lanked',0.00035),('Aether',0.00001901140684)
)
update public.dungeon_mutations m
set selection_weight = w.selection_weight /
  case when m.native_regions && array['Rft', 'Any']::text[] then 2 else 1 end
from weights w
where m.name = w.name;

commit;
