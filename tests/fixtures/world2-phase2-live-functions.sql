-- Read-only production snapshot, 29 October 2026. No credentials/player data.
CREATE OR REPLACE FUNCTION public.claim_server_roll(p_player_id uuid, p_cooldown_ms numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_player public.players%rowtype;
  v_lease_id uuid := gen_random_uuid();
  v_cooldown_ms numeric;
  v_next_roll_at timestamptz;
begin
  if p_player_id is null or p_cooldown_ms is null or p_cooldown_ms <= 0 then
    raise exception 'invalid_roll_claim' using errcode = '22023';
  end if;

  v_cooldown_ms := least(300000::numeric, greatest(10::numeric, p_cooldown_ms));

  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_player.roll_lease_expires_at is not null
     and v_player.roll_lease_expires_at > v_now then
    return jsonb_build_object(
      'status', 'in_flight',
      'retryAt', v_player.roll_lease_expires_at
    );
  end if;

  if v_player.next_roll_at is not null and v_player.next_roll_at > v_now then
    return jsonb_build_object(
      'status', 'cooldown',
      'retryAt', v_player.next_roll_at
    );
  end if;

  v_next_roll_at := v_now + make_interval(secs => (v_cooldown_ms / 1000)::double precision);

  update public.players
  set next_roll_at = v_next_roll_at,
      roll_lease_id = v_lease_id,
      roll_lease_expires_at = v_now + make_interval(
        secs => greatest(30::numeric, v_cooldown_ms / 1000 + 10)::double precision
      )
  where id = p_player_id;

  return jsonb_build_object(
    'status', 'claimed',
    'leaseId', v_lease_id,
    'nextRollAt', v_next_roll_at,
    'genuineRoll', v_player.equipment_genuine_rolls + 1
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.release_server_roll(p_player_id uuid, p_lease_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.players
  set roll_lease_id = null,
      roll_lease_expires_at = null
  where id = p_player_id
    and roll_lease_id = p_lease_id;

  return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.roll_route_result(p_player_id uuid, p_lease_id uuid, p_specimen jsonb, p_filter_keep boolean, p_active_auto_craft text DEFAULT NULL::text, p_external_deposit text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player public.players%rowtype; v_bundle jsonb;
  v_auto_craft jsonb:=jsonb_build_object('deposited',false,'preserved',false,'recipeId',null,'requirementIndex',null);
  v_auto_craft_error text:=null;
begin
  select * into v_player from public.players where id=p_player_id for update;
  if not found or p_lease_id is null or v_player.roll_lease_id is distinct from p_lease_id then raise exception 'invalid_roll_lease'; end if;
  if p_external_deposit is not null then v_bundle:=jsonb_build_object('status',p_external_deposit,'keepInInventory',false);
  elsif coalesce(p_filter_keep,false) then v_bundle:=jsonb_build_object('status','kept','keepInInventory',true,'reason','filter');
  else v_bundle:=public.bundle_route_roll(p_player_id,p_lease_id,p_specimen); end if;
  if coalesce(v_bundle->>'status','none')<>'deposited' and not coalesce((v_bundle->>'keepInInventory')::boolean,false) then
    begin
      if p_active_auto_craft='convergence-pickaxe' then
        v_auto_craft:=convergence_private.autocraft_deposit(p_player_id,p_specimen);
      elsif p_active_auto_craft='paradox-pickaxe' then
        v_auto_craft:=public.paradox_autocraft_deposit(p_player_id,p_specimen);
      elsif p_active_auto_craft is not null then
        v_auto_craft:=public.roll_autocraft_deposit(p_player_id,p_specimen);
      end if;
    exception when others then v_auto_craft_error:=sqlerrm; end;
  end if;
  return jsonb_build_object('bundle',v_bundle,'autoCraft',v_auto_craft,'autoCraftError',v_auto_craft_error);
end $function$

;
