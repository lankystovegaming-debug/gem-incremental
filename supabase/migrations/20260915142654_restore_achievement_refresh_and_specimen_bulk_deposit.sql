-- Restore the server-authoritative achievement refresh that was removed from
-- the read endpoint on 2026-09-08 before every achievement had an incremental
-- update path. Also let the optimized manual consumed-material path handle the
-- same specimen predicates as Auto Craft.
begin;

create or replace function public.get_player_achievements_v013(p_player_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  defs jsonb;
  prog jsonb;
  points integer;
  visible_total integer;
  visible_done integer;
  unclaimed integer;
  ranking bigint;
  milestones jsonb;
begin
  if auth.uid() is distinct from p_player_id then
    raise exception 'forbidden';
  end if;

  -- Keep the page read server-authoritative until every achievement mutation
  -- has a complete event-driven writer. The refresh functions use indexed or
  -- cached lifetime facts and only persist monotonic progress.
  perform public.ensure_private_feature_progress(p_player_id);
  perform public.refresh_player_achievements_v013(p_player_id);

  select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order), '[]')
  into defs
  from public.private_feature_definitions d
  where d.feature_kind = 'achievement'
    and (
      d.enabled
      or exists (
        select 1
        from public.private_feature_progress p
        where p.player_id = p_player_id
          and p.feature_id = d.id
          and p.completed
      )
    );

  select coalesce(jsonb_agg(to_jsonb(p)), '[]')
  into prog
  from public.private_feature_progress p
  join public.private_feature_definitions d on d.id = p.feature_id
  where p.player_id = p_player_id
    and d.feature_kind = 'achievement';

  select coalesce(achievement_points, 0)
  into points
  from public.player_achievement_profiles
  where player_id = p_player_id;

  select
    count(*) filter (
      where not coalesce((d.metadata->>'hidden')::boolean, false)
        and (d.enabled or p.completed)
    ),
    count(*) filter (
      where p.completed
        and not coalesce((d.metadata->>'hidden')::boolean, false)
    ),
    count(*) filter (where p.completed and not p.reward_granted)
  into visible_total, visible_done, unclaimed
  from public.private_feature_definitions d
  left join public.private_feature_progress p
    on p.feature_id = d.id
   and p.player_id = p_player_id
  where d.feature_kind = 'achievement';

  select 1 + count(*)
  into ranking
  from public.player_achievement_profiles
  where achievement_points > coalesce(points, 0);

  select jsonb_agg(
    m || jsonb_build_object(
      'unlocked', coalesce(points, 0) >= (m->>'ap')::integer,
      'claimed', c.ap is not null
    )
    order by (m->>'ap')::integer
  )
  into milestones
  from jsonb_array_elements(public.achievement_milestones_v013()) m
  left join public.player_achievement_milestones c
    on c.player_id = p_player_id
   and c.ap = (m->>'ap')::integer;

  return jsonb_build_object(
    'definitions', defs,
    'progress', prog,
    'summary', jsonb_build_object(
      'ap', coalesce(points, 0),
      'visibleCompleted', coalesce(visible_done, 0),
      'visibleTotal', coalesce(visible_total, 0),
      'completionPercent', case
        when coalesce(visible_total, 0) = 0 then 0
        else round(100.0 * coalesce(visible_done, 0) / visible_total, 1)
      end,
      'rank', coalesce(ranking, 1),
      'unclaimed', coalesce(unclaimed, 0)
    ),
    'milestones', coalesce(milestones, '[]')
  );
end
$$;

revoke all on function public.get_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_achievements_v013(uuid)
  to authenticated, service_role;

