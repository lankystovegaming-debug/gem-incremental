begin;

create table if not exists public.player_titles (
  player_id uuid primary key references public.players(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  color text not null default '#ffd166' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.player_titles enable row level security;
revoke all on public.player_titles from anon, authenticated;
grant all on public.player_titles to service_role;

create or replace function public.get_chat_profiles(p_user_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
    'username', p.username,
    'avatar_url', coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
    'title', coalesce(t.title, ''),
    'title_color', coalesce(t.color, '#ffd166')
  )), '{}'::jsonb)
  from public.players p
  left join auth.users u on u.id=p.id
  left join public.player_titles t on t.player_id=p.id
  where p.id=any(coalesce(p_user_ids, '{}'::uuid[]));
$$;
revoke all on function public.get_chat_profiles(uuid[]) from public;
grant execute on function public.get_chat_profiles(uuid[]) to anon, authenticated;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id::text,
    'username',coalesce(nullif(p.username,''),'Guest Player'),
    'avatar_url',coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
    'title',coalesce(t.title,''),
    'title_color',coalesce(t.color,'#ffd166'),
    'total_rolls',coalesce(p.total_rolls,0),
    'lifetime_earnings',coalesce(p.lifetime_earnings,0),
    'inventory_count',(select count(*) from public.inventory_gems ig where ig.player_id=p.id),
    'inventory_capacity',coalesce(p.inventory_capacity,0),
    'rarest_gem_name',p.rarest_gem_name,
    'rarest_gem_rarity',p.rarest_gem_rarity,
    'mutation_luck',coalesce(p.mutation_luck,1),
    'showcase',coalesce(p.showcase,'[]'::jsonb),
    'best_roll',(select jsonb_build_object('gem_name',g.gem_name,'rarity',g.rarity,'final_weight',g.final_weight,'value',g.value,'mutation_ids',coalesce(g.mutation_ids,'{}'::text[])) from public.inventory_gems g where g.player_id=p.id order by g.rarity desc,g.value desc,g.id desc limit 1)
  ) end from public.players p left join auth.users u on u.id=p.id left join public.player_titles t on t.player_id=p.id where p.id=p_user_id;
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

-- Keep the public mutation catalog authoritative and resilient to older policy deployments.
alter table if exists public.game_mutations enable row level security;
drop policy if exists game_mutations_enabled_public_read on public.game_mutations;
create policy game_mutations_enabled_public_read on public.game_mutations for select to anon, authenticated using (enabled=true);
grant select on public.game_mutations to anon, authenticated;

create or replace function public.get_public_mutation_catalog()
returns table(id text,name text,chance numeric,multiplier numeric,description text,icon text,color text,enabled boolean,sort_order integer,updated_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,m.icon,m.color,m.enabled,m.sort_order,m.updated_at from public.game_mutations m where m.enabled=true order by m.sort_order,m.name,m.id;
$$;
revoke all on function public.get_public_mutation_catalog() from public;
grant execute on function public.get_public_mutation_catalog() to anon, authenticated;


-- Recreate the rare-roll recovery projection so recovered announcements also
-- carry the player's current title and colour after a page reload.
drop function if exists public.get_rare_roll_chat_history(integer);
create or replace function public.get_rare_roll_chat_history(p_limit integer default 100)
returns table(
  id bigint,
  player_id uuid,
  username text,
  title text,
  title_color text,
  gem_name text,
  rarity numeric,
  effective_rarity numeric,
  mutation_ids text[],
  base_luck numeric,
  created_at timestamptz
)
language sql security definer set search_path = public
as $$
  with history_rows as (
    select h.id,h.player_id,h.username,
      coalesce(t.title,'') as title,
      coalesce(t.color,'#ffd166') as title_color,
      h.gem_name,h.rarity::numeric as rarity,
      greatest(1,h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[]))) as effective_rarity,
      coalesce(h.mutation_ids,'{}'::text[]) as mutation_ids,
      h.base_luck::numeric as base_luck,h.created_at
    from public.best_roll_history h
    left join public.player_titles t on t.player_id=h.player_id
    where h.rarity >= 100000
       or (cardinality(coalesce(h.mutation_ids,'{}'::text[])) > 0 and h.rarity * public.get_mutation_chance_product(coalesce(h.mutation_ids,'{}'::text[])) >= 1000000)
  ),
  inventory_rows as (
    select -g.id as id,g.player_id,p.username,
      coalesce(t.title,'') as title,
      coalesce(t.color,'#ffd166') as title_color,
      g.gem_name,g.rarity::numeric as rarity,
      greatest(1,g.rarity * public.get_mutation_chance_product(coalesce(g.mutation_ids,'{}'::text[]))) as effective_rarity,
      coalesce(g.mutation_ids,'{}'::text[]) as mutation_ids,
      g.luck_at_roll::numeric as base_luck,g.created_at
    from public.inventory_gems g
    join public.players p on p.id=g.player_id
    left join public.player_titles t on t.player_id=g.player_id
    where g.rarity >= 100000
       or (cardinality(coalesce(g.mutation_ids,'{}'::text[])) > 0 and g.rarity * public.get_mutation_chance_product(coalesce(g.mutation_ids,'{}'::text[])) >= 1000000)
  )
  select * from (select * from history_rows union all select * from inventory_rows) combined
  order by created_at desc,id desc
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;
revoke all on function public.get_rare_roll_chat_history(integer) from public;
grant execute on function public.get_rare_roll_chat_history(integer) to anon, authenticated;

commit;
