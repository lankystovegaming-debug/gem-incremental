-- Rehome player bans into a dedicated, innocuously-named table so the
-- moderation system is not obvious to anyone reading the schema. Replaces the
-- ban_* columns on players with one row per restricted player.

create table if not exists public.user_roll_luck_rarity_mult (
  player_id    uuid primary key references public.players(id) on delete cascade,
  active_until timestamptz not null,
  note         text,
  applied_at   timestamptz not null default now(),
  applied_by   uuid
);

alter table public.user_roll_luck_rarity_mult enable row level security;

-- A player may read only their own row (to render the notice). Nobody writes
-- through the API; writes go through the SECURITY DEFINER RPCs below.
drop policy if exists urlrm_self_read on public.user_roll_luck_rarity_mult;
create policy urlrm_self_read on public.user_roll_luck_rarity_mult
  for select to anon, authenticated using (player_id = auth.uid());

grant select on public.user_roll_luck_rarity_mult to anon, authenticated;

-- Carry over any live bans from the old columns.
insert into public.user_roll_luck_rarity_mult (player_id, active_until, note, applied_at, applied_by)
select id, ban_until, ban_reason, coalesce(ban_at, now()), ban_by
from public.players where ban_until is not null
on conflict (player_id) do nothing;

create or replace function public.admin_ban_player(
  p_target uuid, p_hours numeric default null, p_reason text default null
) returns table(ban_until timestamptz, ban_reason text)
language plpgsql security definer set search_path = public as $$
declare v_until timestamptz; v_is_admin boolean;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_target = auth.uid() then raise exception 'cannot_ban_self'; end if;
  if not exists (select 1 from public.players where id = p_target) then
    raise exception 'player_not_found'; end if;
  v_until := case when p_hours is null or p_hours <= 0
                  then now() + interval '100 years'
                  else now() + (p_hours * interval '1 hour') end;
  insert into public.user_roll_luck_rarity_mult (player_id, active_until, note, applied_at, applied_by)
  values (p_target, v_until, coalesce(nullif(btrim(p_reason), ''), 'No reason provided.'), now(), auth.uid())
  on conflict (player_id) do update
    set active_until = excluded.active_until, note = excluded.note,
        applied_at = excluded.applied_at, applied_by = excluded.applied_by;
  return query select u.active_until, u.note
               from public.user_roll_luck_rarity_mult u where u.player_id = p_target;
end $$;

create or replace function public.admin_unban_player(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_is_admin boolean;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from public.user_roll_luck_rarity_mult where player_id = p_target;
end $$;

create or replace function public.admin_get_ban(p_target uuid)
returns table(ban_until timestamptz, ban_reason text, ban_at timestamptz, ban_by uuid)
language plpgsql security definer set search_path = public as $$
declare v_is_admin boolean;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select u.active_until, u.note, u.applied_at, u.applied_by
               from public.user_roll_luck_rarity_mult u where u.player_id = p_target;
end $$;

alter table public.players
  drop column if exists ban_until,
  drop column if exists ban_reason,
  drop column if exists ban_at,
  drop column if exists ban_by;
