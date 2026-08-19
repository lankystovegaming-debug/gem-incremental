import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";

mountShell({ page:"upcoming", base:"../" });

const $ = (id) => document.getElementById(id);
let password = "";
let editing = null;
let editingGem = null;
let definitions = [];
let gems = [];
let questFilter = "all";

const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const dateText = (v) => v ? new Date(v).toLocaleString() : "Permanent";
const dateInput = (v) => v ? new Date(v).toISOString().slice(0,16) : "";

function status(message, error=false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

async function call(action, extra={}) {
  const { data, error } = await supabase.functions.invoke("private-features", { body:{ action, password, ...extra } });
  if (error) throw new Error(data?.message || data?.error || error.message || "Private feature request failed");
  if (data?.error) throw new Error(data.message || data.error);
  return data;
}

function toggleButtons() {
  document.querySelectorAll("[data-feature-toggle]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        await call("toggle", { id:button.dataset.featureToggle, enabled:button.dataset.enabled !== "true" });
        await loadAll();
      } catch (e) { status(e.message, true); button.disabled = false; }
    };
  });
}

function featureCard(d) {
  const active = d.enabled !== false;
  const temporary = Boolean(d.starts_at || d.ends_at);
  const rewards = Array.isArray(d.rewards) ? d.rewards.length : 0;
  const requirementLabel = summarizeRequirement(d.requirements);
  return `<article class="feature-card ${active ? "" : "is-disabled"}">
    <div class="card-glow"></div>
    <div class="feature-card__top">
      <span class="feature-icon">${esc(d.icon || "◆")}</span>
      <div class="feature-card__identity"><div class="feature-meta">${esc(d.quest_type || "achievement")} · ${temporary ? "Temporary" : "Permanent"}</div><h3>${esc(d.name)}</h3></div>
      <span class="state-pill ${active ? "on" : "off"}">${active ? "ON" : "OFF"}</span>
    </div>
    <p>${esc(d.description || "No description.")}</p>
    <div class="feature-stats"><span>⚙ ${esc(requirementLabel)}</span><span>🎁 ${rewards} reward${rewards === 1 ? "" : "s"}</span></div>
    <div class="date-line">${dateText(d.starts_at)} → ${d.ends_at ? dateText(d.ends_at) : "No end"}</div>
    <div class="card-actions">
      <button class="btn btn--sm" data-edit="${esc(d.id)}">Edit</button>
      <button class="btn btn--sm" data-feature-toggle="${esc(d.id)}" data-enabled="${active}">${active ? "Disable" : "Enable"}</button>
      <button class="btn btn--sm btn--danger" data-delete="${esc(d.id)}">Delete</button>
    </div>
  </article>`;
}

function summarizeRequirement(req) {
  if (!req || typeof req !== "object") return "Custom requirement";
  if (req.type === "rolls") return `${req.amount ?? 0} rolls`;
  if (req.type === "count") return `${req.amount ?? 0} matching gems${req.windowRolls ? ` / ${req.windowRolls} rolls` : ""}`;
  if (req.type === "consecutive") return `${req.amount ?? 0} consecutive`;
  if (req.type === "single") return "Single result";
  if (req.all) return `${req.all.length} conditions — ALL`;
  if (req.any) return `${req.any.length} conditions — ANY`;
  if (req.not) return "NOT condition";
  return req.type ? String(req.type) : "Custom requirement";
}

function renderFeatures() {
  const achievements = definitions.filter(d => d.feature_kind === "achievement");
  const quests = definitions.filter(d => d.feature_kind === "quest" && (questFilter === "all" || d.quest_type === questFilter));
  $("achievementCount").textContent = achievements.length;
  $("questCount").textContent = definitions.filter(d => d.feature_kind === "quest").length;
  $("achievementCards").innerHTML = achievements.map(featureCard).join("") || empty("No achievements yet.");
  $("questCards").innerHTML = quests.map(featureCard).join("") || empty("No quests match this filter.");
  wireFeatureCards();
  renderPrerequisites();
}

function empty(text) { return `<div class="empty-lab">${esc(text)}</div>`; }

