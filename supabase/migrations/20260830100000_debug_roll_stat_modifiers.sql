-- Exposes only the authenticated player's always-on roll modifiers to the
-- client-side stats screen. Guild and artifact tables are otherwise private.
create or replace function public.get_current_roll_stat_modifiers()
returns table (
  guild_luck_multiplier numeric,
  guild_roll_speed_multiplier numeric,
  guild_weight_luck_multiplier numeric,
  artifact_luck_bonus numeric,
  artifact_roll_speed_bonus numeric,
  artifact_weight_luck_bonus numeric,
  artifact_weight_multiplier_bonus numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with own_guild as (
    select
      membership.eligible_at,
      guild.luck_tier,
      guild.speed_tier,
      guild.weight_luck_tier
    from public.guild_members membership
    join public.guilds guild on guild.id = membership.guild_id
    where membership.player_id = auth.uid()
    limit 1
  ),
  own_artifacts as (
    select artifact_key
    from public.museum_artifact_registrations
    where player_id = auth.uid()
  )
  select
    coalesce((
      select case when eligible_at <= now()
        then 1 + least(10, greatest(0, coalesce(luck_tier, 0))) / 100.0
        else 1
      end
      from own_guild
    ), 1),
    coalesce((
      select case when eligible_at <= now()
        then 1 + least(10, greatest(0, coalesce(speed_tier, 0))) / 100.0
        else 1
      end
      from own_guild
    ), 1),
    coalesce((
      select case when eligible_at <= now()
        then 1 + least(10, greatest(0, coalesce(weight_luck_tier, 0))) / 100.0
        else 1
      end
      from own_guild
    ), 1),
    case when exists (select 1 from own_artifacts where artifact_key = 'vein-prism') then 0.05 else 0 end,
    (case when exists (select 1 from own_artifacts where artifact_key = 'miners-lamp') then 0.02 else 0 end)
      + (case when exists (select 1 from own_artifacts where artifact_key = 'clockwork-drill') then 0.05 else 0 end),
    case when exists (select 1 from own_artifacts where artifact_key = 'surveyors-compass') then 0.03 else 0 end,
    case when exists (select 1 from own_artifacts where artifact_key = 'silver-pick') then 0.05 else 0 end;
$$;

revoke all on function public.get_current_roll_stat_modifiers() from public, anon;
grant execute on function public.get_current_roll_stat_modifiers() to authenticated, service_role;
