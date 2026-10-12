import { mountShell } from "../../src/ui/shell.js";
import { deepSeaRequest } from "../../src/backend/cloudDeepSea.js";
import { invokeFunction } from "../../src/backend/invoke.js";
import { getSettings, updateSettings } from "../../src/ui/settings.js";
import { NEPTUNE_RECIPE } from "../../src/data/deepSea.js";
mountShell({page:"limited-events",base:"../../"});
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let snapshot,timer,phaseReloading=false;
let loadInFlight=null,actionBusy=false,requestVersion=0,progressTimer=null;
const milestones=[[5,"The Reef Calls"],[10,"Beneath the Waves"],[15,"Into the Deep"],[20,"The Abyss Opens"],[25,"The Ocean Floor"],[30,"The Depths Are Satisfied"]];
function duration(ms){if(ms<=0)return"00d 00h 00m 00s";const s=Math.floor(ms/1000);return`${String(Math.floor(s/86400)).padStart(2,"0")}d ${String(Math.floor(s/3600)%24).padStart(2,"0")}h ${String(Math.floor(s/60)%60).padStart(2,"0")}m ${String(s%60).padStart(2,"0")}s`;}
function notice(text,bad=false){$("notice").textContent=text;$("notice").className=`notice show${bad?" bad":""}`;clearTimeout(notice.t);notice.t=setTimeout(()=>$("notice").className="notice",3500);}
function phaseClock(){clearInterval(timer);const loaded=Date.now(),server=Date.parse(snapshot.serverNow),run=snapshot.run,phase=snapshot.phase;const tick=()=>{if(phase==="archived"){$("countdown").textContent="ARCHIVED";return;}const now=server+Date.now()-loaded,target=phase==="teaser"?Date.parse(run.starts_at):phase==="active"?Date.parse(run.ends_at):Date.parse(run.redemption_ends_at);$("countdown").textContent=duration(target-now);if(now>=target&&!phaseReloading){phaseReloading=true;load().finally(()=>{phaseReloading=false;});}};tick();timer=setInterval(tick,1000);}
function render(){const s=snapshot.state,phase=snapshot.phase,settings=getSettings();$("phase").textContent=phase.toUpperCase();$("teaser").classList.toggle("hidden",phase!=="teaser");$("event").classList.toggle("hidden",phase==="teaser");$("clockLabel").textContent=phase==="teaser"?"THE DESCENT BEGINS IN":phase==="active"?"THE TIDE RECEDES IN":phase==="redemption"?"REDEMPTION CLOSES IN":"THE SEA REMEMBERS";phaseClock();if(phase==="teaser")return;$("tokens").textContent=Number(s.tide_tokens).toLocaleString()+" TT";$("depth").textContent=`${s.depth_step} / 30`;$("neptuneState").textContent=s.neptune_owned?"FORGED":"LOCKED";$("poolState").textContent=(settings.rollPool||"normal").replace("deep_sea","DEEP SEA").toUpperCase();$("neptuneFeed").checked=s.neptune_auto_feed;$("depthFeed").checked=s.depths_auto_feed;const progress=new Map((snapshot.progress||[]).map(p=>[`${p.target}:${p.gem_name}`,Number(p.quantity)]));const recipe=NEPTUNE_RECIPE.gems;$("recipe").innerHTML=Object.entries(recipe).map(([g,q])=>`<article><strong>${esc(g)}</strong><span>${progress.get("neptune:"+g)||0} / ${q}</span></article>`).join("");const step=Math.min(30,Number(s.depth_step)+1),req=(snapshot.requirements||[]).filter(r=>Number(r.step)===step);$("requirements").innerHTML=req.map(r=>`<article><strong>${esc(r.gem_name)}</strong><span>${progress.get("depths:"+r.gem_name)||0} / ${r.quantity}</span></article>`).join("")||"<p>The Depths are satisfied.</p>";$("milestone").textContent=milestones.find(([n])=>step<=n)?.[1]||milestones.at(-1)[1];$("catalogue").innerHTML=(snapshot.gems||[]).map(g=>`<article><span>1 in ${Number(g.rarity).toLocaleString()}</span><h3>${esc(g.name)}</h3><p>${esc(g.description)}</p></article>`).join("");const bought=new Set((snapshot.purchases||[]).map(p=>p.item_id));$("shop").innerHTML=(snapshot.shop||[]).map(i=>`<article><strong>${esc(i.item_id.replaceAll("-"," "))}</strong><span>${Number(i.price).toLocaleString()} TT</span><button data-buy="${esc(i.item_id)}" ${i.item_type==="cosmetic"&&bought.has(i.item_id)?"disabled":""}>${bought.has(i.item_id)&&i.item_type==="cosmetic"?"Owned":"Buy"}</button></article>`).join("");$("legacyGem").innerHTML=(snapshot.gems||[]).map(g=>`<option>${esc(g.name)}</option>`).join("");$("claimLegacy").disabled=phase!=="redemption"||Boolean(s.legacy_gem_name);$("craftNeptune").disabled=s.neptune_owned||phase==="archived";}
function renderNeptuneControls(){
  if(!snapshot?.state)return;
  const s=snapshot.state,closed=!["active","redemption"].includes(snapshot.phase);
  for(const id of ["depositNeptune","craftNeptune","neptuneFeed","neptuneAutoCraft"]){
    $(id).disabled=actionBusy||s.neptune_owned||closed;
  }
  $("neptuneFeed").checked=Boolean(s.neptune_auto_feed);
  $("neptuneAutoCraft").checked=Boolean(s.neptune_auto_craft);
  $("neptuneStatus").textContent=s.neptune_owned
    ?"Neptune has been forged. You can equip it from Crafting."
    :s.neptune_auto_craft
      ?"Auto Forge is enabled. Neptune will be forged once all materials are deposited and you have $250,000."
      :"Progress updates automatically while this panel is open.";
}
function acceptSnapshot(data){
  const next=data.snapshot||data;
  const justForged=snapshot?.state?.neptune_auto_craft&&!snapshot.state.neptune_owned&&next.state?.neptune_owned;
  snapshot=next;
  render();renderNeptuneControls();
  if(justForged)notice("Neptune was automatically forged. Equip it from Crafting.");
}
async function load({silent=false,neptune=false}={}){
  if(actionBusy)return;
  if(loadInFlight)return loadInFlight;
  const version=++requestVersion;
  loadInFlight=(async()=>{
    try{
      const data=await deepSeaRequest(neptune?"neptuneProgress":"snapshot");
      if(version===requestVersion)acceptSnapshot(data);
    }catch(e){if(!silent&&version===requestVersion)notice(e.message,true);}
  })();
  try{await loadInFlight;}finally{loadInFlight=null;}
}
async function act(action,payload={}){
  if(actionBusy)return;
  actionBusy=true;++requestVersion;renderNeptuneControls();
  try{
    const data=await deepSeaRequest(action,payload);
    acceptSnapshot(data);
    notice(action==="depositNeptune"
      ?`${Number(data.deposited||0).toLocaleString()} inventory materials added.${snapshot.state.neptune_owned?" Neptune is forged.":""}`
      :"Deep Sea records updated.");
  }catch(e){notice(e.message,true);}
  finally{actionBusy=false;renderNeptuneControls();}
}
function viewingNeptune(){return !document.hidden&&!document.querySelector('[data-panel="neptune"]').classList.contains("hidden");}
function refreshNeptune(){
  if(viewingNeptune()&&snapshot&&["active","redemption"].includes(snapshot.phase))load({silent:true,neptune:true});
}
window.addEventListener("gem:roll-complete",()=>{
  if(!viewingNeptune()||progressTimer)return;
  progressTimer=setTimeout(()=>{progressTimer=null;refreshNeptune();},1000);
});
document.addEventListener("visibilitychange",refreshNeptune);
window.addEventListener("focus",refreshNeptune);
document.addEventListener("click",e=>{if(e.target.closest('[data-tab="neptune"]'))queueMicrotask(refreshNeptune);});
setInterval(refreshNeptune,5000);
document.addEventListener("click",e=>{const tab=e.target.closest("[data-tab]");if(tab){document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===tab));document.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("hidden",x.dataset.panel!==tab.dataset.tab));return;}const buy=e.target.closest("[data-buy]");if(buy)act("buy",{itemId:buy.dataset.buy});});
async function setPool(pool){if(getSettings().autoRoll){notice("Stop Auto Roll before changing pools.",true);return;}await updateSettings({rollPool:pool});render();window.dispatchEvent(new CustomEvent("gem:roll-pool-changed",{detail:{pool}}));}
$("normalPool").onclick=()=>setPool("normal");$("deepSeaPool").onclick=()=>setPool("deep_sea");$("neptuneFeed").onchange=e=>act("setFeed",{target:"neptune",enabled:e.target.checked});$("depthFeed").onchange=e=>act("setFeed",{target:"depths",enabled:e.target.checked});$("craftNeptune").onclick=()=>act("craftNeptune");$("claimLegacy").onclick=()=>act("claimLegacy",{gemName:$("legacyGem").value});load();
$("depositNeptune").onclick=()=>act("depositNeptune");
$("neptuneAutoCraft").onchange=e=>act("setNeptuneAutoCraft",{enabled:e.target.checked});

