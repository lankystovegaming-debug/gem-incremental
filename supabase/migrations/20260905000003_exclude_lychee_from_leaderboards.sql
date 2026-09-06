-- Hide the lychee dev account from all public leaderboards.
--
-- Every board already honours players.leaderboard_hidden EXCEPT the museum
-- prestige board, which only filtered on prestige > 0. Redefine that one to
-- honour the flag too, then set the flag on lychee by username (the same key
-- roles.js already uses to identify the account). With every board respecting
-- the flag, no Edge Function change is needed.

create or replace function public.get_museum_prestige_leaderboard(p_limit integer default 100)
returns table(rank bigint, player_id uuid, username text, avatar_url text, prestige numeric, tier integer, collections_completed integer, highest_exhibit_score numeric)
language sql stable security definer set search_path=public as $$
  select row_number() over(order by m.prestige desc,p.total_rolls desc,p.username),p.id,p.username,null::text as avatar_url,
    m.prestige,m.tier,m.collections_completed,m.highest_exhibit_score
  from public.museum_profiles m join public.players p on p.id=m.player_id
  where m.prestige > 0 and coalesce(p.leaderboard_hidden,false)=false
  order by m.prestige desc,p.total_rolls desc,p.username limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.get_museum_prestige_leaderboard(integer) from public;
grant execute on function public.get_museum_prestige_leaderboard(integer) to anon, authenticated;

update public.players
set leaderboard_hidden = true
where username = '1248lychee1632';
