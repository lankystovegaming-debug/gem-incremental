-- =========================================================
-- Announcements.
--
-- Admins post short messages that appear as a banner at the top
-- of the game for every player, including guests. Reads are a
-- plain public SELECT (fast, no function call); posting and
-- clearing go through admin-gated SECURITY DEFINER functions so
-- no client can write the table directly.
-- =========================================================

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  body text not null,
  tone text not null default 'info',
  created_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Anyone may read the active announcements (this is what the banner
-- shows). Nothing else is exposed.
drop policy if exists "Public can read active announcements" on public.announcements;
create policy "Public can read active announcements"
  on public.announcements
  for select
  to anon, authenticated
  using (active = true);

-- Writes never come from the client directly.
revoke insert, update, delete on public.announcements from anon, authenticated;


-- Post a new announcement. Admin only.
create or replace function public.post_announcement(
  p_body text,
  p_tone text default 'info'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null
     or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  if p_body is null or btrim(p_body) = '' then
    raise exception 'empty_body';
  end if;

  if length(p_body) > 500 then
    raise exception 'body_too_long';
  end if;

  insert into public.announcements (body, tone, created_by, active)
  values (
    btrim(p_body),
    case when p_tone in ('info', 'warning', 'positive') then p_tone else 'info' end,
    auth.uid(),
    true
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.post_announcement(text, text) to authenticated;


-- Retire an announcement (or all of them when no id is given).
-- Admin only.
create or replace function public.clear_announcements(
  p_id bigint default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null
     or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  if p_id is null then
    update public.announcements set active = false where active = true;
  else
    update public.announcements set active = false where id = p_id;
  end if;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.clear_announcements(bigint) to authenticated;
