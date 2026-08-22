begin;

-- Gem Builder descriptions are consumed directly by the live Gem Index.
alter table if exists public.private_feature_gems
  add column if not exists description text not null default '';

-- Every retained, non-relic specimen gets an immutable serial within its gem
-- type. Moving a specimen through an auction preserves the existing value.
alter table public.inventory_gems
  add column if not exists serial_number bigint;

with numbered as (
  select id,
         row_number() over (partition by gem_name order by created_at, id)::bigint as serial_number
  from public.inventory_gems
  where gem_name not in ('Enchant Relic', 'Ancient Relic')
    and serial_number is null
)
update public.inventory_gems gem
set serial_number = numbered.serial_number
from numbered
where gem.id = numbered.id;

create table if not exists public.inventory_gem_serial_counters (
  gem_name text primary key,
  next_serial bigint not null check (next_serial > 0)
);

insert into public.inventory_gem_serial_counters(gem_name, next_serial)
select gem_name, max(serial_number) + 1
from public.inventory_gems
where serial_number is not null
group by gem_name
on conflict (gem_name) do update
set next_serial = greatest(public.inventory_gem_serial_counters.next_serial, excluded.next_serial);

create unique index if not exists inventory_gems_name_serial_unique
  on public.inventory_gems(gem_name, serial_number)
  where serial_number is not null;

create or replace function public.assign_inventory_gem_serial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.serial_number is not null
     or new.gem_name in ('Enchant Relic', 'Ancient Relic') then
    return new;
  end if;

  insert into public.inventory_gem_serial_counters(gem_name, next_serial)
  values(new.gem_name, 2)
  on conflict (gem_name) do update
    set next_serial = public.inventory_gem_serial_counters.next_serial + 1
  returning next_serial - 1 into new.serial_number;

  return new;
end;
$$;

drop trigger if exists assign_inventory_gem_serial_trg on public.inventory_gems;
create trigger assign_inventory_gem_serial_trg
  before insert on public.inventory_gems
  for each row execute function public.assign_inventory_gem_serial();

-- The auction system deletes inventory rows into JSON escrow. Restore the
-- original serial when the lot is returned, sold, or used to fill an order.
create or replace function public._auction_restore_gem(p_owner uuid, p_gem jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_gems (
    player_id, serial_number, gem_name, rarity, base_weight, value_per_gram,
    rolled_weight_multiplier, rolled_weight, final_weight, value, locked,
    roll_number, luck_at_roll, mutation_id, mutation_multiplier,
    mutation_ids, mutation_multipliers, mutation_chance_multiplier
  )
  select
    p_owner, r.serial_number, r.gem_name, r.rarity, r.base_weight, r.value_per_gram,
    r.rolled_weight_multiplier, r.rolled_weight, r.final_weight, r.value, false,
    r.roll_number, r.luck_at_roll, r.mutation_id, r.mutation_multiplier,
    r.mutation_ids, r.mutation_multipliers,
    coalesce((p_gem->>'mutation_chance_multiplier')::numeric, 1)
  from jsonb_populate_record(null::public.inventory_gems, p_gem) r;
end;
$$;

-- New codes can contain a bundle of different potion types. Existing codes
-- continue to use their original single-potion columns unchanged.
create table if not exists public.promotional_code_consumable_rewards (
  code text primary key,
  rewards jsonb not null default '[]'::jsonb check (jsonb_typeof(rewards) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.promotional_code_consumable_rewards enable row level security;
revoke all on public.promotional_code_consumable_rewards from anon, authenticated;
grant select, insert, update, delete on public.promotional_code_consumable_rewards to service_role;

create or replace function public.admin_set_code_consumable_rewards(p_code text, p_rewards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward jsonb;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.am_i_admin() then raise exception 'admin_only'; end if;
  if v_code = '' or jsonb_typeof(coalesce(p_rewards, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rewards, '[]'::jsonb)) > 20 then
    raise exception 'invalid_code_rewards';
  end if;

  for v_reward in select value from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb)) loop
    if trim(coalesce(v_reward->>'id', '')) = ''
       or coalesce((v_reward->>'quantity')::integer, 0) not between 1 and 1000000 then
      raise exception 'invalid_code_reward';
    end if;
  end loop;

  insert into public.promotional_code_consumable_rewards(code, rewards, updated_at)
  values(v_code, coalesce(p_rewards, '[]'::jsonb), now())
  on conflict(code) do update set rewards=excluded.rewards, updated_at=now();
  return jsonb_build_object('ok', true, 'code', v_code, 'rewards', coalesce(p_rewards, '[]'::jsonb));
end;
$$;

create or replace function public.admin_list_code_consumable_rewards()
returns table(code text, rewards jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.am_i_admin() then raise exception 'admin_only'; end if;
  return query select r.code, r.rewards from public.promotional_code_consumable_rewards r order by r.code;
end;
$$;

-- Keep the existing, battle-tested validity/redemption-limit implementation
-- and wrap it to grant the additional potion bundle in the same transaction.
do $$
begin
  if to_regprocedure('public.redeem_code_single_reward(text)') is null then
    alter function public.redeem_code(text) rename to redeem_code_single_reward;
  end if;
end
$$;

create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_rewards jsonb := '[]'::jsonb;
  v_reward jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_result := public.redeem_code_single_reward(p_code);
  select rewards into v_rewards
  from public.promotional_code_consumable_rewards
  where code = upper(trim(p_code));
  v_rewards := coalesce(v_rewards, '[]'::jsonb);

  for v_reward in select value from jsonb_array_elements(v_rewards) loop
    perform public.expedition_grant_consumable(
      v_uid,
      v_reward->>'id',
      (v_reward->>'quantity')::integer
    );
  end loop;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('consumables', v_rewards);
end;
$$;

revoke all on function public.admin_set_code_consumable_rewards(text,jsonb) from public;
revoke all on function public.admin_list_code_consumable_rewards() from public;
revoke all on function public.redeem_code(text) from public;
grant execute on function public.admin_set_code_consumable_rewards(text,jsonb) to authenticated;
grant execute on function public.admin_list_code_consumable_rewards() to authenticated;
grant execute on function public.redeem_code(text) to authenticated;

commit;
