-- =========================================================
-- LEADERBOARD HIDE FLAG + AUCTION LISTING CAP
--
-- 1. players.leaderboard_hidden lets an admin remove a player
--    from every leaderboard (the admin panel toggles it). Every
--    board RPC + the leaderboards edge function filter on it.
-- 2. Auction house: cap concurrent listings per player at 3.
-- =========================================================

alter table public.players
  add column if not exists leaderboard_hidden boolean not null default false;

-- ---- Player-sourced boards: exclude hidden players ----

create or replace function public.get_base_luck_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, base_luck numeric, equipped_items bigint)
language sql security definer set search_path to '' as $function$
  with player_luck as (
    select
      p.id, p.username,
      (1::numeric + coalesce(sum(
        case when e.equipped = true then coalesce(e.luck_bonus, 0)::numeric else 0::numeric end
      ), 0::numeric)) as base_luck,
      count(*) filter (where e.equipped = true) as equipped_items
    from public.players p
    left join public.player_equipment e on e.player_id = p.id
    where p.username is not null and p.leaderboard_hidden = false
    group by p.id, p.username
  )
  select row_number() over (order by base_luck desc, username asc) as rank,
    username, base_luck, equipped_items
  from player_luck
  order by base_luck desc, username asc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

create or replace function public.get_gems_found_leaderboard()
returns table(rank bigint, username text, gems_found numeric)
language sql security definer set search_path to '' as $function$
  with ranked as (
    select p.username,
      coalesce(p.gems_found_score, 0)::numeric as gems_found,
      row_number() over (
        order by coalesce(p.gems_found_score, 0) desc, p.total_rolls desc, p.id
      ) as rn
    from public.players p
    where p.username is not null and p.leaderboard_hidden = false
  )
  select rn as rank, username, gems_found
  from ranked where rn <= 100 order by rn;
$function$;

create or replace function public.get_rarest_gem_leaderboard(p_limit integer default 25)
returns table(rank bigint, username text, gem_name text, rarity numeric, base_rarity numeric, value numeric, final_weight numeric, mutation_id text, mutation_ids text[], mutation_multiplier numeric, mutation_chance_multiplier numeric, mutation_chance_product numeric, created_at timestamp with time zone)
language sql security definer set search_path to '' as $function$
  with inventory as (
    select g.id, g.player_id, p.username, g.gem_name,
      coalesce(g.rarity, 0)::numeric as base_rarity,
      coalesce(g.value, 0)::numeric as value,
      coalesce(g.final_weight, 0)::numeric as final_weight,
      g.mutation_id,
      coalesce(g.mutation_ids, '{}') as mutation_ids,
      coalesce(g.mutation_multiplier, 1)::numeric as mutation_multiplier,
      g.created_at
    from public.inventory_gems g
    join public.players p on p.id = g.player_id
    where p.username is not null and p.leaderboard_hidden = false
  ),
  scored as (
    select i.*,
      (i.base_rarity
        * case when 'polished' = any(i.mutation_ids) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(i.mutation_ids) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(i.mutation_ids) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(i.mutation_ids) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(i.mutation_ids) then 50000::numeric else 1::numeric end
      )::numeric as effective_rarity,
      (case when 'polished' = any(i.mutation_ids) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(i.mutation_ids) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(i.mutation_ids) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(i.mutation_ids) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(i.mutation_ids) then 50000::numeric else 1::numeric end
      )::numeric as mutation_chance_product
    from inventory i
  ),
  per_player as (
    select s.*,
      row_number() over (
        partition by s.player_id
        order by s.effective_rarity desc, s.base_rarity desc, s.created_at desc, s.id desc
      ) as player_rank
    from scored s
  )
  select row_number() over (
      order by p.effective_rarity desc, p.base_rarity desc, p.created_at desc, p.id desc
    ) as rank,
    p.username, p.gem_name, p.effective_rarity as rarity, p.base_rarity, p.value,
    p.final_weight, p.mutation_id, p.mutation_ids, p.mutation_multiplier,
    1::numeric as mutation_chance_multiplier, p.mutation_chance_product, p.created_at
  from per_player p
  where p.player_rank = 1
  order by p.effective_rarity desc, p.base_rarity desc, p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$function$;

-- ---- History-sourced boards: exclude rows whose player is hidden ----

