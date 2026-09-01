begin;

-- Remove the broken v1 catalog and every attached progress row, including
-- claimed rows. Rewards already delivered remain, but their AP is removed by
-- the authoritative profile rebuild below.
delete from public.private_feature_definitions
where feature_kind = 'achievement'
  and coalesce((metadata->>'hidden')::boolean, false)
  and metadata->>'catalogVersion' = 'v0.13.0-beta';

with hidden_v2(name, description, hint, ap, reward, sort_order) as (
  values
    ('Echo in Stone', 'Roll the same 1-in-100,000+ base gem twice consecutively.', 'The mine sometimes answers itself.', 10, '[{"type":"money","amount":25000}]'::jsonb, 9001),
    ('Impossibly Familiar', 'Repeat a 1-in-100,000+ gem with the same mutations and weight multiplier to three decimals.', 'Near-identical is not identical enough.', 35, '[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":1}]', 9002),
    ('Low-Luck Miracle', 'Roll 1-in-10-billion+ effective rarity with no more than 25x effective Luck.', 'Let probability do the heavy lifting.', 60, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9003),
    ('Natural Wonder', 'Roll a 1-in-50-million+ base gem at no more than 1.25x your permanent base Luck.', 'No overwhelming one-roll boost allowed.', 100, '[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":1}]', 9004),
    ('Mutation Singularity', 'Accumulate 10,000 mutation occurrences after this secret set launches.', 'Every mutation leaves a trace.', 175, '[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":1}]', 9005),
    ('Titan Specimen', 'Roll a specimen weighing at least 15x its catalog base weight.', 'The far end of the weight curve.', 40, '[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":1}]', 9006),
    ('Quantum Pebble', 'Roll a 1-in-5-million+ gem at no more than 0.40x catalog base weight.', 'Rare enough to treasure, small enough to lose.', 25, '[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":1}]', 9007),
    ('Cursed Common', 'Roll a 1-in-100-or-commoner base gem with mutations worth 1-in-10-million+ odds.', 'The gem is ordinary; everything attached is not.', 100, '[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":1}]', 9008),
    ('Ten-Thousandth Bell', 'Roll a 1-in-100,000+ base gem on an exact multiple of 10,000 lifetime rolls.', 'Some counters ring only rarely.', 75, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9009),
    ('Crown Exhibit', 'Permanently register a specimen with 1-in-50-million+ base rarity.', 'Reserve the central display.', 125, '[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":1}]', 9010),
    ('Twin Abysses', 'Settle both Abandoned Mine and Crystal Caverns at Overdepth 10 or higher.', 'Return from both edges of the map.', 50, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9011),
    ('Cataclysmic Find', 'Roll a mutated 1-in-10-million+ gem weighing at least 7.5x catalog base weight.', 'Three exceptional properties, one specimen.', 50, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9012),
    ('Claimstorm', 'Claim 15 achievement rewards within one ten-minute window.', 'Patience first, then everything at once.', 75, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9013),
    ('Last Dollar', 'Reach $5 billion lifetime earnings, then spend down to $50,000 or less.', 'A fortune remembered rather than held.', 75, '[{"type":"potion","consumableId":"fortune-potion-3","name":"Fortune Potion III","amount":1}]', 9014),
    ('Four Corners', 'Own a Stage 4 node in all four research branches simultaneously.', 'Master every direction.', 40, '[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":1}]', 9015),
    ('Lucky 777', 'Own or register a 1-in-1-million+ specimen with a serial ending in 777.', 'Three digits can make a specimen feel chosen.', 100, '[{"type":"potion","consumableId":"legendary-potion","name":"Legendary Potion","amount":1}]', 9016),
    ('Perfect Arsenal', 'Own a Tier 15 Pickaxe, Tier 12 Boots, and Tier 12 Bag, all at Masterwork V.', 'Nothing left to improve.', 30, '[{"type":"potion","consumableId":"fortune-potion-2","name":"Fortune Potion II","amount":1}]', 9017),
    ('Keeper of Secrets', 'Complete 12 other achievements from this hidden set.', 'One secret points toward another.', 250, '[{"type":"potion","consumableId":"mythic-potion","name":"Mythic Potion","amount":1}]', 9018)
)
insert into public.private_feature_definitions(
  id, feature_kind, name, description, icon, sort_order, enabled,
  requirements, rewards, metadata
)
select md5('hidden-achievements-v2:' || name)::uuid, 'achievement', name,
  description, '◆', sort_order, true,
  jsonb_build_object('type', 'authoritative', 'source', 'hidden-achievements-v2'),
  reward,
  jsonb_build_object(
    'category', 'hidden', 'hidden', true, 'ap', ap, 'target', 1,
    'hint', hint, 'catalogVersion', 'v0.13.0-beta',
    'conditionVersion', 'hidden-achievements-v2'
  )
from hidden_v2;

