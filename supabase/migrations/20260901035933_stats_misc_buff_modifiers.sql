-- Return only the signed-in player's permanent artifact modifiers that are
-- useful to the Stats page. The function accepts no player id, so callers
-- cannot inspect another account's Museum collection.
create or replace function public.get_current_misc_buff_modifiers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with own_artifacts as (
    select registration.artifact_key
    from public.museum_artifact_registrations registration
    where registration.player_id = auth.uid()
  )
  select jsonb_build_object(
    'normalMutationChanceMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'black-geode') then 1.05 else 1 end,
    'normalGemValueMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'bedrock-crown') then 1.05 else 1 end,
    'crystalLuckBonus',
      (case when exists(select 1 from own_artifacts where artifact_key = 'crystal-splinter') then .02 else 0 end)
      + (case when exists(select 1 from own_artifacts where artifact_key = 'fractured-prism') then .03 else 0 end),
    'crystalWeightLuckMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'calcified-geode') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'perfect-crystal-sphere') then 1.03 else 1 end),
    'crystalWeightMultiplierMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'quartz-cluster') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'ancient-crystal-chisel') then 1.03 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'impossible-crystal') then 1.04 else 1 end),
    'crystalArtifactChanceMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'broken-survey-lens') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'prismatic-fossil') then 1.03 else 1 end),
    'crystalGemValueMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'crystallized-lantern') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'unstable-crystal-heart') then 1.03 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'frozen-light-fragment') then 1.03 else 1 end),
    'crystalMutationChanceMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'prismatic-shard') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'heart-of-the-cavern') then 1.02 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'fractured-core') then 1.03 else 1 end),
    'crystalProgressMultiplier',
      (case when exists(select 1 from own_artifacts where artifact_key = 'resonance-core') then 1.03 else 1 end)
      * (case when exists(select 1 from own_artifacts where artifact_key = 'resonant-geode') then 1.04 else 1 end),
    'crystalHeavyGemValueMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'shattered-heart') then 1.05 else 1 end,
    'hellProgressMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'charred-miners-tag') then 1.03 else 1 end,
    'hellDoomGainMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'melted-chain-link') then .97 else 1 end,
    'hellMutationChanceMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'crimson-geode') then 1.03 else 1 end,
    'hellArtifactChanceMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'extinguished-hell-lantern') then 1.03 else 1 end,
    'hellGemValueMultiplier',
      case when exists(select 1 from own_artifacts where artifact_key = 'doomstone') then 1.03 else 1 end,
    'hellLuckBonus',
      case when exists(select 1 from own_artifacts where artifact_key = 'eye-bottomless-mine') then .05 else 0 end
  );
$$;

revoke all on function public.get_current_misc_buff_modifiers() from public, anon;
grant execute on function public.get_current_misc_buff_modifiers() to authenticated, service_role;