create or replace function public.deposit_equipment_material(
  p_player_id uuid,
  p_recipe_id text,
  p_specimen jsonb default null,
  p_requirement_index integer default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_req jsonb;
  v_key text;
  v_remaining integer;
  v_count integer;
  v_ids bigint[];
  v_recipe jsonb;
  v_progress jsonb;
  v_plan jsonb;
  v_gem public.inventory_gems%rowtype;
  v_preserved boolean := false;
  v_chance numeric := 0;
  v_manual boolean := p_specimen is null;
begin
  perform 1 from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;

  select recipe into v_recipe from public.game_recipes where id = p_recipe_id;
  if v_recipe is null then raise exception 'recipe_not_found'; end if;

  if p_recipe_id = 'impossible-pickaxe' then
    if v_manual then
      return jsonb_build_object('deposited', false, 'reason', 'use_impossible_workspace');
    end if;
    return impossible_private.deposit_specimen(p_player_id, p_specimen, true);
  end if;

  insert into public.crafting_progress(player_id, recipe_id, progress)
  values (p_player_id, p_recipe_id, '{}')
  on conflict do nothing;

  select progress into v_progress
  from public.crafting_progress
  where player_id = p_player_id and recipe_id = p_recipe_id
  for update;

  v_recipe := coalesce(v_progress->'_equipment_recipe', v_recipe);

  -- Consumed recipes intentionally deposit every currently eligible specimen
  -- in one statement. This now accepts specimen-condition requirements and
  -- mirrors every predicate supported by plan_equipment_material.
  if v_manual and v_recipe->>'consumeMaterials' = 'true' then
    v_req := v_recipe->'requirements'->p_requirement_index;
    if p_requirement_index is null
      or p_requirement_index < 0
      or v_req->>'type' not in ('gem-count', 'specimen-condition') then
      raise exception 'invalid_bulk_requirement';
    end if;

    v_key := coalesce(v_req->>'id', v_req->>'gem');
    if v_key is null then raise exception 'invalid_bulk_requirement'; end if;

    v_remaining := greatest(
      0,
      (v_req->>'amount')::integer - coalesce((v_progress->>v_key)::integer, 0)
    );

    select coalesce(array_agg(id), '{}'::bigint[])
    into v_ids
    from (
      select id
      from public.inventory_gems
      where player_id = p_player_id
        and not locked
        and not coalesce(museum_locked, false)
        and rarity >= coalesce((v_req->>'minimumRarity')::numeric, 0)
        and rarity <= coalesce((v_req->>'maximumRarity')::numeric, 1e100)
        and (not (v_req ? 'gem') or gem_name = v_req->>'gem')
        and (
          not (v_req ? 'minimumWeightMultiplier')
          or final_weight / nullif(base_weight, 0)
            >= (v_req->>'minimumWeightMultiplier')::numeric
        )
        and (
          not (v_req ? 'maximumWeightMultiplier')
          or final_weight / nullif(base_weight, 0)
            <= (v_req->>'maximumWeightMultiplier')::numeric
        )
        and (
          not (v_req ? 'minimumFinalWeight')
          or final_weight >= (v_req->>'minimumFinalWeight')::numeric
        )
        and (
          not (v_req ? 'minimumValue')
          or value >= (v_req->>'minimumValue')::numeric
        )
      order by
        case when v_req ? 'minimumValue' then value end,
        case when v_req ? 'minimumFinalWeight' then final_weight end,
        final_weight,
        id
      limit v_remaining
      for update
    ) eligible;

    v_count := cardinality(v_ids);
    if v_count = 0 then
      return jsonb_build_object('deposited', false, 'progress', v_progress);
    end if;

    delete from public.inventory_gems
    where player_id = p_player_id and id = any(v_ids);

    v_progress := jsonb_set(
      v_progress,
      array[v_key],
      to_jsonb(coalesce((v_progress->>v_key)::integer, 0) + v_count)
    );
    update public.crafting_progress
    set progress = v_progress, updated_at = now()
    where player_id = p_player_id and recipe_id = p_recipe_id;

    return jsonb_build_object(
      'deposited', true,
      'depositedCount', v_count,
      'progress', v_progress,
      'preserved', false
    );
  end if;

  if v_manual then
    if p_requirement_index is null then raise exception 'requirement_required'; end if;
    for v_gem in
      select *
      from public.inventory_gems
      where player_id = p_player_id
        and not coalesce(locked, false)
        and (not coalesce((v_recipe->>'includedSpecimens')::boolean, false) or base_weight > 0)
        and rarity >= coalesce((v_recipe->'requirements'->p_requirement_index->>'minimumRarity')::numeric, 0)
        and rarity <= coalesce((v_recipe->'requirements'->p_requirement_index->>'maximumRarity')::numeric, 1e100)
        and (not (v_recipe->'requirements'->p_requirement_index ? 'gem') or gem_name = v_recipe->'requirements'->p_requirement_index->>'gem')
        and (not (v_recipe->'requirements'->p_requirement_index ? 'minimumWeightMultiplier') or final_weight / nullif(base_weight, 0) >= (v_recipe->'requirements'->p_requirement_index->>'minimumWeightMultiplier')::numeric)
      order by final_weight, id
      for update
    loop
      v_plan := public.plan_equipment_material(v_recipe, v_progress, to_jsonb(v_gem), p_requirement_index);
      if v_plan is not null then exit; end if;
    end loop;
  else
    v_plan := public.plan_equipment_material(v_recipe, v_progress, p_specimen, p_requirement_index);
  end if;

  if v_plan is null then
    return jsonb_build_object('deposited', false, 'progress', v_progress);
  end if;

  if (v_plan->>'conservationEligible')::boolean then
    select coalesce(max(case equipment_id when 'plastic-shopping-bag' then 0.125 else 0 end), 0)
    into v_chance
    from public.player_equipment
    where player_id = p_player_id and equipped and category = 'bag';
    v_preserved := random() < v_chance;
  end if;

  update public.crafting_progress
  set progress = v_plan->'progress', updated_at = now()
  where player_id = p_player_id and recipe_id = p_recipe_id;

  if v_manual and not v_preserved then
    delete from public.inventory_gems where id = v_gem.id and player_id = p_player_id;
  end if;

  return v_plan || jsonb_build_object(
    'deposited', true,
    'preserved', v_preserved,
    'consumedSpecimen', case
      when v_manual and not v_preserved then jsonb_build_object(
        'id', v_gem.id,
        'gemName', v_gem.gem_name,
        'weight', v_gem.final_weight,
        'value', v_gem.value
      )
      else null
    end
  );
end
$$;

revoke all on function public.deposit_equipment_material(uuid, text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.deposit_equipment_material(uuid, text, jsonb, integer)
  to service_role;

commit;
