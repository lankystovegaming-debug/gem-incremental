-- Sum of every player's lifetime earnings ("global cash"), for the
-- optional side counter. Only rises when players sell to the game;
-- trades between players move money but do not touch lifetime_earnings,
-- so the total is unchanged by trading. SECURITY DEFINER so it can read
-- across all players past RLS; returns a single aggregate, no PII.
create or replace function public.get_global_cash()
returns double precision
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(lifetime_earnings), 0)::double precision from public.players;
$$;
grant execute on function public.get_global_cash() to anon, authenticated;
