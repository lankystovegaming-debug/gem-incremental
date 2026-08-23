begin;

-- Unique RPC for the Gem Index.  This intentionally has a new name so the
-- browser cannot be served an older cached definition of the legacy catalog
-- functions.  It reads the same game_mutations table used by the admin panel.
create or replace function public.get_gem_index_mutation_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'chance', m.chance,
        'multiplier', m.multiplier,
        'description', m.description,
        'icon', m.icon,
        'color', m.color,
        'enabled', m.enabled,
        'sort_order', m.sort_order,
        'updated_at', m.updated_at
      )
      order by m.sort_order asc, m.name asc, m.id asc
    ),
    '[]'::jsonb
  )
  from public.game_mutations m
  where m.enabled = true;
$$;

revoke all on function public.get_gem_index_mutation_catalog() from public;
grant execute on function public.get_gem_index_mutation_catalog() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
