-- =========================================================
-- Leaderboard avatars.
--
-- The leaderboards Edge Function returns usernames + stats but no
-- avatar. Avatars live in auth.users.user_metadata (Google, or an
-- uploaded picture whose public URL is stored there), which a
-- normal client cannot read for other users. This SECURITY
-- DEFINER function maps a set of usernames to their avatar URLs
-- and nothing else — the usernames are already public on the
-- board, and the images sit in a public bucket / are public
-- Google URLs, so this exposes nothing new.
-- =========================================================

-- players is not tracked in this repo; skip body validation so a
-- fresh preview / CI database does not fail to create the function.
set local check_function_bodies = off;

create or replace function public.get_leaderboard_avatars(
  p_usernames text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(username, avatar), '{}'::jsonb)
  from (
    select
      p.username,
      coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ) as avatar
    from public.players p
    join auth.users u on u.id = p.id
    where p.username = any(p_usernames)
      and coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ) is not null
  ) t;
$$;

grant execute on function public.get_leaderboard_avatars(text[]) to anon, authenticated;
