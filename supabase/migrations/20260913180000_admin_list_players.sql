-- =========================================================
-- ADMIN CLI — FULL PLAYER ROSTER
--
-- Admin-gated, SECURITY DEFINER: returns every username that has ever
-- existed (players table), so the admin CLI can autocomplete a target
-- for /ban and the other player commands. The admin `search` action is
-- query-based and capped, and the browser cannot read the players table
-- directly, so this dedicated RPC provides the full list. It works
-- without an admin Edge Function redeploy, like the ban / IP-audit RPCs.
-- =========================================================

create or replace function public.admin_list_players()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));

  if not v_is_admin then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(username order by username), '[]'::jsonb)
    from public.players
    where username is not null
  );
end;
$$;

revoke all on function public.admin_list_players() from public, anon;
grant execute on function public.admin_list_players() to authenticated;
