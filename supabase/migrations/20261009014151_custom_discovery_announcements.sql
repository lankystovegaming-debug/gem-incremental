-- Live Discoveries derives ordinary and potion-exclusive announcements from
-- roll history. The one-time i puzzle claim bypasses that roll path, so emit
-- its durable event from the authoritative claim row instead.

create or replace function private.announce_anomalous_i_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text;
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

  -- The existing Live Discoveries subscription listens to this public roll
  -- signal table, while its durable history is read from rare_roll_chat_events.
  -- The current qualification trigger removes this 1-in-1 signal row, but its
  -- INSERT/DELETE changes still prompt connected clients to refresh the feed.
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
    1,
    1,
    '{}'::text[],
    null,
    new.claimed_at
  );

  return new;
end;
$function$;

revoke all on function private.announce_anomalous_i_claim() from public;

drop trigger if exists announce_anomalous_i_claim
  on private.gem_puzzle_claims;
create trigger announce_anomalous_i_claim
after insert on private.gem_puzzle_claims
for each row execute function private.announce_anomalous_i_claim();

-- Preserve earlier successful claims without rebroadcasting them as new.
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
)
select
  'puzzle_claim',
  c.specimen_id,
  c.player_id,
  coalesce(p.username, c.player_id::text),
  'i',
  -1,
  -1,
  '{}'::text[],
  null,
  null,
  null,
  c.claimed_at
from private.gem_puzzle_claims c
left join public.players p on p.id = c.player_id
where c.puzzle_id = 'imaginary-unit'
  and c.specimen_id is not null
on conflict (source_type, source_id) where source_id is not null do nothing;
