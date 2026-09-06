create or replace function public.use_consumable_bulk(
  p_consumable_id text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_used integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'invalid_quantity';
  end if;

  for v_used in 1..p_quantity loop
    v_result := public.use_consumable(p_consumable_id);
  end loop;

  return jsonb_build_object(
    'quantity', v_result->'quantity',
    'boost', v_result->'boost',
    'used', p_quantity
  );
end;
$$;

revoke all on function public.use_consumable_bulk(text, integer) from public;
grant execute on function public.use_consumable_bulk(text, integer) to authenticated;