-- =========================================================
-- Fix rare-roll announcement mutation metadata.
--
-- record_server_roll creates the rare announcement, but historically it
-- inserted mutation_ids as [] because the roll mutation list was generated
-- in the Edge Function. This RPC attaches the complete list immediately
-- after the roll is committed.
--
-- SECURITY DEFINER keeps the update server-side. The function only touches
-- the newest matching announcement that still has an empty mutation list,
-- making repeated calls harmless.
-- =========================================================

create or replace function public.attach_roll_announcement_mutations(
  p_player_id uuid,
  p_gem_name text,
  p_gem_rarity numeric,
  p_mutation_ids text[] default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_player_id is null or p_gem_name is null then
    return null;
  end if;

  /*
   * Do not require auth.uid() here: the Edge roll function calls this using
   * the service role after it has already authenticated the player. Keeping
   * this function service-side prevents clients from editing announcements.
   */
  select a.id
    into v_id
  from public.global_chat_announcements a
  where a.player_id = p_player_id
    and a.gem_name = p_gem_name
    and a.rarity = p_gem_rarity
    and (
      a.mutation_ids is null
      or a.mutation_ids = '{}'::text[]
      or cardinality(a.mutation_ids) = 0
    )
  order by a.created_at desc, a.id desc
  limit 1
  for update;

  if v_id is null then
    return null;
  end if;

  update public.global_chat_announcements
  set mutation_ids = coalesce(p_mutation_ids, '{}'::text[])
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.attach_roll_announcement_mutations(uuid, text, numeric, text[]) from public;
grant execute on function public.attach_roll_announcement_mutations(uuid, text, numeric, text[]) to service_role;

-- Best-effort historical backfill. Each empty announcement is matched to the
-- nearest inventory specimen for the same player/gem/rarity within 15 seconds.
-- Rows that have no mutated specimen remain untouched.
with candidates as (
  select
    a.id as announcement_id,
    g.mutation_ids,
    row_number() over (
      partition by a.id
      order by abs(extract(epoch from (a.created_at - g.created_at))), g.id desc
    ) as rn
  from public.global_chat_announcements a
  join public.inventory_gems g
    on g.player_id = a.player_id
   and g.gem_name = a.gem_name
   and g.rarity = a.rarity
   and abs(extract(epoch from (a.created_at - g.created_at))) <= 15
  where (
    a.mutation_ids is null
    or cardinality(a.mutation_ids) = 0
  )
  and g.mutation_ids is not null
  and cardinality(g.mutation_ids) > 0
)
update public.global_chat_announcements a
set mutation_ids = c.mutation_ids
from candidates c
where c.rn = 1
  and a.id = c.announcement_id;
