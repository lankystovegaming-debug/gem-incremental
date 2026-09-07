-- Month One: deploy BEFORE 2026-09-07 16:00 UTC. No late baseline is truthful.
-- Source verified against igrddscmrdrrwtvyspbf on 2026-09-07 (roll v137).
begin;
set local lock_timeout = '5s';
create schema if not exists month_one_private;
revoke all on schema month_one_private from public, anon, authenticated;

create function month_one_private.cutoff() returns timestamptz
language sql immutable set search_path = '' as $$ select '2026-09-07 16:00:00+00'::timestamptz $$;

do $$ begin
  if clock_timestamp() >= month_one_private.cutoff() then
    raise exception 'Month One capture must be installed before cutoff; restore a verified cutoff backup instead of seeding current counters.';
  end if;
end $$;

create table month_one_private.sources (
  source text not null,
  key text not null,
  data jsonb not null,
  primary key (source, key)
);
create table month_one_private.records (
  player_id uuid not null,
  category text not null,
  score numeric not null,
  rarity numeric not null,
  occurred_at timestamptz not null,
  source_id bigint not null,
  data jsonb not null,
  primary key (player_id, category)
);
create table month_one_private.cache (
  singleton boolean primary key default true check (singleton),
  generated_at timestamptz not null,
  final boolean not null,
  payload jsonb not null
);
alter table month_one_private.sources enable row level security;
alter table month_one_private.records enable row level security;
alter table month_one_private.cache enable row level security;

-- Shared transaction locks let finalization wait for every in-flight capture.
-- The clock is sampled after acquiring the lock, never from the browser or now().
create function month_one_private.capture_source() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; row_key text;
begin
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  perform pg_advisory_xact_lock_shared(7012026, 1);
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_key := row_data ->> tg_argv[0];
  if tg_op = 'DELETE' then
    delete from month_one_private.sources where source = tg_table_name and key = row_key;
  else
    insert into month_one_private.sources values (tg_table_name, row_key, row_data)
    on conflict (source, key) do update set data = excluded.data;
  end if;
  return null;
end $$;

-- This is the EXACT deployed get_raw_rare_roll_leaderboard score and tie order.
create function month_one_private.candidates(h jsonb, weight_only boolean default false)
returns table(category text, score numeric, rarity numeric, occurred_at timestamptz, source_id bigint, data jsonb)
language sql immutable set search_path = '' as $$
  with parsed as (
    select coalesce((h->>'rarity')::numeric, (h->>'base_rarity')::numeric, 0) r,
      greatest(0.000001::numeric, coalesce((h->>'raw_luck')::numeric, 1::numeric)) luck,
      coalesce(nullif(h->'mutation_ids','null'::jsonb),'[]'::jsonb) mutations
  )
  select c.category, c.score, p.r, (h->>'created_at')::timestamptz, (h->>'id')::bigint,
    jsonb_build_object('gem', h->>'gem_name', 'rarity', p.r,
      'luck', (h->>'raw_luck')::numeric, 'mutations', p.mutations,
      'value', (h->>'value')::numeric, 'weight', (h->>'final_weight')::numeric,
      'rawRarity', greatest(1::numeric, p.r / p.luck),
      'at', h->>'created_at', 'recorded', true)
  from parsed p cross join lateral (values
    ('displayed', p.r, not weight_only),
    ('raw', greatest(1::numeric, p.r / p.luck), not weight_only),
    ('value', coalesce((h->>'value')::numeric,0), not weight_only),
    ('mutations', jsonb_array_length(p.mutations)::numeric, not weight_only),
    ('combo', coalesce((h->>'effective_rarity')::numeric / nullif(p.r,0),1), not weight_only),
    ('weight', coalesce((h->>'final_weight')::numeric,0), weight_only)
  ) c(category,score,enabled)
  where c.enabled and (c.category not in ('mutations','combo') or jsonb_array_length(p.mutations)>0) and p.r > 0 and h->>'gem_name' not in ('Enchant Relic','Ancient Relic');
$$;

