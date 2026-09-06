-- Full removal of the Daily Spin feature.
--
-- The page, Edge Function, admin Feature Lab tab and navigation link are gone
-- from the client; this drops the server-side objects that only Daily Spin
-- used. The separate daily login streak feature is unrelated and left intact.
--
-- Order matters: drop the functions first (they reference the tables), then the
-- tables, then remove the navigation section row so the link cannot reappear.

drop function if exists public.claim_daily_spin();
drop function if exists public.get_daily_spin_state();

drop table if exists public.daily_spin_claims cascade;
drop table if exists public.daily_spin_config cascade;

delete from public.game_section_settings where id = 'daily-spin';
