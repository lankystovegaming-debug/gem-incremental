-- Preserve authoritative effective rarity on rare-roll announcements.

alter table public.global_chat_announcements
  add column if not exists effective_rarity numeric;

update public.global_chat_announcements a
set effective_rarity = greatest(
  1,
  coalesce(a.rarity, 0) * public.get_mutation_chance_product(a.mutation_ids)
)
where effective_rarity is null;

create or replace function public.attach_roll_announcement_mutations(
  p_player_id uuid,
  p_gem_name text,
  p_gem_rarity numeric,
  p_mutation_ids text[] default '{}',
  p_luck_at_roll numeric default null,
  p_effective_rarity numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  select a.id into v_id
  from public.global_chat_announcements a
  where a.player_id = p_player_id
    and a.gem_name = p_gem_name
    and a.rarity = p_gem_rarity
    and coalesce(cardinality(a.mutation_ids), 0) = 0
  order by a.created_at desc, a.id desc
  limit 1
  for update;

  if v_id is null then return null; end if;

  update public.global_chat_announcements
  set mutation_ids = coalesce(p_mutation_ids, '{}'::text[]),
      luck_at_roll = coalesce(p_luck_at_roll, luck_at_roll),
      effective_rarity = coalesce(
        p_effective_rarity,
        greatest(1, p_gem_rarity * public.get_mutation_chance_product(p_mutation_ids))
      )
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.attach_roll_announcement_mutations(uuid,text,numeric,text[],numeric,numeric) from public;
grant execute on function public.attach_roll_announcement_mutations(uuid,text,numeric,text[],numeric,numeric) to service_role;
