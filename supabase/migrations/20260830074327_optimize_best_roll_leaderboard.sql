-- Best Roll was timing out because the public RPC recalculated mutation odds
-- for every historical row on every request. Cache the effective rarity when
-- history is written and index the exact public ranking order instead.

alter table public.best_roll_history
  add column if not exists effective_rarity numeric;

create or replace function public.set_best_roll_effective_rarity()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.effective_rarity := greatest(
    1::numeric,
    coalesce(new.rarity, 0)::numeric
      * public.get_mutation_chance_product(
          coalesce(new.mutation_ids, '{}'::text[])
        )
  );
  return new;
end;
$function$;

drop trigger if exists set_best_roll_effective_rarity
  on public.best_roll_history;
create trigger set_best_roll_effective_rarity
before insert or update of rarity, mutation_ids
on public.best_roll_history
for each row execute function public.set_best_roll_effective_rarity();

with mutation_products as (
  select
    h.id,
    coalesce(
      exp(sum(ln(greatest(m.chance::numeric, 1)))),
      1::numeric
    ) as chance_product
  from public.best_roll_history h
  left join lateral unnest(coalesce(h.mutation_ids, '{}'::text[])) ids(id)
    on true
  left join public.game_mutations m
    on m.id = ids.id
   and m.enabled = true
   and m.chance > 0
  group by h.id
)
update public.best_roll_history h
set effective_rarity = greatest(
  1::numeric,
  coalesce(h.rarity, 0)::numeric * products.chance_product
)
from mutation_products products
where products.id = h.id
  and h.effective_rarity is null;

alter table public.best_roll_history
  alter column effective_rarity set default 1,
  alter column effective_rarity set not null;

create index if not exists best_roll_history_effective_ranking_idx
  on public.best_roll_history (
    effective_rarity desc,
    rarity desc,
    created_at desc,
    id desc
  );

create or replace function public.get_best_roll_leaderboard(
  p_limit integer default 25
)
returns table(
  rank bigint,
  username text,
  gem_name text,
  rarity numeric,
  base_rarity numeric,
  value numeric,
  final_weight numeric,
  mutation_id text,
  mutation_ids text[],
  mutation_multiplier numeric,
  mutation_chance_multiplier numeric,
  mutation_chance_product numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    row_number() over (
      order by
        h.effective_rarity desc,
        h.rarity desc,
        h.created_at desc,
        h.id desc
    ),
    h.username,
    h.gem_name,
    h.effective_rarity,
    h.rarity,
    h.value,
    h.final_weight,
    h.mutation_id,
    coalesce(h.mutation_ids, '{}'::text[]),
    h.mutation_multiplier,
    1::numeric,
    greatest(
      1::numeric,
      h.effective_rarity / greatest(1::numeric, h.rarity)
    ),
    h.created_at
  from public.best_roll_history h
  join public.players p on p.id = h.player_id
  where h.gem_name not in ('Enchant Relic', 'Ancient Relic')
    and coalesce(p.leaderboard_hidden, false) = false
  order by
    h.effective_rarity desc,
    h.rarity desc,
    h.created_at desc,
    h.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$function$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer)
  to anon, authenticated;
