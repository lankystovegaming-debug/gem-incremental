-- =========================================================
-- Referral program.
--
-- Every player can mint a short, shareable referral code. A brand-new
-- player who arrives through that code (…/?ref=CODE) is attributed to the
-- referrer. Once the referred player proves they are a real, active player
-- (reaches a lifetime-rolls milestone), both sides receive a cash reward.
--
-- All state lives on auth.users ids so attribution works before the lazy
-- players row is created (it is only inserted on the first roll). Rewards
-- are computed entirely from server-side state (the referred player's real
-- total_rolls), so even though the client triggers the settlement call it
-- can never inflate the payout, and the status guard makes it pay once.
-- =========================================================

-- Tunables ------------------------------------------------------------------
--   QUALIFY_ROLLS         lifetime rolls the referred player must reach
--   NEW_ACCOUNT_MAX_ROLLS how "fresh" an account may be to claim a code
--   REFERRER_REWARD       cash paid to the referrer on qualification
--   REFERRED_REWARD       welcome cash paid to the referred player
-- These are inlined as literals in the functions below.


-- Each user's own referral code.
create table if not exists public.player_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.player_referral_codes enable row level security;

drop policy if exists "Players can read their own referral code"
  on public.player_referral_codes;

create policy "Players can read their own referral code"
  on public.player_referral_codes
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.player_referral_codes from anon, authenticated;
grant select on table public.player_referral_codes to authenticated;


-- One attribution row per referred account (referred_id is the primary key,
-- so an account can only ever be referred once).
create table if not exists public.player_referrals (
  referred_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  reward_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint player_referrals_no_self check (referred_id <> referrer_id)
);

create index if not exists player_referrals_referrer_idx
  on public.player_referrals (referrer_id);

alter table public.player_referrals enable row level security;

drop policy if exists "Players can read referrals they are part of"
  on public.player_referrals;

create policy "Players can read referrals they are part of"
  on public.player_referrals
  for select
  to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

revoke all on table public.player_referrals from anon, authenticated;
grant select on table public.player_referrals to authenticated;


-- Mint (or return) the caller's referral code. Codes are short, uppercase,
-- and avoid visually ambiguous characters.
create or replace function public.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_candidate text;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_attempts integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select code into v_code
  from public.player_referral_codes
  where user_id = v_uid;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempts := v_attempts + 1;

    v_candidate := '';
    for i in 1..6 loop
      v_candidate := v_candidate ||
        substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.player_referral_codes (user_id, code)
      values (v_uid, v_candidate)
      returning code into v_code;
      return v_code;
    exception when unique_violation then
      -- Either this user raced with themselves or the code collided.
      select code into v_code
      from public.player_referral_codes
      where user_id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
      if v_attempts >= 12 then
        raise exception 'referral_code_generation_failed';
      end if;
    end;
  end loop;
end;
$$;

grant execute on function public.get_or_create_referral_code() to authenticated;


-- Attribute the caller to the owner of p_code. Only a fresh account with no
-- existing attribution may claim, and never its own code.
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_normalized text;
  v_rolls integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_normalized := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if length(v_normalized) < 4 then
    raise exception 'referral_code_invalid';
  end if;

  select user_id into v_referrer
  from public.player_referral_codes
  where code = v_normalized;

  if v_referrer is null then
    raise exception 'referral_code_invalid';
  end if;

  if v_referrer = v_uid then
    raise exception 'referral_self';
  end if;

  if exists (
    select 1 from public.player_referrals where referred_id = v_uid
  ) then
    raise exception 'referral_already_claimed';
  end if;

  -- Only genuinely new accounts may be attributed.
  select total_rolls into v_rolls
  from public.players
  where id = v_uid;

  if coalesce(v_rolls, 0) > 100 then
    raise exception 'referral_not_eligible';
  end if;

  insert into public.player_referrals (referred_id, referrer_id, code)
  values (v_uid, v_referrer, v_normalized);

  return jsonb_build_object('success', true, 'code', v_normalized);
end;
$$;

grant execute on function public.claim_referral(text) to authenticated;


-- Settle the caller's own pending referral if they have reached the rolls
-- milestone. Idempotent: the status guard means the reward is paid once.
create or replace function public.settle_my_referral()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_rolls integer;
  v_qualify_rolls integer := 200;
  v_referrer_reward numeric := 5000000;
  v_referred_reward numeric := 1000000;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select referrer_id into v_referrer
  from public.player_referrals
  where referred_id = v_uid
    and status = 'pending'
  for update;

  if v_referrer is null then
    return jsonb_build_object('settled', false);
  end if;

  select total_rolls into v_rolls
  from public.players
  where id = v_uid;

  if coalesce(v_rolls, 0) < v_qualify_rolls then
    return jsonb_build_object(
      'settled', false,
      'progress', coalesce(v_rolls, 0),
      'goal', v_qualify_rolls
    );
  end if;

  -- Pay the referrer (their players row certainly exists once they have a
  -- code and referrals, but guard anyway).
  update public.players
  set money = coalesce(money, 0) + v_referrer_reward
  where id = v_referrer;

  update public.players
  set money = coalesce(money, 0) + v_referred_reward
  where id = v_uid;

  update public.player_referrals
  set status = 'qualified',
      qualified_at = now(),
      reward_amount = v_referrer_reward
  where referred_id = v_uid;

  return jsonb_build_object(
    'settled', true,
    'referrerReward', v_referrer_reward,
    'referredReward', v_referred_reward
  );
end;
$$;

grant execute on function public.settle_my_referral() to authenticated;


-- Referrer-facing dashboard: their code plus aggregate counts and earnings,
-- and whether they themselves were referred.
create or replace function public.get_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_total integer;
  v_qualified integer;
  v_earned numeric;
  v_my_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_code := public.get_or_create_referral_code();

  select
    count(*),
    count(*) filter (where status = 'qualified'),
    coalesce(sum(reward_amount) filter (where status = 'qualified'), 0)
  into v_total, v_qualified, v_earned
  from public.player_referrals
  where referrer_id = v_uid;

  select status into v_my_status
  from public.player_referrals
  where referred_id = v_uid;

  return jsonb_build_object(
    'code', v_code,
    'total', coalesce(v_total, 0),
    'qualified', coalesce(v_qualified, 0),
    'pending', coalesce(v_total, 0) - coalesce(v_qualified, 0),
    'earned', coalesce(v_earned, 0),
    'referredStatus', v_my_status
  );
end;
$$;

grant execute on function public.get_referral_summary() to authenticated;
