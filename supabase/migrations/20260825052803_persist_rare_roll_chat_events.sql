-- Persist qualifying rolls at write time so global chat history can read a
-- small, indexed event feed instead of reconstructing it from roll history.

create table if not exists public.rare_roll_chat_events (
  id bigserial primary key,
  source_type text not null,
  source_id bigint,
  player_id uuid not null,
  username text not null,
  gem_name text not null,
  rarity numeric not null,
  effective_rarity numeric not null,
  mutation_ids text[] not null default '{}'::text[],
  base_luck numeric,
  created_at timestamptz not null default now()
);

alter table public.rare_roll_chat_events enable row level security;

create index if not exists rare_roll_chat_events_created_idx
  on public.rare_roll_chat_events (created_at desc, id desc);

create unique index if not exists rare_roll_chat_events_source_unique
  on public.rare_roll_chat_events (source_type, source_id)
  where source_id is not null;

revoke all on table public.rare_roll_chat_events from anon, authenticated;

-- Preserve existing history when this migration is applied to a database that
-- has not already received the dedicated-feed backfill.
insert into public.rare_roll_chat_events (
  source_type,
  source_id,
  player_id,
  username,
  gem_name,
  rarity,
  effective_rarity,
  mutation_ids,
  base_luck,
  created_at
)
select
  'history',
  h.id,
  h.player_id,
  h.username,
  h.gem_name,
  h.rarity,
  greatest(
    1,
    h.rarity * public.get_mutation_chance_product(
      coalesce(h.mutation_ids, '{}'::text[])
    )
  ),
  coalesce(h.mutation_ids, '{}'::text[]),
  h.base_luck,
  h.created_at
from public.best_roll_history h
where h.rarity >= 1000000
   or (
     cardinality(coalesce(h.mutation_ids, '{}'::text[])) > 0
     and h.rarity * public.get_mutation_chance_product(
       coalesce(h.mutation_ids, '{}'::text[])
     ) >= 100000000
   )
on conflict (source_type, source_id) where source_id is not null do nothing;

create or replace function public.get_rare_roll_chat_history(
  p_limit integer default 100
)
returns table(
  id bigint,
  player_id uuid,
  username text,
  title text,
  title_color text,
  gem_name text,
  rarity numeric,
  effective_rarity numeric,
  mutation_ids text[],
  base_luck numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  select
    e.id,
    e.player_id,
    e.username,
    coalesce(t.title, '') as title,
    coalesce(t.color, '#ffd166') as title_color,
    e.gem_name,
    e.rarity,
    e.effective_rarity,
    e.mutation_ids,
    e.base_luck,
    e.created_at
  from public.rare_roll_chat_events e
  left join public.player_titles t on t.player_id = e.player_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer)
  to anon, authenticated;

-- The normal roll Edge Function already calls this RPC exactly once after the
-- specimen is committed. Keep the leaderboard, Gems Found score, and rare-chat
-- event in one transaction so a qualifying roll cannot be partially recorded.
create or replace function public.record_roll_leaderboard_entry(
  p_player_id uuid,
  p_username text,
  p_gem_name text,
  p_rarity numeric,
  p_final_weight numeric,
  p_value numeric,
  p_mutation_id text,
  p_mutation_ids text[],
  p_mutation_multiplier numeric,
  p_raw_luck numeric,
  p_base_luck numeric,
  p_roll_number bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_score numeric;
  v_history_id bigint;
  v_history_created_at timestamptz;
  v_effective_rarity numeric;
  v_rare_event_id bigint;
begin
  if p_player_id is null then
    raise exception 'player_not_found';
  end if;

  if coalesce(p_rarity, 0) <= 0 then
    return jsonb_build_object('recorded', false, 'relic', true);
  end if;

  insert into public.best_roll_history (
    player_id,
    username,
    gem_name,
    rarity,
    final_weight,
    value,
    mutation_id,
    mutation_ids,
    mutation_multiplier,
    raw_luck,
    base_luck,
    roll_number
  ) values (
    p_player_id,
    coalesce(p_username, p_player_id::text),
    p_gem_name,
    p_rarity,
    coalesce(p_final_weight, 0),
    coalesce(p_value, 0),
    p_mutation_id,
    coalesce(p_mutation_ids, '{}'::text[]),
    coalesce(p_mutation_multiplier, 1),
    greatest(0.000001, coalesce(p_raw_luck, 1)),
    greatest(0.000001, coalesce(p_base_luck, 1)),
    p_roll_number
  )
  returning id, created_at into v_history_id, v_history_created_at;

  update public.players
  set gems_found_score = coalesce(gems_found_score, 0) + greatest(0, p_rarity)
  where id = p_player_id
  returning gems_found_score into v_score;

  if not found then
    raise exception 'player_not_found';
  end if;

  v_effective_rarity := greatest(
    1,
    p_rarity * public.get_mutation_chance_product(
      coalesce(p_mutation_ids, '{}'::text[])
    )
  );

  if p_rarity >= 1000000
     or (
       cardinality(coalesce(p_mutation_ids, '{}'::text[])) > 0
       and v_effective_rarity >= 100000000
     ) then
    insert into public.rare_roll_chat_events (
      source_type,
      source_id,
      player_id,
      username,
      gem_name,
      rarity,
      effective_rarity,
      mutation_ids,
      base_luck,
      created_at
    ) values (
      'history',
      v_history_id,
      p_player_id,
      coalesce(p_username, p_player_id::text),
      p_gem_name,
      p_rarity,
      v_effective_rarity,
      coalesce(p_mutation_ids, '{}'::text[]),
      greatest(0.000001, coalesce(p_base_luck, 1)),
      v_history_created_at
    )
    on conflict (source_type, source_id) where source_id is not null do nothing
    returning id into v_rare_event_id;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'gemsFoundScore', v_score,
    'rareChatEventId', v_rare_event_id
  );
end;
$function$;

revoke all on function public.record_roll_leaderboard_entry(
  uuid,text,text,numeric,numeric,numeric,text,text[],numeric,numeric,numeric,bigint
) from public;
grant execute on function public.record_roll_leaderboard_entry(
  uuid,text,text,numeric,numeric,numeric,text,text[],numeric,numeric,numeric,bigint
) to service_role;
