-- =========================================================
-- Loot boxes + coins.
--
--   coins            new currency on players (guarded like money)
--   game_loot_boxes  box definitions (id, jsonb) — single source of
--                    truth, read publicly so the UI's odds match the
--                    server's actual odds
--   buy_coins_with_money(n)  1 coin = 100,000 money
--   open_loot_box(id)        spend coins, weighted-pick a reward
--                            (gem / money / inventory slots / potion)
--   loot_box_log     audit of every open
--
-- Real-money coin purchases are intentionally NOT implemented here —
-- that needs a payment provider (Stripe etc.) + a webhook function.
-- =========================================================

set local check_function_bodies = off;

alter table public.players add column if not exists coins bigint not null default 0;


-- Re-guard players including coins.
create or replace function public.players_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.money := 0;
    new.lifetime_earnings := 0;
    new.total_rolls := 0;
    new.inventory_capacity := 15;
    new.coins := 0;
    new.next_roll_at := null;
    new.rarest_gem_name := null;
    new.rarest_gem_rarity := null;
    new.crafting_migrated := false;
    new.stats_migrated := false;
    new.legacy_save_migrated := false;
    return new;
  end if;

  if new.id                    is distinct from old.id
     or new.money              is distinct from old.money
     or new.lifetime_earnings  is distinct from old.lifetime_earnings
     or new.total_rolls        is distinct from old.total_rolls
     or new.inventory_capacity is distinct from old.inventory_capacity
     or new.coins              is distinct from old.coins
     or new.next_roll_at       is distinct from old.next_roll_at
     or new.rarest_gem_name    is distinct from old.rarest_gem_name
     or new.rarest_gem_rarity  is distinct from old.rarest_gem_rarity
     or new.crafting_migrated  is distinct from old.crafting_migrated
     or new.stats_migrated     is distinct from old.stats_migrated
     or new.legacy_save_migrated is distinct from old.legacy_save_migrated
     or new.created_at         is distinct from old.created_at
  then
    raise exception 'forbidden_column_update';
  end if;

  return new;
end;
$$;

drop trigger if exists players_guard_trg on public.players;
create trigger players_guard_trg
  before insert or update on public.players
  for each row execute function public.players_guard();


create table if not exists public.game_loot_boxes (
  id text primary key,
  box jsonb not null,
  sort integer not null default 0
);
alter table public.game_loot_boxes enable row level security;
drop policy if exists "Public can read loot boxes" on public.game_loot_boxes;
create policy "Public can read loot boxes"
  on public.game_loot_boxes for select to anon, authenticated using (true);
revoke insert, update, delete on public.game_loot_boxes from anon, authenticated;
grant select on public.game_loot_boxes to anon, authenticated;

-- RLS policies filter rows, but the role still needs the base SELECT
-- privilege. Newer tables created via SQL don't get it automatically,
-- so grant it here (also backfills the earlier announcements/bug tables).
grant select on public.announcements to anon, authenticated;
grant select on public.bug_reports to authenticated;

create table if not exists public.loot_box_log (
  id bigint generated always as identity primary key,
  player_id uuid references auth.users(id) on delete cascade,
  box_id text,
  reward jsonb,
  created_at timestamptz not null default now()
);
alter table public.loot_box_log enable row level security;
revoke all on public.loot_box_log from anon, authenticated;


