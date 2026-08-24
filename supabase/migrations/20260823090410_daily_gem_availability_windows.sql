begin;

alter table if exists public.private_feature_gems
  add column if not exists availability_mode text not null default 'always',
  add column if not exists daily_start_time time,
  add column if not exists daily_end_time time,
  add column if not exists availability_timezone text not null default 'Asia/Singapore';

update public.private_feature_gems
set availability_mode = 'always'
where availability_mode is null or availability_mode not in ('always','date_range','daily','date_range_daily');

alter table public.private_feature_gems
  drop constraint if exists private_feature_gems_availability_mode_check;
alter table public.private_feature_gems
  add constraint private_feature_gems_availability_mode_check
  check (availability_mode in ('always','date_range','daily','date_range_daily'));

drop function if exists public.get_public_gem_catalog();

create function public.get_public_gem_catalog()
returns table (
  id uuid, title text, name text, rarity numeric, base_weight numeric,
  value_per_gram numeric, description text, metadata jsonb,
  hide_rarity_until_discovered boolean, enabled boolean, sort_order integer,
  starts_at timestamptz, ends_at timestamptz, updated_at timestamptz,
  availability_mode text, daily_start_time time, daily_end_time time,
  availability_timezone text
)
language sql stable security definer set search_path = public
as $$
  select g.id, g.title, g.name, g.rarity, g.base_weight, g.value_per_gram,
    g.description, g.metadata, g.hide_rarity_until_discovered, g.enabled,
    g.sort_order, g.starts_at, g.ends_at, g.updated_at,
    g.availability_mode, g.daily_start_time, g.daily_end_time,
    g.availability_timezone
  from public.private_feature_gems g
  where g.enabled = true
    and (g.starts_at is null or g.starts_at <= now())
    and (g.ends_at is null or g.ends_at > now())
  order by g.sort_order asc, g.rarity asc, g.name asc;
$$;

revoke all on function public.get_public_gem_catalog() from public;
grant execute on function public.get_public_gem_catalog() to anon, authenticated;

commit;
