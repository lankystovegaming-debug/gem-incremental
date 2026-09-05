-- Referral abuse signal: flag referrals where the referrer and the referred
-- account share the same last-seen IP (a likely self-referral via an alt).
-- Redefines admin_referral_stats to add, per referrer, a `sameIp` count, a
-- top-level `sameIpCount`, and a `flagged` list of the offending pairs.
-- IP data comes from public.player_presence.last_ip (admin-only, same source
-- as the shared-IP audit).

create or replace function public.admin_referral_stats(p_limit integer default 100)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_limit integer;
  v_result jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 1000));

  with base as (
    select
      r.referred_id,
      r.referrer_id,
      r.status,
      r.reward_amount,
      r.created_at,
      pr.last_ip as referrer_ip,
      pd.last_ip as referred_ip,
      (pr.last_ip is not null and btrim(pr.last_ip) <> '' and pr.last_ip = pd.last_ip) as same_ip
    from public.player_referrals r
    left join public.player_presence pr on pr.player_id = r.referrer_id
    left join public.player_presence pd on pd.player_id = r.referred_id
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'total', (select count(*) from public.player_referrals),
    'qualified', (select count(*) from public.player_referrals where status = 'qualified'),
    'pending', (select count(*) from public.player_referrals where status = 'pending'),
    'referrerCount', (select count(distinct referrer_id) from public.player_referrals),
    'totalReward', (select coalesce(sum(reward_amount), 0) from public.player_referrals),
    'sameIpCount', (select count(*) from base where same_ip),
    'referrers', coalesce((
      select jsonb_agg(entry)
      from (
        select jsonb_build_object(
          'referrerId', b.referrer_id,
          'username', coalesce(nullif(p.username, ''), left(b.referrer_id::text, 8)),
          'email', u.email,
          'total', count(*),
          'qualified', count(*) filter (where b.status = 'qualified'),
          'pending', count(*) filter (where b.status = 'pending'),
          'sameIp', count(*) filter (where b.same_ip),
          'reward', coalesce(sum(b.reward_amount), 0),
          'lastReferredAt', max(b.created_at)
        ) as entry
        from base b
        left join public.players p on p.id = b.referrer_id
        left join auth.users u on u.id = b.referrer_id
        group by b.referrer_id, p.username, u.email
        order by count(*) filter (where b.same_ip) desc, count(*) desc, max(b.created_at) desc
        limit v_limit
      ) t
    ), '[]'::jsonb),
    'flagged', coalesce((
      select jsonb_agg(entry order by created_at desc)
      from (
        select
          b.created_at,
          jsonb_build_object(
            'referrerId', b.referrer_id,
            'referrer', coalesce(nullif(pr.username, ''), left(b.referrer_id::text, 8)),
            'referredId', b.referred_id,
            'referred', coalesce(nullif(pd.username, ''), left(b.referred_id::text, 8)),
            'referredEmail', ud.email,
            'ip', b.referrer_ip,
            'status', b.status,
            'createdAt', b.created_at
          ) as entry
        from base b
        left join public.players pr on pr.id = b.referrer_id
        left join public.players pd on pd.id = b.referred_id
        left join auth.users ud on ud.id = b.referred_id
        where b.same_ip
        order by b.created_at desc
        limit v_limit
      ) fl
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_referral_stats(integer) from public;
grant execute on function public.admin_referral_stats(integer) to authenticated;
