begin;

-- Runtime-hardening: store a title directly on players as a durable fallback.
-- This avoids title visibility depending on a separate protected table.
alter table public.players
  add column if not exists display_title text not null default ''
  check (char_length(display_title) <= 40);

alter table public.players
  add column if not exists display_title_color text not null default '#ffd166'
  check (display_title_color ~ '^#[0-9A-Fa-f]{6}$');

-- Backfill the player columns from the title table when it already exists.
update public.players p
set display_title = t.title,
    display_title_color = t.color
from public.player_titles t
where t.player_id = p.id
  and coalesce(p.display_title,'') = '';

-- Single authoritative title reader with a players-column fallback.
create or replace function public.get_public_player_titles(p_user_ids uuid[])
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
    'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
    'title_color', coalesce(nullif(t.color,''), nullif(p.display_title_color,''), '#ffd166')
  )), '{}'::jsonb)
  from public.players p
  left join public.player_titles t on t.player_id=p.id
  where p.id = any(coalesce(p_user_ids,'{}'::uuid[]));
$$;
revoke all on function public.get_public_player_titles(uuid[]) from public;
grant execute on function public.get_public_player_titles(uuid[]) to anon, authenticated;

-- Rebuild the public chat/profile readers to use the same fallback.
create or replace function public.get_chat_profiles(p_user_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
    'username', p.username,
    'avatar_url', coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
    'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
    'title_color', coalesce(nullif(t.color,''), nullif(p.display_title_color,''), '#ffd166')
  )), '{}'::jsonb)
  from public.players p
  left join auth.users u on u.id=p.id
  left join public.player_titles t on t.player_id=p.id
  where p.id=any(coalesce(p_user_ids,'{}'::uuid[]));
$$;
revoke all on function public.get_chat_profiles(uuid[]) from public;
grant execute on function public.get_chat_profiles(uuid[]) to anon, authenticated;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id::text,
    'username',coalesce(nullif(p.username,''),'Guest Player'),
    'avatar_url',coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
    'title',coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
    'title_color',coalesce(nullif(t.color,''), nullif(p.display_title_color,''), '#ffd166'),
    'total_rolls',coalesce(p.total_rolls,0),
    'lifetime_earnings',coalesce(p.lifetime_earnings,0),
    'inventory_count',(select count(*) from public.inventory_gems ig where ig.player_id=p.id),
    'inventory_capacity',coalesce(p.inventory_capacity,0),
    'rarest_gem_name',p.rarest_gem_name,
    'rarest_gem_rarity',p.rarest_gem_rarity,
    'mutation_luck',coalesce(p.mutation_luck,1),
    'showcase',coalesce(p.showcase,'[]'::jsonb),
    'best_roll',(select jsonb_build_object('gem_name',g.gem_name,'rarity',g.rarity,'final_weight',g.final_weight,'value',g.value,'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])) from public.inventory_gems g where g.player_id=p.id order by g.rarity desc,g.value desc,g.id desc limit 1)
  ) end
  from public.players p
  left join auth.users u on u.id=p.id
  left join public.player_titles t on t.player_id=p.id
  where p.id=p_user_id;
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- A JSON catalog endpoint plus the table-returning endpoint. The JSON endpoint
-- is deliberately tiny and makes the browser resilient to PostgREST return-shape changes.
create or replace function public.get_public_mutation_catalog_json()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.name,m.id),'[]'::jsonb)
  from public.game_mutations m
  where m.enabled=true;
$$;
revoke all on function public.get_public_mutation_catalog_json() from public;
grant execute on function public.get_public_mutation_catalog_json() to anon, authenticated;

-- Force PostgREST to reload the function/schema cache.
notify pgrst, 'reload schema';

commit;

begin;
create or replace function public.get_public_mutation_catalog_all()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.name,m.id),'[]'::jsonb)
  from public.game_mutations m;
$$;
revoke all on function public.get_public_mutation_catalog_all() from public;
grant execute on function public.get_public_mutation_catalog_all() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