-- Start the new roll-event set from a clean release boundary. No saved roll or
-- inventory row is deleted.
update public.secret_roll_backfill_config set cutoff_id = 0 where singleton;
delete from public.secret_roll_backfill_state;
delete from public.player_secret_roll_signatures;
delete from public.player_secret_roll_progress;

create or replace function public.accumulate_secret_roll_progress_v1(
  p_history_id bigint,p_player_id uuid,p_gem_name text,p_rarity numeric,
  p_final_weight numeric,p_mutation_ids text[],p_effective_rarity numeric,
  p_raw_luck numeric,p_base_luck numeric,p_roll_number bigint
) returns void language plpgsql security definer set search_path='' as $function$
declare
  base_weight numeric:=0; signature_value text; signature_rows integer:=1;
  mutation_count integer:=cardinality(coalesce(p_mutation_ids,'{}'::text[]));
begin
  select coalesce(g.base_weight,0) into base_weight from public.private_feature_gems g where g.name=p_gem_name;
  if coalesce(p_rarity,0)>=100000 and mutation_count>0 and base_weight>0 then
    signature_value:=md5(coalesce(p_gem_name,'')||'|'||array_to_string(coalesce(p_mutation_ids,'{}'::text[]),',')||'|'||round(coalesce(p_final_weight,0)/base_weight,3)::text);
    insert into public.player_secret_roll_signatures(player_id,signature,first_history_id)
    values(p_player_id,signature_value,p_history_id) on conflict(player_id,signature) do nothing;
    get diagnostics signature_rows=row_count;
  end if;
  insert into public.player_secret_roll_progress(
    player_id,last_history_id,last_gem_name,last_rarity,mutation_occurrences,
    perfect_copy,against_all_odds,pure_fortune,heavyweight_champion,
    pocket_mineral,wrong_side_jackpot,perfect_timing,two_birds
  ) values(
    p_player_id,p_history_id,p_gem_name,coalesce(p_rarity,0),mutation_count,
    signature_value is not null and signature_rows=0,
    coalesce(p_effective_rarity,0)>=10000000000 and greatest(coalesce(p_raw_luck,1),1)<=25,
    coalesce(p_rarity,0)>=50000000 and greatest(coalesce(p_raw_luck,1),1)<=greatest(coalesce(p_base_luck,1),1)*1.25,
    base_weight>0 and coalesce(p_final_weight,0)/base_weight>=15,
    coalesce(p_rarity,0)>=5000000 and base_weight>0 and coalesce(p_final_weight,0)/base_weight<=0.40,
    coalesce(p_rarity,0)<=100 and coalesce(p_effective_rarity,0)/greatest(coalesce(p_rarity,1),1)>=10000000,
    coalesce(p_rarity,0)>=100000 and coalesce(p_roll_number,0)>0 and mod(p_roll_number,10000)=0,
    coalesce(p_rarity,0)>=10000000 and mutation_count>0 and base_weight>0 and coalesce(p_final_weight,0)/base_weight>=7.5
  ) on conflict(player_id) do update set
    mutation_occurrences=public.player_secret_roll_progress.mutation_occurrences+excluded.mutation_occurrences,
    deja_vu=public.player_secret_roll_progress.deja_vu or (
      excluded.last_history_id>public.player_secret_roll_progress.last_history_id
      and excluded.last_gem_name=public.player_secret_roll_progress.last_gem_name
      and excluded.last_rarity>=100000 and public.player_secret_roll_progress.last_rarity>=100000),
    perfect_copy=public.player_secret_roll_progress.perfect_copy or excluded.perfect_copy,
    against_all_odds=public.player_secret_roll_progress.against_all_odds or excluded.against_all_odds,
    pure_fortune=public.player_secret_roll_progress.pure_fortune or excluded.pure_fortune,
    heavyweight_champion=public.player_secret_roll_progress.heavyweight_champion or excluded.heavyweight_champion,
    pocket_mineral=public.player_secret_roll_progress.pocket_mineral or excluded.pocket_mineral,
    wrong_side_jackpot=public.player_secret_roll_progress.wrong_side_jackpot or excluded.wrong_side_jackpot,
    perfect_timing=public.player_secret_roll_progress.perfect_timing or excluded.perfect_timing,
    two_birds=public.player_secret_roll_progress.two_birds or excluded.two_birds,
    last_history_id=greatest(public.player_secret_roll_progress.last_history_id,excluded.last_history_id),
    last_gem_name=case when excluded.last_history_id>public.player_secret_roll_progress.last_history_id then excluded.last_gem_name else public.player_secret_roll_progress.last_gem_name end,
    last_rarity=case when excluded.last_history_id>public.player_secret_roll_progress.last_history_id then excluded.last_rarity else public.player_secret_roll_progress.last_rarity end,
    updated_at=now();
end;
$function$;

