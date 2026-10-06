-- Run after 20261006082544_gemdle_classification_rarity_bonuses.sql.
-- Read-only verification; it does not change Gemdle data.

-- Total processed and changed/unchanged scores from the original backfill pass.
select
  count(*) as total_rows_processed,
  count(*) filter (where original_overall_rarity is distinct from recalculated_overall_rarity) as scores_changed,
  count(*) filter (where original_overall_rarity is not distinct from recalculated_overall_rarity) as scores_unchanged
from gemdle_private.classification_backfill_audit;

-- Occurrence count for every awarded classification, including zero-bonus structural labels.
select
  classification->>'id' as classification_id,
  classification->>'name' as classification_name,
  (classification->>'bonus')::double precision as bonus,
  count(*) as occurrences
from gemdle_private.classification_backfill_audit a
cross join lateral jsonb_array_elements(a.classifications) classification
group by classification->>'id',classification->>'name',(classification->>'bonus')::double precision
order by occurrences desc,classification_name;

-- Largest absolute and percentage increases.
select
  r.id,
  r.gemdle_date,
  r.specimen->>'gem_name' as gem_name,
  a.original_overall_rarity,
  a.recalculated_overall_rarity,
  a.recalculated_overall_rarity-a.original_overall_rarity as absolute_increase,
  case when a.original_overall_rarity>0 then
    100*(a.recalculated_overall_rarity/a.original_overall_rarity-1)
  end as percentage_increase,
  r.specimen->'classifications' as classifications
from gemdle_private.classification_backfill_audit a
join public.gemdle_results r on r.id=a.result_id
order by absolute_increase desc
limit 50;

-- New all-time Gemdle leaderboard using recalculated scores.
with totals as (
  select r.player_id,coalesce(nullif(p.username,''),'Player') username,
    sum(r.overall_rarity)::double precision total_score,count(*) discoveries
  from public.gemdle_results r
  join public.players p on p.id=r.player_id
  where not coalesce(p.leaderboard_hidden,false)
    and not exists(select 1 from public.user_roll_luck_rarity_mult b where b.player_id=r.player_id and b.active_until>now())
  group by r.player_id,p.username
)
select rank() over(order by total_score desc) as rank,username,total_score,discoveries
from totals
order by total_score desc,player_id
limit 50;

-- Idempotency proof: recompute every row from original contribution factors and
-- report any score/specimen classification mismatch. Expected result: all zeros.
with recomputed as (
  select r.id,r.overall_rarity,r.specimen,
    gemdle_private.classify_specimen(r.specimen,to_jsonb(g)) scored
  from public.gemdle_results r
  left join public.private_feature_gems g on g.name=r.specimen->>'gem_name'
)
select
  count(*) filter (where overall_rarity is distinct from (scored->>'overall_rarity')::double precision) as score_mismatches,
  count(*) filter (where specimen->'classifications' is distinct from scored->'classifications') as classification_mismatches,
  count(*) filter (where specimen->'gem_tags' is distinct from scored->'gem_tags') as tag_mismatches
from recomputed;
