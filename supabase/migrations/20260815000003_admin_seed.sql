-- =========================================================
-- Seed the admin allow-lists on the current project.
--
--   admins            → both people who can use the /admin panel
--   code_improvement  → the single account allowed to use the
--                       hidden maintenance panel
--
-- Each insert is guarded on the auth user existing, so a fresh
-- preview / CI database (where these accounts do not exist) does
-- not trip the foreign key. Idempotent — safe to run repeatedly.
-- =========================================================

-- Admin panel (/admin): both accounts.
insert into public.admins (user_id, note)
select id, 'seed'
from (values
  ('316c668e-1ab3-4e5f-bad0-8cd964a41440'::uuid),
  ('004d883f-edbc-4610-b5e3-9068a0de0ca2'::uuid)
) as seed(id)
where exists (select 1 from auth.users u where u.id = seed.id)
on conflict (user_id) do nothing;

-- Maintenance panel: only the one account. (Intentionally NOT the
-- second admin — the maintenance layer is more powerful than the
-- admin panel.)
insert into public.code_improvement (user_id, note)
select '316c668e-1ab3-4e5f-bad0-8cd964a41440'::uuid, 'seed'
where exists (
  select 1 from auth.users u
  where u.id = '316c668e-1ab3-4e5f-bad0-8cd964a41440'::uuid
)
on conflict (user_id) do nothing;
