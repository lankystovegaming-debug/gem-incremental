-- Read-only Exchange shareholders overview for the admin panel.
-- Reports, per holder: shares held, amount invested (cost basis), current
-- market value at the live index price, and unrealised P/L (value - basis).
-- Admin-gated, SECURITY DEFINER (player_shares is not client-readable across
-- users). Purely informational: it does NOT change any economy behaviour.
create or replace function public.admin_get_shareholders()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
  v_price double precision;
  v_result jsonb;
begin
  v_is_admin := auth.uid() is not null and (
    auth.uid() = '38d5e8ce-18af-46d3-aa9e-6e601e75dd78'::uuid
    or exists (select 1 from public.admins where user_id = auth.uid()));
  if not v_is_admin then raise exception 'not_admin' using errcode = '42501'; end if;

  v_price := public.share_index_price();

  select jsonb_build_object(
    'price', v_price,
    'holderCount', count(*) filter (where s.shares > 0),
    'totalShares', coalesce(sum(s.shares) filter (where s.shares > 0), 0),
    'totalInvested', coalesce(sum(s.total_invested) filter (where s.shares > 0), 0),
    'totalValue', coalesce(sum(s.shares * v_price) filter (where s.shares > 0), 0),
    'totalPl', coalesce(sum(s.shares * v_price - s.total_invested) filter (where s.shares > 0), 0),
    'holders', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', s.player_id,
          'username', coalesce(nullif(p.username, ''), left(s.player_id::text, 8)),
          'shares', s.shares,
          'invested', s.total_invested,
          'value', s.shares * v_price,
          'pl', s.shares * v_price - s.total_invested,
          'plPct', case when s.total_invested > 0
                        then (s.shares * v_price - s.total_invested) / s.total_invested * 100.0
                        else 0 end,
          'lastTrade', s.updated_at
        )
        order by s.shares * v_price desc
      ) filter (where s.shares > 0),
      '[]'::jsonb)
  )
  into v_result
  from public.player_shares s
  left join public.players p on p.id = s.player_id;

  return v_result;
end $$;

revoke all on function public.admin_get_shareholders() from public;
grant execute on function public.admin_get_shareholders() to authenticated;
