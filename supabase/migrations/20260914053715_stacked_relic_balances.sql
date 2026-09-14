begin;

-- Relic Vault progression already uses public.player_relics. Keep the two
-- inventory relic currencies in a separate, deliberately narrow table.
create table public.player_relic_balances (
  player_id uuid not null references public.players(id) on delete cascade,
  relic_type text not null,
  amount bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint player_relic_balances_pkey primary key (player_id, relic_type),
  constraint player_relic_balances_type_check
    check (relic_type in ('Enchant Relic', 'Ancient Relic')),
  constraint player_relic_balances_amount_check check (amount >= 0)
);

alter table public.player_relic_balances enable row level security;

create policy "Players can read their relic balances"
on public.player_relic_balances
for select
to authenticated
using ((select auth.uid()) = player_id);

revoke all on table public.player_relic_balances from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.player_relic_balances from authenticated;
grant select on table public.player_relic_balances to authenticated;
grant all on table public.player_relic_balances to service_role;

create or replace function public.grant_player_relic(
  p_player_id uuid,
  p_relic_type text,
  p_amount bigint default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint;
begin
  if p_player_id is null
     or p_relic_type not in ('Enchant Relic', 'Ancient Relic')
     or p_amount is null
     or p_amount <= 0 then
    raise exception 'invalid_relic';
  end if;

  insert into public.player_relic_balances(player_id, relic_type, amount, updated_at)
  values (p_player_id, p_relic_type, p_amount, now())
  on conflict (player_id, relic_type) do update
    set amount = public.player_relic_balances.amount + excluded.amount,
        updated_at = now()
  returning amount into v_amount;

  return v_amount;
end;
$$;

create or replace function public.spend_player_relic(
  p_player_id uuid,
  p_relic_type text,
  p_amount bigint default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount bigint;
begin
  if p_player_id is null
     or p_relic_type not in ('Enchant Relic', 'Ancient Relic')
     or p_amount is null
     or p_amount <= 0 then
    raise exception 'invalid_relic';
  end if;

  update public.player_relic_balances
  set amount = amount - p_amount,
      updated_at = now()
  where player_id = p_player_id
    and relic_type = p_relic_type
    and amount >= p_amount
  returning amount into v_amount;

  if not found then
    if p_relic_type = 'Ancient Relic' then
      raise exception 'not_enough_ancient_relics';
    end if;
    raise exception 'not_enough_enchant_relics';
  end if;

  return v_amount;
end;
$$;

revoke all on function public.grant_player_relic(uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.spend_player_relic(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.grant_player_relic(uuid, text, bigint) to service_role;
grant execute on function public.spend_player_relic(uuid, text, bigint) to service_role;

create or replace function public.apply_equipment_enchant(
  p_player_id uuid,
  p_equipment_row_id bigint,
  p_relic_type text,
  p_enchant_id text,
  p_enchant_grade text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equipment public.player_equipment%rowtype;
  v_expected_grade text;
  v_remaining bigint;
begin
  v_expected_grade := case p_relic_type
    when 'Enchant Relic' then 'normal'
    when 'Ancient Relic' then 'ancient'
    else null
  end;

  if p_player_id is null
     or v_expected_grade is null
     or p_enchant_grade is distinct from v_expected_grade
     or nullif(p_enchant_id, '') is null then
    raise exception 'invalid_relic';
  end if;

  if (v_expected_grade = 'normal' and not (p_enchant_id = any(array[
       'deep_strike','lucky_break','fortune_surge','collectors_edge',
       'geologist','prospectors_instinct','jackpot_mining','blitz_vein'
     ]))) or (v_expected_grade = 'ancient' and not (p_enchant_id = any(array[
       'deep_strike','lucky_break','fortune_surge','collectors_edge',
       'prospectors_instinct','vein_hunter','jackpot_mining','blitz_vein','slow_starter'
     ]))) then
    raise exception 'invalid_enchant';
  end if;

  select * into v_equipment
  from public.player_equipment
  where id = p_equipment_row_id
    and player_id = p_player_id
  for update;

  if not found
     or v_equipment.category <> 'pickaxe'
     or not v_equipment.equipped then
    raise exception 'invalid_equipment';
  end if;

  if v_equipment.enchant_id is not distinct from p_enchant_id then
    raise exception 'same_enchant';
  end if;

  v_remaining := public.spend_player_relic(p_player_id, p_relic_type, 1);

  update public.player_equipment
  set enchant_id = p_enchant_id,
      enchant_grade = p_enchant_grade,
      enchant_state = '{}'::jsonb
  where id = p_equipment_row_id
  returning * into v_equipment;

  -- Expedition tracking is ancillary. Keep enchanting atomic even on installs
  -- where that later feature is absent.
  if to_regprocedure('public.record_expedition_relic_spend(uuid,integer,integer)') is not null then
    perform public.record_expedition_relic_spend(
      p_player_id,
      case when p_relic_type = 'Enchant Relic' then 1 else 0 end,
      case when p_relic_type = 'Ancient Relic' then 1 else 0 end
    );
  end if;

  return jsonb_build_object(
    'equipment', to_jsonb(v_equipment),
    'enchantId', p_enchant_id,
    'grade', p_enchant_grade,
    'remaining', v_remaining
  );
end;
$$;

revoke all on function public.apply_equipment_enchant(uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_equipment_enchant(uuid, bigint, text, text, text)
  to service_role;

-- Serialize the one-time snapshot/backfill/delete with all legacy inventory writers.
lock table public.inventory_gems in share row exclusive mode;

create temporary table relic_migration_snapshot (
  player_id uuid not null,
  relic_type text not null,
  amount bigint not null,
  primary key (player_id, relic_type)
) on commit drop;

insert into relic_migration_snapshot(player_id, relic_type, amount)
select player_id, gem_name, count(*)::bigint
from public.inventory_gems
where gem_name in ('Enchant Relic', 'Ancient Relic')
group by player_id, gem_name;

insert into public.player_relic_balances(player_id, relic_type, amount, updated_at)
select player_id, relic_type, amount, now()
from relic_migration_snapshot
on conflict (player_id, relic_type) do update
  set amount = excluded.amount,
      updated_at = now();

do $$
begin
  if exists (
    select 1
    from relic_migration_snapshot s
    full join public.player_relic_balances b
      on b.player_id = s.player_id and b.relic_type = s.relic_type
    where coalesce(s.amount, -1) <> coalesce(b.amount, -1)
  ) then
    raise exception 'relic_backfill_verification_failed';
  end if;
end;
$$;

-- Relics cease to be specimens, so remove the few specimen-only references
-- before the FK-protected legacy rows are deleted.
update public.players p
set showcase = coalesce((
  select jsonb_agg(item)
  from jsonb_array_elements(p.showcase) item
  where item->>'gem_name' not in ('Enchant Relic', 'Ancient Relic')
), '[]'::jsonb)
where exists (
  select 1 from jsonb_array_elements(p.showcase) item
  where item->>'gem_name' in ('Enchant Relic', 'Ancient Relic')
);

create temporary table relic_museum_players(player_id uuid primary key) on commit drop;
insert into relic_museum_players(player_id)
select distinct me.player_id
from public.museum_exhibits me
join public.inventory_gems ig on ig.id = me.specimen_id
where ig.gem_name in ('Enchant Relic', 'Ancient Relic');

select set_config('app.museum_internal', 'on', true);
delete from public.museum_exhibits me
using public.inventory_gems ig
where me.specimen_id = ig.id
  and ig.gem_name in ('Enchant Relic', 'Ancient Relic');

do $$
declare
  v_player_id uuid;
begin
  if to_regprocedure('public.museum_recalculate(uuid)') is not null then
    for v_player_id in select player_id from relic_museum_players loop
      perform public.museum_recalculate(v_player_id);
    end loop;
  end if;
end;
$$;

delete from public.inventory_gems
where gem_name in ('Enchant Relic', 'Ancient Relic');

do $$
begin
  if exists (
    select 1
    from relic_migration_snapshot s
    full join public.player_relic_balances b
      on b.player_id = s.player_id and b.relic_type = s.relic_type
    where coalesce(s.amount, -1) <> coalesce(b.amount, -1)
  ) or exists (
    select 1 from public.inventory_gems
    where gem_name in ('Enchant Relic', 'Ancient Relic')
  ) then
    raise exception 'relic_final_verification_failed';
  end if;
end;
$$;

-- Compatibility and safety net for old SQL paths (shop/cache/season/admin,
-- auction restoration, and legacy-save imports): aggregate any attempted
-- relic specimens, then remove those transient inventory rows in the same
-- statement transaction.
create or replace function public.redirect_inventory_relic_inserts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_relic_balances(player_id, relic_type, amount, updated_at)
  select player_id, gem_name, count(*)::bigint, now()
  from inserted_inventory_rows
  where gem_name in ('Enchant Relic', 'Ancient Relic')
  group by player_id, gem_name
  on conflict (player_id, relic_type) do update
    set amount = public.player_relic_balances.amount + excluded.amount,
        updated_at = now();

  delete from public.inventory_gems ig
  using inserted_inventory_rows n
  where ig.id = n.id
    and n.gem_name in ('Enchant Relic', 'Ancient Relic');

  return null;
end;
$$;

create trigger inventory_relics_are_stacked
after insert on public.inventory_gems
referencing new table as inserted_inventory_rows
for each statement execute function public.redirect_inventory_relic_inserts();

revoke all on function public.redirect_inventory_relic_inserts() from public, anon, authenticated;

create or replace function public.expedition_grant_relic(
  p_uid uuid,
  p_name text,
  p_qty integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.grant_player_relic(p_uid, p_name, p_qty);
end;
$$;

-- Preserve the current public profile payload while excluding currencies from
-- specimen counts and best-specimen selection.
create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'id', p.id::text,
      'username', coalesce(nullif(p.username,''), 'Guest Player'),
      'avatar_url', coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
      'title', coalesce(nullif(t.title,''), nullif(p.display_title,''), ''),
      'title_color', coalesce(nullif(t.color,''), nullif(p.display_title_color,''), '#ffd166'),
      'created_at', p.created_at,
      'cosmetics', cosmetics_private.resolved_loadout(p.id),
      'bundles', public.bundle_public_summary(p.id) || jsonb_build_object(
        'total',(select count(*) from public.game_bundles),
        'catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'icon',b.icon) order by b.sort_order),'[]') from public.game_bundles b)
      ),
      'gems_discovered', (select count(distinct c.gem_name) from public.player_gem_mutation_combinations c where c.player_id=p.id),
      'achievement_count', (select count(*) from public.private_feature_progress fp join public.private_feature_definitions fd on fd.id=fp.feature_id where fp.player_id=p.id and fp.completed and fd.feature_kind='achievement' and fd.enabled),
      'raw_roll_rarity', (select max(h.raw_rarity) from roll_history_private.lifetime_facts h where h.player_id=p.id and h.gem_name not in ('Enchant Relic','Ancient Relic')),
      'total_rolls', coalesce(p.total_rolls,0),
      'lifetime_earnings', coalesce(p.lifetime_earnings,0),
      'inventory_count', (
        select count(*) from public.inventory_gems ig
        where ig.player_id = p.id
          and ig.gem_name not in ('Enchant Relic', 'Ancient Relic')
      ),
      'inventory_capacity', coalesce(p.inventory_capacity,0),
      'rarest_gem_name', p.rarest_gem_name,
      'rarest_gem_rarity', p.rarest_gem_rarity,
      'mutation_luck', coalesce(p.mutation_luck,1),
      'showcase', coalesce(p.showcase,'[]'::jsonb),
      'best_roll', (
        select jsonb_build_object(
          'gem_name',g.gem_name,
          'rarity',g.rarity,
          'final_weight',g.final_weight,
          'value',g.value,
          'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])
        )
        from public.inventory_gems g
        where g.player_id=p.id
          and g.gem_name not in ('Enchant Relic', 'Ancient Relic')
        order by g.rarity desc,g.value desc,g.id desc
        limit 1
      )
    )
  end
  from public.players p
  left join auth.users u on u.id = p.id
  left join public.player_titles t on t.player_id = p.id
  where p.id = p_user_id;
$$;

-- Keep the live Masterwork formulas and behavior unchanged; only replace the
-- specimen SELECT/DELETE costs and conversion grant with atomic balances.
create or replace function public.masterwork_equipment_beta(
  p_equipment_row_id bigint,
  p_action text,
  p_choice text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.player_equipment%rowtype;
  v_pool text[];
  v_candidates text[];
  v_next integer;
  v_money_mult numeric;
  v_relic_mult numeric;
  v_ancient_mult numeric;
  v_money numeric := 0;
  v_enchant integer := 0;
  v_ancient integer := 0;
  v_base_reroll numeric;
  v_base_relic integer;
  v_new_passive text;
  v_choices text[];
  v_balance double precision;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_action = 'convert_relics' then
    v_money := 2000000;
    v_enchant := 12;
  else
    select * into v_item from public.player_equipment
    where id = p_equipment_row_id and player_id = v_uid for update;
    if not found then raise exception 'equipment_not_found'; end if;
    if v_item.category <> 'pickaxe' and v_item.equipment_id <> 'plastic-shopping-bag' then
      raise exception 'secondary_masterwork_retired';
    end if;
    if v_item.tier < 10 then raise exception 'masterwork_tier_locked'; end if;

    v_pool := case v_item.category
      when 'pickaxe' then array['deep_survey','mutation_resonance','careful_extraction','steady_hand']
      when 'lantern' then array['overclocked_flame','potion_afterglow','focused_beam','flashpoint']
      when 'boots' then array['heavy_step','sure_footing','fortune_walker','trailblazer']
      else null end;
    if v_pool is null then raise exception 'invalid_equipment'; end if;

    v_money_mult := case
      when v_item.tier >= 17 then 3
      when v_item.tier = 16 then 2.5
      when v_item.tier = 15 then 2.2
      when v_item.tier = 14 then 1.9
      when v_item.tier >= 13 then 1.65
      when v_item.tier = 12 then 1.4
      when v_item.tier = 11 then 1.2
      else 1
    end;
    v_relic_mult := case
      when v_item.tier >= 17 then 2.25
      when v_item.tier = 16 then 2
      when v_item.tier = 15 then 1.8
      when v_item.tier = 14 then 1.65
      when v_item.tier >= 13 then 1.5
      when v_item.tier = 12 then 1.3
      when v_item.tier = 11 then 1.15
      else 1
    end;
    v_ancient_mult := case
      when v_item.tier >= 17 then 2
      when v_item.tier = 16 then 1.85
      when v_item.tier = 15 then 1.7
      when v_item.tier = 14 then 1.55
      when v_item.tier >= 13 then 1.4
      when v_item.tier = 12 then 1.2
      else 1
    end;

    if p_action = 'upgrade' then
      if v_item.masterwork_level >= 5 then raise exception 'masterwork_maxed'; end if;
      v_next := v_item.masterwork_level + 1;
      v_money := (array[1000000,2500000,6000000,15000000,25000000])[v_next] * v_money_mult;
      v_enchant := ceil((array[2,4,6,8,10])[v_next] * v_relic_mult);
      v_ancient := ceil((array[0,0,1,1,3])[v_next] * v_ancient_mult);
      if v_next = 3 then
        v_new_passive := v_pool[1 + floor(random() * array_length(v_pool, 1))::integer];
      end if;
    elsif p_action in ('reroll','insight','imprint') then
      if v_item.masterwork_level < 3 or v_item.masterwork_choices is not null then
        raise exception 'passive_unavailable';
      end if;
      v_base_reroll := (array[2000000,3500000,6000000,10000000,15000000])[least(v_item.masterwork_rerolls + 1, 5)];
      v_base_relic := (array[2,3,4,5,6])[least(v_item.masterwork_rerolls + 1, 5)];
      v_money := v_base_reroll * least(2, v_money_mult) * case when p_action = 'imprint' then 5 else 1 end;
      v_enchant := ceil(v_base_relic * v_relic_mult);
      v_ancient := case when p_action = 'insight' then 1 when p_action = 'imprint' then 3 else 0 end;
      select array_agg(x order by random()) into v_candidates
      from unnest(v_pool) x where x <> v_item.masterwork_passive;
      if p_action = 'reroll' then
        v_new_passive := v_candidates[1];
      elsif p_action = 'insight' then
        v_choices := v_candidates[1:3];
      else
        if p_choice is null or not (p_choice = any(v_pool)) or p_choice = v_item.masterwork_passive then
          raise exception 'invalid_passive';
        end if;
        v_new_passive := p_choice;
      end if;
    elsif p_action = 'choose' then
      if v_item.masterwork_choices is null or not (p_choice = any(v_item.masterwork_choices)) then
        raise exception 'invalid_passive';
      end if;
      update public.player_equipment
      set masterwork_passive = p_choice, masterwork_choices = null
      where id = v_item.id;
      return jsonb_build_object(
        'equipment', (select to_jsonb(e) from public.player_equipment e where e.id = v_item.id)
      );
    elsif p_action = 'attune' then
      if v_item.category <> 'pickaxe' or v_item.masterwork_level < 4 then
        raise exception 'attunement_locked';
      end if;
      if p_choice is null
         or p_choice not in ('amplified','resonant','specialized')
         or p_choice is not distinct from v_item.masterwork_attunement then
        raise exception 'invalid_attunement';
      end if;
      v_money := 10000000 * v_money_mult;
      v_enchant := ceil(5 * v_relic_mult);
      v_ancient := ceil(1 * v_ancient_mult);
    else
      raise exception 'invalid_action';
    end if;
  end if;

  update public.players
  set money = money - v_money
  where id = v_uid and money >= v_money
  returning money into v_balance;
  if not found then raise exception 'not_enough_money'; end if;

  if v_enchant > 0 then
    perform public.spend_player_relic(v_uid, 'Enchant Relic', v_enchant);
  end if;
  if v_ancient > 0 then
    perform public.spend_player_relic(v_uid, 'Ancient Relic', v_ancient);
  end if;

  if p_action = 'convert_relics' then
    perform public.grant_player_relic(v_uid, 'Ancient Relic', 1);
    return jsonb_build_object('money',v_balance,'converted',true);
  elsif p_action = 'upgrade' then
    update public.player_equipment set
      masterwork_level=v_next,
      masterwork_passive=coalesce(v_new_passive,masterwork_passive),
      masterwork_passive_rank=case when v_next=3 then 1 when v_next>=4 then 2 else masterwork_passive_rank end,
      masterwork_perfected_at=case when v_next=5 then now() else masterwork_perfected_at end
    where id=v_item.id;
  elsif p_action in ('reroll','imprint') then
    update public.player_equipment
    set masterwork_passive=v_new_passive, masterwork_rerolls=masterwork_rerolls+1
    where id=v_item.id;
  elsif p_action='insight' then
    update public.player_equipment
    set masterwork_choices=v_choices, masterwork_rerolls=masterwork_rerolls+1
    where id=v_item.id;
  elsif p_action='attune' then
    update public.player_equipment set masterwork_attunement=p_choice where id=v_item.id;
  end if;

  return jsonb_build_object(
    'money',v_balance,
    'spentMoney',v_money,
    'spentEnchantRelics',v_enchant,
    'spentAncientRelics',v_ancient,
    'equipment',(select to_jsonb(e) from public.player_equipment e where e.id=v_item.id)
  );
end;
$$;

create or replace function public.masterwork_equipment_with_cache_tokens(
  p_equipment_row_id bigint,
  p_action text,
  p_choice text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := p_action;
  v_result jsonb;
  v_token text;
  v_money numeric;
  v_enchant integer;
  v_ancient integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_action='reroll' and exists(
    select 1 from public.player_mining_cache_items
    where player_id=v_uid and item_id='perfect-forge-token' and quantity>0 for update
  ) then
    v_token := 'perfect-forge-token';
    v_action := 'insight';
  elsif p_action='reroll' and exists(
    select 1 from public.player_mining_cache_items
    where player_id=v_uid and item_id='forge-reroll-token' and quantity>0 for update
  ) then
    v_token := 'forge-reroll-token';
  end if;

  v_result := public.masterwork_equipment_beta(p_equipment_row_id,v_action,p_choice);
  if v_token is not null then
    v_money := coalesce((v_result->>'spentMoney')::numeric,0);
    v_enchant := coalesce((v_result->>'spentEnchantRelics')::integer,0);
    v_ancient := coalesce((v_result->>'spentAncientRelics')::integer,0);
    update public.players set money=money+v_money where id=v_uid;
    if v_enchant > 0 then
      perform public.grant_player_relic(v_uid, 'Enchant Relic', v_enchant);
    end if;
    if v_ancient > 0 then
      perform public.grant_player_relic(v_uid, 'Ancient Relic', v_ancient);
    end if;
    update public.player_mining_cache_items
    set quantity=quantity-1,updated_at=now()
    where player_id=v_uid and item_id=v_token;
    v_result := v_result || jsonb_build_object(
      'spentMoney',0,
      'spentEnchantRelics',0,
      'spentAncientRelics',0,
      'cacheTokenUsed',v_token
    );
  end if;
  return v_result;
end;
$$;

-- A legacy import is a full replacement. Inject balance cleanup into the live
-- function without copying its large, independently evolving import logic.
do $$
declare
  v_oid regprocedure := to_regprocedure(
    'public.migrate_legacy_save(uuid,numeric,integer,bigint,text,integer,jsonb,jsonb,jsonb,text,jsonb)'
  );
  v_definition text;
  v_patched text;
begin
  if v_oid is null then
    raise exception 'migrate_legacy_save_missing';
  end if;

  select pg_get_functiondef(v_oid) into v_definition;
  v_patched := regexp_replace(
    v_definition,
    '(delete from public[.]inventory_gems[[:space:]]+where player_id = p_player_id;)',
    E'\\1\n\n  delete from public.player_relic_balances\n  where player_id = p_player_id;',
    'i'
  );

  if v_patched = v_definition then
    raise exception 'migrate_legacy_save_patch_point_missing';
  end if;
  execute v_patched;
end;
$$;

commit;
