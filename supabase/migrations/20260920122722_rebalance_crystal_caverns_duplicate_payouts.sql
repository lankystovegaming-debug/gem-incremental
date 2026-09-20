-- Rebalance Crystal Caverns duplicate payouts without changing artifact
-- acquisition, progression, drop eligibility, weights, or cargo rewards.
create temporary table crystal_caverns_duplicate_payout_rebalance(
  key text primary key,
  duplicate_value numeric not null
);

insert into crystal_caverns_duplicate_payout_rebalance(key, duplicate_value) values
  ('crystal-splinter', 125000::numeric),
  ('calcified-geode', 175000::numeric),
  ('quartz-cluster', 250000::numeric),
  ('broken-survey-lens', 350000::numeric),
  ('crystallized-lantern', 500000::numeric),
  ('prismatic-shard', 600000::numeric),
  ('ancient-crystal-chisel', 650000::numeric),
  ('fractured-prism', 750000::numeric),
  ('perfect-crystal-sphere', 900000::numeric),
  ('resonance-core', 1000000::numeric),
  ('frozen-light-fragment', 750000::numeric),
  ('heart-of-the-cavern', 1250000::numeric),
  ('bloodstained-crystal', 1000000::numeric),
  ('prismatic-fossil', 1000000::numeric),
  ('resonant-geode', 1350000::numeric),
  ('cracked-resonance-bell', 1500000::numeric),
  ('fractured-core', 2000000::numeric),
  ('prismatic-mirror', 2500000::numeric),
  ('impossible-crystal', 2250000::numeric),
  ('shattered-heart', 4000000::numeric);

update public.crystal_cavern_artifacts as artifact
set duplicate_value = payout.duplicate_value
from crystal_caverns_duplicate_payout_rebalance as payout
where artifact.key = payout.key;

-- Artifact finds snapshot duplicateValue when they are rolled. Refresh only
-- unsettled runs so already-earned history is immutable while open runs use
-- the finalized payout table. First copies still ignore duplicateValue during
-- settlement and register in the Museum as before.
update public.crystal_cavern_runs as cavern_run
set secured_artifacts = (
    select coalesce(jsonb_agg(
      case when payout.key is null then item.value
        else jsonb_set(item.value, '{duplicateValue}', to_jsonb(payout.duplicate_value), true)
      end order by item.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(cavern_run.secured_artifacts) with ordinality as item(value, ordinality)
    left join crystal_caverns_duplicate_payout_rebalance as payout on payout.key = item.value->>'key'
  ),
  unsecured_artifacts = (
    select coalesce(jsonb_agg(
      case when payout.key is null then item.value
        else jsonb_set(item.value, '{duplicateValue}', to_jsonb(payout.duplicate_value), true)
      end order by item.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(cavern_run.unsecured_artifacts) with ordinality as item(value, ordinality)
    left join crystal_caverns_duplicate_payout_rebalance as payout on payout.key = item.value->>'key'
  )
where cavern_run.status <> 'settled'
  and (
    exists (
      select 1 from jsonb_array_elements(cavern_run.secured_artifacts) as item(value)
      join crystal_caverns_duplicate_payout_rebalance as payout on payout.key = item.value->>'key'
    )
    or exists (
      select 1 from jsonb_array_elements(cavern_run.unsecured_artifacts) as item(value)
      join crystal_caverns_duplicate_payout_rebalance as payout on payout.key = item.value->>'key'
    )
  );

drop table crystal_caverns_duplicate_payout_rebalance;
