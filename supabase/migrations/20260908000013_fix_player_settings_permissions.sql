-- Fix player_settings permissions for authenticated browser clients.
-- RLS controls WHICH rows a player can access; GRANT controls whether the
-- authenticated PostgREST role may access the table at all.

begin;

create table if not exists public.player_settings (
  player_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_settings enable row level security;

-- Remove old policies so this migration is safe across previous versions.
drop policy if exists "read own settings" on public.player_settings;
drop policy if exists "write own settings" on public.player_settings;
drop policy if exists "player_settings_select_own" on public.player_settings;
drop policy if exists "player_settings_insert_own" on public.player_settings;
drop policy if exists "player_settings_update_own" on public.player_settings;
drop policy if exists "player_settings_delete_own" on public.player_settings;

create policy "player_settings_select_own"
on public.player_settings
for select
to authenticated
using (auth.uid() = player_id);

create policy "player_settings_insert_own"
on public.player_settings
for insert
to authenticated
with check (auth.uid() = player_id);

create policy "player_settings_update_own"
on public.player_settings
for update
to authenticated
using (auth.uid() = player_id)
with check (auth.uid() = player_id);

create policy "player_settings_delete_own"
on public.player_settings
for delete
to authenticated
using (auth.uid() = player_id);

-- This was the missing piece causing the 403 / SQLSTATE 42501 error.
grant select, insert, update, delete on table public.player_settings to authenticated;
grant all privileges on table public.player_settings to service_role;

-- Keep updated_at current even if the client updates settings directly.
create or replace function public.touch_player_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_player_settings_updated_at on public.player_settings;
create trigger trg_touch_player_settings_updated_at
before update on public.player_settings
for each row execute function public.touch_player_settings_updated_at();

notify pgrst, 'reload schema';

commit;
