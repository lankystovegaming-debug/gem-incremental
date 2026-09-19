begin;

-- Content filtering is always enabled. Players may opt into the stricter tier,
-- which additionally masks common profanity and insults.
create or replace function public.update_content_filter_level(p_level text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_level not in ('standard', 'strict') then
    raise exception 'invalid_content_filter_level';
  end if;

  insert into public.player_settings(player_id)
  values(uid)
  on conflict do nothing;

  update public.player_settings
  set settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{contentFilterLevel}',
        to_jsonb(p_level),
        true
      ),
      updated_at = now()
  where player_id = uid
  returning settings into saved;

  return saved;
end;
$$;

revoke all on function public.update_content_filter_level(text) from public, anon;
grant execute on function public.update_content_filter_level(text) to authenticated;

create or replace function public.moderate_player_text(
  p_text text,
  p_level text default 'standard'
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  filtered text := coalesce(p_text, '');
  pattern text;
  standard_patterns constant text[] := array[
    E'\\m(f+[^[:alnum:]]*u+[^[:alnum:]]*c+[^[:alnum:]]*k+)([^[:alnum:]]*(e+d+|i+n+g+|s+))?\\M',
    E'\\m(s+[^[:alnum:]]*h+[^[:alnum:]]*[i1]+[^[:alnum:]]*t+)([^[:alnum:]]*(t+y+|e+d+|s+))?\\M',
    E'\\m(b+[^[:alnum:]]*[i1]+[^[:alnum:]]*t+[^[:alnum:]]*c+[^[:alnum:]]*h+)([^[:alnum:]]*(e+s+|y+))?\\M',
    E'\\mc+[^[:alnum:]]*u+[^[:alnum:]]*n+[^[:alnum:]]*t+s?\\M',
    E'\\m(w+[^[:alnum:]]*h+[^[:alnum:]]*o+[^[:alnum:]]*r+[^[:alnum:]]*e+s?|s+[^[:alnum:]]*l+[^[:alnum:]]*u+[^[:alnum:]]*t+s?)\\M',
    E'\\mn+[^[:alnum:]]*[i1]+[^[:alnum:]]*g+[^[:alnum:]]*g+[^[:alnum:]]*(e+[^[:alnum:]]*r+|a+)s?\\M',
    E'\\mf+[^[:alnum:]]*a+[^[:alnum:]]*g+([^[:alnum:]]*g+[^[:alnum:]]*o+[^[:alnum:]]*t+)?s?\\M',
    E'\\mr+[^[:alnum:]]*e+[^[:alnum:]]*t+[^[:alnum:]]*a+[^[:alnum:]]*r+[^[:alnum:]]*d+([^[:alnum:]]*e+[^[:alnum:]]*d+)?\\M',
    E'\\m(k+[^[:alnum:]]*y+[^[:alnum:]]*s+|k+[^[:alnum:]]*i+[^[:alnum:]]*l+[^[:alnum:]]*l+[^[:alnum:]]*y+[^[:alnum:]]*o+[^[:alnum:]]*u+[^[:alnum:]]*r+[^[:alnum:]]*s+[^[:alnum:]]*e+[^[:alnum:]]*l+[^[:alnum:]]*f+)\\M',
    E'\\mr+[^[:alnum:]]*a+[^[:alnum:]]*p+[^[:alnum:]]*e+(d+|i+[^[:alnum:]]*s+[^[:alnum:]]*t+)?\\M'
  ];
  strict_patterns constant text[] := array[
    E'\\ma+[^[:alnum:]]*s+[^[:alnum:]]*s+([^[:alnum:]]*h+[^[:alnum:]]*o+[^[:alnum:]]*l+[^[:alnum:]]*e+)?s?\\M',
    E'\\md+[^[:alnum:]]*a+[^[:alnum:]]*m+[^[:alnum:]]*n+(e+d+)?\\M',
    E'\\mh+[^[:alnum:]]*e+[^[:alnum:]]*l+[^[:alnum:]]*l+\\M',
    E'\\m(i+[^[:alnum:]]*d+[^[:alnum:]]*i+[^[:alnum:]]*o+[^[:alnum:]]*t+|m+[^[:alnum:]]*o+[^[:alnum:]]*r+[^[:alnum:]]*o+[^[:alnum:]]*n+|s+[^[:alnum:]]*t+[^[:alnum:]]*u+[^[:alnum:]]*p+[^[:alnum:]]*i+[^[:alnum:]]*d+|l+[^[:alnum:]]*o+[^[:alnum:]]*s+[^[:alnum:]]*e+[^[:alnum:]]*r+)s?\\M',
    E'\\ms+[^[:alnum:]]*h+[^[:alnum:]]*u+[^[:alnum:]]*t+[^[:alnum:]]*u+[^[:alnum:]]*p+\\M'
  ];
begin
  filtered := replace(filtered, chr(8203), '');
  filtered := replace(filtered, chr(8204), '');
  filtered := replace(filtered, chr(8205), '');
  filtered := replace(filtered, chr(8288), '');
  filtered := replace(filtered, chr(65279), '');

  foreach pattern in array standard_patterns loop
    filtered := regexp_replace(filtered, pattern, '[filtered]', 'gi');
  end loop;

  if p_level = 'strict' then
    foreach pattern in array strict_patterns loop
      filtered := regexp_replace(filtered, pattern, '[filtered]', 'gi');
    end loop;
  end if;

  return filtered;
end;
$$;

create or replace function public.moderate_player_message_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  filter_level text;
begin
  select coalesce(settings->>'contentFilterLevel', 'standard')
  into filter_level
  from public.player_settings
  where player_id = new.sender_id;

  new.message := public.moderate_player_text(
    new.message,
    coalesce(filter_level, 'standard')
  );
  return new;
end;
$$;

drop trigger if exists moderate_chat_message on public.chat_messages;
create trigger moderate_chat_message
before insert or update of message on public.chat_messages
for each row execute function public.moderate_player_message_row();

drop trigger if exists moderate_private_message on public.private_messages;
create trigger moderate_private_message
before insert or update of message on public.private_messages
for each row execute function public.moderate_player_message_row();

notify pgrst, 'reload schema';

commit;
