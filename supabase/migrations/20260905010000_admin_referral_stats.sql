-- Admin referral tracking: total referrals and a per-referrer breakdown
-- ("who referred how many"). Referral attribution lives in player_referrals
-- (one row per referred account: referrer_id, status pending/qualified,
-- reward_amount, created_at). This exposes an admin-only summary of it.

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

  select jsonb_build_object(
    'generatedAt', now(),
    'total', (select count(*) from public.player_referrals),
    'qualified', (select count(*) from public.player_referrals where status = 'qualified'),
    'pending', (select count(*) from public.player_referrals where status = 'pending'),
    'referrerCount', (select count(distinct referrer_id) from public.player_referrals),
    'totalReward', (select coalesce(sum(reward_amount), 0) from public.player_referrals),
    'referrers', coalesce((
      select jsonb_agg(entry)
      from (
        select jsonb_build_object(
          'referrerId', r.referrer_id,
          'username', coalesce(nullif(p.username, ''), left(r.referrer_id::text, 8)),
          'email', u.email,
          'total', count(*),
          'qualified', count(*) filter (where r.status = 'qualified'),
          'pending', count(*) filter (where r.status = 'pending'),
          'reward', coalesce(sum(r.reward_amount), 0),
          'lastReferredAt', max(r.created_at)
        ) as entry
        from public.player_referrals r
        left join public.players p on p.id = r.referrer_id
        left join auth.users u on u.id = r.referrer_id
        group by r.referrer_id, p.username, u.email
        order by count(*) desc, max(r.created_at) desc
        limit v_limit
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_referral_stats(integer) from public;
grant execute on function public.admin_referral_stats(integer) to authenticated;
