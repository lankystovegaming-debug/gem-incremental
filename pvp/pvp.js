import {mountShell} from "../src/ui/shell.js";
import {supabase} from "../src/backend/supabase.js";
mountShell({page:"pvp",base:"../"});
const $=id=>document.getElementById(id);
let weapons=[],match=null;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
async function api(action,extra={}){const {data,error}=await supabase.functions.invoke("pvp",{body:{action,...extra}});if(error||data?.error)throw new Error(data?.message||data?.error||error?.message||"PvP request failed");return data;}
async function load(){try{const d=await api("config");weapons=d.weapons||[];$("weapon").innerHTML=weapons.map(w=>`<option value="${w.id}">${esc(w.name)} · ${w.attacks.length} attacks</option>`).join("");}catch(e){$("setupStatus").textContent=e.message;$("start").disabled=true;}}
function render(d){
 match=d.match;const mine=match.challenger_id===currentUserId();
 const hp=mine?Number(match.challenger_hp):Number(match.opponent_hp), enemy=mine?Number(match.opponent_hp):Number(match.challenger_hp);
 $("myHp").style.width=`${Math.max(0,hp)}%`;$("enemyHp").style.width=`${Math.max(0,enemy)}%`;
 $("myHpText").textContent=Math.max(0,hp).toFixed(0);$("enemyHpText").textContent=Math.max(0,enemy).toFixed(0);
 $("turnLabel").textContent=match.status!=="active"?(match.winner_id===currentUserId()?"Victory!":match.status==="draw"?"Draw":"Defeat"):match.turn_player_id===currentUserId()?"Your turn":"Opponent's turn";
 const myWeaponId=mine?match.challenger_weapon_id:match.opponent_weapon_id;
 const w=(d.weapons||[]).find(x=>x.id===myWeaponId)||weapons.find(x=>x.id===myWeaponId);
 const can=match.status==="active"&&match.turn_player_id===currentUserId();
 $("attacks").innerHTML=(w?.attacks||[]).map(a=>`<button class="attack" data-attack="${esc(a.id)}" ${can?"":"disabled"}><strong>${esc(a.name)}</strong><small>${esc(a.description||"")} · ×${Number(a.damageMultiplier||1).toFixed(2)} damage</small><span>Use attack</span></button>`).join("");
 document.querySelectorAll("[data-attack]").forEach(b=>b.onclick=async()=>{b.disabled=true;try{const x=await api("attack",{matchId:match.id,attackId:b.dataset.attack});render(x);$("battleStatus").textContent=x.finished?"Duel finished.":`You dealt ${x.attack?.damage??0} damage.`;await refresh();}catch(e){$("battleStatus").textContent=e.message;}});
 const log=Array.isArray(match.battle_log)?match.battle_log:[];$("log").innerHTML=log.slice().reverse().map(x=>`<div class="log-line">${esc(x.attackName)} dealt ${esc(x.damage)} damage.</div>`).join("");
}
async function refresh(){if(!match)return;try{render(await api("state",{matchId:match.id}));}catch(e){$("battleStatus").textContent=e.message;}}
function currentUserId(){return window.__pvpUserId||"";}
supabase.auth.getUser().then(({data})=>{window.__pvpUserId=data.user?.id||"";});
$("start").onclick=async()=>{try{const d=await api("start",{opponentId:$("opponent").value.trim(),weaponId:$("weapon").value});match=d.match;$("setup").hidden=true;$("battle").hidden=false;render({match:d.match,weapons:[...weapons]});}catch(e){$("setupStatus").textContent=e.message;}};
$("refresh").onclick=refresh;load();
