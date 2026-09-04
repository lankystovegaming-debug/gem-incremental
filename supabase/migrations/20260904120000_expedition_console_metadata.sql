-- Expedition console metadata only. Deploy manually; no reward rules or random draws change.
-- Ordinary cargo is recorded at its existing award site, after incident resolution.
alter table public.volcanic_depth_runs add column if not exists extraction_reason text;

create or replace function public.volcanic_award_cargo(p_run public.volcanic_depth_runs,p_value numeric)
returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
begin
 p_run.unsecured_cargo:=p_run.unsecured_cargo+p_value;
 p_run.event_log:=public.volcanic_log(p_run.event_log,'cargo','Volcanic deposit recovered',
  jsonb_build_object('name','Volcanic deposit','value',p_value,'depth',p_run.depth,'overdepth',p_run.overdepth));
 return p_run;
end $$;

create or replace function public.volcanic_award_artifact(p_run public.volcanic_depth_runs,p_key text) returns public.volcanic_depth_runs language plpgsql volatile security definer set search_path='' as $$
declare a public.volcanic_artifacts;inserted integer;begin select*into a from public.volcanic_artifacts where key=p_key;if not found then return p_run;end if;
 insert into public.museum_artifact_registrations(player_id,artifact_key,artifact_name,depth_found,discovery_snapshot)
 values(p_run.player_id,a.key,a.name,case when p_run.overdepth>0 then p_run.overdepth else p_run.depth end,jsonb_build_object('destination','volcanic-depths','depth',p_run.depth,'overdepth',p_run.overdepth,'activity',p_run.activity)) on conflict(player_id,artifact_key)do nothing;
 get diagnostics inserted=row_count;if inserted=0 then p_run.unsecured_cargo:=p_run.unsecured_cargo+a.duplicate_value;p_run.event_log:=public.volcanic_log(p_run.event_log,'artifact','Duplicate '||a.name||' added as unsecured cargo',jsonb_build_object('value',a.duplicate_value,'artifactKey',a.key,'name',a.name,'duplicate',true,'depth',p_run.depth,'overdepth',p_run.overdepth));else p_run.event_log:=public.volcanic_log(p_run.event_log,'artifact','Museum discovery protected: '||a.name,jsonb_build_object('artifactKey',a.key,'name',a.name,'duplicate',false,'depth',p_run.depth,'overdepth',p_run.overdepth));end if;return p_run;end $$;

