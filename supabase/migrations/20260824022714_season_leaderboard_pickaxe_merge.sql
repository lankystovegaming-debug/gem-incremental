begin;

-- Pickaxes now own both Luck and Roll Speed. Lantern rows remain as legacy
-- collectibles, but cannot remain equipped or contribute hidden extra speed.
with speed_curve(tier, bonus) as (values
  (1,0.05::numeric),(2,0.10),(3,0.25),(4,0.40),(5,0.60),
  (6,0.80),(7,1.25),(8,1.80),(9,2.10),(10,2.40),
  (11,2.55),(12,2.70),(13,2.85)
)
update public.player_equipment e
set roll_speed_bonus=s.bonus
from speed_curve s
where e.category='pickaxe' and e.tier=s.tier;

update public.player_equipment
set equipped=false,roll_speed_bonus=0
where category='lantern';

with speed_curve(tier, bonus) as (values
  (1,0.05::numeric),(2,0.10),(3,0.25),(4,0.40),(5,0.60),
  (6,0.80),(7,1.25),(8,1.80),(9,2.10),(10,2.40),
  (11,2.55),(12,2.70),(13,2.85)
)
update public.game_recipes r
set recipe=jsonb_set(
  r.recipe,
  '{reward,bonus,rollSpeed}',
  to_jsonb(s.bonus),
  true
)
from speed_curve s
where r.recipe->>'category'='pickaxe'
  and (r.recipe->'reward'->>'tier')::integer=s.tier;

delete from public.game_recipes where recipe->>'category'='lantern';

-- One authoritative write records history and the Gems Found score together.
create or replace function public.record_roll_leaderboard_entry(
  p_player_id uuid,p_username text,p_gem_name text,p_rarity numeric,
  p_final_weight numeric,p_value numeric,p_mutation_id text,p_mutation_ids text[],
  p_mutation_multiplier numeric,p_raw_luck numeric,p_base_luck numeric,p_roll_number bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_score numeric;
begin
  if p_player_id is null then raise exception 'player_not_found'; end if;
  if coalesce(p_rarity,0)<=0 then return jsonb_build_object('recorded',false,'relic',true); end if;
  insert into public.best_roll_history(
    player_id,username,gem_name,rarity,final_weight,value,mutation_id,
    mutation_ids,mutation_multiplier,raw_luck,base_luck,roll_number
  ) values(
    p_player_id,coalesce(p_username,p_player_id::text),p_gem_name,p_rarity,
    coalesce(p_final_weight,0),coalesce(p_value,0),p_mutation_id,
    coalesce(p_mutation_ids,'{}'::text[]),coalesce(p_mutation_multiplier,1),
    greatest(0.000001,coalesce(p_raw_luck,1)),greatest(0.000001,coalesce(p_base_luck,1)),p_roll_number
  );
  update public.players set gems_found_score=coalesce(gems_found_score,0)+greatest(0,p_rarity)
  where id=p_player_id returning gems_found_score into v_score;
  if not found then raise exception 'player_not_found'; end if;
  return jsonb_build_object('recorded',true,'gemsFoundScore',v_score);
end $$;
revoke all on function public.record_roll_leaderboard_entry(uuid,text,text,numeric,numeric,numeric,text,text[],numeric,numeric,numeric,bigint) from public;
grant execute on function public.record_roll_leaderboard_entry(uuid,text,text,numeric,numeric,numeric,text,text[],numeric,numeric,numeric,bigint) to service_role;
grant select,insert,update,delete on public.best_roll_history to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Repair scores from the complete roll history where available.
update public.players p set gems_found_score=greatest(coalesce(p.gems_found_score,0),coalesce((
  select sum(greatest(0,coalesce(h.rarity,0)))
  from public.best_roll_history h
  where h.player_id=p.id and h.gem_name not in ('Enchant Relic','Ancient Relic')
),0));

create or replace function public.get_gems_found_leaderboard()
returns table(rank bigint,username text,gems_found numeric)
language sql stable security definer set search_path='' as $$
  select row_number() over(order by p.gems_found_score desc,p.total_rolls desc,p.id),
    p.username,p.gems_found_score::numeric
  from public.players p
  where p.username is not null and coalesce(p.leaderboard_hidden,false)=false
  order by p.gems_found_score desc,p.total_rolls desc,p.id limit 100;
$$;
revoke all on function public.get_gems_found_leaderboard() from public;
grant execute on function public.get_gems_found_leaderboard() to anon,authenticated;

create or replace function public.get_best_roll_leaderboard(p_limit integer default 25)
returns table(rank bigint,username text,gem_name text,rarity numeric,base_rarity numeric,value numeric,final_weight numeric,mutation_id text,mutation_ids text[],mutation_multiplier numeric,mutation_chance_multiplier numeric,mutation_chance_product numeric,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  with scored as (
    select h.*,public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[])) chance_product
    from public.best_roll_history h join public.players p on p.id=h.player_id
    where h.gem_name not in ('Enchant Relic','Ancient Relic') and coalesce(p.leaderboard_hidden,false)=false
  )
  select row_number() over(order by s.rarity*s.chance_product desc,s.rarity desc,s.created_at desc,s.id desc),
    s.username,s.gem_name,s.rarity*s.chance_product,s.rarity,s.value,s.final_weight,s.mutation_id,
    s.mutation_ids,s.mutation_multiplier,1::numeric,s.chance_product,s.created_at
  from scored s order by s.rarity*s.chance_product desc,s.rarity desc,s.created_at desc,s.id desc
  limit greatest(1,least(coalesce(p_limit,25),100));
$$;
revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon,authenticated;

create or replace function public.get_raw_rare_roll_leaderboard(p_limit integer default 100)
returns table(rank bigint,username text,gem_name text,raw_rarity numeric,base_rarity numeric,raw_luck numeric,mutation_ids text[],created_at timestamptz)
language sql stable security definer set search_path='' as $$
  with scored as (
    select h.id,h.username,h.gem_name,
      greatest(1::numeric,h.rarity/greatest(0.000001::numeric,coalesce(h.raw_luck,1))) raw_rarity,
      h.rarity base_rarity,greatest(0.000001::numeric,coalesce(h.raw_luck,1)) raw_luck,
      coalesce(h.mutation_ids,'{}'::text[]) mutation_ids,h.created_at
    from public.best_roll_history h join public.players p on p.id=h.player_id
    where h.gem_name not in ('Enchant Relic','Ancient Relic') and coalesce(p.leaderboard_hidden,false)=false
  )
  select row_number() over(order by s.raw_rarity desc,s.base_rarity desc,s.created_at desc,s.id desc),
    s.username,s.gem_name,s.raw_rarity,s.base_rarity,s.raw_luck,s.mutation_ids,s.created_at
  from scored s order by s.raw_rarity desc,s.base_rarity desc,s.created_at desc,s.id desc
  limit greatest(1,least(coalesce(p_limit,100),100));
$$;
revoke all on function public.get_raw_rare_roll_leaderboard(integer) from public;
grant execute on function public.get_raw_rare_roll_leaderboard(integer) to anon,authenticated;

commit;
