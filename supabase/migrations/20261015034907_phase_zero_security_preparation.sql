-- Phase 0 only. Prepared against live catalog definitions on 2026-10-15.
-- Additive first step: apply this, then publish frontend directory readers.
begin;

-- Deliberately owner-executed projection: cross-player discovery must work
-- while full rows remain protected by players RLS. Never add SELECT * here.
create or replace view public.public_player_directory
with (security_barrier = true, security_invoker = false) as
select id, username from public.players;
revoke all on public.public_player_directory from public, anon, authenticated;
grant select on public.public_player_directory to authenticated, service_role;
comment on view public.public_player_directory is
  'Public identity projection for authenticated player search; only id and username.';

notify pgrst, 'reload schema';
commit;
