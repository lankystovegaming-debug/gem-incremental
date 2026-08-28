-- Guild logos are public presentation assets. The guild row holds only an
-- object path; Storage access is limited to the guild's current owner.

begin;

alter table public.guilds
  add column if not exists logo_path text;

alter table public.guilds
  drop constraint if exists guilds_logo_path_format;

alter table public.guilds
  add constraint guilds_logo_path_format
  check (
    logo_path is null
    or logo_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo\.(jpg|jpeg|png|webp)$'
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'guild-logos',
  'guild-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies cannot directly read the private guild tables for a normal
-- player. This narrowly scoped helper keeps that lookup server-side while
-- still evaluating auth.uid() for the player making the upload.
create or replace function public.can_manage_guild_logo(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    array_length(storage.foldername(p_object_name), 1) = 1
    and storage.filename(p_object_name) ~* '^logo\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1
      from public.guilds g
      join public.guild_members m
        on m.guild_id = g.id
      where g.id::text = (storage.foldername(p_object_name))[1]
        and g.owner_id = auth.uid()
        and m.player_id = auth.uid()
        and m.role = 'owner'
    );
$$;

revoke all on function public.can_manage_guild_logo(text) from public;
grant execute on function public.can_manage_guild_logo(text) to authenticated;

drop policy if exists "Guild owners can upload guild logos" on storage.objects;
create policy "Guild owners can upload guild logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'guild-logos'
  and public.can_manage_guild_logo(name)
);

drop policy if exists "Guild owners can replace guild logos" on storage.objects;
create policy "Guild owners can replace guild logos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'guild-logos'
  and public.can_manage_guild_logo(name)
)
with check (
  bucket_id = 'guild-logos'
  and public.can_manage_guild_logo(name)
);

commit;