insert into public.game_loot_boxes (id, box, sort) values
('starter-crate', $$
{
  "id":"starter-crate","name":"Starter Crate","coin_cost":1,
  "blurb":"A cheap crate of common finds.",
  "pool":[
    {"type":"gem","label":"Quartz","gem":"Quartz","rarity":2,"base_weight":100,"value_per_gram":0.0575,"weight":30},
    {"type":"gem","label":"Feldspar","gem":"Feldspar","rarity":5,"base_weight":125,"value_per_gram":0.092,"weight":25},
    {"type":"gem","label":"Agate","gem":"Agate","rarity":25,"base_weight":200,"value_per_gram":0.184,"weight":20},
    {"type":"money","label":"$25,000","amount":25000,"weight":15},
    {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":250,"value_per_gram":0.253,"weight":8},
    {"type":"slots","label":"+1 inventory slot","slots":1,"weight":2}
  ]
}
$$::jsonb, 1),
('prospectors-chest', $$
{
  "id":"prospectors-chest","name":"Prospector's Chest","coin_cost":3,
  "blurb":"Better gems, cash and the odd potion.",
  "pool":[
    {"type":"gem","label":"Amethyst","gem":"Amethyst","rarity":50,"base_weight":250,"value_per_gram":0.253,"weight":28},
    {"type":"gem","label":"Peridot","gem":"Peridot","rarity":100,"base_weight":300,"value_per_gram":0.36455,"weight":22},
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":18},
    {"type":"money","label":"$100,000","amount":100000,"weight":15},
    {"type":"potion","label":"Lucky Potion I","consumable_id":"lucky-potion-1","quantity":1,"weight":10},
    {"type":"slots","label":"+2 inventory slots","slots":2,"weight":5},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":2}
  ]
}
$$::jsonb, 2),
('cosmic-vault', $$
{
  "id":"cosmic-vault","name":"Cosmic Vault","coin_cost":10,
  "blurb":"The big one — rare gems and a shot at the cosmos.",
  "pool":[
    {"type":"gem","label":"Topaz","gem":"Topaz","rarity":150,"base_weight":325,"value_per_gram":0.47725,"weight":25},
    {"type":"gem","label":"Sapphire","gem":"Sapphire","rarity":1100,"base_weight":475,"value_per_gram":2.05735,"weight":22},
    {"type":"gem","label":"Ruby","gem":"Ruby","rarity":1400,"base_weight":500,"value_per_gram":2.53,"weight":18},
    {"type":"money","label":"$500,000","amount":500000,"weight":15},
    {"type":"gem","label":"Diamond","gem":"Diamond","rarity":2300,"base_weight":550,"value_per_gram":3.8686,"weight":10},
    {"type":"slots","label":"+5 inventory slots","slots":5,"weight":6},
    {"type":"potion","label":"Fortune Potion I","consumable_id":"fortune-potion-1","quantity":1,"weight":3},
    {"type":"gem","label":"Void Opal","gem":"Void Opal","rarity":250000,"base_weight":1550,"value_per_gram":76.5,"weight":1}
  ]
}
$$::jsonb, 3)
on conflict (id) do update set box = excluded.box, sort = excluded.sort;


create or replace function public.buy_coins_with_money(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cost double precision;
  v_money double precision;
  v_coins bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_count is null or p_count < 1 or p_count > 1000000 then raise exception 'invalid_count'; end if;

  v_cost := p_count::double precision * 100000;

  select money into v_money from public.players where id = v_uid for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_money < v_cost then raise exception 'not_enough_money'; end if;

  update public.players set money = money - v_cost, coins = coins + p_count
  where id = v_uid returning coins into v_coins;

  return jsonb_build_object('coins', v_coins, 'spent', v_cost);
end;
$$;
grant execute on function public.buy_coins_with_money(integer) to authenticated;


create or replace function public.open_loot_box(p_box_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_box jsonb;
  v_cost bigint;
  v_pool jsonb;
  v_total numeric := 0;
  v_pick numeric;
  v_acc numeric := 0;
  v_entry jsonb;
  v_chosen jsonb := null;
  v_coins bigint;
  v_mult double precision;
  v_weight double precision;
  v_val double precision;
  v_new_money double precision;
  v_cap integer;
  v_qty integer;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select box into v_box from public.game_loot_boxes where id = p_box_id;
  if v_box is null then raise exception 'box_not_found'; end if;

  v_cost := coalesce((v_box ->> 'coin_cost')::bigint, 0);
  v_pool := v_box -> 'pool';

  select coins into v_coins from public.players where id = v_uid for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_coins < v_cost then raise exception 'not_enough_coins'; end if;

  select coalesce(sum((e ->> 'weight')::numeric), 0) into v_total
  from jsonb_array_elements(v_pool) e;
  if v_total <= 0 then raise exception 'empty_pool'; end if;

  v_pick := random() * v_total;
  for v_entry in select value from jsonb_array_elements(v_pool) loop
    v_acc := v_acc + (v_entry ->> 'weight')::numeric;
    if v_pick < v_acc then v_chosen := v_entry; exit; end if;
  end loop;
  if v_chosen is null then
    select value into v_chosen from jsonb_array_elements(v_pool) order by 1 desc limit 1;
  end if;

  update public.players set coins = coins - v_cost where id = v_uid returning coins into v_coins;

  if v_chosen ->> 'type' = 'gem' then
    v_mult := 0.85 + random() * 0.5;
    v_weight := coalesce((v_chosen ->> 'base_weight')::float8, 0) * v_mult;
    v_val := v_weight * coalesce((v_chosen ->> 'value_per_gram')::float8, 0);
    insert into public.inventory_gems (
      player_id, gem_name, rarity, base_weight, value_per_gram,
      rolled_weight_multiplier, rolled_weight, final_weight, value, locked
    ) values (
      v_uid, v_chosen ->> 'gem', coalesce((v_chosen ->> 'rarity')::int, 0),
      coalesce((v_chosen ->> 'base_weight')::float8, 0),
      coalesce((v_chosen ->> 'value_per_gram')::float8, 0),
      v_mult, v_weight, v_weight, v_val, false
    );
    insert into public.gem_index (player_id, gem_name, total_rolled, heaviest_weight)
    values (v_uid, v_chosen ->> 'gem', 1, v_weight)
    on conflict (player_id, gem_name) do update
      set total_rolled = public.gem_index.total_rolled + 1,
          heaviest_weight = greatest(public.gem_index.heaviest_weight, v_weight),
          updated_at = now();
    v_result := jsonb_build_object('final_weight', v_weight, 'value', v_val, 'weight_multiplier', v_mult);

  elsif v_chosen ->> 'type' = 'money' then
    update public.players set money = money + coalesce((v_chosen ->> 'amount')::float8, 0)
    where id = v_uid returning money into v_new_money;
    v_result := jsonb_build_object('money', v_new_money);

  elsif v_chosen ->> 'type' = 'slots' then
    update public.players set inventory_capacity = inventory_capacity + coalesce((v_chosen ->> 'slots')::int, 0)
    where id = v_uid returning inventory_capacity into v_cap;
    v_result := jsonb_build_object('inventory_capacity', v_cap);

  elsif v_chosen ->> 'type' = 'potion' then
    v_qty := greatest(1, coalesce((v_chosen ->> 'quantity')::int, 1));
    insert into public.player_consumables (player_id, consumable_id, quantity, updated_at)
    values (v_uid, v_chosen ->> 'consumable_id', v_qty, now())
    on conflict (player_id, consumable_id) do update
      set quantity = public.player_consumables.quantity + excluded.quantity, updated_at = now();
    v_result := jsonb_build_object('consumable_id', v_chosen ->> 'consumable_id', 'quantity', v_qty);

  else
    raise exception 'unknown_reward_type';
  end if;

  insert into public.loot_box_log (player_id, box_id, reward) values (v_uid, p_box_id, v_chosen);

  return jsonb_build_object('box_id', p_box_id, 'coins', v_coins, 'reward', v_chosen, 'result', v_result);
end;
$$;
grant execute on function public.open_loot_box(text) to authenticated;
