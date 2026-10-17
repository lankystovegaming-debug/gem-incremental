-- Definitions only, read from igrddscmrdrrwtvyspbf on 2026-10-15; no user data.
CREATE OR REPLACE FUNCTION public.get_leaderboard_avatars(p_usernames text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(username, avatar), '{}'::jsonb)
  from (
    select
      p.username,
      coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ) as avatar
    from public.players p
    join auth.users u on u.id = p.id
    where p.username = any(p_usernames)
      and coalesce(
        u.raw_user_meta_data->>'avatar_url',
        u.raw_user_meta_data->>'picture'
      ) is not null
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_content_catalog(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
delete from public.admin_content_catalog where id=p_id; end $function$
;

CREATE OR REPLACE FUNCTION public.admin_save_content_catalog(p_content_type text, p_content_key text, p_name text, p_enabled boolean, p_config jsonb)
 RETURNS admin_content_catalog
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.admin_content_catalog;
begin
  if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
  insert into public.admin_content_catalog(content_type,content_key,name,enabled,config,updated_by)
  values(p_content_type,p_content_key,p_name,coalesce(p_enabled,true),coalesce(p_config,'{}'::jsonb),auth.uid())
  on conflict(content_type,content_key) do update set name=excluded.name,enabled=excluded.enabled,config=excluded.config,updated_at=now(),updated_by=auth.uid()
  returning * into r;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_save_feature_catalog(p_id uuid, p_enabled boolean, p_config jsonb)
 RETURNS admin_feature_catalog
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.admin_feature_catalog;
begin if not exists(select 1 from public.admins where user_id=auth.uid()) then raise exception 'not_admin'; end if;
update public.admin_feature_catalog set enabled=p_enabled,config=coalesce(p_config,'{}'::jsonb),updated_at=now() where id=p_id returning * into r; return r; end $function$
;

CREATE OR REPLACE FUNCTION public.cleanup_private_messages(p_max_age_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_deleted integer;
  v_days integer := greatest(1, least(coalesce(p_max_age_days, 30), 3650));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.private_messages
  where created_at < now() - make_interval(days => v_days)
    and (sender_id = auth.uid() or recipient_id = auth.uid());

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_base_luck_leaderboard(p_limit integer DEFAULT 100)
 RETURNS TABLE(rank bigint, username text, base_luck numeric, equipped_items bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with player_luck as (
    select p.id,p.username,
      1::numeric + coalesce(sum(case when e.equipped then coalesce(e.luck_bonus,0)::numeric else 0 end),0::numeric) as base_luck,
      count(*) filter(where e.equipped) as equipped_items
    from public.players p
    left join public.player_equipment e on e.player_id=p.id
    where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
    group by p.id,p.username
  )
  select row_number() over(order by base_luck desc,username asc),username,base_luck,equipped_items
  from player_luck
  order by base_luck desc,username asc
  limit greatest(1,least(coalesce(p_limit,100),100));
$function$
;

CREATE OR REPLACE FUNCTION public.send_private_message(p_recipient_id uuid, p_message text)
 RETURNS private_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_sender_id uuid;
  v_message text;
  v_last_message timestamptz;
  v_result public.private_messages;
begin
  -- Get the authenticated user.
  v_sender_id := auth.uid();

  if v_sender_id is null then
    raise exception 'You must be signed in to use private messaging.'
      using errcode = '42501';
  end if;

  -- Prevent sending to yourself.
  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception 'You cannot send a private message to yourself.'
      using errcode = '22023';
  end if;

  -- Clean and validate message.
  v_message := btrim(coalesce(p_message, ''));

  if v_message = '' then
    raise exception 'Message cannot be empty.'
      using errcode = '22023';
  end if;

  if char_length(v_message) > 500 then
    raise exception 'Message cannot exceed 500 characters.'
      using errcode = '22001';
  end if;

  -- Make sure the recipient actually exists.
  if not exists (
    select 1
    from public.players
    where id = p_recipient_id
  ) then
    raise exception 'Player account was not found.'
      using errcode = '42501';
  end if;

  -- Make sure the sender is a valid player.
  if not exists (
    select 1
    from public.players
    where id = v_sender_id
  ) then
    raise exception 'Player account was not found.'
      using errcode = '42501';
  end if;

  -- 5-second cooldown for this sender.
  select pm.created_at
    into v_last_message
  from public.private_messages pm
  where pm.sender_id = v_sender_id
  order by pm.created_at desc
  limit 1;

  if v_last_message is not null
     and v_last_message > now() - interval '5 seconds' then
    raise exception 'Please wait 5 seconds between messages.'
      using errcode = 'P0001';
  end if;

  -- Insert the message.
  insert into public.private_messages (
    sender_id,
    recipient_id,
    message
  )
  values (
    v_sender_id,
    p_recipient_id,
    v_message
  )
  returning * into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_chat_profiles(p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    jsonb_object_agg(
      p.id::text,
      jsonb_build_object(
        'username', p.username,
        'avatar_url', coalesce(
          u.raw_user_meta_data->>'avatar_url',
          u.raw_user_meta_data->>'picture'
        ),
        'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
        'title_color', coalesce(
          nullif(t.color,''),
          nullif(p.display_title_color,''),
          '#ffd166'
        )
      )
    ),
    '{}'::jsonb
  )
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]));
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'id', p.id::text,
      'username', coalesce(nullif(p.username,''), 'Guest Player'),
      'avatar_url', coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
      'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
      'title_color', coalesce(nullif(t.color,''), nullif(p.display_title_color,''), '#ffd166'),
      'created_at', p.created_at,
      'cosmetics', cosmetics_private.resolved_loadout(p.id),
      'bundles', public.bundle_public_summary(p.id) || jsonb_build_object(
        'total',(select count(*) from public.game_bundles),
        'catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'icon',b.icon) order by b.sort_order),'[]') from public.game_bundles b)
      ),
      'gems_discovered', (select count(distinct c.gem_name) from public.player_gem_mutation_combinations c where c.player_id=p.id),
      'achievement_count', (select count(*) from public.private_feature_progress fp join public.private_feature_definitions fd on fd.id=fp.feature_id where fp.player_id=p.id and fp.completed and fd.feature_kind='achievement' and fd.enabled),
      'raw_roll_rarity', (select max(h.raw_rarity) from roll_history_private.lifetime_facts h where h.player_id=p.id and h.gem_name not in ('Enchant Relic','Ancient Relic')),
      'total_rolls', coalesce(p.total_rolls,0),
      'lifetime_earnings', coalesce(p.lifetime_earnings,0),
      'inventory_count', (
        select count(*) from public.inventory_gems ig
        where ig.player_id = p.id
          and ig.gem_name not in ('Enchant Relic', 'Ancient Relic')
      ),
      'inventory_capacity', coalesce(p.inventory_capacity,0),
      'rarest_gem_name', p.rarest_gem_name,
      'rarest_gem_rarity', p.rarest_gem_rarity,
      'mutation_luck', coalesce(p.mutation_luck,1),
      'showcase', coalesce(p.showcase,'[]'::jsonb),
      'best_roll', (
        select jsonb_build_object(
          'gem_name',g.gem_name,
          'rarity',g.rarity,
          'final_weight',g.final_weight,
          'value',g.value,
          'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])
        )
        from public.inventory_gems g
        where g.player_id=p.id
          and g.gem_name not in ('Enchant Relic', 'Ancient Relic')
        order by g.rarity desc,g.value desc,g.id desc
        limit 1
      )
    )
  end
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = p_user_id;
$function$
;
