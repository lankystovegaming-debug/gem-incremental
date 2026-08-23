begin;

-- Final title visibility hardening.
-- The title is stored in both player_titles and players so every reader has
-- a durable fallback, while the public RPC remains the single read path.
alter table public.players
  add column if not exists display_title text not null default ''
  check (char_length(display_title) <= 40);

alter table public.players
  add column if not exists display_title_color text not null default '#ffd166'
  check (display_title_color ~ '^#[0-9A-Fa-f]{6}$');

create table if not exists public.player_titles (
  player_id uuid primary key references public.players(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  color text not null default '#ffd166' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.player_titles enable row level security;
revoke all on public.player_titles from anon, authenticated;
grant all on public.player_titles to service_role;

-- Backfill either direction so old title records cannot disappear from the
-- player fallback after an admin update.
update public.players p
set display_title = t.title,
    display_title_color = t.color
from public.player_titles t
where t.player_id = p.id
  and (coalesce(p.display_title,'') = '' or p.display_title_color = '#ffd166');

create or replace function public.get_public_player_titles(p_user_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    jsonb_object_agg(
      p.id::text,
      jsonb_build_object(
        'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
        'title_color', coalesce(
          nullif(t.color,''),
          nullif(p.display_title_color,''),
          '#ffd166'
        )
      )
    ),
    '{}'::jsonb
  )
  from public.players p
  left join public.player_titles t on t.player_id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_public_player_titles(uuid[]) from public;
grant execute on function public.get_public_player_titles(uuid[]) to anon, authenticated;

create or replace function public.get_chat_profiles(p_user_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    jsonb_object_agg(
      p.id::text,
      jsonb_build_object(
        'username', p.username,
        'avatar_url', coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        ),
        'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
        'title_color', coalesce(
          nullif(t.color,''),
          nullif(p.display_title_color,''),
          '#ffd166'
        )
      )
    ),
    '{}'::jsonb
  )
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_chat_profiles(uuid[]) from public;
grant execute on function public.get_chat_profiles(uuid[]) to anon, authenticated;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'id', p.id::text,
      'username', coalesce(nullif(p.username,''), 'Guest Player'),
      'avatar_url', coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ),
      'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
      'title_color', coalesce(
        nullif(t.color,''),
        nullif(p.display_title_color,''),
        '#ffd166'
      ),
      'total_rolls', coalesce(p.total_rolls,0),
      'lifetime_earnings', coalesce(p.lifetime_earnings,0),
      'inventory_count', (
        select count(*) from public.inventory_gems ig
        where ig.player_id = p.id
      ),
      'inventory_capacity', coalesce(p.inventory_capacity,0),
      'rarest_gem_name', p.rarest_gem_name,
      'rarest_gem_rarity', p.rarest_gem_rarity,
      'mutation_luck', coalesce(p.mutation_luck,1),
      'showcase', coalesce(p.showcase,'[]'::jsonb),
      'best_roll', (
        select jsonb_build_object(
          'gem_name',g.gem_name,
          'rarity',g.rarity,
          'final_weight',g.final_weight,
          'value',g.value,
          'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])
        )
        from public.inventory_gems g
        where g.player_id=p.id
        order by g.rarity desc,g.value desc,g.id desc
        limit 1
      )
    )
  end
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = p_user_id;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
