begin;

create table if not exists public.guild_point_cash_contributions (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  contribution_date date not null,
  purchase_number integer not null check (purchase_number between 1 and 5),
  money_spent bigint not null check (money_spent > 0),
  points_awarded integer not null default 100 check (points_awarded = 100),
  created_at timestamptz not null default now(),
  unique(guild_id, contribution_date, purchase_number)
);

create index if not exists guild_point_cash_contributions_daily_idx
  on public.guild_point_cash_contributions(guild_id, contribution_date, created_at);

alter table public.guild_point_cash_contributions enable row level security;
revoke all on public.guild_point_cash_contributions from anon, authenticated;
grant select, insert, update, delete on public.guild_point_cash_contributions to service_role;

create or replace function public.guild_purchase_points_with_cash(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.guild_members%rowtype;
  v_guild public.guilds%rowtype;
  v_date date := (now() at time zone 'utc')::date;
  v_purchase_number integer;
  v_costs bigint[] := array[1000000,1500000,2000000,3000000,5000000];
  v_cost bigint;
  v_money numeric;
  v_reset_at timestamptz := ((v_date + 1)::timestamp at time zone 'UTC');
begin
  select * into v_member
  from public.guild_members
  where player_id = p_player_id;
  if not found then raise exception 'not_in_guild'; end if;
  if v_member.role not in ('owner','officer') then raise exception 'management_only'; end if;

  -- Serialise purchases for this guild so concurrent officers cannot buy the
  -- same daily slot or bypass its escalating price.
  select * into v_guild from public.guilds where id = v_member.guild_id for update;
  if not found then raise exception 'guild_not_found'; end if;

  select count(*)::integer + 1 into v_purchase_number
  from public.guild_point_cash_contributions
  where guild_id = v_member.guild_id and contribution_date = v_date;
  if v_purchase_number > 5 then raise exception 'guild_point_purchase_limit'; end if;
  v_cost := v_costs[v_purchase_number];

  select money into v_money from public.players where id = p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  if coalesce(v_money, 0) < v_cost then raise exception 'insufficient_money'; end if;

  update public.players set money = money - v_cost where id = p_player_id returning money into v_money;
  update public.guilds set guild_points = guild_points + 100, updated_at = now()
  where id = v_member.guild_id returning * into v_guild;

  insert into public.guild_point_cash_contributions(
    guild_id, player_id, contribution_date, purchase_number, money_spent, points_awarded
  ) values(v_member.guild_id, p_player_id, v_date, v_purchase_number, v_cost, 100);

  insert into public.guild_activity(guild_id, actor_id, action, details)
  values(v_member.guild_id, p_player_id, 'guild_points_funded',
    jsonb_build_object('money', v_cost, 'points', 100, 'purchaseNumber', v_purchase_number));

  return jsonb_build_object(
    'ok', true,
    'moneySpent', v_cost,
    'playerMoney', v_money,
    'pointsAwarded', 100,
    'guildPoints', v_guild.guild_points,
    'purchaseCount', v_purchase_number,
    'remainingPurchases', 5 - v_purchase_number,
    'nextCost', case when v_purchase_number < 5 then v_costs[v_purchase_number + 1] else null end,
    'resetsAt', v_reset_at
  );
end;
$$;

revoke all on function public.guild_purchase_points_with_cash(uuid) from public;
grant execute on function public.guild_purchase_points_with_cash(uuid) to service_role;

commit;