create function month_one_private.capture_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  perform pg_advisory_xact_lock_shared(7012026, 1);
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  if new.created_at < '2026-08-06 16:00:00+00'::timestamptz or new.created_at >= month_one_private.cutoff() then return null; end if;
  insert into month_one_private.records
  select new.player_id, c.* from month_one_private.candidates(to_jsonb(new), tg_table_name='roll_weight_history') c
  on conflict (player_id,category) do update set
    score=excluded.score, rarity=excluded.rarity, occurred_at=excluded.occurred_at,
    source_id=excluded.source_id, data=excluded.data
  where (excluded.score,excluded.rarity,excluded.occurred_at,excluded.source_id) >
    (records.score,records.rarity,records.occurred_at,records.source_id);
  return null;
end $$;

-- Lock source writes during baseline + trigger installation, avoiding a capture gap.
lock table public.players, public.bank_accounts, public.system_account_exclusions,
  public.minigame_scores, public.best_roll_history, public.roll_weight_history in share row exclusive mode;

do $$ declare t text; k text; begin
  for t,k in select * from (values ('players','id'),('bank_accounts','player_id'),
    ('system_account_exclusions','player_id'),('minigame_scores','run_id')) x(t,k)
  loop
    execute format('insert into month_one_private.sources select %L, %I::text, to_jsonb(s) from public.%I s',t,k,t);
    execute format('create trigger month_one_capture after insert or update or delete on public.%I for each row execute function month_one_private.capture_source(%L)',t,k);
  end loop;
end $$;

-- Sort narrow native columns first, then turn only the winning rows into JSON.
-- Also reused for rare administrative corrections/deletions of existing history.
create function month_one_private.rebuild_records(p_player uuid default null, p_weight boolean default false)
returns void language plpgsql set search_path = '' as $$
declare category_name text; score_sql text; table_name text; rarity_sql text;
begin
  table_name := case when p_weight then 'roll_weight_history' else 'best_roll_history' end;
  rarity_sql := case when p_weight then 'h.base_rarity' else 'h.rarity' end;
  delete from month_one_private.records
  where (p_player is null or player_id=p_player) and ((category='weight')=p_weight);
  for category_name,score_sql in select * from (values
    ('displayed','h.rarity',false),
    ('raw','greatest(1::numeric,h.rarity/greatest(0.000001::numeric,coalesce(h.raw_luck,1::numeric)))',false),
    ('value','coalesce(h.value,0)',false),
    ('mutations','cardinality(coalesce(h.mutation_ids,ARRAY[]::text[]))',false),
    ('combo','coalesce(h.effective_rarity/nullif(h.rarity,0),1)',false),
    ('weight','coalesce(h.final_weight,0)',true)
  ) c(category,score,weight_only) where weight_only=p_weight loop
    execute format($query$
      insert into month_one_private.records
      select h.player_id,c.* from (
        select distinct on(h.player_id) h.id,h.player_id,%s score,%s rarity,h.created_at
        from public.%I h where ($1 is null or h.player_id=$1)
          and h.created_at >= '2026-08-06 16:00:00+00' and h.created_at < month_one_private.cutoff()
          and %s>0 and h.gem_name not in ('Enchant Relic','Ancient Relic')
        order by h.player_id,score desc,rarity desc,h.created_at desc,h.id desc
      ) winner join public.%I h on h.id=winner.id
      cross join lateral month_one_private.candidates(to_jsonb(h),$2) c
      where c.category=$3
    $query$,score_sql,rarity_sql,table_name,rarity_sql,table_name)
    using p_player,p_weight,category_name;
  end loop;
end $$;
select month_one_private.rebuild_records();
select month_one_private.rebuild_records(null,true);

create function month_one_private.correct_record() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  perform pg_advisory_xact_lock_shared(7012026,1);
  if clock_timestamp() >= month_one_private.cutoff() then return null; end if;
  perform month_one_private.rebuild_records(old.player_id,tg_table_name='roll_weight_history');
  if tg_op='UPDATE' and new.player_id is distinct from old.player_id then
    perform month_one_private.rebuild_records(new.player_id,tg_table_name='roll_weight_history');
  end if;
  return null;
end $$;
create trigger month_one_record_correction after update or delete on public.best_roll_history
for each row execute function month_one_private.correct_record();
create trigger month_one_weight_correction after update or delete on public.roll_weight_history
for each row execute function month_one_private.correct_record();
create trigger month_one_record after insert on public.best_roll_history
for each row execute function month_one_private.capture_record();
create trigger month_one_weight after insert on public.roll_weight_history
for each row execute function month_one_private.capture_record();