function wireFeatureCards() {
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditor(definitions.find(d => d.id === b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => deleteFeature(b.dataset.delete));
  toggleButtons();
}

function renderGems() {
  $("gemCount").textContent = gems.length;
  $("gemCards").innerHTML = gems.map(g => `<article class="gem-admin-card ${g.enabled ? "" : "is-disabled"}">
    <div class="gem-admin-head"><div><div class="feature-meta">1 in ${Number(g.rarity).toLocaleString()}</div><h3>${esc(g.name)}</h3></div><span class="state-pill ${g.enabled ? "on":"off"}">${g.enabled ? "ON":"OFF"}</span></div>
    <div class="gem-stats"><span>Weight <b>${Number(g.base_weight).toLocaleString()}</b></span><span>Value/g <b>${Number(g.value_per_gram).toLocaleString()}</b></span></div>
    <div class="date-line">${dateText(g.starts_at)} → ${g.ends_at ? dateText(g.ends_at) : "No end"}</div>
    <div class="card-actions">
      <button class="btn btn--sm" data-gem-edit="${esc(g.id)}">Edit</button>
      <button class="btn btn--sm" data-gem-toggle="${esc(g.id)}" data-enabled="${g.enabled}">${g.enabled ? "Disable":"Enable"}</button>
      <button class="btn btn--sm btn--danger" data-gem-delete="${esc(g.id)}">Delete</button>
    </div>
  </article>`).join("") || empty("No gems in the live catalogue.");
  document.querySelectorAll("[data-gem-edit]").forEach(b => b.onclick = () => openGemEditor(gems.find(g => g.id === b.dataset.gemEdit)));
  document.querySelectorAll("[data-gem-toggle]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await call("gem-toggle",{id:b.dataset.gemToggle,enabled:b.dataset.enabled!=="true"}); await loadAll(); }
    catch(e){ status(e.message,true); b.disabled=false; }
  });
  document.querySelectorAll("[data-gem-delete]").forEach(b => b.onclick = async () => {
    const gem = gems.find(g => g.id === b.dataset.gemDelete);
    if (!gem || !confirm(`Permanently delete ${gem.name}? It will stop appearing in rolls.`)) return;
    try { await call("gem-delete",{id:gem.id}); await loadAll(); }
    catch(e){ status(e.message,true); }
  });
}

function renderPrerequisites() {
  const select = $("prerequisites");
  const current = new Set([...select.selectedOptions].map(o=>o.value));
  select.innerHTML = definitions.filter(d => d.id !== editing).map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
  for (const o of select.options) o.selected = current.has(o.value);
}

function ruleFromNode(node) {
  const type = node.querySelector(".rule-type").value;
  const n = (sel) => Number(node.querySelector(sel)?.value || 0);
  const v = (sel) => node.querySelector(sel)?.value || "";
  const obj = {};
  if (type === "rolls") return { type:"rolls", amount:Math.max(1,n(".rule-amount")) };
  if (type === "count") return { type:"count", amount:Math.max(1,n(".rule-amount")), windowRolls: n(".rule-window") || null, match: conditionFrom(node) };
  if (type === "consecutive") return { type:"consecutive", amount:Math.max(1,n(".rule-amount")), match:conditionFrom(node) };
  if (type === "single") return { type:"single", match:conditionFrom(node) };
  if (type === "value") return { type:"single", match:{valueGte:Math.max(0,n(".rule-value"))} };
  if (type === "weight") return { type:"single", match:{weightGte:Math.max(0,n(".rule-value"))} };
  if (type === "mutation-count") return { type:"single", match:{mutationCountGte:Math.max(1,n(".rule-amount"))} };
  if (type === "mutation-chance") return { type:"single", match:{mutationChanceMultiplierGte:Math.max(1,n(".rule-value"))} };
  if (type === "gem") return { type:"single", match:{gemName:v(".rule-gem")} };
  if (type === "no-potion") return { type:"single", match:{noLegendaryOrMythicPotion:true} };
  if (type === "no-any-potion") return { type:"single", match:{noPotionUsed:true} };
  if (type === "mutation") return { type:"single", match:{hasMutation:v(".rule-mutation")} };
  return { type:"single", match:conditionFrom(node) };
}

