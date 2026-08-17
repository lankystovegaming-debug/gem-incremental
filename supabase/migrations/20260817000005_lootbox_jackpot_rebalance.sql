-- =========================================================
-- Loot box jackpot rebalance.
--
-- Cash jackpots must feel exciting without injecting multi-million
-- fortunes too often. Each box retains a profitable cash outcome, but
-- both the payout and the chance are reduced. The adjusted normal-reward
-- weights keep every pool at exactly 100 total weight.
-- =========================================================

update public.game_loot_boxes
set box = jsonb_set(
  jsonb_set(
    jsonb_set(
      box,
      '{blurb}',
      '"A 1% chance at a $500,000 cash jackpot, plus useful starter rewards."'::jsonb
    ),
    '{pool,0,weight}',
    '27'::jsonb
  ),
  '{pool,6}',
  '{"type":"money","label":"$500,000 cash jackpot","amount":500000,"weight":1}'::jsonb
)
where id = 'prospectors-chest';

update public.game_loot_boxes
set box = jsonb_set(
  jsonb_set(
    jsonb_set(
      box,
      '{blurb}',
      '"A 0.5% chance at a $2,500,000 cash jackpot, with premium rewards otherwise."'::jsonb
    ),
    '{pool,0,weight}',
    '23.5'::jsonb
  ),
  '{pool,7}',
  '{"type":"money","label":"$2,500,000 cash jackpot","amount":2500000,"weight":0.5}'::jsonb
)
where id = 'cosmic-vault';

update public.game_loot_boxes
set box = jsonb_set(
  jsonb_set(
    jsonb_set(
      box,
      '{blurb}',
      '"A 0.25% chance at a $10,000,000 cash jackpot, with elite rewards otherwise."'::jsonb
    ),
    '{pool,0,weight}',
    '19.25'::jsonb
  ),
  '{pool,9}',
  '{"type":"money","label":"$10,000,000 cash jackpot","amount":10000000,"weight":0.25}'::jsonb
)
where id = 'celestial-cache';
