-- Mutated specimens now require 1/1b+ effective rarity for global chat.
-- Unmutated specimens retain the existing 1/1m+ base-rarity threshold.

create or replace function public.filter_global_roll_announcements()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if cardinality(coalesce(new.mutation_ids, '{}'::text[])) > 0 then
    if coalesce(new.effective_rarity, 0) >= 1000000000 then return new; end if;
  elsif coalesce(new.rarity, 0) >= 1000000 then
    return new;
  end if;

  delete from public.global_chat_announcements where id = new.id;
  return new;
end;
$function$;

-- Mutation metadata is attached after some natural-rarity announcements are
-- inserted, so enforce the rule again on that update instead of trusting the
-- row's insert-time state.
drop trigger if exists filter_global_roll_announcements
  on public.global_chat_announcements;
create trigger filter_global_roll_announcements
after insert or update of rarity, effective_rarity, mutation_ids
on public.global_chat_announcements
for each row execute function public.filter_global_roll_announcements();

create or replace function public.persist_rare_roll_chat_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_effective_rarity numeric;
  v_has_mutations boolean;
begin
  v_has_mutations := cardinality(coalesce(new.mutation_ids, '{}'::text[])) > 0;
  v_effective_rarity := greatest(
    1,
    new.rarity * public.get_mutation_chance_product(
      coalesce(new.mutation_ids, '{}'::text[])
    )
  );

  if (v_has_mutations and v_effective_rarity >= 1000000000)
     or (not v_has_mutations and new.rarity >= 1000000) then
    insert into public.rare_roll_chat_events (
      source_type,
      source_id,
      player_id,
      username,
      gem_name,
      rarity,
      effective_rarity,
      mutation_ids,
      base_luck,
      created_at
    ) values (
      'history',
      new.id,
      new.player_id,
      new.username,
      new.gem_name,
      new.rarity,
      v_effective_rarity,
      coalesce(new.mutation_ids, '{}'::text[]),
      new.base_luck,
      new.created_at
    )
    on conflict (source_type, source_id) where source_id is not null do nothing;
  end if;

  return new;
end;
$function$;

revoke all on function public.persist_rare_roll_chat_event() from public;

-- Remove previously persisted announcements that no longer qualify. Natural
-- 1/1m+ discoveries remain available in chat history.
delete from public.global_chat_announcements
where (
    cardinality(coalesce(mutation_ids, '{}'::text[])) > 0
    and coalesce(effective_rarity, 0) < 1000000000
  )
  or (
    cardinality(coalesce(mutation_ids, '{}'::text[])) = 0
    and coalesce(rarity, 0) < 1000000
  );

delete from public.rare_roll_chat_events
where (
    cardinality(coalesce(mutation_ids, '{}'::text[])) > 0
    and coalesce(effective_rarity, 0) < 1000000000
  )
  or (
    cardinality(coalesce(mutation_ids, '{}'::text[])) = 0
    and coalesce(rarity, 0) < 1000000
  );
