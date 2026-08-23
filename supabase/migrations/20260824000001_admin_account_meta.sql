-- Expose account creation / last sign-in to admins for the player inspector.
-- Reads auth.users (only reachable via SECURITY DEFINER); admin-gated, null-safe.
create or replace function public.admin_get_account_meta(p_target uuid)
returns table(created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_is_admin boolean;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select u.created_at, u.last_sign_in_at from auth.users u where u.id = p_target;
end $$;

revoke all on function public.admin_get_account_meta(uuid) from public;
grant execute on function public.admin_get_account_meta(uuid) to authenticated;