function conditionFrom(node) {
  const out = {};
  const rarityMin = Number(node.querySelector(".rule-rarity-min")?.value || 0);
  const rarityMax = Number(node.querySelector(".rule-rarity-max")?.value || 0);
  const valueMin = Number(node.querySelector(".rule-value-min")?.value || 0);
  const weightMin = Number(node.querySelector(".rule-weight-min")?.value || 0);
  const gem = node.querySelector(".rule-gem")?.value || "";
  const mutation = node.querySelector(".rule-mutation")?.value || "";
  const mutationCount = Number(node.querySelector(".rule-mutation-count")?.value || 0);
  if (rarityMin) out.gemRarityGte = rarityMin;
  if (rarityMax) out.gemRarityLte = rarityMax;
  if (valueMin) out.valueGte = valueMin;
  if (weightMin) out.weightGte = weightMin;
  if (gem) out.gemName = gem;
  if (mutation) out.hasMutation = mutation;
  if (mutationCount) out.mutationCountGte = mutationCount;
  return out;
}

function conditionControls(existing={}) {
  return `<div class="condition-grid">
    <label>Rarity min<input class="rule-rarity-min" type="number" step="any" value="${esc(existing.gemRarityGte ?? "")}"></label>
    <label>Rarity max<input class="rule-rarity-max" type="number" step="any" value="${esc(existing.gemRarityLte ?? "")}"></label>
    <label>Value min<input class="rule-value-min" type="number" step="any" value="${esc(existing.valueGte ?? "")}"></label>
    <label>Weight min<input class="rule-weight-min" type="number" step="any" value="${esc(existing.weightGte ?? "")}"></label>
    <label>Gem<select class="rule-gem"><option value="">Any gem</option>${gems.map(g=>`<option value="${esc(g.name)}" ${existing.gemName===g.name?"selected":""}>${esc(g.name)}</option>`).join("")}</select></label>
    <label>Mutation<select class="rule-mutation"><option value="">Any mutation</option><option value="polished" ${existing.hasMutation==="polished"?"selected":""}>Polished</option><option value="gilded" ${existing.hasMutation==="gilded"?"selected":""}>Gilded</option><option value="prismatic" ${existing.hasMutation==="prismatic"?"selected":""}>Prismatic</option><option value="celestial" ${existing.hasMutation==="celestial"?"selected":""}>Celestial</option><option value="corrupted" ${existing.hasMutation==="corrupted"?"selected":""}>Corrupted</option></select></label>
    <label>Mutation count<input class="rule-mutation-count" type="number" min="0" value="${esc(existing.mutationCountGte ?? "")}"></label>
  </div>`;
}

function addRequirementRow(node=null) {
  const row=document.createElement("div");
  row.className="builder-row requirement-row";
  let type="single", amount="", window="", value="";
  let existing={};
  if (node) {
    if (node.type === "rolls") {type="rolls";amount=node.amount;}
    else if(node.type==="count"){type="count";amount=node.amount;window=node.windowRolls||"";existing=node.match||{};}
    else if(node.type==="consecutive"){type="consecutive";amount=node.amount;existing=node.match||{};}
    else if(node.type==="single"){type="single";existing=node.match||{};}
  }
  row.innerHTML=`<div class="builder-row-top">
    <select class="rule-type">
      <option value="rolls" ${type==="rolls"?"selected":""}>Roll a number of times</option>
      <option value="count" ${type==="count"?"selected":""}>Get matching gems</option>
      <option value="consecutive" ${type==="consecutive"?"selected":""}>Consecutive matching rolls</option>
      <option value="single" ${type==="single"?"selected":""}>One result matching conditions</option>
      <option value="value">One gem worth at least…</option>
      <option value="weight">One gem weighing at least…</option>
      <option value="mutation-count">One roll with at least N mutations</option>
      <option value="mutation-chance">Reach mutation chance multiplier…</option>
      <option value="gem">Roll this exact gem</option>
      <option value="mutation">Get this mutation</option>
      <option value="no-potion">Mythic/Legendary without those potions</option>
      <option value="no-any-potion">Complete without any one-roll potion</option>
    </select>
    <input class="rule-amount" type="number" min="1" placeholder="Amount" value="${esc(amount)}">
    <input class="rule-window" type="number" min="1" placeholder="Window rolls" value="${esc(window)}">
    <button class="icon-button remove-rule" type="button">×</button>
  </div>
  <div class="rule-extra">${conditionControls(existing)}</div>`;
  const typeSelect=row.querySelector(".rule-type");
  const extra=row.querySelector(".rule-extra");
  const redraw=()=>{
    const t=typeSelect.value;
    if(t==="rolls") extra.innerHTML=`<div class="mini-note">Counts every roll.</div>`;
    else if(t==="count"||t==="consecutive"||t==="single") extra.innerHTML=conditionControls(existing);
    else if(t==="value") extra.innerHTML=`<label>Minimum value<input class="rule-value" type="number" min="0" step="any" value="${value}"></label>`;
    else if(t==="weight") extra.innerHTML=`<label>Minimum weight<input class="rule-value" type="number" min="0" step="any" value="${value}"></label>`;
    else if(t==="mutation-count") extra.innerHTML=`<label>Minimum mutation count<input class="rule-amount" type="number" min="1" value="2"></label>`;
    else if(t==="mutation-chance") extra.innerHTML=`<label>Multiplier threshold<input class="rule-value" type="number" min="1" step="any" value="2"></label>`;
    else if(t==="gem") extra.innerHTML=conditionControls({gemName:existing.gemName});
    else if(t==="mutation") extra.innerHTML=conditionControls({hasMutation:existing.hasMutation});
    else extra.innerHTML=`<div class="mini-note">No additional fields.</div>`;
  };
  typeSelect.onchange=redraw;
  row.querySelector(".remove-rule").onclick=()=>row.remove();
  $("requirementRows").appendChild(row);
  redraw();
}

