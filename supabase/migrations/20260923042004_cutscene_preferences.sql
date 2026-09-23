-- Cloud-sync the two cutscene controls without replacing the current
-- update_qol_settings implementation. The existing function remains the
-- authority for every established setting and validation rule.

alter function public.update_qol_settings(jsonb)
  rename to update_qol_settings_before_cutscene_preferences;

create function public.update_qol_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  compatible_patch jsonb;
  cutscene_patch jsonb := '{}'::jsonb;
  saved jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(p_patch) is distinct from 'object'
     or octet_length(p_patch::text) > 200000 then
    raise exception 'invalid_settings';
  end if;

  if p_patch ? 'cutscenesEnabled' then
    if jsonb_typeof(p_patch->'cutscenesEnabled') is distinct from 'boolean' then
      raise exception 'invalid_boolean';
    end if;
    cutscene_patch := jsonb_set(
      cutscene_patch,
      '{cutscenesEnabled}',
      p_patch->'cutscenesEnabled',
      true
    );
  end if;

  if p_patch ? 'skipSeenCutscenes' then
    if jsonb_typeof(p_patch->'skipSeenCutscenes') is distinct from 'boolean' then
      raise exception 'invalid_boolean';
    end if;
    cutscene_patch := jsonb_set(
      cutscene_patch,
      '{skipSeenCutscenes}',
      p_patch->'skipSeenCutscenes',
      true
    );
  end if;

  compatible_patch := p_patch - 'cutscenesEnabled' - 'skipSeenCutscenes';

  if compatible_patch <> '{}'::jsonb then
    saved := public.update_qol_settings_before_cutscene_preferences(compatible_patch);
  else
    insert into public.player_settings(player_id)
    values(uid)
    on conflict do nothing;

    select settings
    into saved
    from public.player_settings
    where player_id = uid
    for update;
  end if;

  if cutscene_patch <> '{}'::jsonb then
    saved := coalesce(saved, '{}'::jsonb) || cutscene_patch;
    update public.player_settings
    set settings = saved,
        updated_at = now()
    where player_id = uid;
  end if;

  return coalesce(saved, '{}'::jsonb);
end;
$$;

revoke all on function public.update_qol_settings(jsonb) from public, anon;
grant execute on function public.update_qol_settings(jsonb) to authenticated;
