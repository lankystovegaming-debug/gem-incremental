-- Mail is delivered by trusted server tooling / SQL only. Players cannot create
-- messages, change attachments, or mark a reward claimed directly.
create table public.player_mail (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(body) between 1 and 20000),
  sender text not null default 'Gem Incremental' check (length(sender) between 1 and 100),
  rewards jsonb not null default '[]' check (jsonb_typeof(rewards) = 'array' and jsonb_array_length(rewards) <= 20),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  claimed_at timestamptz
);
create index player_mail_inbox_idx on public.player_mail(player_id, id desc);
alter table public.player_mail enable row level security;
revoke all on public.player_mail from public, anon, authenticated;
grant select on public.player_mail to authenticated;
grant all on public.player_mail to service_role;
grant usage, select on sequence public.player_mail_id_seq to service_role;
create policy "Players read their own mail" on public.player_mail for select
  to authenticated using ((select auth.uid()) = player_id);

create schema if not exists mailbox_private;
revoke all on schema mailbox_private from public, anon;
grant usage on schema mailbox_private to authenticated;

create function mailbox_private.read_mail(p_mail_id bigint) returns public.player_mail
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result public.player_mail;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  update public.player_mail set read_at = coalesce(read_at, now())
    where id = p_mail_id and player_id = uid returning * into result;
  if not found then raise exception 'mail_not_found'; end if;
  return result;
end;
$$;
create function public.read_mail(p_mail_id bigint) returns public.player_mail
language sql security invoker set search_path = '' as $$
  select mailbox_private.read_mail(p_mail_id);
$$;

create function mailbox_private.claim_mail_reward(p_mail_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail public.player_mail; reward jsonb; granted jsonb := '[]';
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  -- Serialize with other wallet operations before locking the message.
  perform 1 from public.players where id = uid for update;
  if not found then raise exception 'player_not_found'; end if;
  select * into mail from public.player_mail where id = p_mail_id and player_id = uid for update;
  if not found then raise exception 'mail_not_found'; end if;
  if mail.claimed_at is not null then
    return jsonb_build_object('alreadyClaimed', true, 'claimedAt', mail.claimed_at);
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
    where id = mail.id;
  return jsonb_build_object('alreadyClaimed', false, 'claimedAt', now(), 'granted', granted);
end;
$$;
create function public.claim_mail_reward(p_mail_id bigint) returns jsonb
language sql security invoker set search_path = '' as $$
  select mailbox_private.claim_mail_reward(p_mail_id);
$$;
revoke all on function mailbox_private.read_mail(bigint), mailbox_private.claim_mail_reward(bigint),
  public.read_mail(bigint), public.claim_mail_reward(bigint) from public, anon, authenticated;
grant execute on function mailbox_private.read_mail(bigint), mailbox_private.claim_mail_reward(bigint),
  public.read_mail(bigint), public.claim_mail_reward(bigint) to authenticated;
