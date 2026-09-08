-- Repair playtime upgrade RPCs after the initial migration.
-- Keeps the existing award_playtime_points() return signature intact, because
-- changing a PostgreSQL function return type with CREATE OR REPLACE is illegal.

create or replace function public.get_playtime_upgrades()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_now timestamptz := now();
  v_elapsed bigint := 0;
  r public.players%rowtype;
begin
  if v_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into r
  from public.players
  where id = v_id
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  v_elapsed := least(
    300,
    greatest(0, floor(extract(epoch from (v_now - coalesce(r.playtime_last_award_at, v_now))))::bigint)
  );

  update public.players
  set
    playtime_seconds = coalesce(playtime_seconds, 0) + v_elapsed,
    playtime_last_award_at = v_now
  where id = v_id
  returning * into r;

  return jsonb_build_object(
    'playtimeSeconds', coalesce(r.playtime_seconds, 0),
    'availablePoints', greatest(0, coalesce(r.playtime_seconds, 0) - coalesce(r.playtime_points_spent, 0)),
    'spent', coalesce(r.playtime_points_spent, 0),
    'levels', jsonb_build_object(
      'luck', coalesce(r.playtime_luck_level, 0),
      'mutation', coalesce(r.playtime_mutation_level, 0),
      'rollSpeed', coalesce(r.playtime_roll_speed_level, 0),
      'money', coalesce(r.playtime_money_level, 0)
    )
  );
end;
$$;

create or replace function public.buy_playtime_upgrade(p_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
  v_now timestamptz := now();
  v_elapsed bigint := 0;
  r public.players%rowtype;
  v_level integer;
  v_cost bigint;
begin
  if v_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into r
  from public.players
  where id = v_id
  for update;

  if not found then
    raise exception 'player_not_found';
  end if;

  v_elapsed := least(
    300,
    greatest(0, floor(extract(epoch from (v_now - coalesce(r.playtime_last_award_at, v_now))))::bigint)
  );

  update public.players
  set
    playtime_seconds = coalesce(playtime_seconds, 0) + v_elapsed,
    playtime_last_award_at = v_now
  where id = v_id
  returning * into r;

  v_level := case p_upgrade
    when 'luck' then coalesce(r.playtime_luck_level, 0)
    when 'mutation' then coalesce(r.playtime_mutation_level, 0)
    when 'rollSpeed' then coalesce(r.playtime_roll_speed_level, 0)
    when 'money' then coalesce(r.playtime_money_level, 0)
    else null
  end;

  if v_level is null then
    raise exception 'invalid_upgrade';
  end if;

  if v_level >= 10 then
    raise exception 'upgrade_maxed';
  end if;

  v_cost := public.playtime_upgrade_cost(v_level);

  if coalesce(r.playtime_seconds, 0) - coalesce(r.playtime_points_spent, 0) < v_cost then
    raise exception 'insufficient_playtime_points';
  end if;

  case p_upgrade
    when 'luck' then
      update public.players set
        playtime_luck_level = coalesce(playtime_luck_level, 0) + 1,
        playtime_points_spent = coalesce(playtime_points_spent, 0) + v_cost
      where id = v_id returning * into r;
    when 'mutation' then
      update public.players set
        playtime_mutation_level = coalesce(playtime_mutation_level, 0) + 1,
        playtime_points_spent = coalesce(playtime_points_spent, 0) + v_cost
      where id = v_id returning * into r;
    when 'rollSpeed' then
      update public.players set
        playtime_roll_speed_level = coalesce(playtime_roll_speed_level, 0) + 1,
        playtime_points_spent = coalesce(playtime_points_spent, 0) + v_cost
      where id = v_id returning * into r;
    when 'money' then
      update public.players set
        playtime_money_level = coalesce(playtime_money_level, 0) + 1,
        playtime_points_spent = coalesce(playtime_points_spent, 0) + v_cost
      where id = v_id returning * into r;
  end case;

  return jsonb_build_object(
    'playtimeSeconds', coalesce(r.playtime_seconds, 0),
    'availablePoints', greatest(0, coalesce(r.playtime_seconds, 0) - coalesce(r.playtime_points_spent, 0)),
    'spent', coalesce(r.playtime_points_spent, 0),
    'levels', jsonb_build_object(
      'luck', coalesce(r.playtime_luck_level, 0),
      'mutation', coalesce(r.playtime_mutation_level, 0),
      'rollSpeed', coalesce(r.playtime_roll_speed_level, 0),
      'money', coalesce(r.playtime_money_level, 0)
    )
  );
end;
$$;

grant execute on function public.get_playtime_upgrades() to authenticated, service_role;
grant execute on function public.buy_playtime_upgrade(text) to authenticated, service_role;
grant execute on function public.award_playtime_points() to authenticated, service_role;

notify pgrst, 'reload schema';
