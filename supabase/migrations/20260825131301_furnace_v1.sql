begin;

alter table public.players
  add column if not exists lifetime_money_burned double precision not null default 0;

alter table public.players
  drop constraint if exists players_lifetime_money_burned_nonnegative;
alter table public.players
  add constraint players_lifetime_money_burned_nonnegative check (lifetime_money_burned >= 0);

create index if not exists players_money_burned_leaderboard_idx
  on public.players (lifetime_money_burned desc)
  where lifetime_money_burned > 0 and leaderboard_hidden = false;

create or replace function public.burn_player_money(p_amount numeric default null, p_burn_all boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_wallet double precision;
  v_amount double precision;
  v_lifetime double precision;
begin
  if v_uid is null then raise exception using errcode = '28000', message = 'not_authenticated'; end if;
  select money into v_wallet from public.players where id = v_uid for update;
  if not found then raise exception using errcode = 'P0001', message = 'player_not_found'; end if;

  if p_burn_all then
    v_amount := greatest(0, v_wallet);
  else
    if p_amount is null or p_amount <= 0 then
      raise exception using errcode = '22023', message = 'invalid_burn_amount';
    end if;
    v_amount := round(p_amount, 2)::double precision;
  end if;

  if v_amount <= 0 then raise exception using errcode = '22023', message = 'invalid_burn_amount'; end if;
  if v_amount > v_wallet then raise exception using errcode = 'P0001', message = 'insufficient_money'; end if;

  update public.players
  set money = greatest(0, money - v_amount),
      lifetime_money_burned = lifetime_money_burned + v_amount
  where id = v_uid
  returning money, lifetime_money_burned into v_wallet, v_lifetime;

  -- Record the drop immediately. Lifetime earnings are deliberately untouched.
  perform public.snapshot_global_cash();
  return jsonb_build_object('money', v_wallet, 'lifetime_money_burned', v_lifetime, 'burned', v_amount);
end;
$$;

revoke all on function public.burn_player_money(numeric, boolean) from public, anon;
grant execute on function public.burn_player_money(numeric, boolean) to authenticated;

create or replace function public.get_top_money_burners(p_limit integer default 10)
returns table (username text, lifetime_money_burned double precision)
language sql stable security definer set search_path = '' as $$
  select p.username, p.lifetime_money_burned
  from public.players p
  where p.username is not null and p.leaderboard_hidden = false and p.lifetime_money_burned > 0
  order by p.lifetime_money_burned desc, p.username
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.get_top_money_burners(integer) from public;
grant execute on function public.get_top_money_burners(integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
