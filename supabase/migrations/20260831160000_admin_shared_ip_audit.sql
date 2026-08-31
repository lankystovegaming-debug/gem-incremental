-- Shared-IP audit for the admin panel: find accounts that share the same (or a
-- similar) last-seen IP address, so multi-accounting / alt abuse is easy to spot.
-- Admin-gated, SECURITY DEFINER (player_presence is not client-readable and the
-- e-mail lookup reads auth.users). Purely informational — it changes nothing.
--
-- p_min_accounts    minimum accounts sharing a key before the group is reported.
-- p_include_subnet  false = exact IP match; true = group by network
--                   (IPv4 /24, IPv6 /64) so "similar" addresses cluster too.

-- Grouping/filtering scans by IP, so keep that lookup cheap.
create index if not exists player_presence_last_ip_idx
  on public.player_presence(last_ip)
  where last_ip is not null;

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

  -- Clamp the threshold so a bad argument can never mean "report everything"
  -- (min 2 accounts) or scan for an absurdly large group.
  v_min := greatest(2, least(coalesce(p_min_accounts, 2), 100));

  with base as (
    select
      pp.player_id,
      pp.last_ip,
      pp.last_ip_at,
      pp.last_seen_at,
      case
        -- Exact-IP mode: the address itself is the grouping key.
        when not coalesce(p_include_subnet, false) then pp.last_ip
        -- IPv4: collapse the host octet into a /24 network.
        when pp.last_ip ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
          then array_to_string((string_to_array(pp.last_ip, '.'))[1:3], '.') || '.0/24'
        -- IPv6: keep the first four hextets (roughly a /64 network).
        when position(':' in pp.last_ip) > 0
          then array_to_string((string_to_array(pp.last_ip, ':'))[1:4], ':') || '::/64'
        else pp.last_ip
      end as group_key
    from public.player_presence pp
    where pp.last_ip is not null and btrim(pp.last_ip) <> ''
  ),
  enriched as (
    select
      b.group_key,
      b.player_id,
      b.last_ip,
      b.last_ip_at,
      b.last_seen_at,
      coalesce(nullif(p.username, ''), left(b.player_id::text, 8)) as username,
      u.email
    from base b
    left join public.players p on p.id = b.player_id
    left join auth.users u on u.id = b.player_id
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
          'lastIpAt', e.last_ip_at
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
