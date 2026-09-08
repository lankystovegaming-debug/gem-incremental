-- Playtime Upgrades: one point per second of accumulated account playtime.
alter table public.players add column if not exists playtime_seconds bigint not null default 0;
alter table public.players add column if not exists playtime_last_award_at timestamptz not null default now();
alter table public.players add column if not exists playtime_luck_level integer not null default 0;
alter table public.players add column if not exists playtime_mutation_level integer not null default 0;
alter table public.players add column if not exists playtime_roll_speed_level integer not null default 0;
alter table public.players add column if not exists playtime_money_level integer not null default 0;
alter table public.players add column if not exists playtime_points_spent bigint not null default 0;

create or replace function public.playtime_upgrade_multiplier(p_level integer)
returns numeric language sql immutable as $$
  select case greatest(0,coalesce(p_level,0))
    when 0 then 1 when 1 then 1.05 when 2 then 1.10 when 3 then 1.20
    when 4 then 1.35 when 5 then 1.50 when 6 then 1.75 when 7 then 2.00
    when 8 then 2.50 when 9 then 3.00 else 4.00 end;
$$;
create or replace function public.playtime_upgrade_cost(p_level integer)
returns bigint language sql immutable as $$
  select case greatest(0,coalesce(p_level,0))
    when 0 then 100 when 1 then 300 when 2 then 900 when 3 then 3000
    when 4 then 10000 when 5 then 30000 when 6 then 90000 when 7 then 300000
    when 8 then 1000000 else 3000000 end;
$$;

create or replace function public.award_playtime_points()
returns table(playtime_seconds bigint, available_points bigint) language plpgsql security definer set search_path=public as $$
declare v_id uuid:=auth.uid(); v_elapsed bigint; v_now timestamptz:=now(); v_row public.players%rowtype;
begin
 if v_id is null then raise exception 'not_authenticated'; end if;
 select * into v_row from public.players where id=v_id for update;
 if not found then raise exception 'player_not_found'; end if;
 v_elapsed:=least(300,greatest(0,floor(extract(epoch from (v_now-v_row.playtime_last_award_at)))::bigint));
 update public.players set playtime_seconds=playtime_seconds+v_elapsed, playtime_last_award_at=v_now where id=v_id
 returning * into v_row;
 return query select v_row.playtime_seconds, greatest(0,v_row.playtime_seconds-v_row.playtime_points_spent);
end $$;

create or replace function public.get_playtime_upgrades()
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.players%rowtype;
begin perform public.award_playtime_points(); select * into r from public.players where id=auth.uid();
 return jsonb_build_object('playtimeSeconds',r.playtime_seconds,'availablePoints',greatest(0,r.playtime_seconds-r.playtime_points_spent),'spent',r.playtime_points_spent,'levels',jsonb_build_object('luck',r.playtime_luck_level,'mutation',r.playtime_mutation_level,'rollSpeed',r.playtime_roll_speed_level,'money',r.playtime_money_level)); end $$;

create or replace function public.buy_playtime_upgrade(p_upgrade text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.players%rowtype; lvl integer; cost bigint; col text;
begin perform public.award_playtime_points(); select * into r from public.players where id=auth.uid() for update;
 col:=case p_upgrade when 'luck' then 'playtime_luck_level' when 'mutation' then 'playtime_mutation_level' when 'rollSpeed' then 'playtime_roll_speed_level' when 'money' then 'playtime_money_level' else null end;
 if col is null then raise exception 'invalid_upgrade'; end if;
 lvl:=case col when 'playtime_luck_level' then r.playtime_luck_level when 'playtime_mutation_level' then r.playtime_mutation_level when 'playtime_roll_speed_level' then r.playtime_roll_speed_level else r.playtime_money_level end;
 cost:=public.playtime_upgrade_cost(lvl); if r.playtime_seconds-r.playtime_points_spent<cost then raise exception 'insufficient_playtime_points'; end if;
 execute format('update public.players set %I=%I+1, playtime_points_spent=playtime_points_spent+$1 where id=$2',col,col) using cost,auth.uid();
 return public.get_playtime_upgrades(); end $$;