alter function public.refresh_player_achievements_v013(uuid)
  rename to refresh_player_achievements_v013_pre_hidden_v2;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  r public.player_secret_roll_progress%rowtype;
  crown boolean := false; twin boolean := false; claimstorm boolean := false;
  last_dollar boolean := false; four_corners boolean := false;
  lucky boolean := false; arsenal boolean := false; secret_count numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then raise exception 'forbidden'; end if;
  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);
  select * into r from public.player_secret_roll_progress where player_id = p_uid;

  select exists(select 1 from public.museum_registrations m where m.player_id=p_uid
    and coalesce(nullif(m.specimen_snapshot->>'rarity','')::numeric,0)>=50000000) into crown;
  select exists(select 1 from public.abandoned_mine_runs x where x.player_id=p_uid and x.status='settled' and x.overdepth>=10)
    and exists(select 1 from public.crystal_cavern_runs x where x.player_id=p_uid and x.status='settled' and x.overdepth>=10) into twin;
  select exists(select 1 from public.private_feature_progress first_claim where first_claim.player_id=p_uid
    and first_claim.reward_granted_at is not null and (select count(*) from public.private_feature_progress nearby
      where nearby.player_id=p_uid and nearby.reward_granted_at between first_claim.reward_granted_at and first_claim.reward_granted_at+interval '10 minutes')>=15) into claimstorm;
  select coalesce(p.lifetime_earnings,0)>=5000000000 and coalesce(p.money,0)<=50000 into last_dollar from public.players p where p.id=p_uid;
  select count(distinct n.branch)=4 into four_corners from public.player_research_purchases q join public.research_nodes n on n.id=q.node_id
    where q.player_id=p_uid and n.enabled and n.stage=4 and n.branch in ('mining','specimen','engineering','exploration');
  select exists(select 1 from public.inventory_gems g where g.player_id=p_uid and g.rarity>=1000000 and mod(g.serial_number,1000)=777)
    or exists(select 1 from public.museum_registrations m where m.player_id=p_uid
      and coalesce(nullif(m.specimen_snapshot->>'rarity','')::numeric,0)>=1000000
      and mod(nullif(m.specimen_snapshot->>'serial_number','')::bigint,1000)=777) into lucky;
  select coalesce(max(e.tier) filter(where e.category='pickaxe' and e.masterwork_level>=5),0)>=15
    and coalesce(max(e.tier) filter(where e.category='boots' and e.masterwork_level>=5),0)>=12
    and coalesce(max(e.tier) filter(where e.category='bag' and e.masterwork_level>=5),0)>=12 into arsenal
    from public.player_equipment e where e.player_id=p_uid;

  perform public.achievement_set_progress_v013(p_uid,'Echo in Stone',case when coalesce(r.deja_vu,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Impossibly Familiar',case when coalesce(r.perfect_copy,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Low-Luck Miracle',case when coalesce(r.against_all_odds,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Natural Wonder',case when coalesce(r.pure_fortune,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Mutation Singularity',coalesce(r.mutation_occurrences,0),10000);
  perform public.achievement_set_progress_v013(p_uid,'Titan Specimen',case when coalesce(r.heavyweight_champion,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Quantum Pebble',case when coalesce(r.pocket_mineral,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Cursed Common',case when coalesce(r.wrong_side_jackpot,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Ten-Thousandth Bell',case when coalesce(r.perfect_timing,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Crown Exhibit',case when crown then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Twin Abysses',case when twin then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Cataclysmic Find',case when coalesce(r.two_birds,false) then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Claimstorm',case when claimstorm then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Last Dollar',case when last_dollar then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Four Corners',case when four_corners then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Lucky 777',case when lucky then 1 else 0 end,1);
  perform public.achievement_set_progress_v013(p_uid,'Perfect Arsenal',case when arsenal then 1 else 0 end,1);
  select count(*) into secret_count from public.private_feature_progress p join public.private_feature_definitions d on d.id=p.feature_id
    where p.player_id=p_uid and p.completed and d.metadata->>'conditionVersion'='hidden-achievements-v2' and d.name<>'Keeper of Secrets';
  perform public.achievement_set_progress_v013(p_uid,'Keeper of Secrets',secret_count,12);
end;
$function$;

-- Removing the old definitions cascades their progress ledgers. Rebuild AP for
-- every player, which also reverses AP from old secrets that had been claimed.
insert into public.player_achievement_profiles(player_id, achievement_points, updated_at)
select p.id, coalesce(sum(progress.achievement_points_awarded),0)::integer, now()
from public.players p left join public.private_feature_progress progress on progress.player_id=p.id
group by p.id
on conflict(player_id) do update set achievement_points=excluded.achievement_points,updated_at=excluded.updated_at;

revoke all on function public.refresh_player_achievements_v013(uuid) from public,anon,authenticated;
grant execute on function public.refresh_player_achievements_v013(uuid) to service_role;
revoke all on function public.accumulate_secret_roll_progress_v1(bigint,uuid,text,numeric,numeric,text[],numeric,numeric,numeric,bigint) from public,anon,authenticated;
grant execute on function public.accumulate_secret_roll_progress_v1(bigint,uuid,text,numeric,numeric,text[],numeric,numeric,numeric,bigint) to service_role;

commit;
