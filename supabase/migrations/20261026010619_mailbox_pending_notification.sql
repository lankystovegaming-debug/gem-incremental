-- Count each visible mail once: unread OR containing an unclaimed reward.
-- SECURITY INVOKER preserves player ownership and expiry RLS.
create function public.mailbox_pending_count() returns bigint
language sql stable security invoker set search_path = '' as $$
 select count(*) from public.player_mail
 where player_id=(select auth.uid())
   and (expires_at is null or expires_at > now())
   and (read_at is null or (jsonb_array_length(rewards)>0 and claimed_at is null));
$$;
revoke all on function public.mailbox_pending_count() from public,anon,authenticated;
grant execute on function public.mailbox_pending_count() to authenticated;