function collectRequirements() {
  const nodes=[...document.querySelectorAll(".requirement-row")].map(rowFromDom);
  const logic=$("requirementLogic").value;
  if(nodes.length===1 && logic==="single") return nodes[0];
  return {[logic]:nodes};
}

function rowFromDom(row) {
  const type=row.querySelector(".rule-type").value;
  if(type==="rolls") return {type:"rolls",amount:Math.max(1,Number(row.querySelector(".rule-amount")?.value||1))};
  if(type==="count") return {type:"count",amount:Math.max(1,Number(row.querySelector(".rule-amount")?.value||1)),windowRolls:Number(row.querySelector(".rule-window")?.value||0)||null,match:conditionFrom(row)};
  if(type==="consecutive") return {type:"consecutive",amount:Math.max(1,Number(row.querySelector(".rule-amount")?.value||1)),match:conditionFrom(row)};
  if(type==="single") return {type:"single",match:conditionFrom(row)};
  if(type==="value") return {type:"single",match:{valueGte:Number(row.querySelector(".rule-value")?.value||0)}};
  if(type==="weight") return {type:"single",match:{weightGte:Number(row.querySelector(".rule-value")?.value||0)}};
  if(type==="mutation-count") return {type:"single",match:{mutationCountGte:Number(row.querySelector(".rule-amount")?.value||1)}};
  if(type==="mutation-chance") return {type:"single",match:{mutationChanceMultiplierGte:Number(row.querySelector(".rule-value")?.value||1)}};
  if(type==="gem") return {type:"single",match:{gemName:row.querySelector(".rule-gem")?.value||""}};
  if(type==="mutation") return {type:"single",match:{hasMutation:row.querySelector(".rule-mutation")?.value||""}};
  if(type==="no-potion") return {type:"single",match:{noLegendaryOrMythicPotion:true}};
  return {type:"single",match:{noPotionUsed:true}};
}

