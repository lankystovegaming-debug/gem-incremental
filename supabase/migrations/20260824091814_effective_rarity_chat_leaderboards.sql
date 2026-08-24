-- Correct live mutation denominators and apply the new global-announcement
-- thresholds: base 1/1m+, or mutation-driven effective rarity 1/100m+.

create or replace function public.get_mutation_chance_product(p_mutation_ids text[])
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exp(sum(ln(greatest(m.chance::numeric, 1)))),
    1::numeric
  )
  from unnest(coalesce(p_mutation_ids, '{}'::text[])) ids(id)
  join public.game_mutations m on m.id = ids.id
  where m.enabled = true and m.chance > 0;
$function$;

revoke all on function public.get_mutation_chance_product(text[]) from public;
grant execute on function public.get_mutation_chance_product(text[]) to anon, authenticated, service_role;

create or replace function public.filter_global_roll_announcements()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.rarity, 0) >= 1000000 then return new; end if;
  if coalesce(new.effective_rarity, 0) >= 100000000 then return new; end if;
  delete from public.global_chat_announcements where id = new.id;
  return new;
end;
$function$;

drop trigger if exists filter_global_roll_announcements on public.global_chat_announcements;
create trigger filter_global_roll_announcements
after insert on public.global_chat_announcements
for each row execute function public.filter_global_roll_announcements();

create or replace function public.get_best_roll_leaderboard(p_limit integer default 25)
returns table(rank bigint,username text,gem_name text,rarity numeric,base_rarity numeric,value numeric,final_weight numeric,mutation_id text,mutation_ids text[],mutation_multiplier numeric,mutation_chance_multiplier numeric,mutation_chance_product numeric,created_at timestamptz)
language sql stable security definer set search_path='' as $function$
  with scored as (
    select h.id,h.username,h.gem_name,coalesce(h.rarity,0)::numeric base_rarity,
      h.value,h.final_weight,h.mutation_id,coalesce(h.mutation_ids,'{}'::text[]) mutation_ids,
      coalesce(h.mutation_multiplier,1)::numeric mutation_multiplier,h.created_at,
      public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[])) chance_product
    from public.best_roll_history h
    join public.players p on p.id=h.player_id
    where h.gem_name not in ('Enchant Relic','Ancient Relic')
      and coalesce(p.leaderboard_hidden,false)=false
  )
  select row_number() over(order by s.base_rarity*s.chance_product desc,s.base_rarity desc,s.created_at desc,s.id desc),
    s.username,s.gem_name,s.base_rarity*s.chance_product,s.base_rarity,s.value,s.final_weight,
    s.mutation_id,s.mutation_ids,s.mutation_multiplier,1::numeric,s.chance_product,s.created_at
  from scored s
  order by s.base_rarity*s.chance_product desc,s.base_rarity desc,s.created_at desc,s.id desc
  limit greatest(1,least(coalesce(p_limit,25),100));
$function$;

revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon, authenticated;

create or replace function public.get_rarest_gem_leaderboard(p_limit integer default 25)
returns table(rank bigint,username text,gem_name text,rarity numeric,base_rarity numeric,value numeric,final_weight numeric,mutation_id text,mutation_ids text[],mutation_multiplier numeric,mutation_chance_multiplier numeric,mutation_chance_product numeric,created_at timestamptz)
language sql stable security definer set search_path='' as $function$
  with scored as (
    select g.id,g.player_id,p.username,g.gem_name,coalesce(g.rarity,0)::numeric base_rarity,
      coalesce(g.value,0)::numeric value,coalesce(g.final_weight,0)::numeric final_weight,
      g.mutation_id,coalesce(g.mutation_ids,'{}'::text[]) mutation_ids,
      coalesce(g.mutation_multiplier,1)::numeric mutation_multiplier,g.created_at,
      public.get_mutation_chance_product(coalesce(g.mutation_ids,'{}'::text[])) chance_product
    from public.inventory_gems g
    join public.players p on p.id=g.player_id
    where g.gem_name not in ('Enchant Relic','Ancient Relic')
      and coalesce(p.leaderboard_hidden,false)=false
  ), per_player as (
    select s.*,row_number() over(partition by s.player_id
      order by s.base_rarity*s.chance_product desc,s.base_rarity desc,s.created_at desc,s.id desc) player_rank
    from scored s
  )
  select row_number() over(order by s.base_rarity*s.chance_product desc,s.base_rarity desc,s.created_at desc,s.id desc),
    s.username,s.gem_name,s.base_rarity*s.chance_product,s.base_rarity,s.value,s.final_weight,
    s.mutation_id,s.mutation_ids,s.mutation_multiplier,1::numeric,s.chance_product,s.created_at
  from per_player s where s.player_rank=1
  order by s.base_rarity*s.chance_product desc,s.base_rarity desc,s.created_at desc,s.id desc
  limit greatest(1,least(coalesce(p_limit,25),100));
$function$;

revoke all on function public.get_rarest_gem_leaderboard(integer) from public;
grant execute on function public.get_rarest_gem_leaderboard(integer) to anon, authenticated;