create function month_one_private.build() returns jsonb
language sql stable set search_path = '' as $$
with eligible as materialized (
  select s.key::uuid id, s.data->>'username' username, (s.data->>'created_at')::timestamptz joined,
    coalesce((s.data->>'total_rolls')::numeric,0) rolls,
    coalesce((s.data->>'lifetime_earnings')::numeric,0) earned,
    coalesce((s.data->>'lifetime_money_burned')::numeric,0) burned,
    coalesce((s.data->>'money')::numeric,0) money,
    s.data->>'rarest_gem_name' rarest_gem,
    coalesce((s.data->>'rarest_gem_rarity')::numeric,0) rarest_rarity
  from month_one_private.sources s
  where s.source='players' and s.data->>'username' is not null
    and not coalesce((s.data->>'leaderboard_hidden')::boolean,false)
    and (s.data->>'created_at')::timestamptz < month_one_private.cutoff()
    and not exists (select 1 from month_one_private.sources e
      where e.source='system_account_exclusions' and e.key=s.key)
), ranked as materialized (
  select e.*, rank() over(order by rolls desc) roll_rank,
    rank() over(order by earned desc) earnings_rank,
    row_number() over(order by joined,id) join_number,
    count(*) over() population from eligible e
), records as materialized (
  select r.*, e.username, r.data || jsonb_build_object('username',e.username,'score',r.score) card
  from month_one_private.records r join eligible e on e.id=r.player_id
), games as materialized (
  select s.data->>'game' game, s.data->>'player_id' player_id,
    (s.data->>'score')::numeric score, (s.data->>'tie1')::numeric tie1,
    (s.data->>'tie2')::numeric tie2, s.data->>'achieved_at' achieved_at, s.key run_id, e.username
  from month_one_private.sources s join eligible e on e.id::text=s.data->>'player_id'
  where s.source='minigame_scores'
    and (s.data->>'achieved_at')::timestamptz >= '2026-08-06 16:00:00+00'
    and (s.data->>'achieved_at')::timestamptz < month_one_private.cutoff()
), game_bests as (
  select distinct on(game,player_id) * from games
  order by game,player_id,score desc,tie1 desc,tie2 desc,achieved_at,run_id
), game_rankings as (
  select *,row_number() over(partition by game order by score desc,tie1 desc,tie2 desc,achieved_at,run_id) ranking,
    count(*) over(partition by game) participants from game_bests
), totals as (
  select count(*) players, coalesce(sum(rolls),0) rolls, coalesce(sum(earned),0) earned,
    coalesce(sum(burned),0) burned, coalesce(sum(money),0) money,
    coalesce(percentile_cont(0.5) within group(order by rolls),0) median_rolls,
    count(*) filter(where rolls>=1000) rollers_1k,
    count(*) filter(where rolls>=10000) rollers_10k,
    count(*) filter(where rolls>=100000) rollers_100k,
    count(*) filter(where rarest_rarity>=1000000) finds_1m,
    count(*) filter(where rarest_rarity>=10000000) finds_10m,
    count(*) filter(where rarest_rarity>=100000000) finds_100m
  from eligible
)
select jsonb_build_object(
  'global', jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'topRollers', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from
      (select username,rolls,roll_rank from ranked order by rolls desc,id limit 10) t),
    'topTenShare', (select coalesce(100*sum(rolls)/nullif((select rolls from totals),0),0)
      from (select rolls from eligible order by rolls desc limit 10) t),
    'banked', (select coalesce(sum((s.data->>'balance')::numeric),0) from month_one_private.sources s
      join eligible e on e.id::text=s.key where s.source='bank_accounts'),
    'highestDisplayed', (select jsonb_build_object('username',e.username,'gem',e.rarest_gem,
      'rarity',e.rarest_rarity,'luck',case when r.rarity=e.rarest_rarity then r.data->'luck' else null end)
      from eligible e left join records r on r.player_id=e.id and r.category='displayed'
      where e.rarest_rarity>0 order by e.rarest_rarity desc,e.id limit 1),
    'records', (select coalesce(jsonb_object_agg(category,card),'{}') from
      (select distinct on(category) category,card from records
       order by category,score desc,rarity desc,occurred_at desc,source_id desc) t),
    'discoveries', (select coalesce(jsonb_agg(card),'[]') from
      (select card from records where category='displayed' order by score desc,occurred_at desc limit 5) t),
    'minigameRuns', (select count(*) from games),
    'minigamePlayers', (select count(distinct player_id) from games),
    'richest', (select jsonb_build_object('username',username,'money',money) from eligible order by money desc,id limit 1),
    'minigames', (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from
      (select game,count(*) runs,count(distinct player_id) players,
       case when game='minesweeper' then null else (array_agg(username order by score desc,tie1 desc,tie2 desc,achieved_at,run_id))[1] end best_player,
       case when game='minesweeper' then null else max(score) end best_score
       from games group by game order by count(*) desc,game) t)
  ),
  'personal', (select coalesce(jsonb_object_agg(e.id::text,jsonb_build_object(
    'username',e.username,'joined',e.joined,'joinNumber',e.join_number,
    'rolls',e.rolls,'earned',e.earned,'burned',e.burned,'population',e.population,
    'rollRank',e.roll_rank,'earningsRank',e.earnings_rank,
    'rollTopPercent',ceil(100.0*e.roll_rank/nullif(e.population,0)),
    'earningsTopPercent',ceil(100.0*e.earnings_rank/nullif(e.population,0)),
    'rollShare',coalesce(100*e.rolls/nullif((select rolls from totals),0),0),
    'highestDisplayed',jsonb_build_object('gem',e.rarest_gem,'rarity',e.rarest_rarity,
      'luck',(select data->'luck' from records where player_id=e.id and category='displayed' and rarity=e.rarest_rarity)),
    'records',(select coalesce(jsonb_object_agg(category,card),'{}') from records where player_id=e.id),
    'minigames',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from
      (select g.game,count(*) runs,case when g.game='minesweeper' then null else max(g.score) end best_score,
        (select ranking from game_rankings gr where gr.game=g.game and gr.player_id=e.id::text) rank,
        (select participants from game_rankings gr where gr.game=g.game and gr.player_id=e.id::text) participants
       from games g where g.player_id=e.id::text group by g.game order by count(*) desc,g.game) t)
  )),'{}') from ranked e)
);
$$;

