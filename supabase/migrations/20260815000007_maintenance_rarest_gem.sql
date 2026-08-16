-- =========================================================
-- Maintenance: set a player's rarest-gem leaderboard record.
--
-- This is intentionally separate from the public client. Only
-- accounts in code_improvement may call it, targets are resolved
-- server-side, and every change is recorded in dependency_log.
-- =========================================================

create or replace function public.maintenance_set_rarest_gem(
  p_target text,
  p_gem_name text,
  p_gem_rarity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_gem_name text := btrim(coalesce(p_gem_name, ''));
  v_result jsonb;
begin
  if v_actor is null
     or not exists (
       select 1
       from public.code_improvement c
       where c.user_id = v_actor
     ) then
    raise exception 'not_authorized';
  end if;

  if p_target is null or btrim(p_target) = '' then
    v_target := v_actor;
  else
    begin
      v_target := p_target::uuid;
    exception when others then
      select p.id
      into v_target
      from public.players p
      where p.username = btrim(p_target)
      limit 1;
    end;
  end if;

  if v_target is null
     or not exists (select 1 from public.players p where p.id = v_target) then
    raise exception 'target_not_found';
  end if;

  if v_gem_name = '' or coalesce(p_gem_rarity, 0) < 1 then
    raise exception 'invalid_gem';
  end if;

  update public.players
  set rarest_gem_name = v_gem_name,
      rarest_gem_rarity = p_gem_rarity
  where id = v_target;

  v_result := jsonb_build_object(
    'gem_name', v_gem_name,
    'rarity', p_gem_rarity
  );

  insert into public.dependency_log (actor, target, kind, detail)
  values (v_actor, v_target, 'rarest', v_result);

  return v_result;
end;
$$;

revoke all on function public.maintenance_set_rarest_gem(text, text, integer) from public;
grant execute on function public.maintenance_set_rarest_gem(text, text, integer) to authenticated;
