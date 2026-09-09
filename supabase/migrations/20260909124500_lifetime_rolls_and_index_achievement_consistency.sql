begin;

-- Requirements described as lifetime rolls must include progress made before
-- the equipment overhaul introduced its separate mechanics counter.
update public.game_recipes recipe_row
set recipe = jsonb_set(
  recipe_row.recipe,
  '{requirements}',
  (
    select jsonb_agg(
      case
        when requirement->>'type' = 'equipment-history'
         and requirement->>'metric' = 'genuineRolls'
        then (requirement - 'metric' - 'amount' - 'consume' - 'label') ||
          jsonb_build_object(
            'type', 'lifetime-rolls',
            'rolls', (requirement->>'amount')::bigint
          )
        else requirement
      end
      order by ordinal
    )
    from jsonb_array_elements(recipe_row.recipe->'requirements')
      with ordinality as requirements(requirement, ordinal)
  ),
  false
)
where exists (
  select 1
  from jsonb_array_elements(recipe_row.recipe->'requirements') requirement
  where requirement->>'type' = 'equipment-history'
    and requirement->>'metric' = 'genuineRolls'
);

-- Discovery achievements now use the same authoritative ledger as Gem Index.
create or replace function public.sync_gem_index_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gems numeric := 0;
  v_mutations numeric := 0;
  v_catalog_total numeric := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  select count(distinct combination.gem_name)
  into v_gems
  from public.player_gem_mutation_combinations combination
  where combination.player_id = p_uid;

  select count(*) into v_catalog_total
  from public.private_feature_gems gem
  where gem.enabled;

  perform public.achievement_set_progress_v013(p_uid, 'Index Apprentice', v_gems, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Index Explorer', v_gems, 25);
  perform public.achievement_set_progress_v013(p_uid, 'Index Scholar', v_gems, 50);
  perform public.achievement_set_progress_v013(p_uid, 'Index Expert', v_gems, 100);
  perform public.achievement_set_progress_v013(p_uid, 'The Complete Index', v_gems, v_catalog_total);

  select count(distinct mutation.mutation_id)
  into v_mutations
  from public.player_gem_mutation_combinations combination
  cross join lateral unnest(coalesce(combination.mutation_ids, '{}'::text[]))
    as mutation(mutation_id)
  where combination.player_id = p_uid;

  select count(*) into v_catalog_total
  from public.game_mutations mutation
  where mutation.enabled;

  perform public.achievement_set_progress_v013(p_uid, 'Five Mutation Types', v_mutations, 5);
  perform public.achievement_set_progress_v013(p_uid, 'Ten Mutation Types', v_mutations, 10);
  perform public.achievement_set_progress_v013(p_uid, 'Mutation Mastery', v_mutations, v_catalog_total);
end;
$$;

create or replace function public.refresh_player_achievements_v013(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_uid then
    raise exception 'forbidden';
  end if;

  perform public.refresh_player_achievements_v013_pre_secret_rework(p_uid);
  perform public.sync_gem_index_achievements_v013(p_uid);
  perform public.sync_current_expedition_achievements_v013(p_uid);
end;
$$;

revoke all on function public.sync_gem_index_achievements_v013(uuid),
  public.refresh_player_achievements_v013(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_gem_index_achievements_v013(uuid),
  public.refresh_player_achievements_v013(uuid)
  to service_role;

commit;
