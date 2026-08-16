-- =========================================================
-- Maintenance panel gate.
--
-- The hidden maintenance panel (Konami-code devpanel) must open
-- ONLY for the maintenance account. All power already runs through
-- dependency_improvement, which is gated to the code_improvement
-- allow-list, but the panel UI itself used to render for anyone.
--
-- code_improvement is RLS-locked (no client can read it), so this
-- SECURITY DEFINER function lets the client ask "am I the
-- maintainer?" without exposing the list. The panel stays closed
-- (nothing renders) for everyone else.
-- =========================================================

create or replace function public.am_i_maintainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.code_improvement c where c.user_id = auth.uid()
  );
$$;

grant execute on function public.am_i_maintainer() to anon, authenticated;
