-- Daily login streak: one claim per day, a rolling 7-day reward cycle, and the
-- streak resets if a day is missed. Rewards escalate (cash / potions / coins),
-- with day 7 a jackpot (big cash + legendary potion + coins + a rare-gem chance).

create table if not exists public.login_streaks (
  player_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_date date,
  total_claims integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.login_streaks enable row level security;
drop policy if exists "read own streak" on public.login_streaks;
create policy "read own streak" on public.login_streaks for select to authenticated using (auth.uid() = player_id);
revoke insert, update, delete on public.login_streaks from anon, authenticated;
grant select on public.login_streaks to authenticated;

-- What day N of the cycle awards (1..7). Returned for previews and applied on
-- claim. Amounts are intentionally modest (this is a daily habit reward).
create or replace function public.login_streak_reward(p_day integer)
returns jsonb language sql immutable as $$
  select case ((p_day - 1) % 7) + 1
    when 1 then '[{"type":"money","amount":25000,"label":"$25,000"}]'::jsonb
    when 2 then '[{"type":"money","amount":50000,"label":"$50,000"}]'::jsonb
    when 3 then '[{"type":"potion","consumableId":"lucky-potion-1","amount":2,"label":"Lucky Potion I ×2"}]'::jsonb
    when 4 then '[{"type":"money","amount":100000,"label":"$100,000"}]'::jsonb
    when 5 then '[{"type":"coins","amount":30,"label":"30 Coins"}]'::jsonb
    when 6 then '[{"type":"money","amount":75000,"label":"$75,000"},{"type":"potion","consumableId":"speed-potion-1","amount":2,"label":"Speed Potion I ×2"}]'::jsonb
    else '[{"type":"money","amount":300000,"label":"$300,000"},{"type":"potion","consumableId":"legendary-potion","amount":1,"label":"Legendary Potion ×1"},{"type":"coins","amount":50,"label":"50 Coins"},{"type":"gemChance","chance":0.2,"gemName":"Kyawthuite","label":"20% chance: rare gem"}]'::jsonb
  end
$$;

-- Grant one reward object to the current player. Mirrors the daily-spin grant
-- paths (money/coins/potion/gem) so behaviour is consistent.
create or replace function public.apply_reward_object(p_uid uuid, p_reward jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_type text := p_reward->>'type';
  v_gem jsonb;
begin
  if v_type = 'money' then
    update public.players set money = greatest(0, coalesce(money,0) + greatest(0,(p_reward->>'amount')::numeric)),
      lifetime_earnings = greatest(0, coalesce(lifetime_earnings,0) + greatest(0,(p_reward->>'amount')::numeric)) where id = p_uid;
    return p_reward;
  elsif v_type = 'coins' then
    update public.players set coins = greatest(0, coalesce(coins,0) + greatest(0,(p_reward->>'amount')::numeric)) where id = p_uid;
    return p_reward;
  elsif v_type = 'potion' then
    if exists (select 1 from public.game_consumables where id = p_reward->>'consumableId') then
      insert into public.player_consumables(player_id, consumable_id, quantity, updated_at)
      values (p_uid, p_reward->>'consumableId', greatest(1,coalesce((p_reward->>'amount')::integer,1)), now())
      on conflict (player_id, consumable_id) do update
        set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();
    end if;
    return p_reward;
  elsif v_type = 'gem' or (v_type = 'gemChance' and random() < coalesce((p_reward->>'chance')::numeric,0)) then
    select to_jsonb(g) into v_gem from public.private_feature_gems g
      where g.name = p_reward->>'gemName' and g.enabled = true order by g.rarity asc limit 1;
    if v_gem is not null then
      insert into public.inventory_gems(player_id,gem_name,rarity,base_weight,value_per_gram,
        rolled_weight_multiplier,rolled_weight,final_weight,mutation_id,mutation_multiplier,
        mutation_ids,mutation_multipliers,value,locked,roll_number,luck_at_roll)
      values (p_uid, v_gem->>'name',(v_gem->>'rarity')::numeric,(v_gem->>'base_weight')::numeric,(v_gem->>'value_per_gram')::numeric,
        1,(v_gem->>'base_weight')::numeric,(v_gem->>'base_weight')::numeric,null,1,'{}'::text[],'{}'::jsonb,
        (v_gem->>'base_weight')::numeric * (v_gem->>'value_per_gram')::numeric, false, 0, 0);
      return jsonb_build_object('type','gem','gemName',v_gem->>'name','label','Rare gem: '||(v_gem->>'name'));
    end if;
    return jsonb_build_object('type','gemChance','won',false,'label','No jackpot this time');
  end if;
  return p_reward;
end $$;
revoke all on function public.apply_reward_object(uuid, jsonb) from public;

create or replace function public.get_login_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.login_streaks%rowtype; v_next integer; v_claimable boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.login_streaks where player_id = v_uid;
  if not found then
    return jsonb_build_object('current',0,'longest',0,'claimable',true,'nextDay',1,
      'todayReward', public.login_streak_reward(1));
  end if;
  v_claimable := v_row.last_claim_date is null or v_row.last_claim_date < current_date;
  -- If the last claim was before yesterday, the streak has lapsed → next is day 1.
  if v_row.last_claim_date is null or v_row.last_claim_date < current_date - 1 then
    v_next := 1;
  else
    v_next := v_row.current_streak + (case when v_claimable then 1 else 0 end);
  end if;
  return jsonb_build_object('current', v_row.current_streak, 'longest', v_row.longest_streak,
    'claimable', v_claimable, 'nextDay', greatest(1,v_next), 'totalClaims', v_row.total_claims,
    'todayReward', public.login_streak_reward(greatest(1, case when v_claimable then v_next else v_row.current_streak end)));
end $$;
revoke all on function public.get_login_streak() from public;
grant execute on function public.get_login_streak() to authenticated;

create or replace function public.claim_daily_login()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.login_streaks%rowtype; v_new integer; v_reward jsonb; v_granted jsonb := '[]'::jsonb; v_item jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.login_streaks(player_id) values (v_uid) on conflict (player_id) do nothing;
  select * into v_row from public.login_streaks where player_id = v_uid for update;

  if v_row.last_claim_date = current_date then raise exception 'already_claimed'; end if;

  if v_row.last_claim_date = current_date - 1 then v_new := v_row.current_streak + 1; else v_new := 1; end if;

  v_reward := public.login_streak_reward(v_new);
  for v_item in select value from jsonb_array_elements(v_reward) loop
    v_granted := v_granted || jsonb_build_array(public.apply_reward_object(v_uid, v_item));
  end loop;

  update public.login_streaks
    set current_streak = v_new, longest_streak = greatest(longest_streak, v_new),
        last_claim_date = current_date, total_claims = total_claims + 1, updated_at = now()
    where player_id = v_uid;

  return jsonb_build_object('streak', v_new, 'dayInCycle', ((v_new - 1) % 7) + 1,
    'longest', greatest(v_row.longest_streak, v_new), 'granted', v_granted);
end $$;
revoke all on function public.claim_daily_login() from public;
grant execute on function public.claim_daily_login() to authenticated;
