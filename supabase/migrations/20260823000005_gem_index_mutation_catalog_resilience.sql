begin;

-- Gem Index mutation catalog resilience. Admin-created rows live in
-- game_mutations; expose both a table-shaped and JSON-shaped public reader so
-- older PostgREST schema caches cannot hide custom mutations from the client.
create or replace function public.get_public_mutation_catalog()
returns table (
  id text, name text, chance numeric, multiplier numeric, description text,
  icon text, color text, enabled boolean, sort_order integer, updated_at timestamptz
)
language sql stable security definer set search_path=public
as $$
  select m.id,m.name,m.chance,m.multiplier,m.description,m.icon,m.color,m.enabled,m.sort_order,m.updated_at
  from public.game_mutations m
  where m.enabled = true
  order by m.sort_order asc,m.name asc,m.id asc;
$$;

create or replace function public.get_public_mutation_catalog_json()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',m.id,'name',m.name,'chance',m.chance,'multiplier',m.multiplier,
      'description',m.description,'icon',m.icon,'color',m.color,
      'enabled',m.enabled,'sort_order',m.sort_order,'updated_at',m.updated_at
    ) order by m.sort_order asc,m.name asc,m.id asc
  ),'[]'::jsonb)
  from public.game_mutations m
  where m.enabled = true;
$$;

create or replace function public.get_public_mutation_catalog_all()
returns jsonb
language sql stable security definer set search_path=public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',m.id,'name',m.name,'chance',m.chance,'multiplier',m.multiplier,
      'description',m.description,'icon',m.icon,'color',m.color,
      'enabled',m.enabled,'sort_order',m.sort_order,'updated_at',m.updated_at
    ) order by m.sort_order asc,m.name asc,m.id asc
  ),'[]'::jsonb)
  from public.game_mutations m;
$$;

revoke all on function public.get_public_mutation_catalog() from public;
grant execute on function public.get_public_mutation_catalog() to anon, authenticated;
revoke all on function public.get_public_mutation_catalog_json() from public;
grant execute on function public.get_public_mutation_catalog_json() to anon, authenticated;
revoke all on function public.get_public_mutation_catalog_all() from public;
grant execute on function public.get_public_mutation_catalog_all() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
