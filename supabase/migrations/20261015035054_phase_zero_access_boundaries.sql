-- Phase 0 access restrictions. Apply after directory migration + frontend rollout.
begin;

drop policy if exists "Authenticated users can read player usernames" on public.players;
-- Retain the existing own-row SELECT policy and all server-managed writes.
-- TRUNCATE bypasses RLS; client roles never need these maintenance privileges.
revoke truncate, references, trigger on public.players from public, anon, authenticated;

-- Direct creation bypasses validation/cooldown; only send_private_message may insert.
drop policy if exists "Users can insert private messages" on public.private_messages;
revoke insert, update, delete, truncate, references, trigger
  on public.private_messages from public, anon, authenticated;
-- Membership remains managed by trusted server/database operations.
revoke all on public.admins, public.admin_viewers from public, anon, authenticated;

-- Table revocation does not remove independent column privileges.
do $$
declare r record;
begin
  for r in select table_name, column_name from information_schema.columns
    where table_schema='public'
      and table_name in ('players','private_messages','admins','admin_viewers')
  loop
    if r.table_name = 'players' then
      execute format('revoke references (%I) on public.%I from public, anon, authenticated',r.column_name,r.table_name);
    else
      execute format('revoke all (%I) on public.%I from public, anon, authenticated',r.column_name,r.table_name);
    end if;
  end loop;
end $$;

grant select on public.private_messages to authenticated;
grant update (read_at) on public.private_messages to authenticated;
drop policy if exists "Users can mark received messages as read" on public.private_messages;
create policy "Users can mark received messages as read"
  on public.private_messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.send_private_message(p_recipient_id uuid, p_message text)
 RETURNS public.private_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sender_id uuid;
  v_message text;
  v_last_message timestamptz;
  v_result public.private_messages;
begin
  -- Get the authenticated user.
  v_sender_id := auth.uid();

  if v_sender_id is null then
    raise exception 'You must be signed in to use private messaging.'
      using errcode = '42501';
  end if;

  -- Prevent sending to yourself.
  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception 'You cannot send a private message to yourself.'
      using errcode = '22023';
  end if;

  -- Clean and validate message.
  v_message := btrim(coalesce(p_message, ''));

  if v_message = '' then
    raise exception 'Message cannot be empty.'
      using errcode = '22023';
  end if;

  if char_length(v_message) > 500 then
    raise exception 'Message cannot exceed 500 characters.'
      using errcode = '22001';
  end if;

  -- Make sure the recipient actually exists.
  if not exists (
    select 1
    from public.players
    where id = p_recipient_id
  ) then
    raise exception 'Player account was not found.'
      using errcode = '42501';
  end if;

  -- Make sure the sender is a valid player.
  if not exists (
    select 1
    from public.players
    where id = v_sender_id
  ) then
    raise exception 'Player account was not found.'
      using errcode = '42501';
  end if;

  -- Serialize concurrent sends without locking the gameplay player row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private-message:' || v_sender_id::text, 0)
  );

  -- 5-second cooldown for this sender.
  select pm.created_at
    into v_last_message
  from public.private_messages pm
  where pm.sender_id = v_sender_id
  order by pm.created_at desc
  limit 1;

  if v_last_message is not null
     and v_last_message > clock_timestamp() - interval '5 seconds' then
    raise exception 'Please wait 5 seconds between messages.'
      using errcode = 'P0001';
  end if;

  -- Insert the message.
  insert into public.private_messages (
    sender_id,
    recipient_id,
    message,
    created_at
  )
  values (
    v_sender_id,
    p_recipient_id,
    v_message,
    clock_timestamp()
  )
  returning * into v_result;

  return v_result;
end;
$function$
;

revoke all on function public.send_private_message(uuid,text) from public, anon;
grant execute on function public.send_private_message(uuid,text) to authenticated, service_role;

-- These RPCs already check trusted admins membership. Remove unnecessary
-- anonymous/PUBLIC execution without changing owner/editor/viewer semantics.
revoke execute on function public.admin_save_content_catalog(text,text,text,boolean,jsonb)
  from public, anon;
revoke execute on function public.admin_delete_content_catalog(uuid) from public, anon;
revoke execute on function public.admin_save_feature_catalog(uuid,boolean,jsonb) from public, anon;
grant execute on function public.admin_save_content_catalog(text,text,text,boolean,jsonb),
  public.admin_delete_content_catalog(uuid), public.admin_save_feature_catalog(uuid,boolean,jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

