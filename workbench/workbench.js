import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
mountShell({page:"workbench",base:"../"});
const $=id=>document.getElementById(id);
let config=null,session=null,selected=[];
let raf=0,startTime=0;
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
async function api(action,extra={}){const {data,error}=await supabase.functions.invoke("workbench",{body:{action,...extra}});if(error||data?.error)throw new Error(data?.message||data?.error||error?.message);return data;}
async function load(){
 try{
  const c=await api("config");config=c.config;
  document.title=`${config.display_name||config.beta_label||"Workbench [BETA]"} · Gem Incremental`;
  const heroTitle=document.getElementById("workbenchTitle"); if(heroTitle) heroTitle.textContent=config.display_name||config.beta_label||"Workbench [BETA]";
  const materials=await api("materials");
  const data=materials.gems||[];
  $("materials").innerHTML=data.map(g=>`<button type="button" class="material" data-gem="${g.id}"><b>${esc(g.gem_name)}</b><small>1 in ${Number(g.rarity).toLocaleString()} · $${Number(g.value||0).toFixed(2)}</small></button>`).join("")||"<p class='muted'>No unlocked gems available.</p>";
  document.querySelectorAll(".material").forEach(b=>b.onclick=()=>{b.classList.toggle("selected");selected=b.classList.contains("selected")?[...selected,b.dataset.gem]:selected.filter(x=>x!==b.dataset.gem);});
  const h=await api("history");
  $("history").innerHTML=(h.items||[]).map(x=>`<div class="result-stat"><b>${esc(x.rarity)} ${esc(x.item_name)}</b> · ${esc(x.item_type)} · ${esc(x.quality)}x · ${x.ore_count} gems</div>`).join("")||'<p class="muted">No Workbench results yet.</p>';
 }catch(e){console.error("[WORKBENCH]",e);$("setupStatus").textContent=`Workbench could not load: ${e.message||"Unknown server error"}`;}
}
function animate(){
  const t=(performance.now()-startTime)/1000;
  const track=document.querySelector(".timing-track");
  const target=document.getElementById("target");
  if(!track||!target)return;
  const w=Math.max(1,track.clientWidth-24);
  const period=Math.max(1,Number(config?.stage_time_seconds||8));
  const progress=(t%period)/period;
  const wave=progress<.5?progress*2:2-progress*2;
  target.style.left=(wave*w)+"px";
  raf=requestAnimationFrame(animate);
}
function stop(){cancelAnimationFrame(raf);raf=0;}
function startStage(){
  stop();
  const stage=Number(session?.stage||1);
  startTime=performance.now();
  $("stageLabel").textContent=`Stage ${stage} / 3`;
  $("stageStatus").textContent="Click STRIKE when the marker is centered.";
  requestAnimationFrame(()=>animate());
}
$("start").onclick=async()=>{try{if(selected.length<(config?.min_materials||3))throw new Error(`Select at least ${config.min_materials} gems.`);const d=await api("start",{itemType:$("itemType").value,materialIds:selected.map(Number).filter(Number.isFinite)});
session=d.session;$("setup").hidden=true;$("minigame").hidden=false;startStage();}catch(e){console.error("[WORKBENCH]",e);$("setupStatus").textContent=`Workbench could not load: ${e.message||"Unknown server error"}`;}};
$("strike").onclick=async()=>{stop();const rect=$(".timing-track").getBoundingClientRect(),target=$("target").getBoundingClientRect();const center=rect.left+rect.width/2;const dist=Math.abs(target.left+target.width/2-center)/(rect.width/2);const score=Math.max(0,1-dist);$("stageStatus").textContent=`Timing score: ${(score*100).toFixed(0)}%`;try{const d=await api("stage",{sessionId:session.id,score});session=d.session;if(d.stage<=3)setTimeout(startStage,450);else{showResult(d.result);await load();}}catch(e){$("stageStatus").textContent=e.message;}};
function showResult(r){$("minigame").hidden=true;$("result").hidden=false;$("resultBody").innerHTML=`<div class="result-stat"><b>${esc(r.quality)}</b> · ${esc(r.rarity)} · ${esc(r.itemClass)}</div><div class="result-stat">Multiplier: ${Number(r.multiplier).toFixed(3)}x · Ore count: ${r.oreCount}</div><div class="result-stat">Stats: ${esc(JSON.stringify(r.stats))}</div><div class="result-stat">Traits: ${esc(JSON.stringify(r.traits))}</div>`;}
$("again").onclick=()=>location.reload();
load();