const supplyNames={diver:"Diver",'tidal-rush':"Tidal Rush",pressure:"Pressure",'treasure-tonic':"Treasure Tonic",offering:"Offering to Neptune",'supply-crate':"Supply Crate",'abyssal-potion':"Abyssal Potion"};
function renderSupplies(){if(!snapshot||!$("supplies"))return;$("supplies").innerHTML=Object.entries(supplyNames).map(([id,name])=>`<article><strong>${name}</strong><span>Owned · ${Number(snapshot.consumables?.[id]||0).toLocaleString()}</span><button data-use="${id}" ${Number(snapshot.consumables?.[id]||0)<1?"disabled":""}>${id==='supply-crate'?'Open':id==='abyssal-potion'?'Drink & roll':'Use'}</button></article>`).join("");}
setInterval(renderSupplies,500);
document.addEventListener("click",async e=>{const button=e.target.closest("[data-use]");if(!button)return;const id=button.dataset.use;if(getSettings().autoRoll){notice("Stop Auto Roll before using Deep Sea supplies.",true);return;}if(id==='supply-crate')return act("openCrate");if(id==='abyssal-potion'){const {data,error}=await invokeFunction("roll",{batchSize:1,pool:"normal",abyssalPotion:true});if(error){notice(error.message||error.code,true);return;}window.dispatchEvent(new CustomEvent("gem:roll-complete",{detail:data}));notice(`${data.gem?.name||'A specimen'} emerged from the Abyssal Potion.`);return load();}return act("use",{itemId:id});});
