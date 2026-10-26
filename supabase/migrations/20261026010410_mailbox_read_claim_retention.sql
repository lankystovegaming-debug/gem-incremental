-- Retain unread mail and unclaimed attachments indefinitely. Start the timer
-- when all required actions are complete; opening again never resets it.
alter table public.player_mail add column expires_at timestamptz;
create function mailbox_private.set_mail_expiry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 new.expires_at := case
   when new.read_at is null then null
   when jsonb_array_length(new.rewards)=0 then new.read_at + interval '30 minutes'
   when new.claimed_at is not null then greatest(new.read_at,new.claimed_at) + interval '30 minutes'
   else null
 end;
 return new;
end;
$$;
revoke all on function mailbox_private.set_mail_expiry() from public,anon,authenticated;
create trigger player_mail_set_expiry before insert or update on public.player_mail
for each row execute function mailbox_private.set_mail_expiry();
update public.player_mail set read_at=read_at;
create index player_mail_cleanup_idx on public.player_mail(expires_at,id) where expires_at is not null;

-- Hide expired mail immediately, even between scheduled deletion batches.
alter policy "Players read their own mail" on public.player_mail
using ((select auth.uid())=player_id and (expires_at is null or expires_at > now()));

create function mailbox_private.clear_expired_mail() returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
 with expired as (
   select id from public.player_mail where expires_at <= now()
   order by expires_at,id limit 5000 for update skip locked
 )
 delete from public.player_mail m using expired e where m.id=e.id;
 get diagnostics removed = row_count;
 return removed;
end;
$$;
revoke all on function mailbox_private.clear_expired_mail() from public,anon,authenticated;
grant execute on function mailbox_private.clear_expired_mail() to service_role;

create or replace function mailbox_private.read_mail(p_mail_id bigint) returns public.player_mail
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result public.player_mail;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.player_mail set read_at = coalesce(read_at, now())
    where id = p_mail_id and player_id = uid
      and (expires_at is null or expires_at > now()) returning * into result;
  if not found then raise exception 'mail_not_found'; end if;
  return result;
end;
$$;

create or replace function mailbox_private.claim_mail_reward(p_mail_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail public.player_mail; reward jsonb; granted jsonb := '[]'; expiry timestamptz;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  -- Serialize with other wallet operations before locking the message.
  perform 1 from public.players where id = uid for update;
  if not found then raise exception 'player_not_found'; end if;
  select * into mail from public.player_mail where id = p_mail_id and player_id = uid
    and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'mail_not_found'; end if;
  if mail.claimed_at is not null then
    return jsonb_build_object('alreadyClaimed', true, 'claimedAt', mail.claimed_at, 'expiresAt', mail.expires_at);
  end if;
  if jsonb_array_length(mail.rewards) = 0 then raise exception 'no_rewards'; end if;
  for reward in select value from jsonb_array_elements(mail.rewards) loop
    -- Match the deployed apply_reward_object contract, but reject silent no-ops.
    if coalesce(reward->>'type','') not in ('money','coins','potion')
      or jsonb_typeof(reward->'amount') is distinct from 'number'
      or (reward->>'amount')::numeric <= 0
      or (reward->>'amount')::numeric > 1000000000000000
      or (reward->>'amount')::numeric <> trunc((reward->>'amount')::numeric) then
      raise exception 'invalid_mail_reward';
    end if;
    if reward->>'type' = 'potion' and (
      (reward->>'amount')::numeric > 2147483647 or not exists (
        select 1 from public.game_consumables where id = reward->>'consumableId'
      )) then raise exception 'invalid_mail_consumable'; end if;
    granted := granted || jsonb_build_array(public.apply_reward_object(uid, reward));
  end loop;
  update public.player_mail set claimed_at = now(), read_at = coalesce(read_at, now())
    where id = mail.id returning expires_at into expiry;
  return jsonb_build_object('alreadyClaimed', false, 'claimedAt', now(), 'granted', granted, 'expiresAt', expiry);
end;
$$;

-- The live project already has pg_cron enabled. Fail clearly on other projects
-- so deploying this migration cannot silently omit automatic cleanup.
do $$
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
   raise exception 'Enable pg_cron before applying mailbox retention';
 end if;
 perform cron.schedule('clear-expired-player-mail','* * * * *',
   'select mailbox_private.clear_expired_mail();');
end;
$$;
