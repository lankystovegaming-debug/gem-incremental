-- Active announcements are intentionally visible before a player has signed
-- in. RLS limits the rows to active announcements, while this restores the
-- table-level SELECT privilege required by PostgREST.
grant select on table public.announcements to anon, authenticated;

revoke insert, update, delete on table public.announcements from anon, authenticated;