function rewardRow(existing={}) {
  const row=document.createElement("div");
  row.className="builder-row reward-row";
  row.innerHTML=`<div class="builder-row-top">
    <select class="reward-type"><option value="money">Money</option><option value="coins">Coins</option><option value="potion">Potion</option><option value="gem">Gem</option><option value="capacity">Inventory capacity</option><option value="unlock">Unlock ID</option></select>
    <input class="reward-amount" type="number" min="1" step="any" value="${esc(existing.amount ?? 1)}">
    <button class="icon-button remove-reward" type="button">×</button>
  </div>
  <div class="reward-extra"></div>`;
  const select=row.querySelector(".reward-type");
  const extra=row.querySelector(".reward-extra");
  const redraw=()=>{
    if(select.value==="potion") extra.innerHTML=`<label>Potion<select class="reward-potion">${potionOptions(existing.consumableId)}</select></label>`;
    else if(select.value==="gem") extra.innerHTML=`<label>Gem<select class="reward-gem"><option value="">Select gem</option>${gems.map(g=>`<option value="${esc(g.name)}" ${existing.gemName===g.name?"selected":""}>${esc(g.name)}</option>`).join("")}</select></label><label>Weight multiplier<input class="reward-mult" type="number" min=".01" step=".01" value="${esc(existing.weightMultiplier??1)}"></label>`;
    else if(select.value==="unlock") extra.innerHTML=`<label>Unlock ID<input class="reward-unlock" value="${esc(existing.unlockId??"")}"></label>`;
    else extra.innerHTML="";
  };
  select.value=existing.type||"money";
  select.onchange=redraw;
  row.querySelector(".remove-reward").onclick=()=>row.remove();
  $("rewardRows").appendChild(row); redraw();
}
function potionOptions(selected){return `<option value="">Choose potion</option>${["lucky-potion-1","lucky-potion-2","lucky-potion-3","legendary-potion","mythic-potion"].map(x=>`<option value="${x}" ${selected===x?"selected":""}>${x}</option>`).join("")}`;}
function collectRewards(){return [...document.querySelectorAll(".reward-row")].map(row=>{const type=row.querySelector(".reward-type").value;const amount=Number(row.querySelector(".reward-amount")?.value||1);if(type==="potion")return {type,consumableId:row.querySelector(".reward-potion")?.value,amount};if(type==="gem")return {type,gemName:row.querySelector(".reward-gem")?.value,weightMultiplier:Number(row.querySelector(".reward-mult")?.value||1),amount};if(type==="unlock")return {type,unlockId:row.querySelector(".reward-unlock")?.value,amount:1};return {type,amount};});}

function openEditor(d=null){
  editing=d?.id||null;$("editor").hidden=false;$("gemEditor").hidden=true;
  $("editorTitle").textContent=d?"Edit feature":"New feature";
  $("kind").value=d?.feature_kind||"achievement";$("questType").value=d?.quest_type||"main";
  $("name").value=d?.name||"";$("icon").value=d?.icon||"✦";$("description").value=d?.description||"";
  $("sortOrder").value=d?.sort_order??0;$("enabled").checked=d?.enabled!==false;
  const temp=Boolean(d?.starts_at||d?.ends_at);$("durationMode").value=temp?"temporary":"permanent";
  $("startsAt").value=dateInput(d?.starts_at);$("endsAt").value=dateInput(d?.ends_at);
  $("requirementRows").innerHTML=""; let req=d?.requirements||{type:"rolls",amount:1};
  let logic="single", nodes=[req]; if(req.all){logic="all";nodes=req.all;} else if(req.any){logic="any";nodes=req.any;}
  $("requirementLogic").value=logic; nodes.forEach(addRequirementRow);
  $("rewardRows").innerHTML="";(d?.rewards||[]).forEach(rewardRow); if(!(d?.rewards||[]).length) rewardRow({type:"money",amount:0});
  renderPrerequisites(); if(d?.prerequisites) for(const o of $("prerequisites").options)o.selected=d.prerequisites.includes(o.value);
  $("unlocks").value=Array.isArray(d?.unlocks)?d.unlocks.join(", "):"";
  window.scrollTo({top:$("editor").offsetTop-80,behavior:"smooth"});
}
function openGemEditor(g=null){
  editingGem=g?.id||null;$("gemEditor").hidden=false;$("editor").hidden=true;$("gemEditorTitle").textContent=g?"Edit Gem":"New Gem";
  $("gemName").value=g?.name||"";$("gemRarity").value=g?.rarity??100;$("gemWeight").value=g?.base_weight??100;$("gemValue").value=g?.value_per_gram??1;$("gemSort").value=g?.sort_order??0;$("gemEnabled").checked=g?.enabled!==false;
  $("gemDuration").value=(g?.starts_at||g?.ends_at)?"temporary":"permanent";$("gemStarts").value=dateInput(g?.starts_at);$("gemEnds").value=dateInput(g?.ends_at);
  window.scrollTo({top:$("gemEditor").offsetTop-80,behavior:"smooth"});
}
function temporaryDates(mode,start,end){return mode==="temporary"?{starts_at:start?new Date(start).toISOString():null,ends_at:end?new Date(end).toISOString():null}:{starts_at:null,ends_at:null};}

