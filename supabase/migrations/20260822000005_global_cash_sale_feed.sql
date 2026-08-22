-- A small, capped log of what pushes global cash up (gem sales to the game),
-- so the counter can show "<player> sold <gem>" in real time.
create table if not exists public.global_cash_events (
  id          bigint generated always as identity primary key,
  player_name text,
  gem_name    text,
  amount      double precision not null,
  created_at  timestamptz not null default now()
);
alter table public.global_cash_events enable row level security;
grant select, insert, delete on public.global_cash_events to service_role;

-- Amortised retention: keep roughly the newest ~300 rows so this log never
-- grows large (prunes on ~1% of inserts).
create or replace function public._prune_global_cash_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.id % 100) = 0 then
    delete from public.global_cash_events where id < new.id - 300;
  end if;
  return null;
end $$;
drop trigger if exists global_cash_events_prune on public.global_cash_events;
create trigger global_cash_events_prune after insert on public.global_cash_events
  for each row execute function public._prune_global_cash_events();

-- Feed: the running total + the most recent sales that drove it up.
create or replace function public.get_global_cash_feed()
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object(
    'total', coalesce((select sum(lifetime_earnings) from public.players), 0),
    'events', coalesce((
      select jsonb_agg(row_to_json(e))
      from (
        select id, player_name as name, gem_name as gem, amount, created_at as at
        from public.global_cash_events order by id desc limit 10
      ) e
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_global_cash_feed() to anon, authenticated;

-- Log each gem sale (best-effort; a logging failure must never block a sale).
create or replace function public.sell_inventory_gem(p_player_id uuid, p_specimen_id bigint)
returns double precision language plpgsql security definer set search_path to 'public' as $function$
declare
  v_value double precision;
  v_locked boolean;
  v_new_money double precision;
  v_gem_name text;
  v_name text;
begin
  select value, locked, gem_name
    into v_value, v_locked, v_gem_name
  from public.inventory_gems
  where id = p_specimen_id and player_id = p_player_id
  for update;

  if not found then raise exception 'gem_not_found'; end if;
  if v_locked then raise exception 'gem_locked'; end if;

  update public.players
  set money = money + v_value,
      lifetime_earnings = lifetime_earnings + v_value
  where id = p_player_id
  returning money into v_new_money;

  delete from public.inventory_gems
  where id = p_specimen_id and player_id = p_player_id;

  begin
    select username into v_name from public.players where id = p_player_id;
    insert into public.global_cash_events(player_name, gem_name, amount)
    values (v_name, v_gem_name, v_value);
  exception when others then null;
  end;

  return v_new_money;
end;
$function$;
