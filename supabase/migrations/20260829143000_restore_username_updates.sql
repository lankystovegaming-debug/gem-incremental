-- Restore username updates after direct browser writes to players were
-- intentionally disabled. Only the authenticated user's username is mutable.

begin;

create or replace function public.set_own_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_username text := btrim(coalesce(p_username, ''));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if length(v_username) < 3 or length(v_username) > 20 then
    raise exception 'invalid_username_length' using errcode = '23514';
  end if;

  if v_username !~ '^[A-Za-z0-9_]+$' then
    raise exception 'invalid_username_characters' using errcode = '23514';
  end if;

  insert into public.players (id, username)
  values (v_uid, v_username)
  on conflict (id) do update
    set username = excluded.username;

  return v_username;
end;
$function$;

revoke all on function public.set_own_username(text) from public, anon;
grant execute on function public.set_own_username(text) to authenticated;

commit;
