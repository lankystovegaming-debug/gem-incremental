
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
 create table players(id uuid primary key,equipment_state jsonb default '{}',equipment_state_roll bigint default 0,
  roll_lease_id uuid,total_rolls bigint default 0);
 create table player_equipment(id bigint,player_id uuid,equipped boolean);
 create table player_settings(player_id uuid primary key,settings jsonb default '{}',updated_at timestamptz);
 create table private_feature_gems(id uuid default gen_random_uuid(),name text,rarity numeric,base_weight numeric,value_per_gram numeric,
  sort_order integer,enabled boolean,affected_by_luck boolean,metadata jsonb,description text,hide_rarity_until_discovered boolean);
 create function roll_batch_unlock_status(uuid,integer) returns jsonb language sql as $$select '{"status":"unlocked"}'::jsonb$$;
 create function claim_guild_mythic_surge(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function claim_server_roll(p_player_id uuid,p_cooldown_ms numeric) returns jsonb language plpgsql as $$
 declare v_lease uuid:=gen_random_uuid(); begin
 update public.players set roll_lease_id=v_lease where id=p_player_id;
 return jsonb_build_object('status','claimed','leaseId',v_lease,'genuineRoll',1);
 end $$;
 insert into players(id) values('00000000-0000-0000-0000-000000000001');
