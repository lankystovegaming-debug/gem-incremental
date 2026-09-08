-- Full cleanup: multiplier-only mutation ordering, description credits, cloud settings.
alter table public.game_mutations add column if not exists description_credit text not null default '';
-- Sort order is intentionally removed completely.
alter table public.game_mutations drop column if exists sort_order cascade;

create or replace function public.get_gem_index_mutation_catalog_v3()
returns table (id text,name text,chance numeric,multiplier numeric,description text,description_credit text,icon text,color text,enabled boolean)
language sql stable security definer set search_path=public as $$
 select m.id,m.name,m.chance,m.multiplier,m.description,m.description_credit,m.icon,m.color,m.enabled
 from public.game_mutations m where m.enabled=true order by m.multiplier desc,m.name asc,m.id asc;
$$;

create table if not exists public.player_settings (
 player_id uuid primary key references auth.users(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
alter table public.player_settings enable row level security;
drop policy if exists "read own settings" on public.player_settings;
drop policy if exists "write own settings" on public.player_settings;
create policy "read own settings" on public.player_settings for select using (auth.uid()=player_id);
create policy "write own settings" on public.player_settings for all using (auth.uid()=player_id) with check (auth.uid()=player_id);

-- Remove retired feature tables only when they exist. CASCADE clears obsolete dependent views/policies.
drop table if exists public.quests cascade;
drop table if exists public.player_quests cascade;
drop table if exists public.quest_progress cascade;
drop table if exists public.artifact_archives cascade;
drop table if exists public.artifact_archive_entries cascade;
drop table if exists public.gem_fusions cascade;
drop table if exists public.gem_fusion_jobs cascade;
drop table if exists public.enchanting_lab cascade;
drop table if exists public.enchanting_lab_jobs cascade;
notify pgrst,'reload schema';
