begin;

-- display_title and display_title_color are compatibility mirrors for the
-- service-role-managed player_titles table. They must never be writable by a
-- browser session, even when the player is updating their own players row.
create or replace function public.protect_player_display_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.display_title := '';
      new.display_title_color := '#ffd166';
    elsif new.display_title is distinct from old.display_title
       or new.display_title_color is distinct from old.display_title_color then
      raise exception using
        errcode = '42501',
        message = 'display_title_is_server_managed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_player_display_title_trg on public.players;
create trigger protect_player_display_title_trg
  before insert or update of display_title, display_title_color
  on public.players
  for each row execute function public.protect_player_display_title();

-- Remove console-injected fallback titles while preserving titles granted by
-- the protected player_titles table. The admin Edge Function uses service_role
-- and remains able to manage both copies.
update public.players p
set display_title = coalesce(t.title, ''),
    display_title_color = coalesce(t.color, '#ffd166')
from (
  select p2.id,
         pt.title,
         pt.color
  from public.players p2
  left join public.player_titles pt on pt.player_id = p2.id
) t
where t.id = p.id
  and (
    p.display_title is distinct from coalesce(t.title, '')
    or p.display_title_color is distinct from coalesce(t.color, '#ffd166')
  );

revoke all on function public.protect_player_display_title() from public;

notify pgrst, 'reload schema';

