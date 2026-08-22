-- Leaderboard/chat access hotfix.
begin;

create or replace function public.get_total_rolls_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, total_rolls bigint)
language sql security definer set search_path = public as $$
  select row_number() over(order by coalesce(p.total_rolls,0) desc, p.id),
         p.username, coalesce(p.total_rolls,0)::bigint
  from public.players p
  where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    and coalesce(p.total_rolls,0)>0
  order by coalesce(p.total_rolls,0) desc, p.id
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.get_total_rolls_leaderboard(integer) from public;
grant execute on function public.get_total_rolls_leaderboard(integer) to anon, authenticated;

create or replace function public.get_lifetime_earnings_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, lifetime_earnings numeric)
language sql security definer set search_path = public as $$
  select row_number() over(order by coalesce(p.lifetime_earnings,0) desc, p.id),
         p.username, coalesce(p.lifetime_earnings,0)::numeric
  from public.players p
  where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    and coalesce(p.lifetime_earnings,0)>0
  order by coalesce(p.lifetime_earnings,0) desc, p.id
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.get_lifetime_earnings_leaderboard(integer) from public;
grant execute on function public.get_lifetime_earnings_leaderboard(integer) to anon, authenticated;

create or replace function public.get_rare_roll_chat_history(p_limit integer default 100)
returns table(
  id bigint, player_id uuid, username text, gem_name text, rarity numeric,
  effective_rarity numeric, mutation_ids text[], base_luck numeric, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select h.id,h.player_id,h.username,h.gem_name,h.rarity,
    greatest(1,h.rarity*public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[]))),
    coalesce(h.mutation_ids,'{}'::text[]),h.base_luck,h.created_at
  from public.best_roll_history h
  where h.rarity >= 100000
     or (cardinality(coalesce(h.mutation_ids,'{}'::text[])) > 0
         and h.rarity*public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[])) >= 1000000)
  order by h.created_at desc,h.id desc
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer) to anon, authenticated;

commit;