-- Only this narrow API is exposed. No player id parameter; private recap derives
-- from the validated JWT. Shared cache never leaves the DB with other profiles.
create function public.get_month_one_recap() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cached month_one_private.cache; server_time timestamptz := clock_timestamp();
begin
  select * into cached from month_one_private.cache where singleton;
  if cached.singleton is null or (not cached.final and
     (server_time >= month_one_private.cutoff() or cached.generated_at <= server_time-interval '45 seconds')) then
    perform pg_advisory_xact_lock(7012026,2);
    server_time := clock_timestamp();
    select * into cached from month_one_private.cache where singleton;
    if cached.singleton is null or (not cached.final and
       (server_time >= month_one_private.cutoff() or cached.generated_at <= server_time-interval '45 seconds')) then
      if server_time >= month_one_private.cutoff() then
        perform pg_advisory_xact_lock(7012026,1);
      end if;
      insert into month_one_private.cache values(true,server_time,
        server_time>=month_one_private.cutoff(),month_one_private.build())
      on conflict(singleton) do update set generated_at=excluded.generated_at,
        final=excluded.final,payload=excluded.payload returning * into cached;
    end if;
  end if;
  return jsonb_build_object('status',case when cached.final then 'final' else 'live' end,
    'serverTime',server_time,'asOf',least(cached.generated_at,month_one_private.cutoff()),
    'cutoff',month_one_private.cutoff(),'refreshSeconds',case when cached.final then null else 45 end,
    'global',cached.payload->'global','personal',cached.payload->'personal'->(auth.uid()::text));
end $$;
revoke all on all functions in schema month_one_private from public,anon,authenticated;
revoke all on function public.get_month_one_recap() from public;
grant execute on function public.get_month_one_recap() to anon,authenticated;
-- Fail atomically if the baseline installation itself crossed midnight.
do $$ begin
  if clock_timestamp() >= month_one_private.cutoff() then raise exception 'Capture installation crossed cutoff; transaction rolled back.'; end if;
end $$;
commit;
