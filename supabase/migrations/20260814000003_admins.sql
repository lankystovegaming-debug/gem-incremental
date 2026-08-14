-- Admin allow-list as data instead of hardcoded UUIDs. The admin
-- edge function (service role) checks this table; no client can read
-- or write it, and no admin id is baked into the source or bundle.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Seed the existing admin, but only if that auth user exists (so a
-- fresh preview / CI database does not fail on the foreign key).
insert into public.admins (user_id, note)
select '004d883f-edbc-4610-b5e3-9068a0de0ca2', 'seed'
where exists (
  select 1 from auth.users where id = '004d883f-edbc-4610-b5e3-9068a0de0ca2'
)
on conflict (user_id) do nothing;
