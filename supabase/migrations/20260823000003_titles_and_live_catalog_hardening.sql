begin;

-- Idempotent hardening for player titles and the live mutation catalog.
create table if not exists public.player_titles (
  player_id uuid primary key references public.players(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  color text not null default '#ffd166' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.player_titles enable row level security;
revoke all on public.player_titles from anon, authenticated;
grant all on public.player_titles to service_role;

-- One authoritative batch profile RPC. The client uses this for both normal
-- chat and rare-roll recovery, avoiding a direct read of the protected table.
create or replace function public.get_public_player_titles(p_user_ids uuid[])
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
    'title', coalesce(t.title,''),
    'title_color', coalesce(t.color,'#ffd166')
  )), '{}'::jsonb)
  from public.players p
  left join public.player_titles t on t.player_id=p.id
  where p.id = any(coalesce(p_user_ids,'{}'::uuid[]));
$$;
revoke all on function public.get_public_player_titles(uuid[]) from public;
grant execute on function public.get_public_player_titles(uuid[]) to anon, authenticated;

-- Recreate the public mutation catalog function defensively. It returns all
-- enabled admin-created mutations, including custom IDs, in deterministic order.
create or replace function public.get_public_mutation_catalog()
returns table(id text,name text,chance numeric,multiplier numeric,description text,icon text,color text,enabled boolean,sort_order integer,updated_at timestamptz)
language sql stable security definer set search_path=public
as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,m.icon,m.color,m.enabled,m.sort_order,m.updated_at
  from public.game_mutations m
  where m.enabled = true
  order by m.sort_order asc,m.name asc,m.id asc;
$$;
revoke all on function public.get_public_mutation_catalog() from public;
grant execute on function public.get_public_mutation_catalog() to anon, authenticated;

-- Keep direct reads as a compatibility fallback for older clients.
alter table public.game_mutations enable row level security;
drop policy if exists game_mutations_enabled_public_read on public.game_mutations;
create policy game_mutations_enabled_public_read on public.game_mutations
  for select to anon, authenticated using (enabled=true);
grant select on public.game_mutations to anon, authenticated;

commit;
