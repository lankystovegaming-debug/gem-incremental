-- =========================================================
-- PUBLIC PLAYER PROFILES
--
-- Leaderboard names link to /user/<auth-user-id>/.
-- These SECURITY DEFINER functions expose only information that
-- is intentionally suitable for a public game profile:
-- username, public avatar, showcase, and game statistics.
-- Email addresses and other auth metadata are never returned.
-- =========================================================

set local check_function_bodies = off;

create or replace function public.get_profile_ids_for_usernames(
  p_usernames text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(p.username, p.id::text),
    '{}'::jsonb
  )
  from public.players p
  where p.username = any(coalesce(p_usernames, '{}'::text[]))
    and p.username is not null;
$$;

revoke all on function public.get_profile_ids_for_usernames(text[]) from public;
grant execute on function public.get_profile_ids_for_usernames(text[])
  to anon, authenticated;


create or replace function public.get_public_profile(
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when p.id is null then null
      else jsonb_build_object(
        'id', p.id::text,
        'username', coalesce(nullif(p.username, ''), 'Guest Player'),
        'avatar_url', coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        ),
        'total_rolls', coalesce(p.total_rolls, 0),
        'lifetime_earnings', coalesce(p.lifetime_earnings, 0),
        'inventory_count', (
          select count(*)
          from public.inventory_gems ig
          where ig.player_id = p.id
        ),
        'inventory_capacity', coalesce(p.inventory_capacity, 0),
        'rarest_gem_name', p.rarest_gem_name,
        'rarest_gem_rarity', p.rarest_gem_rarity,
        'mutation_luck', coalesce(p.mutation_luck, 1),
        'showcase', coalesce(p.showcase, '[]'::jsonb),
        'best_roll', (
          select jsonb_build_object(
            'gem_name', g.gem_name,
            'rarity', g.rarity,
            'final_weight', g.final_weight,
            'value', g.value,
            'mutation_ids', coalesce(g.mutation_ids, '{}'::text[])
          )
          from public.inventory_gems g
          where g.player_id = p.id
          order by g.rarity desc, g.value desc, g.id desc
          limit 1
        )
      )
    end
  from public.players p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid)
  to anon, authenticated;
