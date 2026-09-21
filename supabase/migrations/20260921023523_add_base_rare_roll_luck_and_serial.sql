-- Capture the immutable per-gem serial in roll history and expose it together
-- with the final recorded roll Luck for base-rarity Rare Rolls.

alter table public.best_roll_history
  add column if not exists serial_number bigint;

-- Recover serials for retained specimens that are still owned by their
-- original roller. Future history rows are stamped by the trigger below.
update public.best_roll_history h
set serial_number = (
  select g.serial_number
  from public.inventory_gems g
  where g.player_id = h.player_id
    and g.gem_name = h.gem_name
    and g.roll_number = h.roll_number
    and g.serial_number is not null
  order by g.id desc
  limit 1
)
where h.serial_number is null
  and h.roll_number is not null
  and exists (
    select 1 from public.inventory_gems g
    where g.player_id = h.player_id
      and g.gem_name = h.gem_name
      and g.roll_number = h.roll_number
      and g.serial_number is not null
  );

create or replace function public.capture_best_roll_serial()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.serial_number is null and new.roll_number is not null then
    select g.serial_number into new.serial_number
    from public.inventory_gems g
    where g.player_id = new.player_id
      and g.gem_name = new.gem_name
      and g.roll_number = new.roll_number
      and g.serial_number is not null
    order by g.id desc
    limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists capture_best_roll_serial_trg on public.best_roll_history;
create trigger capture_best_roll_serial_trg
before insert on public.best_roll_history
for each row execute function public.capture_best_roll_serial();

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
    e.base_luck,
    h.raw_luck as luck_at_roll,
    h.serial_number,
    e.created_at
  from public.rare_roll_chat_events e
  left join public.player_titles t on t.player_id = e.player_id
  left join public.best_roll_history h
    on e.source_type = 'history' and h.id = e.source_id
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
