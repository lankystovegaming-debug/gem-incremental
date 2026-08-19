-- =========================================================
-- Hidden Upcoming Features: achievements + quests + progression events
-- =========================================================

create table if not exists public.private_feature_definitions (
  id uuid primary key default gen_random_uuid(),
  feature_kind text not null check (feature_kind in ('achievement','quest')),
  quest_type text check (quest_type is null or quest_type in ('main','event','special')),
  name text not null,
  description text not null default '',
  icon text not null default '◆',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  prerequisites uuid[] not null default '{}',
  requirements jsonb not null default '{"all":[]}'::jsonb,
  rewards jsonb not null default '[]'::jsonb,
  unlocks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists private_feature_definitions_kind_idx
  on public.private_feature_definitions(feature_kind, quest_type, enabled, sort_order);

create table if not exists public.private_feature_progress (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  feature_id uuid not null references public.private_feature_definitions(id) on delete cascade,
  current_value numeric not null default 0,
  completed boolean not null default false,
  reward_granted boolean not null default false,
  completed_at timestamptz,
  reward_granted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(player_id, feature_id)
);

create index if not exists private_feature_progress_player_idx
  on public.private_feature_progress(player_id, completed);

create table if not exists public.private_feature_progress_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  event_type text not null,
  roll_number bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists private_feature_events_player_roll_idx
  on public.private_feature_progress_events(player_id, roll_number desc, id desc);

create index if not exists private_feature_events_player_created_idx
  on public.private_feature_progress_events(player_id, created_at desc, id desc);

alter table public.private_feature_definitions enable row level security;
alter table public.private_feature_progress enable row level security;
alter table public.private_feature_progress_events enable row level security;

revoke all on public.private_feature_definitions from anon, authenticated;
revoke all on public.private_feature_progress from anon, authenticated;
revoke all on public.private_feature_progress_events from anon, authenticated;

-- Hidden feature data is intentionally service-role only. The private-feature
-- Edge Function performs all reads/writes after the password + admin/owner gate.

create or replace function public.apply_private_feature_currency_reward(
  p_player_id uuid,
  p_money numeric default 0,
  p_coins bigint default 0,
  p_capacity integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players%rowtype;
begin
  update public.players
  set money = greatest(0, money + coalesce(p_money, 0)),
      coins = greatest(0, coins + coalesce(p_coins, 0)),
      inventory_capacity = greatest(0, inventory_capacity + coalesce(p_capacity, 0))
  where id = p_player_id
  returning * into v_player;

  if not found then raise exception 'player_not_found'; end if;
  return jsonb_build_object('money', v_player.money, 'coins', v_player.coins, 'inventory_capacity', v_player.inventory_capacity);
end;
$$;

revoke all on function public.apply_private_feature_currency_reward(uuid,numeric,bigint,integer) from public;
grant execute on function public.apply_private_feature_currency_reward(uuid,numeric,bigint,integer) to service_role;
