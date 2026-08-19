-- =========================================================
-- Public Achievements / Quests / Guilds + site feature switches
-- =========================================================

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  owner_id uuid not null references public.players(id) on delete cascade,
  points bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (guild_id, player_id),
  unique (player_id)
);

create table if not exists public.guild_invites (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  invited_player_id uuid not null references public.players(id) on delete cascade,
  invited_by uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.guild_quests (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  name text not null,
  description text not null default '',
  requirements jsonb not null default '{"type":"guild_points","amount":100}'::jsonb,
  reward_points bigint not null default 0,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_members_player_idx on public.guild_members(player_id);
create index if not exists guild_invites_player_status_idx on public.guild_invites(invited_player_id,status);
create index if not exists guild_quests_guild_idx on public.guild_quests(guild_id,enabled);

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_quests enable row level security;
revoke all on public.guilds, public.guild_members, public.guild_invites, public.guild_quests from anon, authenticated;
grant select,insert,update,delete on public.guilds, public.guild_members, public.guild_invites, public.guild_quests to service_role;

drop policy if exists game_section_settings_public_read on public.game_section_settings;
create policy game_section_settings_public_read on public.game_section_settings for select to anon, authenticated using (true);

insert into public.game_section_settings(id,label,description,enabled,sort_order) values
 ('achievements','Achievements','Milestones and permanent accomplishments.',false,50),
 ('quests','Quests','Main, event and special progression quests.',false,60),
 ('guilds','Guilds','Create a guild, invite players and earn guild points.',false,70)
on conflict (id) do nothing;

create or replace function public.record_guild_roll_points(p_player_id uuid, p_points bigint default 1)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_guild public.guilds%rowtype; v_points bigint;
begin
 select g.* into v_guild from public.guild_members gm join public.guilds g on g.id=gm.guild_id where gm.player_id=p_player_id limit 1;
 if not found then return jsonb_build_object('guild',false,'points',0); end if;
 v_points:=greatest(1,coalesce(p_points,1));
 update public.guilds set points=points+v_points where id=v_guild.id returning points into v_points;
 return jsonb_build_object('guild',true,'guildId',v_guild.id,'points',v_points);
end; $$;
revoke all on function public.record_guild_roll_points(uuid,bigint) from public;
grant execute on function public.record_guild_roll_points(uuid,bigint) to service_role;
