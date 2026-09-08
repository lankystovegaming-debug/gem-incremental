-- Raise mutation-driven global chat qualification from 1/10m to 1/50m.
-- Natural base-rarity announcements remain 1/1m and above.

create or replace function public.filter_global_roll_announcements()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.rarity, 0) >= 1000000 then return new; end if;
  if coalesce(new.effective_rarity, 0) >= 50000000 then return new; end if;
  delete from public.global_chat_announcements where id = new.id;
  return new;
end;
$function$;

create or replace function public.persist_rare_roll_chat_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_effective_rarity numeric;
begin
  v_effective_rarity := greatest(
    1,
    new.rarity * public.get_mutation_chance_product(
      coalesce(new.mutation_ids, '{}'::text[])
    )
  );

  if new.rarity >= 1000000
     or (
       cardinality(coalesce(new.mutation_ids, '{}'::text[])) > 0
       and v_effective_rarity >= 50000000
     ) then
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

drop trigger if exists persist_rare_roll_chat_event
  on public.best_roll_history;
create trigger persist_rare_roll_chat_event
after insert on public.best_roll_history
for each row execute function public.persist_rare_roll_chat_event();

-- Remove mutation-only announcements admitted by the old 1/10m threshold.
-- Base gems at 1/1m+ remain eligible regardless of their effective rarity.
delete from public.global_chat_announcements
where coalesce(rarity, 0) < 1000000
  and coalesce(effective_rarity, 0) < 50000000;

delete from public.rare_roll_chat_events
where coalesce(rarity, 0) < 1000000
  and coalesce(effective_rarity, 0) < 50000000;
