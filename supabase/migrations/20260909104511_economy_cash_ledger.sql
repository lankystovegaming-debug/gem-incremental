-- Forward-only accounting. Existing transaction/history tables remain authoritative
-- for their own features. No historical attribution or opening-balance backfill.
begin;
set local lock_timeout = '5s';
-- Stop concurrent cash writers while installing all accounting hooks atomically.
lock table public.players, public.bank_accounts, public.market_fee_transactions in share row exclusive mode;
create schema if not exists economy_private;
revoke all on schema economy_private from public, anon, authenticated;

create table public.economy_cash_ledger (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default statement_timestamp(),
  transaction_id bigint not null default txid_current(),
  player_id uuid, -- deliberately no FK: account deletion must not erase accounting
  account text not null check (account in ('wallet','bank','clearing')),
  amount numeric not null check (amount <> 0 and amount not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  direction text not null check (direction in ('source','sink','transfer')),
  category text not null,
  subcategory text not null,
  reference text,
  metadata jsonb not null default '{}'::jsonb
);
create index economy_cash_ledger_time on public.economy_cash_ledger(created_at);
create index economy_cash_ledger_player_time on public.economy_cash_ledger(player_id,created_at desc);
alter table public.economy_cash_ledger enable row level security;
revoke all on public.economy_cash_ledger from public,anon,authenticated,service_role;

create table economy_private.tracking (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default clock_timestamp()
);
insert into economy_private.tracking default values;
alter table economy_private.tracking enable row level security;

-- The first recognized PL/pgSQL caller is the actual writer, not an outer
-- request (bank_deposit can call bank_touch, which credits savings interest).
-- This avoids replacing deployed gameplay functions just to add telemetry.
create table economy_private.cash_paths (
  function_name text primary key,
  category text not null,
  direction text check(direction in ('source','sink','transfer'))
);
alter table economy_private.cash_paths enable row level security;

insert into economy_private.cash_paths values
  ('sell_inventory_gem','gem_sales',null),
  ('bank_borrow','bank_loans',null),
  ('bank_repay','bank_loans',null),
  ('bank_touch','bank_interest',null),
  ('bank_deposit','bank_deposit','transfer'),
  ('bank_withdraw','bank_withdrawal','transfer'),
  ('apply_private_feature_currency_reward','admin_system_rewards',null),
  ('apply_reward_object','admin_system_rewards',null),
  ('dependency_improvement','admin_system_rewards',null),
  ('admin_adjust_economy_cash','admin_system_rewards',null),
  ('grant_achievement_rewards_v013','achievements',null),
  ('redeem_code_single_reward','codes',null),
  ('settle_my_referral','referrals',null),
  ('season_grant_reward','season_rewards',null),
  ('finalize_guild_competitions','guild_rewards',null),
  ('craft_equipment_recipe','equipment_crafting',null),
  ('masterwork_equipment_beta','masterwork','sink'),
  ('masterwork_equipment_with_cache_tokens','masterwork','sink'),
  ('buy_consumable','consumables',null),
  ('buy_consumables_bulk','consumables',null),
  ('craft_consumable_recipe','consumables',null),
  ('buy_daily_shop_offer','daily_shop',null),
  ('refresh_daily_shop','daily_shop',null),
  ('buy_gem','gem_shop',null),
  ('buy_shares','shares',null),
  ('sell_shares','shares',null),
  ('guild_purchase_points_with_cash','guild_contributions',null),
  ('create_guild_v2','guild_creation',null),
  ('museum_expand','museum',null),
  ('purchase_mining_cache','mining_caches',null),
  ('purchase_season_premium','season_premium',null),
  ('reset_research_tree_v014','research',null),
  ('upgrade_inventory_capacity','inventory',null),
  ('upgrade_inventory_infinite','inventory',null),
  ('burn_player_money','money_burn',null),
  ('migrate_legacy_save','legacy_import',null),
  ('enter_expedition','expedition_services',null),
  ('choose_abandoned_mine_camp_service','expedition_services',null),
  ('fund_abandoned_mine','expedition_services',null),
  ('fund_abandoned_mine_hell','expedition_services',null),
  ('fund_crystal_depth','expedition_services',null),
  ('fund_crystal_hell_depth','expedition_services',null),
  ('fund_volcanic_depth','expedition_services',null),
  ('buy_volcanic_cooling','expedition_services',null),
  ('buy_volcanic_monitoring','expedition_services',null),
  ('resolve_abandoned_mine_hell_event','expedition_services',null),
  ('resolve_crystal_decision','expedition_services',null),
  ('resolve_crystal_hell_decision','expedition_services',null),
  ('reveal_abandoned_mine_hell_card','expedition_services',null),
  ('sample_volcanic_magma','expedition_services',null),
  ('reroll_expedition_quest','expedition_services',null),
  ('settle_abandoned_mine','expedition_rewards',null),
  ('settle_abandoned_mine_hell','expedition_rewards',null),
  ('settle_crystal_caverns','expedition_rewards',null),
  ('settle_volcanic_depths','expedition_rewards',null),
  ('buy_auction','market_escrow','transfer'),
  ('create_gem_order','market_escrow','transfer'),
  ('cancel_gem_order','market_escrow','transfer'),
  ('expire_stale_gem_orders','market_escrow','transfer'),
  ('fulfill_gem_order','market_escrow','transfer'),
  ('place_bid','market_escrow','transfer'),
  ('settle_due_auctions','market_escrow','transfer'),
  ('war_challenge','war_escrow','transfer'),
  ('war_respond','war_escrow','transfer'),
  ('war_cancel','war_escrow','transfer'),
  ('war_resolve_due','war_escrow','transfer');

create function economy_private.capture_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old numeric := 0; v_new numeric := 0; v_delta numeric; v_player uuid;
  v_account text := tg_argv[0]; v_context text; v_match text[];
  v_function text; v_category text; v_direction text; v_subcategory text;
begin
  if tg_op <> 'INSERT' then
    if v_account='wallet' then v_old:=coalesce(old.money::numeric,0); v_player:=old.id;
    else v_old:=coalesce(old.balance::numeric,0); v_player:=old.player_id; end if;
  end if;
  if tg_op <> 'DELETE' then
    if v_account='wallet' then v_new:=coalesce(new.money::numeric,0); v_player:=new.id;
    else v_new:=coalesce(new.balance::numeric,0); v_player:=new.player_id; end if;
  end if;
  v_delta := v_new-v_old;
  if v_delta=0 then return null; end if;
  get diagnostics v_context = pg_context;
  for v_match in select regexp_matches(v_context,'(?:PL/pgSQL|SQL) function (?:public\.)?([a-z_][a-z_0-9]*)\(', 'g') loop
    select category,direction into v_category,v_direction
      from economy_private.cash_paths where function_name=v_match[1];
    if found then v_function:=v_match[1]; exit; end if;
  end loop;
  v_subcategory:=coalesce(v_function,lower(tg_op));
  if v_function='bank_touch' then
    v_category:=case when v_delta>0 then 'bank_interest' else 'bank_loan_seizure' end;
  end if;
  if v_category is null then
    v_category:=case tg_op when 'INSERT' then 'account_initialization' when 'DELETE' then 'account_removal' else 'unattributed' end;
  end if;
  v_direction:=coalesce(v_direction,case when v_delta>0 then 'source' else 'sink' end);
  insert into public.economy_cash_ledger(player_id,account,amount,direction,category,subcategory,reference,metadata)
  values(v_player,v_account,v_delta,v_direction,v_category,v_subcategory,v_function,
    jsonb_build_object('table',tg_table_name,'operation',tg_op,'before',v_old,'after',v_new,
      'attribution',case when v_function is null then 'balance_only' else 'database_function' end));
  return null;
end $$;
revoke all on function economy_private.capture_cash() from public,anon,authenticated,service_role;

create trigger economy_wallet_update after update of money on public.players
for each row when (old.money is distinct from new.money)
execute function economy_private.capture_cash('wallet','money','id');
create trigger economy_wallet_lifecycle after insert or delete on public.players
for each row execute function economy_private.capture_cash('wallet','money','id');
create trigger economy_bank_update after update of balance on public.bank_accounts
for each row when (old.balance is distinct from new.balance)
execute function economy_private.capture_cash('bank','balance','player_id');
create trigger economy_bank_lifecycle after insert or delete on public.bank_accounts
for each row execute function economy_private.capture_cash('bank','balance','player_id');

-- A fee withheld from an escrow payout is not another wallet debit. These two
-- clearing entries reclassify it from transfer to sink, sum to zero, and retain
-- exact reconciliation to wallet+bank changes. They never change player money.
create function economy_private.record_fee(p_player uuid,p_amount numeric,p_category text,p_reference text,
  p_offset_direction text default 'transfer',p_offset_category text default 'market_escrow') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount=0 then return; end if;
  if p_amount<0 then raise exception 'negative_economy_fee'; end if;
  insert into public.economy_cash_ledger(player_id,account,amount,direction,category,subcategory,reference,metadata)
  values
    (p_player,'clearing',p_amount,p_offset_direction,p_offset_category,'fee_reclassification',p_reference,'{"accountingOnly":true}'),
    (p_player,'clearing',-p_amount,'sink','market_fees',p_category,p_reference,'{"accountingOnly":true}');
end $$;
revoke all on function economy_private.record_fee(uuid,numeric,text,text,text,text) from public,anon,authenticated,service_role;

create function economy_private.capture_market_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform economy_private.record_fee(new.player_id,new.amount,new.market_type,
    'market_fee_transactions:'||new.id::text);
  return null;
end $$;
revoke all on function economy_private.capture_market_fee() from public,anon,authenticated,service_role;
create trigger economy_market_fee after insert on public.market_fee_transactions
for each row execute function economy_private.capture_market_fee();

-- Admin changes now lock and adjust the current balance in a single database
-- transaction, including the existing admin audit and the new cash ledger.
create function public.admin_adjust_economy_cash(p_admin_id uuid,p_player_id uuid,p_amount numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_before double precision; v_after double precision;
begin
  if p_admin_id is null or not (p_admin_id='38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists(select 1 from public.admins where user_id=p_admin_id)) then
    raise exception 'not_admin' using errcode='42501';
  end if;
  if p_amount is null or p_amount=0 or abs(p_amount)>1e12 or p_amount='NaN'::numeric then raise exception 'invalid_amount'; end if;
  select money into v_before from public.players where id=p_player_id for update;
  if not found then raise exception 'player_not_found'; end if;
  update public.players set money=greatest(0,coalesce(money,0)+p_amount),
    lifetime_earnings=greatest(0,coalesce(lifetime_earnings,0)+greatest(0,p_amount))
    where id=p_player_id returning money into v_after;
  insert into public.admin_audit_log(admin_id,target_player_id,action,details)
  values(p_admin_id,p_player_id,'money_adjusted',jsonb_build_object('amount',p_amount,'before',v_before,'after',v_after));
  return jsonb_build_object('money',v_after);
end $$;
revoke all on function public.admin_adjust_economy_cash(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.admin_adjust_economy_cash(uuid,uuid,numeric) to service_role;

create function public.admin_get_economy_breakdown(p_period text default '24H') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_started timestamptz; v_from timestamptz; v_now timestamptz:=statement_timestamp(); v_result jsonb;
begin
  if auth.uid() is null or not (auth.uid()='38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists(select 1 from public.admins where user_id=auth.uid())) then
    raise exception 'not_admin' using errcode='42501';
  end if;
  if p_period is null or p_period not in ('1H','6H','24H','7D','All') then raise exception 'invalid_economy_period'; end if;
  select started_at into v_started from economy_private.tracking where singleton;
  v_from:=greatest(v_started,case p_period when '1H' then v_now-interval '1 hour'
    when '6H' then v_now-interval '6 hours' when '24H' then v_now-interval '24 hours'
    when '7D' then v_now-interval '7 days' else v_started end);
  with grouped as materialized (
    select direction,category,subcategory,account,sum(amount) amount,count(*) entries,
      coalesce(sum(amount) filter(where amount>0),0) credited,
      coalesce(-sum(amount) filter(where amount<0),0) debited
    from public.economy_cash_ledger where created_at>=v_from and created_at<=v_now
    group by direction,category,subcategory,account
  ), totals as (
    select coalesce(sum(amount) filter(where direction='source' and category<>'unattributed'),0) created,
      coalesce(-sum(amount) filter(where direction='sink' and category<>'unattributed'),0) destroyed,
      coalesce(-sum(amount) filter(where category='bank_deposit' and account='wallet'),0) deposited,
      coalesce(sum(amount) filter(where category='bank_withdrawal' and account='wallet'),0) withdrawn,
      coalesce(sum(amount) filter(where direction='transfer'),0) transfer_net,
      coalesce(sum(amount) filter(where category='unattributed'),0) unattributed_net,
      coalesce(sum(entries) filter(where category='unattributed'),0) unattributed_entries,
      coalesce(sum(amount) filter(where account<>'clearing'),0) balance_change,
      coalesce(sum(entries) filter(where account<>'clearing'),0) balance_events
    from grouped
  ), breakdown as (
    select direction,category,subcategory,sum(amount) amount,sum(entries) entries,
      sum(credited) credited,sum(debited) debited from grouped
    where category<>'unattributed' group by direction,category,subcategory
  ), supply as (
    select (select coalesce(sum(money::numeric),0) from public.players) wallets,
      (select coalesce(sum(balance::numeric),0) from public.bank_accounts) deposits
  )
  select jsonb_build_object('period',p_period,'trackingSince',v_started,'periodStart',v_from,'generatedAt',v_now,
    'cashCreated',t.created,'cashDestroyed',t.destroyed,'netCreation',t.created-t.destroyed,
    'walletToBank',t.deposited,'bankToWallet',t.withdrawn,'transferNet',t.transfer_net,
    'unattributedNet',t.unattributed_net,'unattributedEntries',t.unattributed_entries,
    'balanceChange',t.balance_change,'balanceEvents',t.balance_events,
    'walletCash',s.wallets,'bankDeposits',s.deposits,'totalMoneySupply',s.wallets+s.deposits,
    'breakdown',coalesce((select jsonb_agg(jsonb_build_object('direction',direction,'category',category,
      'subcategory',subcategory,'amount',amount,'entries',entries,'credited',credited,'debited',debited)
      order by direction,category,subcategory) from breakdown),'[]'::jsonb)) into v_result
  from totals t cross join supply s;
  return v_result;
end $$;
revoke all on function public.admin_get_economy_breakdown(text) from public,anon;
grant execute on function public.admin_get_economy_breakdown(text) to authenticated;

-- Small hooks in the audited live implementations: use the actual computed fee.
-- Abort on backend drift rather than replacing a newer gameplay formula.
do $guard$ begin
  if md5(pg_get_functiondef('public.buy_shares(numeric)'::regprocedure)) <> '3a73d054692a4297a94701de625a0e49' then
    raise exception 'Economy audit baseline changed: buy_shares. Re-audit this function before deployment.';
  end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.buy_shares(p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_money numeric; v_fee numeric := 0.01; v_shares numeric; v_i numeric; v_eff numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1e15 then raise exception 'invalid_amount'; end if;
  select money into v_money from public.players where id = v_uid for update;
  if v_money is null then raise exception 'player_not_found'; end if;
  if p_amount > v_money then raise exception 'insufficient_funds'; end if;
  -- Fill at the midpoint of this buy's own price impact (pre + post)/2.
  v_i := coalesce((select sum(total_invested) from public.player_shares), 0);
  v_eff := (public.share_price_at(v_i) + public.share_price_at(v_i + p_amount)) / 2.0;
  v_shares := p_amount / (v_eff * (1 + v_fee));
  update public.players set money = money - p_amount where id = v_uid;
  perform economy_private.record_fee(v_uid,p_amount-p_amount/(1+v_fee),'shares_buy',null,'sink','shares');
  insert into public.player_shares (player_id, shares, total_invested, updated_at)
    values (v_uid, v_shares, p_amount, now())
  on conflict (player_id) do update
    set shares = player_shares.shares + excluded.shares,
        total_invested = player_shares.total_invested + excluded.total_invested,
        updated_at = now();
  return public.get_share_market();
end $function$
;
do $guard$ begin
  if md5(pg_get_functiondef('public.sell_shares(numeric)'::regprocedure)) <> '87c897e62dd96a864a99fc595e5672ee' then
    raise exception 'Economy audit baseline changed: sell_shares. Re-audit this function before deployment.';
  end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.sell_shares(p_shares numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_fee numeric := 0.01;
  v_have numeric; v_invested numeric; v_sell numeric; v_proceeds numeric; v_basis_out numeric; v_i numeric; v_eff numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.share_market_is_open() then raise exception 'market_closed'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_amount'; end if;
  select shares, total_invested into v_have, v_invested
    from public.player_shares where player_id = v_uid for update;
  if v_have is null or v_have <= 0 then raise exception 'no_shares'; end if;
  v_sell := least(p_shares, v_have);
  v_basis_out := case when v_have > 0 then v_invested * (v_sell / v_have) else 0 end;
  -- Fill at the midpoint of this sell's own price impact — dumping a big block
  -- crashes your own average fill, so it can't extract the pump.
  v_i := coalesce((select sum(total_invested) from public.player_shares), 0);
  v_eff := (public.share_price_at(v_i) + public.share_price_at(greatest(0, v_i - v_basis_out))) / 2.0;
  v_proceeds := v_sell * v_eff * (1 - v_fee);
  update public.player_shares
    set shares = shares - v_sell,
        total_invested = greatest(0, total_invested - v_basis_out),
        updated_at = now()
    where player_id = v_uid;
  update public.players set money = money + v_proceeds where id = v_uid;
  perform economy_private.record_fee(v_uid,v_sell*v_eff*v_fee,'shares_sell',null,'source','shares');
  return public.get_share_market();
end $function$
;
do $guard$ begin
  if md5(pg_get_functiondef('public.war_resolve_due()'::regprocedure)) <> 'f2f578f8585341f29fa82fde59fd694e' then
    raise exception 'Economy audit baseline changed: war_resolve_due. Re-audit this function before deployment.';
  end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.war_resolve_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_w public.player_wars%rowtype; v_cs numeric; v_os numeric; v_winner uuid; v_net numeric; v_rake numeric; v_n integer := 0;
begin
  -- Expire never-answered challenges and refund the challenger's ante.
  for v_w in select * from public.player_wars where status='pending' and created_at < now() - interval '48 hours' for update loop
    if v_w.stake > 0 then update public.players set money = money + v_w.stake where id = v_w.challenger_id; end if;
    update public.player_wars set status='expired', resolved_at=now(), pot=0 where id = v_w.id;
  end loop;

  for v_w in select * from public.player_wars where status='active' and ends_at <= now() for update loop
    v_cs := greatest(0, public.war_metric_value(v_w.challenger_id, v_w.metric) - coalesce(v_w.challenger_start,0));
    v_os := greatest(0, public.war_metric_value(v_w.opponent_id,   v_w.metric) - coalesce(v_w.opponent_start,0));
    if v_cs > v_os then v_winner := v_w.challenger_id;
    elsif v_os > v_cs then v_winner := v_w.opponent_id;
    else v_winner := null; end if;  -- tie

    if v_winner is null then
      -- Tie: refund each ante.
      if v_w.stake > 0 then
        update public.players set money = money + v_w.stake where id = v_w.challenger_id;
        update public.players set money = money + v_w.stake where id = v_w.opponent_id;
      end if;
    elsif v_w.pot > 0 then
      -- Wagered: winner takes pot minus 5% rake (burned = economy sink).
      v_rake := round(v_w.pot * 0.05);
      v_net := v_w.pot - v_rake;
      update public.players set money = money + v_net where id = v_winner;
      perform economy_private.record_fee(v_winner,v_rake,'war_rake',v_w.id::text,'transfer','war_escrow');
      update public.players set lifetime_money_burned = coalesce(lifetime_money_burned,0) + v_rake where id = v_winner;
    else
      -- Friendly: the game hands the winner a modest prize.
      perform public.apply_reward_object(v_winner, '{"type":"money","amount":200000}'::jsonb);
      perform public.apply_reward_object(v_winner, '{"type":"potion","consumableId":"lucky-potion-1","amount":1}'::jsonb);
    end if;

    update public.player_wars set status='finished', winner_id=v_winner,
      challenger_score=v_cs, opponent_score=v_os, resolved_at=now() where id = v_w.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$
;

commit;
