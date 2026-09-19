-- Sum of every player's lifetime roll count ("global rolls"), for the
-- headline global counter on the live Roll Count page (/roll-counts/).
-- Mirrors get_global_cash(): SECURITY DEFINER so it can read across all
-- players past RLS, returns a single aggregate with no PII. total_rolls
-- only ever rises, so the global total is monotonic.
create or replace function public.get_global_roll_count()
returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce(sum(total_rolls), 0)::bigint from public.players;
$$;
grant execute on function public.get_global_roll_count() to anon, authenticated;
