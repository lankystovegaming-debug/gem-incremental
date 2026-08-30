-- Read-only guild membership overview for the admin panel: every guild, its
-- owner, tier bonuses and full member list. Admin-gated, SECURITY DEFINER
-- (guild_members is not client-readable across guilds). Purely informational —
-- it does NOT change any guild behaviour.
create or replace function public.admin_get_guild_roster()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_result jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  select jsonb_build_object(
    'guildCount', (select count(*) from public.guilds),
    'memberCount', (select count(*) from public.guild_members),
    'guilds', coalesce((
      select jsonb_agg(g_obj order by (g_obj->>'memberCount')::int desc, lower(g_obj->>'name'))
      from (
        select jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'tag', g.tag,
          'ownerId', g.owner_id,
          'ownerName', coalesce(nullif(op.username, ''), left(g.owner_id::text, 8)),
          'xp', g.xp,
          'guildPoints', g.guild_points,
          'memberCapacity', g.member_capacity,
          'luckTier', g.luck_tier,
          'speedTier', g.speed_tier,
          'weightLuckTier', g.weight_luck_tier,
          'createdAt', g.created_at,
          'memberCount', (select count(*) from public.guild_members m where m.guild_id = g.id),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'playerId', m.player_id,
                'username', coalesce(nullif(p.username, ''), left(m.player_id::text, 8)),
                'role', m.role,
                'joinedAt', m.joined_at,
                'eligibleAt', m.eligible_at,
                'lifetimeContribution', m.lifetime_contribution,
                'weeklyContribution', m.weekly_contribution
              )
              order by case m.role when 'owner' then 0 when 'officer' then 1 else 2 end,
                       m.lifetime_contribution desc nulls last
            )
            from public.guild_members m
            left join public.players p on p.id = m.player_id
            where m.guild_id = g.id
          ), '[]'::jsonb)
        ) as g_obj
        from public.guilds g
        left join public.players op on op.id = g.owner_id
      ) sub
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_get_guild_roster() from public;
grant execute on function public.admin_get_guild_roster() to authenticated;
