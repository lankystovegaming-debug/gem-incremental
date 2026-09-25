begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function deepcore_private.resolve_route() returns void
language plpgsql security definer set search_path='' as $$
declare e public.deepcore_event_state%rowtype; winner text;
begin
 select * into e from public.deepcore_event_state where event_key='deepcore-2026' for update;
 if e.phase<>52 or e.route_winner is not null then return; end if;
 if e.crystalline_funding>=1500000000 and e.crystalline_specimens>=1000 then winner:='crystalline';
 elsif e.anomalous_funding>=1500000000 and e.anomalous_specimens>=10 then winner:='anomalous'; else return; end if;
 update public.deepcore_event_state set route_winner=winner,route_resolved_at=now(),route_loser_snapshot=jsonb_build_object(
  'crystallineFunding',e.crystalline_funding,'crystallineSpecimens',e.crystalline_specimens,
  'anomalousFunding',e.anomalous_funding,'anomalousSpecimens',e.anomalous_specimens),updated_at=now() where event_key=e.event_key;
 insert into public.deepcore_project_log(entry_key,title,body) values('route-winner','ROUTE BREAKTHROUGH',jsonb_build_object('winner',winner,'snapshot',jsonb_build_object('crystallineFunding',e.crystalline_funding,'crystallineSpecimens',e.crystalline_specimens,'anomalousFunding',e.anomalous_funding,'anomalousSpecimens',e.anomalous_specimens))) on conflict do nothing;
 perform deepcore_private.advance_state();
end $$;

-- Reconcile immediately in case the community crossed the reduced threshold
-- before this migration was applied.
select deepcore_private.resolve_route();

commit;