create or replace function public.record_volcanic_depth_roll(p_player_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.volcanic_depth_runs;bonus integer:=0;base_progress numeric;gain numeric;newp numeric;st text;key_ text;begin select*into r from public.volcanic_depth_runs where player_id=p_player_id and status='active'for update;if not found then return;end if;
 if coalesce((p_payload->>'rarity')::numeric,0)>=50 then bonus:=bonus+1;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=1000 then bonus:=bonus+3;end if;if coalesce((p_payload->>'rarity')::numeric,0)>=10000 then bonus:=bonus+7;end if;if jsonb_array_length(coalesce(p_payload->'mutationIds','[]'))>0 then bonus:=bonus+3;end if;if coalesce((p_payload->>'weightMultiplier')::numeric,0)>=2 then bonus:=bonus+3;end if;base_progress:=1+bonus;gain:=base_progress*coalesce((public.volcanic_player_effects(p_player_id)->>'bonusProgressMultiplier')::numeric,1);newp:=least(r.target,r.progress+gain);
 if r.progress<r.target and newp>=r.target then
  if r.overdepth>0 then r:=public.volcanic_apply_od_incident(r);if r.status<>'forced_extraction'then r:=public.volcanic_award_cargo(r,public.volcanic_cargo_value(10,r.overdepth));for key_ in select key from public.volcanic_artifacts where source='od'and r.overdepth>=min_overdepth and random()<chance loop r:=public.volcanic_award_artifact(r,key_);end loop;r.status:='ready_to_extract';r.pending:=jsonb_build_object('type','od_cleared','od',r.overdepth);end if;
  else r.activity:=r.activity+public.volcanic_activity_gain(r.depth);if r.eruption_suppressed then r.eruption_suppressed:=false;r:=public.volcanic_erupt(r,'activity_after_suppression');elsif r.activity>=r.eruption_point then r:=public.volcanic_erupt(r,'depth_activity');end if;
   if r.status='active'then r:=public.volcanic_apply_normal_incident(r);end if;if r.status='active'then r:=public.volcanic_award_cargo(r,public.volcanic_cargo_value(r.depth));r:=public.volcanic_general_artifact(r);st:=public.volcanic_state(r.activity,r.eruption_point);if st='critical'and r.monitoring_tier>0 then r:=public.volcanic_special_check(r,'melted-seismograph',.12,true);end if;if r.depth=10 then r:=public.volcanic_special_check(r,'mantle-crystal',.20,true);r:=public.volcanic_special_check(r,'heart-of-the-volcano',1.0/9,true);r.status:='ready_to_extract';r.pending:=jsonb_build_object('type','d10_chamber');else r.status:='awaiting_funding';r.pending:=null;end if;end if;
  end if;
 end if;update public.volcanic_depth_runs set(progress,status,activity,cooling_tier,suppression_used,eruption_suppressed,shelter_used,secured_cargo,unsecured_cargo,pending,event_log,updated_at)=(newp,r.status,r.activity,r.cooling_tier,r.suppression_used,r.eruption_suppressed,r.shelter_used,r.secured_cargo,r.unsecured_cargo,r.pending,r.event_log,now())where id=r.id;end $$;

-- Preserve the authoritative end reason before extraction clears pending.
create or replace function public.volcanic_capture_extraction_reason()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='extracted' and old.status<>'extracted' then
  new.extraction_reason:=coalesce(old.extraction_reason,
   case when old.status='forced_extraction' then coalesce(old.pending->>'cause','forced') else 'voluntary' end);
 end if;
 return new;
end $$;
create trigger volcanic_capture_extraction_reason before update of status on public.volcanic_depth_runs
 for each row execute function public.volcanic_capture_extraction_reason();

-- Existing Hell telemetry already records all artifact finds, including immediately awarded duplicates.
-- Return only this presentation data, never hidden cards, danger, or objectives.
create or replace function public.get_mine_hell_artifact_finds(p_run_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare finds jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.abandoned_mine_runs where id=p_run_id and player_id=auth.uid() and mode='hell')
 then raise exception 'mine_not_active'; end if;
 select coalesce(jsonb_agg(x.value||jsonb_build_object('depth',t.depth,'overdepth',t.overdepth) order by t.id,x.ordinality),'[]')
 into finds from public.abandoned_mine_hell_telemetry t
 cross join lateral jsonb_array_elements(coalesce(t.data->'artifactRoll','[]')) with ordinality x
 where t.run_id=p_run_id and t.player_id=auth.uid() and t.event_name='depth_clear';
 return finds;
end $$;
revoke all on function public.volcanic_award_cargo(public.volcanic_depth_runs,numeric),public.volcanic_capture_extraction_reason() from public,anon,authenticated;
revoke all on function public.get_mine_hell_artifact_finds(bigint) from public,anon;
grant execute on function public.get_mine_hell_artifact_finds(bigint) to authenticated;

-- Keep a receipt-only artifact history for Crystal, including finds later lost.
-- Existing held artifacts can be backfilled; previously lost artifacts cannot be reconstructed.
alter table public.crystal_cavern_runs add column if not exists artifact_find_log jsonb;
update public.crystal_cavern_runs set artifact_find_log=secured_artifacts||unsecured_artifacts
 where artifact_find_log is null;
alter table public.crystal_cavern_runs alter column artifact_find_log set default '[]'::jsonb;
create or replace function public.crystal_capture_artifact_finds()
returns trigger language plpgsql set search_path='' as $$
declare additions jsonb;
begin
 if new.secured_artifacts is not distinct from old.secured_artifacts
 and new.unsecured_artifacts is not distinct from old.unsecured_artifacts then return new; end if;
 -- Multiset difference: moving artifacts to secured storage is not another discovery.
 select coalesce(jsonb_agg(value),'[]') into additions from (
  select value from jsonb_array_elements(new.secured_artifacts||new.unsecured_artifacts)
  except all
  select value from jsonb_array_elements(old.secured_artifacts||old.unsecured_artifacts)
 ) newly_found;
 new.artifact_find_log:=coalesce(old.artifact_find_log,old.secured_artifacts||old.unsecured_artifacts)||additions;
 return new;
end $$;
create trigger crystal_capture_artifact_finds before update of secured_artifacts,unsecured_artifacts
 on public.crystal_cavern_runs for each row execute function public.crystal_capture_artifact_finds();
revoke all on function public.crystal_capture_artifact_finds() from public,anon,authenticated;
