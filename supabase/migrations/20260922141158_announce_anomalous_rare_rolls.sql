-- Anomalous gems use ordinary numeric denominators for their source-exclusive
-- obtainment rolls. Treat their explicit catalog class as globally rare and
-- display them with base-rarity discoveries.

update public.private_feature_gems
set metadata = coalesce(metadata, '{}'::jsonb) || '{"rarityClass":"anomalous"}'::jsonb
where lower(name) in ('the bottom', 'hadopelagic', 'zephyrion');

-- Recover genuine Anomalous rolls recorded before this classification became
-- eligible for the Rare Rolls feed. Market acquisitions never enter history.
insert into public.rare_roll_chat_events (
  source_type, source_id, player_id, username, gem_name, rarity,
  effective_rarity, mutation_ids, base_luck, created_at
)
select
  'history', h.id, h.player_id, h.username, h.gem_name, h.rarity,
  greatest(1, h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids, '{}'::text[]))),
  coalesce(h.mutation_ids, '{}'::text[]), h.base_luck, h.created_at
from public.best_roll_history h
join public.private_feature_gems g on lower(g.name) = lower(h.gem_name)
where lower(coalesce(g.metadata->>'rarityClass', '')) = 'anomalous'
on conflict (source_type, source_id) where source_id is not null do nothing;

create or replace function public.persist_rare_roll_chat_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_effective_rarity numeric;
  v_has_mutations boolean;
  v_is_anomalous boolean;
begin
  v_has_mutations := cardinality(coalesce(new.mutation_ids, '{}'::text[])) > 0;
  v_effective_rarity := greatest(1, new.rarity * public.get_mutation_chance_product(coalesce(new.mutation_ids, '{}'::text[])));
  select exists (
    select 1
    from public.private_feature_gems g
    where lower(g.name) = lower(new.gem_name)
      and lower(coalesce(g.metadata->>'rarityClass', '')) = 'anomalous'
  ) into v_is_anomalous;

  if v_is_anomalous
     or new.rarity >= 100000000
     or (new.rarity < 100000000 and v_has_mutations and v_effective_rarity >= 10000000000) then
    insert into public.rare_roll_chat_events (
      source_type, source_id, player_id, username, gem_name, rarity,
      effective_rarity, mutation_ids, base_luck, created_at
    ) values (
      'history', new.id, new.player_id, new.username, new.gem_name, new.rarity,
      v_effective_rarity, coalesce(new.mutation_ids, '{}'::text[]), new.base_luck, new.created_at
    ) on conflict (source_type, source_id) where source_id is not null do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function public.persist_rare_roll_chat_event() from public;

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
  rarity_class text,
  base_luck numeric,
  luck_at_roll numeric,
  serial_number bigint,
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
    case
      when lower(coalesce(g.metadata->>'rarityClass', '')) = 'anomalous' then 'anomalous'
      else null
    end as rarity_class,
    e.base_luck,
    h.raw_luck as luck_at_roll,
    h.serial_number,
    e.created_at
  from public.rare_roll_chat_events e
  left join public.player_titles t on t.player_id = e.player_id
  left join public.private_feature_gems g on lower(g.name) = lower(e.gem_name)
  left join public.best_roll_history h
    on e.source_type = 'history' and h.id = e.source_id
  where lower(coalesce(g.metadata->>'rarityClass', '')) = 'anomalous'
     or e.rarity >= 100000000
     or (
       e.rarity < 100000000
       and cardinality(coalesce(e.mutation_ids, '{}'::text[])) > 0
       and e.effective_rarity >= 10000000000
     )
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$function$;

revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer) to anon, authenticated;
