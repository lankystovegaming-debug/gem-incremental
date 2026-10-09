-- Keep the durable i event at display rarity -1, but use the minimum valid
-- rarity for the transient Live Discoveries wake-up row. The qualification
-- trigger removes this signal immediately after connected clients observe it.
create or replace function private.announce_anomalous_i_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text;
  v_signal_rarity constant numeric := 100000;
begin
  if new.puzzle_id <> 'imaginary-unit' or new.specimen_id is null then
    return new;
  end if;

  select p.username
  into v_username
  from public.players p
  where p.id = new.player_id;

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
    luck_at_roll,
    serial_number,
    created_at
  ) values (
    'puzzle_claim',
    new.specimen_id,
    new.player_id,
    coalesce(v_username, new.player_id::text),
    'i',
    -1,
    -1,
    '{}'::text[],
    null,
    null,
    null,
    new.claimed_at
  )
  on conflict (source_type, source_id) where source_id is not null do nothing;

  insert into public.global_chat_announcements (
    player_id,
    gem_name,
    rarity,
    effective_rarity,
    mutation_ids,
    luck_at_roll,
    created_at
  ) values (
    new.player_id,
    'i',
    v_signal_rarity,
    v_signal_rarity,
    '{}'::text[],
    null,
    new.claimed_at
  );

  return new;
end;
$function$;

revoke all on function private.announce_anomalous_i_claim() from public;
