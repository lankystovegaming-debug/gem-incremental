-- Rare Rolls must represent genuine roll events. Older recovery projections
-- unioned current inventory as a fallback, which caused market purchases to
-- appear as discoveries by the buyer. The durable event ledger is populated
-- only by roll bookkeeping, so make it the sole recovery source.

drop function if exists public.get_rare_roll_chat_history(integer);
create or replace function public.get_rare_roll_chat_history(p_limit integer default 100)
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
stable
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
  where (
      cardinality(coalesce(e.mutation_ids, '{}'::text[])) = 0
      and e.rarity >= 100000000
    ) or (
      cardinality(coalesce(e.mutation_ids, '{}'::text[])) > 0
      and e.effective_rarity >= 10000000000
    )
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer) to anon, authenticated;
