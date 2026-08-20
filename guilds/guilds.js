import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
mountShell({ page:"guilds", base:"../" });
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
async function api(action,extra={}){
  const {data,error}=await supabase.functions.invoke("features",{body:{action,...extra}});
  if(error||data?.error){
    const code=data?.error||error?.code;
    const messages={
      guild_create_failed:"The guild could not be created. Please try again.",
      guild_name_taken:"That guild name is already taken.",
      already_in_guild:"You are already in a guild.",
      player_id_required:"Enter the player's UUID.",
      player_already_in_guild:"That player is already in a guild.",
      owner_only:"Only the guild owner can do that."
    };
    throw new Error(messages[code]||data?.message||code||error?.message||"Guild request failed.");
  }
  return data;
}
async function load(){
 try{
  const d=await api("guild");
  $("status").textContent="";
  $("inviteList").innerHTML=(d.invites||[]).map(i=>`<div class="row cardx"><span>Guild invite</span><button class="btn" data-i="${i.id}" data-a="1">Accept</button><button class="btn" data-i="${i.id}">Decline</button></div>`).join("")||'<p class="muted">No pending invitations.</p>';
  document.querySelectorAll("[data-i]").forEach(b=>b.onclick=async()=>{try{await api("guild-respond-invite",{inviteId:b.dataset.i,accept:b.dataset.a==="1"});await load();}catch(e){$("status").textContent=e.message;}});
  if(!d.guild){$("create").classList.remove("hidden");$("guild").classList.add("hidden");return;}
  $("create").classList.add("hidden");$("guild").classList.remove("hidden");
  $("guildTitle").textContent=d.guild.name;
  $("guildMeta").textContent=`Owner: ${d.guild.owner_id}`;
  $("guildPoints").textContent=`${Number(d.guild.points||0).toLocaleString()} guild points`;
  $("members").innerHTML=(d.members||[]).map(m=>`<p>${esc(m.player_id)} · ${esc(m.role)}</p>`).join("")||"<p class='muted'>No members.</p>";
  $("quests").innerHTML=(d.quests||[]).map(q=>`<article class="cardx"><h3>${esc(q.name)}</h3><p>${esc(q.description)}</p><p class="muted">Requires ${q.requirements?.amount??0} guild points · Rewards ${q.reward_points}</p></article>`).join("")||'<p class="muted">No guild quests yet.</p>';
  $("ownerTools").classList.remove("hidden");
  $("inviteBtn").onclick=async()=>{try{await api("guild-invite",{guildId:d.guild.id,playerId:$("invitePlayer").value.trim()});$("invitePlayer").value="";await load();}catch(e){$("status").textContent=e.message;}};
  $("qSave").onclick=async()=>{try{await api("guild-quest-save",{guildId:d.guild.id,quest:{name:$("qName").value,description:$("qDesc").value,requirements:{type:"guild_points",amount:Number($("qAmount").value||100)},reward_points:Number($("qReward").value||0)}});await load();}catch(e){$("status").textContent=e.message;}};
 }catch(e){$("status").textContent=e.message;}
}
$("createBtn").onclick=async()=>{
  const button=$("createBtn");
  const name=$("guildName").value.trim();
  if(name.length<2){$("status").textContent="Guild names need at least 2 characters.";return;}
  button.disabled=true;
  try{await api("guild-create",{name});$("guildName").value="";await load();}
  catch(e){$("status").textContent=e.message;}
  finally{button.disabled=false;}
};
load();