create or replace function public.get_best_roll_leaderboard(p_limit integer default 25)
returns table(rank bigint, username text, gem_name text, rarity numeric, base_rarity numeric, value numeric, final_weight numeric, mutation_id text, mutation_ids text[], mutation_multiplier numeric, mutation_chance_multiplier numeric, mutation_chance_product numeric, created_at timestamp with time zone)
language sql security definer set search_path to '' as $function$
  with scored as (
    select h.id, h.username, h.gem_name, h.rarity as base_rarity, h.value, h.final_weight,
      h.mutation_id, coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids,
      coalesce(h.mutation_multiplier, 1)::numeric as mutation_multiplier, h.created_at,
      (coalesce(h.rarity, 0)::numeric
        * case when 'polished' = any(coalesce(h.mutation_ids, '{}'::text[])) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(coalesce(h.mutation_ids, '{}'::text[])) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(coalesce(h.mutation_ids, '{}'::text[])) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(coalesce(h.mutation_ids, '{}'::text[])) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(coalesce(h.mutation_ids, '{}'::text[])) then 50000::numeric else 1::numeric end
      )::numeric as effective_rarity,
      (case when 'polished' = any(coalesce(h.mutation_ids, '{}'::text[])) then 100::numeric else 1::numeric end
        * case when 'gilded' = any(coalesce(h.mutation_ids, '{}'::text[])) then 500::numeric else 1::numeric end
        * case when 'prismatic' = any(coalesce(h.mutation_ids, '{}'::text[])) then 2500::numeric else 1::numeric end
        * case when 'celestial' = any(coalesce(h.mutation_ids, '{}'::text[])) then 10000::numeric else 1::numeric end
        * case when 'corrupted' = any(coalesce(h.mutation_ids, '{}'::text[])) then 50000::numeric else 1::numeric end
      )::numeric as mutation_chance_product
    from public.best_roll_history h
    where h.username is not null
      and not exists (select 1 from public.players pp where pp.id = h.player_id and pp.leaderboard_hidden = true)
  )
  select row_number() over (
      order by effective_rarity desc, base_rarity desc, created_at desc, id desc
    ) as rank,
    username, gem_name, effective_rarity as rarity, base_rarity, value, final_weight,
    mutation_id, mutation_ids, mutation_multiplier, 1::numeric as mutation_chance_multiplier,
    mutation_chance_product, created_at
  from scored
  order by effective_rarity desc, base_rarity desc, created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$function$;

create or replace function public.get_raw_rare_roll_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, gem_name text, raw_rarity numeric, base_rarity numeric, raw_luck numeric, mutation_ids text[], created_at timestamp with time zone)
language sql security definer set search_path to '' as $function$
  with scored as (
    select h.id, h.username, h.gem_name,
      greatest(1::numeric, coalesce(h.rarity, 0)::numeric / greatest(1::numeric, coalesce(h.raw_luck, 1)::numeric)) as raw_rarity,
      coalesce(h.rarity, 0)::numeric as base_rarity,
      greatest(1::numeric, coalesce(h.raw_luck, 1)::numeric) as raw_luck,
      coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids, h.created_at
    from public.best_roll_history h
    where h.username is not null
      and not exists (select 1 from public.players pp where pp.id = h.player_id and pp.leaderboard_hidden = true)
  )
  select row_number() over (order by raw_rarity desc, base_rarity desc, created_at desc, id desc) as rank,
    username, gem_name, raw_rarity, base_rarity, raw_luck, mutation_ids, created_at
  from scored
  order by raw_rarity desc, base_rarity desc, created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

create or replace function public.get_most_weight_leaderboard(p_limit integer default 100)
returns table(rank bigint, username text, gem_name text, final_weight numeric, base_rarity numeric, mutation_ids text[], created_at timestamp with time zone)
language sql security definer set search_path to '' as $function$
  select row_number() over (order by h.final_weight desc, h.created_at desc, h.id desc) as rank,
    h.username, h.gem_name, h.final_weight, h.base_rarity,
    coalesce(h.mutation_ids, '{}'::text[]) as mutation_ids, h.created_at
  from public.roll_weight_history h
  where h.username is not null
    and not exists (select 1 from public.players pp where pp.id = h.player_id and pp.leaderboard_hidden = true)
  order by h.final_weight desc, h.created_at desc, h.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$function$;

-- ---- Auction house: cap concurrent listings per player at 3 (was 10) ----

create or replace function public.create_auction(p_specimen_id bigint, p_start_price double precision, p_duration_hours integer)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_gem public.inventory_gems%rowtype;
  v_username text; v_auction_id bigint;
  v_hours int := coalesce(p_duration_hours, 24);
  v_active int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_start_price is null or p_start_price < 1 or p_start_price > 1e15 then raise exception 'invalid_price'; end if;
  if v_hours not in (1, 6, 24) then v_hours := 24; end if;

  select count(*) into v_active from public.auctions where seller_id = v_uid and status = 'active';
  if v_active >= 3 then raise exception 'too_many_listings'; end if;

  delete from public.inventory_gems
  where id = p_specimen_id and player_id = v_uid and locked = false
  returning * into v_gem;
  if not found then raise exception 'gem_unavailable'; end if;

  if v_gem.gem_name in ('Enchant Relic', 'Ancient Relic') then
    raise exception 'not_auctionable';
  end if;

  select username into v_username from public.players where id = v_uid;

  insert into public.auctions (seller_id, seller_name, gem, gem_name, rarity, start_price, ends_at)
  values (
    v_uid, v_username,
    to_jsonb(v_gem) - 'id' - 'player_id' - 'created_at',
    v_gem.gem_name, v_gem.rarity, p_start_price,
    now() + make_interval(hours => v_hours)
  )
  returning id into v_auction_id;

  return v_auction_id;
end; $function$;
grant execute on function public.create_auction(bigint, double precision, integer) to authenticated;
