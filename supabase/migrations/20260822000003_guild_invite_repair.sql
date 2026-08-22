-- v0.11.0.2: deterministic guild invitation acceptance.
create or replace function public.guild_respond_invite_v2(p_player_id uuid,p_invite_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invite public.guild_invites%rowtype;v_guild public.guilds%rowtype;v_count integer;
begin
  if p_player_id is null then raise exception 'unauthenticated';end if;
  select * into v_invite from public.guild_invites where id=p_invite_id and invited_player_id=p_player_id and status='pending' for update;
  if not found then raise exception 'invite_not_found';end if;
  if not coalesce(p_accept,false) then update public.guild_invites set status='declined',responded_at=now() where id=v_invite.id;return jsonb_build_object('ok',true,'accepted',false);end if;
  if exists(select 1 from public.guild_members where player_id=p_player_id) then raise exception 'already_in_guild';end if;
  if exists(select 1 from public.guild_player_cooldowns where player_id=p_player_id and can_join_at>now()) then raise exception 'guild_join_cooldown';end if;
  select * into v_guild from public.guilds where id=v_invite.guild_id for update;
  if not found then raise exception 'guild_not_found';end if;
  select count(*) into v_count from public.guild_members where guild_id=v_guild.id;
  if v_count>=v_guild.member_capacity then raise exception 'guild_full';end if;
  insert into public.guild_members(guild_id,player_id,role,eligible_at) values(v_guild.id,p_player_id,'member',now()+interval '24 hours');
  update public.guild_invites set status='accepted',responded_at=now() where id=v_invite.id;
  update public.guild_invites set status='cancelled',responded_at=now() where invited_player_id=p_player_id and status='pending' and id<>v_invite.id;
  delete from public.guild_player_cooldowns where player_id=p_player_id and can_join_at<=now();
  insert into public.guild_activity(guild_id,actor_id,action) values(v_guild.id,p_player_id,'member_joined');
  return jsonb_build_object('ok',true,'accepted',true,'guildId',v_guild.id);
end $$;
revoke all on function public.guild_respond_invite_v2(uuid,uuid,boolean) from public;
grant execute on function public.guild_respond_invite_v2(uuid,uuid,boolean) to service_role;
