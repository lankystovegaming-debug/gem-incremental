begin;

create table public.player_secret_roll_progress (
  player_id uuid primary key references public.players(id) on delete cascade,
  last_history_id bigint not null default 0,
  last_gem_name text,
  last_rarity numeric not null default 0,
  mutation_occurrences bigint not null default 0,
  deja_vu boolean not null default false,
  perfect_copy boolean not null default false,
  against_all_odds boolean not null default false,
  pure_fortune boolean not null default false,
  heavyweight_champion boolean not null default false,
  pocket_mineral boolean not null default false,
  wrong_side_jackpot boolean not null default false,
  perfect_timing boolean not null default false,
  two_birds boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.player_secret_roll_signatures (
  player_id uuid not null references public.players(id) on delete cascade,
  signature text not null,
  first_history_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (player_id, signature)
);

create table public.secret_roll_backfill_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  cutoff_id bigint not null,
  cursor_id bigint not null default 0,
  previous_gem_name text,
  previous_rarity numeric not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.secret_roll_backfill_config (
  singleton boolean primary key default true check(singleton),
  cutoff_id bigint not null
);
insert into public.secret_roll_backfill_config(singleton, cutoff_id)
values(true, coalesce((select max(id) from public.best_roll_history), 0));

alter table public.player_secret_roll_progress enable row level security;
alter table public.player_secret_roll_signatures enable row level security;
alter table public.secret_roll_backfill_state enable row level security;
alter table public.secret_roll_backfill_config enable row level security;
revoke all on public.player_secret_roll_progress,
  public.player_secret_roll_signatures,
  public.secret_roll_backfill_state,
  public.secret_roll_backfill_config from public, anon, authenticated;
grant all on public.player_secret_roll_progress,
  public.player_secret_roll_signatures,
  public.secret_roll_backfill_state,
  public.secret_roll_backfill_config to service_role;

create or replace function public.accumulate_secret_roll_progress_v1(
  p_history_id bigint,
  p_player_id uuid,
  p_gem_name text,
  p_rarity numeric,
  p_final_weight numeric,
  p_mutation_ids text[],
  p_effective_rarity numeric,
  p_raw_luck numeric,
  p_base_luck numeric,
  p_roll_number bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_weight numeric := 0;
  signature_value text;
  signature_rows integer := 1;
  mutation_count integer := cardinality(coalesce(p_mutation_ids, '{}'::text[]));
begin
  select coalesce(gem.base_weight, 0) into base_weight
  from public.private_feature_gems gem where gem.name = p_gem_name;

  if coalesce(p_rarity, 0) >= 10000 and mutation_count > 0 and base_weight > 0 then
    signature_value := md5(
      coalesce(p_gem_name, '') || '|' ||
      array_to_string(coalesce(p_mutation_ids, '{}'::text[]), ',') || '|' ||
      round(coalesce(p_final_weight, 0) / base_weight, 2)::text
    );
    insert into public.player_secret_roll_signatures(player_id, signature, first_history_id)
    values(p_player_id, signature_value, p_history_id)
    on conflict(player_id, signature) do nothing;
    get diagnostics signature_rows = row_count;
  end if;

  insert into public.player_secret_roll_progress(
    player_id, last_history_id, last_gem_name, last_rarity,
    mutation_occurrences, perfect_copy, against_all_odds, pure_fortune,
    heavyweight_champion, pocket_mineral, wrong_side_jackpot,
    perfect_timing, two_birds
  ) values (
    p_player_id, p_history_id, p_gem_name, coalesce(p_rarity, 0),
    mutation_count,
    signature_value is not null and signature_rows = 0,
    coalesce(p_effective_rarity, 0) >= 1000000000 and greatest(coalesce(p_raw_luck, 1), 1) <= 50,
    coalesce(p_rarity, 0) >= 10000000
      and greatest(coalesce(p_raw_luck, 1), 1) <= greatest(coalesce(p_base_luck, 1), 1) * 1.5,
    base_weight > 0 and coalesce(p_final_weight, 0) / base_weight >= 10,
    coalesce(p_rarity, 0) >= 1000000 and base_weight > 0
      and coalesce(p_final_weight, 0) / base_weight <= 0.55,
    coalesce(p_rarity, 0) <= 100
      and coalesce(p_effective_rarity, 0) / greatest(coalesce(p_rarity, 1), 1) >= 1000000,
    coalesce(p_rarity, 0) >= 10000 and coalesce(p_roll_number, 0) > 0
      and mod(p_roll_number, 1000) = 0,
    coalesce(p_rarity, 0) >= 1000000 and mutation_count > 0
      and base_weight > 0 and coalesce(p_final_weight, 0) / base_weight >= 5
  )
  on conflict(player_id) do update set
    mutation_occurrences = public.player_secret_roll_progress.mutation_occurrences
      + excluded.mutation_occurrences,
    deja_vu = public.player_secret_roll_progress.deja_vu or (
      excluded.last_history_id > public.player_secret_roll_progress.last_history_id
      and excluded.last_gem_name = public.player_secret_roll_progress.last_gem_name
      and excluded.last_rarity >= 10000
      and public.player_secret_roll_progress.last_rarity >= 10000
    ),
    perfect_copy = public.player_secret_roll_progress.perfect_copy or excluded.perfect_copy,
    against_all_odds = public.player_secret_roll_progress.against_all_odds or excluded.against_all_odds,
    pure_fortune = public.player_secret_roll_progress.pure_fortune or excluded.pure_fortune,
    heavyweight_champion = public.player_secret_roll_progress.heavyweight_champion or excluded.heavyweight_champion,
    pocket_mineral = public.player_secret_roll_progress.pocket_mineral or excluded.pocket_mineral,
    wrong_side_jackpot = public.player_secret_roll_progress.wrong_side_jackpot or excluded.wrong_side_jackpot,
    perfect_timing = public.player_secret_roll_progress.perfect_timing or excluded.perfect_timing,
    two_birds = public.player_secret_roll_progress.two_birds or excluded.two_birds,
    last_history_id = greatest(public.player_secret_roll_progress.last_history_id, excluded.last_history_id),
    last_gem_name = case
      when excluded.last_history_id > public.player_secret_roll_progress.last_history_id then excluded.last_gem_name
      else public.player_secret_roll_progress.last_gem_name end,
    last_rarity = case
      when excluded.last_history_id > public.player_secret_roll_progress.last_history_id then excluded.last_rarity
      else public.player_secret_roll_progress.last_rarity end,
    updated_at = now();
end;
$function$;

create or replace function public.track_secret_roll_progress_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.accumulate_secret_roll_progress_v1(
    new.id, new.player_id, new.gem_name, new.rarity, new.final_weight,
    new.mutation_ids, new.effective_rarity, new.raw_luck, new.base_luck,
    new.roll_number
  );
  return new;
end;
$function$;

drop trigger if exists track_secret_roll_progress_v1_trg on public.best_roll_history;
create trigger track_secret_roll_progress_v1_trg
after insert on public.best_roll_history
for each row execute function public.track_secret_roll_progress_v1();

-- Historical rows are deliberately processed in bounded batches. Calling this
-- function repeatedly never holds an Achievements request open and never
-- double-counts rows written after this migration's cutoff.
create or replace function public.backfill_secret_roll_progress_v1(
  p_player_id uuid,
  p_batch_size integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  state public.secret_roll_backfill_state%rowtype;
  history record;
  processed integer := 0;
  latest_cursor bigint := 0;
  v_previous_name text;
  v_previous_rarity numeric := 0;
begin
  if p_player_id is null then raise exception 'player_not_found'; end if;
  insert into public.secret_roll_backfill_state(player_id, cutoff_id)
  values(p_player_id, (select cutoff_id from public.secret_roll_backfill_config where singleton))
  on conflict(player_id) do nothing;
  select * into state from public.secret_roll_backfill_state
  where player_id = p_player_id for update;
  if state.completed then
    return jsonb_build_object('processed', 0, 'cursor', state.cursor_id, 'done', true);
  end if;
  v_previous_name := state.previous_gem_name;
  v_previous_rarity := state.previous_rarity;
  latest_cursor := state.cursor_id;
  for history in
    select h.* from public.best_roll_history h
    where h.player_id = p_player_id and h.id > state.cursor_id and h.id <= state.cutoff_id
    order by h.id limit greatest(1, least(coalesce(p_batch_size, 5000), 10000))
  loop
    perform public.accumulate_secret_roll_progress_v1(
      history.id, history.player_id, history.gem_name, history.rarity,
      history.final_weight, history.mutation_ids, history.effective_rarity,
      history.raw_luck, history.base_luck, history.roll_number
    );
    if history.gem_name = v_previous_name and history.rarity >= 10000 and v_previous_rarity >= 10000 then
      update public.player_secret_roll_progress set deja_vu = true, updated_at = now()
      where player_id = p_player_id;
    end if;
    v_previous_name := history.gem_name;
    v_previous_rarity := history.rarity;
    latest_cursor := history.id;
    processed := processed + 1;
  end loop;
  update public.secret_roll_backfill_state
  set cursor_id = latest_cursor,
      previous_gem_name = v_previous_name,
      previous_rarity = v_previous_rarity,
      completed = latest_cursor >= cutoff_id or processed = 0,
      updated_at = now()
  where player_id = p_player_id returning * into state;
  return jsonb_build_object(
    'processed', processed, 'cursor', state.cursor_id,
    'cutoff', state.cutoff_id, 'done', state.completed
  );
end;
$function$;

alter function public.refresh_player_achievements_v013(uuid)
  rename to refresh_player_achievements_v013_pre_secret_timeout_fix;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  roll_state public.player_secret_roll_progress%rowtype;
  museum_piece boolean := false;
  difficult_choice boolean := false;
  milestone_cascade boolean := false;
  from_nothing boolean := false;
  full_circle boolean := false;
  chosen_one boolean := false;
  exactly_planned boolean := false;
  other_secrets numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then raise exception 'forbidden'; end if;

  -- Skip the scan-heavy secret wrapper and call the efficient achievement
  -- refresh that immediately preceded it.
  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);
  -- Advance historical recognition by a small, fixed amount. This is bounded
  -- regardless of lifetime-roll count and resumes from its saved cursor.
  perform public.backfill_secret_roll_progress_v1(p_uid, 100);
  select * into roll_state from public.player_secret_roll_progress where player_id = p_uid;

  select exists(select 1 from public.museum_registrations registration
    where registration.player_id = p_uid
      and coalesce(nullif(registration.specimen_snapshot->>'rarity', '')::numeric, 0) >= 10000000)
  into museum_piece;
  select exists(select 1 from public.abandoned_mine_runs run
      where run.player_id = p_uid and run.status = 'settled' and run.overdepth >= 5)
    and exists(select 1 from public.crystal_cavern_runs run
      where run.player_id = p_uid and run.status = 'settled' and run.overdepth >= 5)
  into difficult_choice;
  select exists(select 1 from public.private_feature_progress first_claim
    where first_claim.player_id = p_uid and first_claim.reward_granted_at is not null
      and (select count(*) from public.private_feature_progress nearby
        where nearby.player_id = p_uid
          and nearby.reward_granted_at between first_claim.reward_granted_at
            and first_claim.reward_granted_at + interval '10 minutes') >= 10)
  into milestone_cascade;
  select coalesce(player.lifetime_earnings, 0) >= 1000000000
      and coalesce(player.money, 0) <= 100000
  into from_nothing from public.players player where player.id = p_uid;
  select count(distinct node.branch) = 4 into full_circle
  from public.player_research_purchases purchase
  join public.research_nodes node on node.id = purchase.node_id
  where purchase.player_id = p_uid and node.enabled and node.stage = 4
    and node.branch in ('mining', 'specimen', 'engineering', 'exploration');
  select exists(select 1 from public.inventory_gems gem
      where gem.player_id = p_uid and gem.serial_number > 0
        and mod(gem.serial_number, 1000) = 777 and gem.rarity >= 100000)
    or exists(select 1 from public.museum_registrations registration
      where registration.player_id = p_uid
        and nullif(registration.specimen_snapshot->>'serial_number', '')::bigint > 0
        and mod(nullif(registration.specimen_snapshot->>'serial_number', '')::bigint, 1000) = 777
        and coalesce(nullif(registration.specimen_snapshot->>'rarity', '')::numeric, 0) >= 100000)
  into chosen_one;
  select coalesce(max(equipment.tier) filter(where equipment.category = 'pickaxe' and equipment.masterwork_level >= 5), 0) >= 15
    and coalesce(max(equipment.tier) filter(where equipment.category = 'boots' and equipment.masterwork_level >= 5), 0) >= 12
    and coalesce(max(equipment.tier) filter(where equipment.category = 'bag' and equipment.masterwork_level >= 5), 0) >= 12
  into exactly_planned from public.player_equipment equipment where equipment.player_id = p_uid;

  perform public.achievement_set_progress_v013(p_uid, 'Déjà Vu', case when coalesce(roll_state.deja_vu, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Perfect Copy', case when coalesce(roll_state.perfect_copy, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Against All Odds', case when coalesce(roll_state.against_all_odds, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Pure Fortune', case when coalesce(roll_state.pure_fortune, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Mutation Overflow', coalesce(roll_state.mutation_occurrences, 0), 5000);
  perform public.achievement_set_progress_v013(p_uid, 'Heavyweight Champion', case when coalesce(roll_state.heavyweight_champion, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Pocket Mineral', case when coalesce(roll_state.pocket_mineral, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Wrong Side Jackpot', case when coalesce(roll_state.wrong_side_jackpot, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Perfect Timing', case when coalesce(roll_state.perfect_timing, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Museum Piece', case when museum_piece then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Difficult Choice', case when difficult_choice then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Two Birds', case when coalesce(roll_state.two_birds, false) then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Milestone Cascade', case when milestone_cascade then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'From Nothing', case when from_nothing then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Full Circle', case when full_circle then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Chosen One', case when chosen_one then 1 else 0 end, 1);
  perform public.achievement_set_progress_v013(p_uid, 'Exactly as Planned', case when exactly_planned then 1 else 0 end, 1);

  select count(*) into other_secrets
  from public.private_feature_progress progress
  join public.private_feature_definitions definition on definition.id = progress.feature_id
  where progress.player_id = p_uid and progress.completed and definition.enabled
    and definition.feature_kind = 'achievement'
    and coalesce((definition.metadata->>'hidden')::boolean, false)
    and definition.name <> 'Secret Within Secret';
  perform public.achievement_set_progress_v013(p_uid, 'Secret Within Secret', other_secrets, 12);
end;
$function$;

revoke all on function public.accumulate_secret_roll_progress_v1(bigint,uuid,text,numeric,numeric,text[],numeric,numeric,numeric,bigint),
  public.track_secret_roll_progress_v1(),
  public.backfill_secret_roll_progress_v1(uuid,integer),
  public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.accumulate_secret_roll_progress_v1(bigint,uuid,text,numeric,numeric,text[],numeric,numeric,numeric,bigint),
  public.track_secret_roll_progress_v1(),
  public.backfill_secret_roll_progress_v1(uuid,integer),
  public.refresh_player_achievements_v013(uuid)
  to service_role;

commit;
