-- v0.11.0.1: reliable account bootstrap and leaderboard writes/reads.

begin;

create or replace function public.ensure_player_record()
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player public.players%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.players(id) values(v_uid) on conflict(id) do nothing;
  select * into v_player from public.players where id=v_uid;
  return v_player;
end;
$$;
revoke all on function public.ensure_player_record() from public;
grant execute on function public.ensure_player_record() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.players(id) values(new.id) on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

alter table public.players add column if not exists gems_found_score numeric not null default 0;
alter table public.players add column if not exists leaderboard_hidden boolean not null default false;

create or replace function public.record_gems_found_score(p_player_id uuid,p_rarity numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_score numeric;
begin
  if p_player_id is null then return null; end if;
  update public.players
  set gems_found_score=coalesce(gems_found_score,0)+greatest(0,coalesce(p_rarity,0))
  where id=p_player_id returning gems_found_score into v_score;
  if not found then raise exception 'player_not_found'; end if;
  return v_score;
end;
$$;
revoke all on function public.record_gems_found_score(uuid,numeric) from public;
grant execute on function public.record_gems_found_score(uuid,numeric) to service_role;

grant select,insert,update,delete on public.best_roll_history to service_role;
grant usage,select on all sequences in schema public to service_role;

-- Recover retained specimens whose history write previously failed. Sold or
-- deleted specimens cannot be reconstructed safely and are left untouched.
insert into public.best_roll_history(
  player_id,username,gem_name,rarity,final_weight,value,mutation_id,
  mutation_ids,mutation_multiplier,roll_number,created_at
)
select g.player_id,coalesce(p.username,p.id::text),g.gem_name,
  coalesce(g.rarity,0),coalesce(g.final_weight,0),coalesce(g.value,0),
  g.mutation_id,coalesce(g.mutation_ids,'{}'::text[]),
  coalesce(g.mutation_multiplier,1),g.roll_number,g.created_at
from public.inventory_gems g
join public.players p on p.id=g.player_id
where not exists(
  select 1 from public.best_roll_history h
  where h.player_id=g.player_id and h.gem_name=g.gem_name
    and h.created_at=g.created_at and h.final_weight=coalesce(g.final_weight,0)
);

create or replace function public.get_gems_found_leaderboard()
returns table(rank bigint,username text,gems_found numeric)
language sql security definer set search_path=public as $$
  select row_number() over(order by coalesce(p.gems_found_score,0) desc,p.total_rolls desc,p.id),
         p.username,coalesce(p.gems_found_score,0)::numeric
  from public.players p
  where p.username is not null and p.leaderboard_hidden=false
  order by coalesce(p.gems_found_score,0) desc,p.total_rolls desc,p.id
  limit 100;
$$;
revoke all on function public.get_gems_found_leaderboard() from public;
grant execute on function public.get_gems_found_leaderboard() to anon,authenticated;

create or replace function public.get_best_roll_leaderboard(p_limit integer default 25)
returns table(rank bigint,username text,gem_name text,rarity numeric,base_rarity numeric,value numeric,final_weight numeric,mutation_id text,mutation_ids text[],mutation_multiplier numeric,mutation_chance_multiplier numeric,mutation_chance_product numeric,created_at timestamptz)
language sql security definer set search_path=public as $$
  with scored as (
    select h.id,h.username,h.gem_name,coalesce(h.rarity,0)::numeric base_rarity,
      h.value,h.final_weight,h.mutation_id,coalesce(h.mutation_ids,'{}'::text[]) mutation_ids,
      coalesce(h.mutation_multiplier,1)::numeric mutation_multiplier,h.created_at,
      public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[])) chance_product
    from public.best_roll_history h
    join public.players p on p.id=h.player_id
    where h.username is not null and p.leaderboard_hidden=false
  )
  select row_number() over(order by base_rarity*chance_product desc,base_rarity desc,created_at desc,id desc),
    username,gem_name,base_rarity*chance_product,base_rarity,value,final_weight,mutation_id,
    mutation_ids,mutation_multiplier,1::numeric,chance_product,created_at
  from scored
  order by base_rarity*chance_product desc,base_rarity desc,created_at desc,id desc
  limit greatest(1,least(coalesce(p_limit,25),100));
$$;
revoke all on function public.get_best_roll_leaderboard(integer) from public;
grant execute on function public.get_best_roll_leaderboard(integer) to anon,authenticated;

commit;
