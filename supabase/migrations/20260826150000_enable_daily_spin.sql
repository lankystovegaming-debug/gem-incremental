-- Turn the already-built Daily Spin feature on and give it a prize table that
-- spans all four reward kinds: money, coins, potions and a rare-gem jackpot.
-- (The claim_daily_spin RPC, daily_spin_config/claims tables and the
--  /daily-spin/ page all already exist — this only enables + configures them.)

insert into public.game_section_settings (id, label, short_label, description, enabled, sort_order, icon)
values ('daily-spin', 'Daily Spin', 'Spin', 'A once-a-day prize wheel: cash, coins, potions and a rare-gem jackpot.', true, 95, '◉')
on conflict (id) do update set enabled = true, label = excluded.label,
  short_label = excluded.short_label, description = excluded.description, updated_at = now();

update public.daily_spin_config
set enabled = true,
    rewards = '[
      {"id":"cash-s","label":"$50,000","chance":26,"reward":{"type":"money","amount":50000}},
      {"id":"cash-m","label":"$150,000","chance":18,"reward":{"type":"money","amount":150000}},
      {"id":"coins-s","label":"25 Coins","chance":12,"reward":{"type":"coins","amount":25}},
      {"id":"lucky1","label":"Lucky Potion I ×2","chance":12,"reward":{"type":"potion","consumableId":"lucky-potion-1","amount":2}},
      {"id":"speed1","label":"Speed Potion I ×2","chance":8,"reward":{"type":"potion","consumableId":"speed-potion-1","amount":2}},
      {"id":"fortune1","label":"Fortune Potion I ×2","chance":6,"reward":{"type":"potion","consumableId":"fortune-potion-1","amount":2}},
      {"id":"cash-l","label":"$500,000","chance":6,"reward":{"type":"money","amount":500000}},
      {"id":"coins-m","label":"100 Coins","chance":4,"reward":{"type":"coins","amount":100}},
      {"id":"legendary","label":"Legendary Potion ×1","chance":2,"reward":{"type":"potion","consumableId":"legendary-potion","amount":1}},
      {"id":"mythic","label":"Mythic Potion ×1","chance":0.7,"reward":{"type":"potion","consumableId":"mythic-potion","amount":1}},
      {"id":"jackpot","label":"JACKPOT: Kyawthuite","chance":0.3,"reward":{"type":"gem","gemName":"Kyawthuite"}}
    ]'::jsonb,
    updated_at = now()
where id = true;

-- Read config + today's claim status without the (undeployed) edge function,
-- so the client can drive the wheel via RPCs alone.
create or replace function public.get_daily_spin_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cfg public.daily_spin_config%rowtype; v_claimed boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_cfg from public.daily_spin_config where id = true;
  if not found or not v_cfg.enabled then
    return jsonb_build_object('disabled', true, 'claimed', false,
      'config', jsonb_build_object('title','Daily Spin','subtitle','Coming soon.','rewards','[]'::jsonb));
  end if;
  v_claimed := exists (select 1 from public.daily_spin_claims where player_id = v_uid and claim_date = current_date);
  return jsonb_build_object('claimed', v_claimed,
    'config', jsonb_build_object('title', coalesce(v_cfg.title,'Daily Spin'),
      'subtitle', coalesce(v_cfg.subtitle,'One free spin every day.'), 'rewards', v_cfg.rewards));
end $$;
revoke all on function public.get_daily_spin_state() from public;
grant execute on function public.get_daily_spin_state() to authenticated;