async function saveFeature(){
  const mode=$("durationMode").value; const dates=temporaryDates(mode,$("startsAt").value,$("endsAt").value);
  const prereqs=[...$("prerequisites").selectedOptions].map(o=>o.value);
  const definition={id:editing||undefined,feature_kind:$("kind").value,quest_type:$("kind").value==="quest"?$("questType").value:null,name:$("name").value.trim(),icon:$("icon").value||"✦",description:$("description").value.trim(),sort_order:Number($("sortOrder").value)||0,enabled:$("enabled").checked,...dates,requirements:collectRequirements(),rewards:collectRewards().filter(r=>r.type!=="money"||Number(r.amount)>0),prerequisites:prereqs,unlocks:$("unlocks").value.split(",").map(x=>x.trim()).filter(Boolean),metadata:{}};
  if(!definition.name){status("Give the feature a name.",true);return;}
  try{await call("save",{definition});$("editor").hidden=true;editing=null;await loadAll();status("Feature saved.");}catch(e){status(e.message,true);}
}
async function saveGem(){
  const dates=temporaryDates($("gemDuration").value,$("gemStarts").value,$("gemEnds").value);
  const gem={id:editingGem||undefined,name:$("gemName").value.trim(),rarity:Number($("gemRarity").value),base_weight:Number($("gemWeight").value),value_per_gram:Number($("gemValue").value),sort_order:Number($("gemSort").value)||0,enabled:$("gemEnabled").checked,...dates,metadata:{}};
  if(!gem.name){status("Give the gem a name.",true);return;}
  try{await call("gem-save",{gem});$("gemEditor").hidden=true;editingGem=null;await loadAll();status("Gem saved.");}catch(e){status(e.message,true);}
}
async function deleteFeature(id){const d=definitions.find(x=>x.id===id);if(!d||!confirm(`Permanently delete ${d.name}?`))return;try{await call("delete",{id});await loadAll();}catch(e){status(e.message,true);}}
async function loadAll(){
  try{
    const [f,g]=await Promise.all([call("list"),call("gem-list")]);
    definitions=f.definitions||[];gems=g.gems||[];renderFeatures();renderGems();
    status(`${definitions.length} features · ${gems.length} gems loaded.`);
  }catch(e){status(e.message,true);}
}

document.querySelectorAll(".lab-tab").forEach(tab=>tab.onclick=()=>{
  document.querySelectorAll(".lab-tab").forEach(x=>x.classList.toggle("is-active",x===tab));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.toggle("is-active",x.dataset.panel===tab.dataset.tab));
});
document.querySelectorAll("[data-quest-filter]").forEach(b=>b.onclick=()=>{questFilter=b.dataset.questFilter;document.querySelectorAll("[data-quest-filter]").forEach(x=>x.classList.toggle("is-active",x===b));renderFeatures();});
$("unlock").onclick=async()=>{password=$("password").value.trim();try{await call("list");$("gate").hidden=true;$("workspace").hidden=false;await loadAll();}catch(e){status(e.message,true);}};
$("refresh").onclick=loadAll;$("seed").onclick=async()=>{try{await call("seed");await loadAll();}catch(e){status(e.message,true);}};
$("newFeature").onclick=()=>openEditor();$("newGem").onclick=()=>openGemEditor();
$("cancel").onclick=$("cancelBottom").onclick=()=>{$("editor").hidden=true;editing=null};
$("gemCancel").onclick=$("gemCancelBottom").onclick=()=>{$("gemEditor").hidden=true;editingGem=null};
$("save").onclick=saveFeature;$("gemSave").onclick=saveGem;
$("addRequirement").onclick=()=>addRequirementRow();$("addReward").onclick=()=>rewardRow({type:"money",amount:1});
$("durationMode").onchange=()=>{const temp=$("durationMode").value==="temporary";$("startsAt").disabled=!temp;$("endsAt").disabled=!temp;};
$("gemDuration").onchange=()=>{const temp=$("gemDuration").value==="temporary";$("gemStarts").disabled=!temp;$("gemEnds").disabled=!temp;};
$("durationMode").dispatchEvent(new Event("change"));$("gemDuration").dispatchEvent(new Event("change"));

ensurePlayerAuth().catch(()=>{});
