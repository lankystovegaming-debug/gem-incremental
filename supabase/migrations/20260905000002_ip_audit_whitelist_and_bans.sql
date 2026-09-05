-- IP audit improvements:
--   1. A whitelist of IP addresses that should never be flagged (e.g. an
--      admin's own home/office IP, or a known shared-NAT school/library).
--   2. Each flagged account now reports whether it is already banned, so the
--      audit can show a "banned" marker beside Inspect.
--
-- Bans live in the innocuously-named user_roll_luck_rarity_mult table (a row
-- with active_until in the future means the player is currently restricted).

-- ── Whitelist store ───────────────────────────────────────────────────────
create table if not exists public.admin_ip_whitelist (
  ip         text primary key,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.admin_ip_whitelist enable row level security;
-- No direct client access: every read/write goes through the SECURITY DEFINER
-- RPCs below, which are admin-gated.
revoke all on public.admin_ip_whitelist from anon, authenticated;

-- Helper: is the caller an admin?
create or replace function public.admin_ip_whitelist_guard()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (auth.uid() is not null and (
      auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
      or exists (select 1 from public.admins where user_id = auth.uid())))
  then
    raise exception 'not_admin' using errcode = '42501';
  end if;
end $$;
revoke all on function public.admin_ip_whitelist_guard() from public;
grant execute on function public.admin_ip_whitelist_guard() to authenticated;

create or replace function public.admin_list_ip_whitelist()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform public.admin_ip_whitelist_guard();
  select coalesce(jsonb_agg(jsonb_build_object(
      'ip', ip, 'note', note, 'createdAt', created_at
    ) order by created_at desc), '[]'::jsonb)
    into v_result
  from public.admin_ip_whitelist;
  return jsonb_build_object('entries', v_result);
end $$;
revoke all on function public.admin_list_ip_whitelist() from public;
grant execute on function public.admin_list_ip_whitelist() to authenticated;

create or replace function public.admin_add_ip_whitelist(p_ip text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := btrim(coalesce(p_ip, ''));
begin
  perform public.admin_ip_whitelist_guard();
  if v_ip = '' then raise exception 'ip_required'; end if;
  insert into public.admin_ip_whitelist (ip, note, created_by)
  values (v_ip, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (ip) do update set note = excluded.note;
  return public.admin_list_ip_whitelist();
end $$;
revoke all on function public.admin_add_ip_whitelist(text, text) from public;
grant execute on function public.admin_add_ip_whitelist(text, text) to authenticated;

create or replace function public.admin_remove_ip_whitelist(p_ip text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_ip_whitelist_guard();
  delete from public.admin_ip_whitelist where ip = btrim(coalesce(p_ip, ''));
  return public.admin_list_ip_whitelist();
end $$;
revoke all on function public.admin_remove_ip_whitelist(text) from public;
grant execute on function public.admin_remove_ip_whitelist(text) to authenticated;

-- ── Redefined audit: skip whitelisted IPs, report ban status ──────────────
create or replace function public.admin_find_shared_ips(
  p_min_accounts integer default 2,
  p_include_subnet boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_min integer;
  v_result jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  v_min := greatest(2, least(coalesce(p_min_accounts, 2), 100));

  with base as (
    select
      pp.player_id,
      pp.last_ip,
      pp.last_ip_at,
      pp.last_seen_at,
      case
        when not coalesce(p_include_subnet, false) then pp.last_ip
        when pp.last_ip ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
          then array_to_string((string_to_array(pp.last_ip, '.'))[1:3], '.') || '.0/24'
        when position(':' in pp.last_ip) > 0
          then array_to_string((string_to_array(pp.last_ip, ':'))[1:4], ':') || '::/64'
        else pp.last_ip
      end as group_key
    from public.player_presence pp
    where pp.last_ip is not null and btrim(pp.last_ip) <> ''
      -- Skip any address the admin has explicitly whitelisted.
      and not exists (
        select 1 from public.admin_ip_whitelist w where w.ip = pp.last_ip
      )
  ),
  enriched as (
    select
      b.group_key,
      b.player_id,
      b.last_ip,
      b.last_ip_at,
      b.last_seen_at,
      coalesce(nullif(p.username, ''), left(b.player_id::text, 8)) as username,
      u.email,
      ban.active_until as ban_until
    from base b
    left join public.players p on p.id = b.player_id
    left join auth.users u on u.id = b.player_id
    left join public.user_roll_luck_rarity_mult ban
      on ban.player_id = b.player_id and ban.active_until > now()
  ),
  grouped as (
    select
      e.group_key,
      count(*) as account_count,
      jsonb_agg(
        jsonb_build_object(
          'playerId', e.player_id,
          'username', e.username,
          'email', e.email,
          'lastIp', e.last_ip,
          'lastSeenAt', e.last_seen_at,
          'lastIpAt', e.last_ip_at,
          'banned', e.ban_until is not null,
          'banUntil', e.ban_until
        )
        order by e.last_seen_at desc nulls last
      ) as accounts
    from enriched e
    group by e.group_key
    having count(*) >= v_min
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'mode', case when coalesce(p_include_subnet, false) then 'subnet' else 'exact' end,
    'minAccounts', v_min,
    'groupCount', (select count(*) from grouped),
    'accountsFlagged', coalesce((select sum(account_count) from grouped), 0),
    'groups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', g.group_key,
          'accountCount', g.account_count,
          'accounts', g.accounts
        )
        order by g.account_count desc, g.group_key
      )
      from grouped g
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_find_shared_ips(integer, boolean) from public;
grant execute on function public.admin_find_shared_ips(integer, boolean) to authenticated;
