-- Owner-composed mail and automated system mail share validation and delivery.
create table public.mail_publications (
  id uuid primary key,
  source text not null check (source in ('owner','system')),
  created_by uuid references public.players(id) on delete set null,
  subject text not null,
  sender text not null,
  audience text not null check (audience in ('all','player')),
  recipient text,
  recipient_count integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.mail_publications enable row level security;
revoke all on public.mail_publications from public, anon, authenticated;
grant select on public.mail_publications to authenticated;
grant all on public.mail_publications to service_role;
create policy "Owner views mail publishing history" on public.mail_publications for select to authenticated
using ((select auth.uid()) = '004d883f-edbc-4610-b5e3-9068a0de0ca2'::uuid);
alter table public.player_mail add column publication_id uuid references public.mail_publications(id);
create unique index player_mail_publication_recipient_idx on public.player_mail(publication_id,player_id);
grant usage on schema mailbox_private to service_role;

create function mailbox_private.publish_mail(
 p_request_id uuid, p_subject text, p_body text, p_rewards jsonb,
 p_audience text, p_recipient text, p_sender text, p_source text, p_creator uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 reward jsonb; target uuid; targets integer; delivered integer; fingerprint jsonb;
 existing public.mail_publications;
begin
 if p_request_id is null then raise exception 'request_id_required'; end if;
 if p_subject is null or length(btrim(p_subject)) not between 1 and 200
   or p_body is null or length(btrim(p_body)) not between 1 and 20000
   or p_sender is null or length(btrim(p_sender)) not between 1 and 100
   or p_audience is null or p_audience not in ('all','player') then
   raise exception 'invalid_mail_content';
 end if;
 if p_rewards is null or jsonb_typeof(p_rewards) <> 'array' then raise exception 'invalid_mail_rewards'; end if;
 if jsonb_array_length(p_rewards) > 20 then raise exception 'too_many_mail_rewards'; end if;
 fingerprint := jsonb_build_object('subject',btrim(p_subject),'body',p_body,'sender',btrim(p_sender),
   'rewards',p_rewards,'audience',p_audience,'recipient',coalesce(btrim(p_recipient),''),
   'source',p_source,'creator',p_creator);
 -- Serialize identical request IDs, including simultaneous retries.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into existing from public.mail_publications where id=p_request_id;
 if found then
   if existing.payload <> fingerprint then raise exception 'mail_request_conflict'; end if;
   return jsonb_build_object('publicationId',existing.id,'recipientCount',existing.recipient_count,'alreadyPublished',true);
 end if;
 for reward in select value from jsonb_array_elements(p_rewards) loop
   if coalesce(reward->>'type','') not in ('money','coins','potion')
     or jsonb_typeof(reward->'amount') is distinct from 'number'
     or (reward->>'amount')::numeric <= 0
     or (reward->>'amount')::numeric > 1000000000000000
     or (reward->>'amount')::numeric <> trunc((reward->>'amount')::numeric) then
     raise exception 'invalid_mail_reward';
   end if;
   if reward->>'type'='potion' and ((reward->>'amount')::numeric > 2147483647 or not exists (
     select 1 from public.game_consumables where id=reward->>'consumableId'
   )) then raise exception 'invalid_mail_consumable'; end if;
 end loop;
 if p_audience='player' then
   select count(*),min(id::text)::uuid into targets,target from public.players
   where id::text=btrim(p_recipient) or lower(username)=lower(btrim(p_recipient));
   if targets <> 1 then raise exception 'mail_recipient_not_found_or_ambiguous'; end if;
 elsif coalesce(btrim(p_recipient),'') <> '' then raise exception 'broadcast_has_recipient';
 end if;
 insert into public.mail_publications(id,source,created_by,subject,sender,audience,recipient,payload)
 values(p_request_id,p_source,p_creator,btrim(p_subject),btrim(p_sender),p_audience,nullif(btrim(p_recipient),''),fingerprint);
 insert into public.player_mail(player_id,subject,body,sender,rewards,publication_id)
 select id,btrim(p_subject),p_body,btrim(p_sender),p_rewards,p_request_id
 from public.players where p_audience='all' or id=target;
 get diagnostics delivered = row_count;
 update public.mail_publications set recipient_count=delivered where id=p_request_id;
 return jsonb_build_object('publicationId',p_request_id,'recipientCount',delivered,'alreadyPublished',false);
end;
$$;
revoke all on function mailbox_private.publish_mail(uuid,text,text,jsonb,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function mailbox_private.publish_mail(uuid,text,text,jsonb,text,text,text,text,uuid) to service_role;

create function mailbox_private.publish_owner_mail(
 p_request_id uuid,p_subject text,p_body text,p_rewards jsonb,p_audience text,p_recipient text,p_sender text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is distinct from '004d883f-edbc-4610-b5e3-9068a0de0ca2'::uuid then
   raise exception 'mail_publisher_owner_only' using errcode='42501';
 end if;
 return mailbox_private.publish_mail(p_request_id,p_subject,p_body,p_rewards,p_audience,p_recipient,p_sender,'owner',auth.uid());
end;
$$;
create function public.publish_owner_mail(
 p_request_id uuid,p_subject text,p_body text,p_rewards jsonb default '[]',
 p_audience text default 'player',p_recipient text default null,p_sender text default 'Gem Incremental'
) returns jsonb language sql security invoker set search_path = '' as $$
 select mailbox_private.publish_owner_mail(p_request_id,p_subject,p_body,p_rewards,p_audience,p_recipient,p_sender);
$$;
revoke all on function mailbox_private.publish_owner_mail(uuid,text,text,jsonb,text,text,text),
 public.publish_owner_mail(uuid,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function mailbox_private.publish_owner_mail(uuid,text,text,jsonb,text,text,text),
 public.publish_owner_mail(uuid,text,text,jsonb,text,text,text) to authenticated;

-- Only trusted service-role callers can send automated mail; no user JWT path.
create function public.publish_system_mail(
 p_request_id uuid,p_subject text,p_body text,p_rewards jsonb default '[]',
 p_audience text default 'player',p_recipient text default null,p_sender text default 'System'
) returns jsonb language sql security invoker set search_path = '' as $$
 select mailbox_private.publish_mail(p_request_id,p_subject,p_body,p_rewards,p_audience,p_recipient,p_sender,'system',null);
$$;
revoke all on function public.publish_system_mail(uuid,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_system_mail(uuid,text,text,jsonb,text,text,text) to service_role;
