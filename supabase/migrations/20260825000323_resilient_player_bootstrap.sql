begin;

-- Account bootstrap must be self-contained. Returning the row from this
-- authenticated SECURITY DEFINER function avoids a second browser-side
-- UPDATE/SELECT whose result can be hidden by RLS and become PGRST116.
create or replace function public.ensure_player_record()
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_player public.players%rowtype;
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'not_authenticated';
  end if;

  insert into public.players(id, last_seen)
  values(v_uid, now())
  on conflict(id) do update
    set last_seen = excluded.last_seen;

  select *
  into strict v_player
  from public.players
  where id = v_uid;

  return v_player;
end;
$$;

revoke all on function public.ensure_player_record() from public;
grant execute on function public.ensure_player_record() to authenticated;

-- Repair any Auth users whose player row was missed by an older trigger.
insert into public.players(id, last_seen)
select u.id, now()
from auth.users u
left join public.players p on p.id = u.id
where p.id is null
on conflict(id) do nothing;

notify pgrst, 'reload schema';

commit;
