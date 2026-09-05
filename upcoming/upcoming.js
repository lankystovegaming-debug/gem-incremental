import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { initExpansionLab } from "./expansionLab.js";

// This module can run standalone at /upcoming/ or inside the combined Admin
// Feature Lab. The latter already owns the application shell.
if (!document.body.dataset.adminUpcoming) {
  mountShell({ page:"upcoming", base:"../" });
}

const $ = (id) => document.getElementById(id);
let password = "";
let editing = null;
let editingGem = null;
let definitions = [];
let gems = [];
let questFilter = "all";
let rarities = [];
let pvpWeapons = [];
let editingRarity = null;
let editingPvpWeapon = null;

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
      <div class="feature-card__identity"><div class="feature-meta">${esc(d.quest_type || "achievement")} · ${temporary ? "Temporary" : "Permanent"} · ${d.admin_only ? "Admin only" : "Public"}</div><h3>${esc(d.name)}</h3></div>
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

async function renderSectionControls(){
  try{
    const r=await call("section-list");
    const sections=r.sections||[];
    const fallbackLabels={
      achievements:["🏆 Achievements","Achievement page + top bar"],
      quests:["⚔ Quests","Quest page + top bar"],
      guilds:["🛡 Guilds","Guild page + top bar"],
      islands:["🗺 Islands","Island travel + boosts + top bar"],
      forge:["⚒ Workbench [BETA]","Three-stage forging + top bar"],
      dungeons:["⚔ Dungeons","Combat dungeons + top bar"],
      pvp:["⚔ PvP","Player-versus-player combat + top bar"],
      "world-bosses":["☄ World Bosses","Phased bosses, contribution races and custom loot."],
      "relic-vault":["◈ Relic Vault","Passive relics, sockets, sets and salvage."],
      seasons:["✦ Seasons","Season XP, tiers, challenges and modifiers."],
      bounties:["⚑ Bounty Board","Custom contracts with targets, requirements and rewards."],
      "treasure-expeditions":["◇ Treasure Expeditions","Branching expeditions with risk and weighted outcomes."],
      "artifact-archives":["◈ Artifact Archives","Collect, socket, upgrade and salvage customizable artifacts."],
      "gem-fusion":["✧ Gem Fusion Lab","Combine gems with recipes, catalysts and weighted outcomes."],
      "enchanting-lab":["✦ Enchanting Lab","Create custom equipment enchantments from gem costs and effects."],
      "collection-hall":["▦ Collection Hall","Long-term collection sets, milestones and permanent bonuses."],
      "mining-events":["⛏ Mining Events","Timed mining phenomena with phases, boosts and custom loot."],
      "merchant-caravan":["◇ Merchant Caravan","Rotating merchants, stock, prices and currencies."],
      "research-tree":["⌬ Research Tree","Branching permanent research with prerequisites and effects."]
    };
    $("sectionControls").innerHTML=sections.filter(s=>fallbackLabels[s.id]).map(s=>{
      const fallback=fallbackLabels[s.id];
      const label=s.label||fallback[0], icon=s.icon||fallback[0].slice(0,2);
      return `<article class="feature-card ${s.enabled?"":"is-disabled"}">
        <div class="feature-card__top"><span class="feature-icon">${esc(icon)}</span><div class="feature-card__identity"><div class="feature-meta">SITE FEATURE · ${s.admin_only ? "ADMIN ONLY" : "PUBLIC"}</div><h3>${esc(label)}</h3></div><span class="state-pill ${s.enabled?"on":"off"}">${s.enabled?"ON":"OFF"}</span></div>
        <p>${esc(s.description||fallback[1])}</p>
        <div class="form-grid compact-section-editor">
          <label>Name<input data-section-label="${esc(s.id)}" value="${esc(label)}"></label>
          <label>Symbol<input maxlength="8" data-section-icon="${esc(s.id)}" value="${esc(icon)}"></label>
          <label>Short label<input maxlength="24" data-section-short="${esc(s.id)}" value="${esc(s.short_label||label)}"></label>
          <label class="toggle-field"><input type="checkbox" data-section-admin-only="${esc(s.id)}" ${s.admin_only ? "checked" : ""}><span>Admins only</span><small>Hide this feature from normal users and require administrator access.</small></label>
        </div>
        <div class="card-actions">
          <button class="btn btn--sm" data-section-save="${esc(s.id)}">Save name</button>
          <button class="btn btn--sm btn--primary" data-section-toggle="${esc(s.id)}" data-enabled="${s.enabled}">${s.enabled?"Disable":"Enable"}</button>
        </div>
      </article>`;
    }).join("");
    document.querySelectorAll("[data-section-toggle]").forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{await call("section-toggle",{id:b.dataset.sectionToggle,enabled:b.dataset.enabled!=="true"});await renderSectionControls();status("Feature visibility updated. Refresh another page to update its navigation.");}
      catch(e){status(e.message,true);b.disabled=false;}
    });
    document.querySelectorAll("[data-section-save]").forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      const id=b.dataset.sectionSave;
      try{
        await call("section-save",{
          id,
          label:document.querySelector(`[data-section-label="${CSS.escape(id)}"]`).value.trim(),
          icon:document.querySelector(`[data-section-icon="${CSS.escape(id)}"]`).value.trim(),
          short_label:document.querySelector(`[data-section-short="${CSS.escape(id)}"]`).value.trim(),
          admin_only:document.querySelector(`[data-section-admin-only="${CSS.escape(id)}"]`)?.checked === true
        });
        await renderSectionControls();
        if(id==="workbench") await renderWorldLab();
        status(`${id==="workbench"?"Workbench":"Site feature"} name and symbol saved.`);
      }catch(e){status(e.message,true);b.disabled=false;}
    });
  }catch(e){status(e.message,true);}
}
function empty(text) { return `<div class="empty-lab">${esc(text)}</div>`; }

function wireFeatureCards() {
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditor(definitions.find(d => d.id === b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => deleteFeature(b.dataset.delete));
  toggleButtons();
}

function renderGems() {
  gems.sort((a,b)=>Number(a.rarity)-Number(b.rarity)||String(a.name).localeCompare(String(b.name)));
  $("gemCount").textContent = gems.length;
  $("gemCards").innerHTML = gems.map(g => {
    const tier = rarities.find(r => r.enabled && Number(g.rarity) >= Number(r.min_rarity) && (r.max_rarity == null || Number(g.rarity) <= Number(r.max_rarity)));
    return `<article class="gem-admin-card ${g.enabled ? "" : "is-disabled"}">
    <div class="gem-admin-head"><div><div class="feature-meta">${tier ? `${esc(tier.icon)} ${esc(tier.name)} · ` : ""}1 in ${Number(g.rarity).toLocaleString()}</div>${g.title ? `<div class="gem-admin-title">${esc(g.title)}</div>` : ""}<h3>${esc(g.name)}</h3></div><span class="state-pill ${g.enabled ? "on":"off"}">${g.enabled ? "ON":"OFF"}</span></div>
    ${g.description ? `<p class="gem-admin-description">${esc(g.description)}</p>` : ""}
    <div class="gem-stats"><span>Weight <b>${Number(g.base_weight).toLocaleString()}</b></span><span>Value/g <b>${Number(g.value_per_gram).toLocaleString()}</b></span></div>
    <div class="date-line">${dateText(g.starts_at)} → ${g.ends_at ? dateText(g.ends_at) : "No end"}</div>
    <div class="card-actions">
      <button class="btn btn--sm" data-gem-edit="${esc(g.id)}">Edit</button>
      <button class="btn btn--sm" data-gem-toggle="${esc(g.id)}" data-enabled="${g.enabled}">${g.enabled ? "Disable":"Enable"}</button>
      <button class="btn btn--sm btn--danger" data-gem-delete="${esc(g.id)}">Delete</button>
    </div>
  </article>`;
  }).join("") || empty("No gems in the live catalogue.");
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
  $("sortOrder").value=d?.sort_order??0;$("enabled").checked=d?.enabled!==false;$("adminOnly").checked=d?.admin_only===true;
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
  $("gemTitle").value=g?.title||g?.metadata?.title||"";$("gemName").value=g?.name||"";$("gemRarity").value=g?.rarity??100;$("gemDescription").value=g?.description||g?.metadata?.description||"";$("gemWeight").value=g?.base_weight??100;$("gemValue").value=g?.value_per_gram??1;$("gemSort").value=g?.sort_order??0;$("gemAffectedByLuck").checked=g?.affected_by_luck!==false;$("gemEnabled").checked=g?.enabled!==false;
  const availabilityMode=g?.availability_mode||((g?.starts_at||g?.ends_at)?"date_range":"always");
  $("gemDuration").value=availabilityMode==="daily"?"daily":availabilityMode==="date_range_daily"?"temporary-daily":availabilityMode==="date_range"?"temporary":"permanent";$("gemStarts").value=dateInput(g?.starts_at);$("gemEnds").value=dateInput(g?.ends_at);$("gemDailyStart").value=String(g?.daily_start_time||"11:00").slice(0,5);$("gemDailyEnd").value=String(g?.daily_end_time||"16:00").slice(0,5);$("gemTimezone").value=g?.availability_timezone||"Asia/Singapore";
  window.scrollTo({top:$("gemEditor").offsetTop-80,behavior:"smooth"});
}
function temporaryDates(mode,start,end){return (mode==="temporary"||mode==="temporary-daily")?{starts_at:start?new Date(start).toISOString():null,ends_at:end?new Date(end).toISOString():null}:{starts_at:null,ends_at:null};}

async function saveFeature(){
  const mode=$("durationMode").value; const dates=temporaryDates(mode,$("startsAt").value,$("endsAt").value);
  const prereqs=[...$("prerequisites").selectedOptions].map(o=>o.value);
  const definition={id:editing||undefined,feature_kind:$("kind").value,quest_type:$("kind").value==="quest"?$("questType").value:null,name:$("name").value.trim(),icon:$("icon").value||"✦",description:$("description").value.trim(),sort_order:Number($("sortOrder").value)||0,enabled:$("enabled").checked,admin_only:$("adminOnly").checked,...dates,requirements:collectRequirements(),rewards:collectRewards().filter(r=>r.type!=="money"||Number(r.amount)>0),prerequisites:prereqs,unlocks:$("unlocks").value.split(",").map(x=>x.trim()).filter(Boolean),metadata:{}};
  if(!definition.name){status("Give the feature a name.",true);return;}
  try{await call("save",{definition});$("editor").hidden=true;editing=null;await loadAll();status("Feature saved.");}catch(e){status(e.message,true);}
}
async function saveGem(){
  const dates=temporaryDates($("gemDuration").value,$("gemStarts").value,$("gemEnds").value);
  const mode=$("gemDuration").value;const usesDaily=mode==="daily"||mode==="temporary-daily";
  const gem={id:editingGem||undefined,title:$("gemTitle").value.trim(),name:$("gemName").value.trim(),description:$("gemDescription").value.trim(),rarity:Number($("gemRarity").value),base_weight:Number($("gemWeight").value),value_per_gram:Number($("gemValue").value),sort_order:Number($("gemSort").value)||0,affected_by_luck:$("gemAffectedByLuck").checked,enabled:$("gemEnabled").checked,...dates,availability_mode:mode==="daily"?"daily":mode==="temporary-daily"?"date_range_daily":mode==="temporary"?"date_range":"always",daily_start_time:usesDaily?$("gemDailyStart").value:null,daily_end_time:usesDaily?$("gemDailyEnd").value:null,availability_timezone:$("gemTimezone").value.trim()||"Asia/Singapore",metadata:{}};
  if(!gem.name){status("Give the gem a name.",true);return;}
  try{await call("gem-save",{gem});$("gemEditor").hidden=true;editingGem=null;await loadAll();status("Gem saved.");}catch(e){status(e.message,true);}
}
async function deleteFeature(id){const d=definitions.find(x=>x.id===id);if(!d||!confirm(`Permanently delete ${d.name}?`))return;try{await call("delete",{id});await loadAll();}catch(e){status(e.message,true);}}
async function loadAll(){
  try{
    const [f,g]=await Promise.all([call("list"),call("gem-list")]);
    definitions=f.definitions||[];gems=g.gems||[];
    await Promise.all([renderRarities(),renderPvpWeapons()]);
    renderFeatures();renderGems();
    await renderWorldLab();
    await renderSectionControls();
    initExpansionLab({call,status,initialGems:gems});
    status(`${definitions.length} features · ${gems.length} gems loaded.`);
  }catch(e){status(e.message,true);}
}

document.querySelectorAll(".lab-tab").forEach(tab=>tab.onclick=()=>{
  document.querySelectorAll(".lab-tab").forEach(x=>x.classList.toggle("is-active",x===tab));
  document.querySelectorAll(".tab-panel").forEach(x=>x.classList.toggle("is-active",x.dataset.panel===tab.dataset.tab));
});
document.querySelectorAll("[data-quest-filter]").forEach(b=>b.onclick=()=>{questFilter=b.dataset.questFilter;document.querySelectorAll("[data-quest-filter]").forEach(x=>x.classList.toggle("is-active",x===b));renderFeatures();});
$("unlock").onclick=async()=>{password=$("password").value.trim();try{await call("list");$("gate").hidden=true;$("workspace").hidden=false;await loadAll();}catch(e){status(e.message,true);}};
$("refresh").onclick=loadAll;$("refreshSections").onclick=renderSectionControls;$("seed").onclick=async()=>{try{await call("seed");await loadAll();}catch(e){status(e.message,true);}};
$("newFeature").onclick=()=>openEditor();$("newGem").onclick=()=>openGemEditor();
$("cancel").onclick=$("cancelBottom").onclick=()=>{$("editor").hidden=true;editing=null};
$("gemCancel").onclick=$("gemCancelBottom").onclick=()=>{$("gemEditor").hidden=true;editingGem=null};
$("save").onclick=saveFeature;$("gemSave").onclick=saveGem;
$("addRequirement").onclick=()=>addRequirementRow();$("addReward").onclick=()=>rewardRow({type:"money",amount:1});
$("durationMode").onchange=()=>{const temp=$("durationMode").value==="temporary";$("startsAt").disabled=!temp;$("endsAt").disabled=!temp;};
$("gemDuration").onchange=()=>{const mode=$("gemDuration").value;const temp=mode==="temporary"||mode==="temporary-daily",daily=mode==="daily"||mode==="temporary-daily";$("gemStarts").disabled=!temp;$("gemEnds").disabled=!temp;$("gemDailyStart").disabled=!daily;$("gemDailyEnd").disabled=!daily;$("gemTimezone").disabled=!daily;};
$("durationMode").dispatchEvent(new Event("change"));$("gemDuration").dispatchEvent(new Event("change"));


let editingIsland=null, editingDungeon=null, workbenchConfig=null, worldData=null;

function worldDates(mode,start,end){return temporaryDates(mode,start,end);}
function renderWorldLab(){
  call("world-list").then(d=>{
    worldData=d;
    $("islandCount").textContent=(d.islands||[]).length;
    $("workbenchState").textContent=d.workbench?.enabled?"ON":"OFF";
    $("dungeonCount").textContent=(d.dungeons||[]).length;
    $("islandCards").innerHTML=(d.islands||[]).map(i=>`<article class="feature-card ${i.enabled?"":"is-disabled"}"><div class="feature-card__top"><span class="feature-icon">🗺</span><div class="feature-card__identity"><div class="feature-meta">Island ${i.island_number}</div><h3>${esc(i.name)}</h3></div><span class="state-pill ${i.enabled?"on":"off"}>${i.enabled?"ON":"OFF"}</span></div><p>${esc(i.description)}</p><div class="feature-stats"><span>🔓 ${esc(JSON.stringify(i.unlock_requirements||{}))}</span><span>✨ ${esc(JSON.stringify(i.boosts||{}))}</span></div><div class="card-actions"><button class="btn btn--sm" data-island-edit="${i.id}">Edit</button><button class="btn btn--sm" data-island-toggle="${i.id}" data-enabled="${i.enabled}">${i.enabled?"Disable":"Enable"}</button><button class="btn btn--sm btn--danger" data-island-delete="${i.id}">Delete</button></div></article>`).join("")||empty("No islands configured.");
    $("dungeonCards").innerHTML=(d.dungeons||[]).map(x=>`<article class="feature-card ${x.enabled?"":"is-disabled"}"><div class="feature-card__top"><span class="feature-icon">⚔</span><div class="feature-card__identity"><div class="feature-meta">${x.max_enemies} enemies max</div><h3>${esc(x.name)}</h3></div><span class="state-pill ${x.enabled?"on":"off"}">${x.enabled?"ON":"OFF"}</span></div><p>${esc(x.description)}</p><div class="card-actions"><button class="btn btn--sm" data-dungeon-edit="${x.id}">Edit</button><button class="btn btn--sm" data-dungeon-toggle="${x.id}" data-enabled="${x.enabled}">${x.enabled?"Disable":"Enable"}</button><button class="btn btn--sm btn--danger" data-dungeon-delete="${x.id}">Delete</button></div></article>`).join("")||empty("No dungeons configured.");
    wireWorldCards();
    renderWorkbenchConfig(d.workbench);
  }).catch(e=>status(e.message,true));
}
function wireWorldCards(){
  document.querySelectorAll("[data-island-edit]").forEach(b=>b.onclick=()=>openIsland((worldData.islands||[]).find(x=>x.id===b.dataset.islandEdit)));
  document.querySelectorAll("[data-island-toggle]").forEach(b=>b.onclick=async()=>{try{await call("world-toggle",{id:b.dataset.islandToggle,enabled:b.dataset.enabled!=="true"});renderWorldLab()}catch(e){status(e.message,true)}});
  document.querySelectorAll("[data-island-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this island?")){try{await call("world-delete",{id:b.dataset.islandDelete});renderWorldLab()}catch(e){status(e.message,true)}}});
  document.querySelectorAll("[data-dungeon-edit]").forEach(b=>b.onclick=()=>openDungeon((worldData.dungeons||[]).find(x=>x.id===b.dataset.dungeonEdit)));
  document.querySelectorAll("[data-dungeon-toggle]").forEach(b=>b.onclick=async()=>{try{await call("dungeon-save",{dungeon:{...(worldData.dungeons||[]).find(x=>x.id===b.dataset.dungeonToggle),enabled:b.dataset.enabled!=="true"}});renderWorldLab()}catch(e){status(e.message,true)}});
  document.querySelectorAll("[data-dungeon-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this dungeon and its enemies?")){try{await call("dungeon-delete",{id:b.dataset.dungeonDelete});renderWorldLab()}catch(e){status(e.message,true)}}});
}
function openIsland(i){
  editingIsland=i?.id||null;$("islandEditor").hidden=false;$("islandEditorTitle").textContent=i?"Edit Island":"New Island";
  $("islandNumber").value=i?.island_number??1;$("islandName").value=i?.name||"";$("islandDescription").value=i?.description||"";$("islandSort").value=i?.sort_order??0;$("islandEnabled").checked=i?.enabled===true;
  $("islandDuration").value=(i?.starts_at||i?.ends_at)?"temporary":"permanent";$("islandStarts").value=dateInput(i?.starts_at);$("islandEnds").value=dateInput(i?.ends_at);
  const r=i?.unlock_requirements||{},b=i?.boosts||{};$("islandReqRolls").value=r.minRolls||0;$("islandReqMoney").value=r.minMoney||0;$("islandReqCoins").value=r.minCoins||0;$("islandReqEquip").value=r.minAllEquipmentTier||0;$("islandReqPick").value=r.minPickaxeTier||0;$("islandReqBag").value=r.minBagTier||0;
  $("islandBoostMoney").value=b.money??1;$("islandBoostCoins").value=b.coins??1;$("islandBoostGems").value=b.gems??1;$("islandBoostXp").value=b.xp??1;
  window.scrollTo({top:$("islandEditor").offsetTop-80,behavior:"smooth"});
}
$("islandSave").onclick=async()=>{try{const dates=worldDates($("islandDuration").value,$("islandStarts").value,$("islandEnds").value);const island={id:editingIsland||undefined,island_number:Number($("islandNumber").value),name:$("islandName").value.trim(),description:$("islandDescription").value.trim(),sort_order:Number($("islandSort").value)||0,enabled:$("islandEnabled").checked,...dates,unlock_requirements:{minRolls:Number($("islandReqRolls").value)||0,minMoney:Number($("islandReqMoney").value)||0,minCoins:Number($("islandReqCoins").value)||0,minAllEquipmentTier:Number($("islandReqEquip").value)||0,minPickaxeTier:Number($("islandReqPick").value)||0,minBagTier:Number($("islandReqBag").value)||0},boosts:{money:Number($("islandBoostMoney").value)||1,coins:Number($("islandBoostCoins").value)||1,gems:Number($("islandBoostGems").value)||1,xp:Number($("islandBoostXp").value)||1}};await call("world-save",{island});$("islandEditor").hidden=true;renderWorldLab()}catch(e){status(e.message,true)}};
$("newIsland").onclick=()=>openIsland();$("islandCancel").onclick=()=>{$("islandEditor").hidden=true;editingIsland=null};

function renderWorkbenchConfig(c){
  workbenchConfig=c;
  const workbenchName=c?.display_name||c?.beta_label||"Workbench [BETA]";
  $("workbenchPanelTitle").textContent=workbenchName;
  $("workbenchConfigPanel").innerHTML=`<div class="form-grid">
  <label class="toggle-field"><input id="workbenchEnabled" type="checkbox" ${c?.enabled?"checked":""}><span>Workbench enabled</span><small>Also enable the Workbench section switch below.</small></label>
  <label>Beta label<input id="workbenchLabel" value="${esc(c?.beta_label||"Workbench [BETA]")}"></label>
  <label>Minimum gems<input id="workbenchMin" type="number" value="${c?.min_materials??3}"></label>
  <label>Maximum gems<input id="workbenchMax" type="number" value="${c?.max_materials??50}"></label>
  <label>Seconds per stage<input id="workbenchTime" type="number" step=".5" value="${c?.stage_time_seconds??8}"></label>
  <label>Minor trait threshold<input id="workbenchMinor" type="number" step=".01" value="${c?.trait_threshold_minor??.1}"></label>
  <label>Full trait threshold<input id="workbenchFull" type="number" step=".01" value="${c?.trait_threshold_full??.3}"></label>
  </div><div class="editor-section"><h3>Quality multipliers</h3><div class="form-grid">
  <label>Broken<input id="qBroken" type="number" step=".01" value="${c?.quality_broken??.65}"></label><label>Poor<input id="qPoor" type="number" step=".01" value="${c?.quality_poor??.8}"></label><label>Average<input id="qAverage" type="number" step=".01" value="${c?.quality_average??1}"></label><label>Good<input id="qGood" type="number" step=".01" value="${c?.quality_good??1.1}"></label><label>Excellent<input id="qExcellent" type="number" step=".01" value="${c?.quality_excellent??1.2}"></label><label>Masterwork<input id="qMasterwork" type="number" step=".01" value="${c?.quality_masterwork??1.3}"></label></div></div><button id="workbenchSave" class="btn btn--primary">Save Workbench Settings</button>`;
  $("workbenchSave").onclick=saveWorkbench;
}
async function saveWorkbench(){try{const c={...workbenchConfig,enabled:$("workbenchEnabled").checked,beta_label:$("workbenchLabel").value,min_materials:Number($("workbenchMin").value),max_materials:Number($("workbenchMax").value),stage_time_seconds:Number($("workbenchTime").value),trait_threshold_minor:Number($("workbenchMinor").value),trait_threshold_full:Number($("workbenchFull").value),quality_broken:Number($("qBroken").value),quality_poor:Number($("qPoor").value),quality_average:Number($("qAverage").value),quality_good:Number($("qGood").value),quality_excellent:Number($("qExcellent").value),quality_masterwork:Number($("qMasterwork").value)};await call("workbench-config",{save:true,config:c});renderWorldLab();status("Workbench settings saved.")}catch(e){status(e.message,true)}}

function enemyRow(e={}){const id=e.id||`new-${Math.random().toString(36).slice(2)}`;const row=document.createElement("div");row.className="builder-row enemy-builder";row.dataset.id=id;row.dataset.saved=e.id||"";row.innerHTML=`<div class="builder-row-top"><input class="enemy-name" value="${esc(e.name||"Enemy")}"><input class="enemy-hp" type="number" value="${e.max_health??100}"><input class="enemy-atk" type="number" value="${e.attack??10}"><button class="icon-button enemy-remove">×</button></div><div class="condition-grid"><label>Defense<input class="enemy-defense" type="number" value="${e.defense??0}"></label><label>Speed<input class="enemy-speed" type="number" step=".1" value="${e.speed??1}"></label><label>Crit chance<input class="enemy-crit" type="number" step=".01" value="${e.crit_chance??0}"></label><label>Sort<input class="enemy-sort" type="number" value="${e.sort_order??0}"></label><label class="wide">Stats / loot note<input class="enemy-note" value="${esc(e.stats?.note||"")}"></label></div>`;row.querySelector(".enemy-remove").onclick=()=>row.remove();$("enemyRows").appendChild(row)}
async function openDungeon(d){
  editingDungeon=d?.id||null;$("dungeonEditor").hidden=false;$("dungeonEditorTitle").textContent=d?"Edit Dungeon":"New Dungeon";$("dungeonName").value=d?.name||"";$("dungeonDescription").value=d?.description||"";$("dungeonMaxEnemies").value=d?.max_enemies??5;$("dungeonSort").value=d?.sort_order??0;$("dungeonEnabled").checked=d?.enabled===true;
  const r=d?.entry_requirements||{};$("dungeonReqRolls").value=r.minRolls||0;$("dungeonReqEquip").value=r.minAllEquipmentTier||0;$("dungeonReqIsland").value=r.minIslandNumber||1;$("dungeonRewardMoney").value=d?.rewards?.money??0;$("dungeonLoot").value=Array.isArray(d?.loot)?d.loot.join("\n"):"";$("enemyRows").innerHTML="";
  if(d)try{const e=await call("dungeon-enemies",{dungeonId:d.id});(e.enemies||[]).forEach(enemyRow)}catch(e){status(e.message,true)}
  window.scrollTo({top:$("dungeonEditor").offsetTop-80,behavior:"smooth"});
}
$("newDungeon").onclick=()=>openDungeon();$("addEnemy").onclick=()=>enemyRow();$("dungeonCancel").onclick=()=>{$("dungeonEditor").hidden=true;editingDungeon=null};
$("dungeonSave").onclick=async()=>{try{const d={id:editingDungeon||undefined,name:$("dungeonName").value.trim(),description:$("dungeonDescription").value.trim(),max_enemies:Number($("dungeonMaxEnemies").value)||5,sort_order:Number($("dungeonSort").value)||0,enabled:$("dungeonEnabled").checked,entry_requirements:{minRolls:Number($("dungeonReqRolls").value)||0,minAllEquipmentTier:Number($("dungeonReqEquip").value)||0,minIslandNumber:Number($("dungeonReqIsland").value)||1},rewards:{money:Number($("dungeonRewardMoney").value)||0},loot:$("dungeonLoot").value.split("\n").map(x=>x.trim()).filter(Boolean)};const saved=await call("dungeon-save",{dungeon:d});for(const row of document.querySelectorAll(".enemy-builder")){const e={id:row.dataset.saved||undefined,dungeon_id:saved.dungeon.id,name:row.querySelector(".enemy-name").value,max_health:Number(row.querySelector(".enemy-hp").value),attack:Number(row.querySelector(".enemy-atk").value),defense:Number(row.querySelector(".enemy-defense").value),speed:Number(row.querySelector(".enemy-speed").value),crit_chance:Number(row.querySelector(".enemy-crit").value),sort_order:Number(row.querySelector(".enemy-sort").value),stats:{note:row.querySelector(".enemy-note").value},loot:[],enabled:true};await call("enemy-save",{enemy:e})}$("dungeonEditor").hidden=true;renderWorldLab();status("Dungeon saved.")}catch(e){status(e.message,true)}};


function renderRarities(){
  return call("rarity-list").then(d=>{
    rarities=d.rarities||[];
    $("rarityCards").innerHTML=rarities.map(r=>`<article class="feature-card ${r.enabled?"":"is-disabled"}"><div class="feature-card__top"><span class="feature-icon" style="color:${esc(r.color)}">${esc(r.icon)}</span><div class="feature-card__identity"><div class="feature-meta">1 in ${Number(r.min_rarity).toLocaleString()}${r.max_rarity?` → 1 in ${Number(r.max_rarity).toLocaleString()}`:"+"}</div><h3>${esc(r.name)}</h3></div><span class="state-pill ${r.enabled?"on":"off"}">${r.enabled?"ON":"OFF"}</span></div><div class="card-actions"><button class="btn btn--sm" data-rarity-edit="${r.id}">Edit</button><button class="btn btn--sm btn--danger" data-rarity-delete="${r.id}">Delete</button></div></article>`).join("")||empty("No rarity tiers.");
    document.querySelectorAll("[data-rarity-edit]").forEach(b=>b.onclick=()=>openRarity(rarities.find(r=>r.id===b.dataset.rarityEdit)));
    document.querySelectorAll("[data-rarity-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this rarity tier?")){await call("rarity-delete",{id:b.dataset.rarityDelete});renderRarities();}});
  }).catch(e=>status(e.message,true));
}
function openRarity(r=null){editingRarity=r?.id||null;$("rarityEditor").hidden=false;$("gemEditor").hidden=true;$("rarityEditorTitle").textContent=r?"Edit Gem Rarity":"New Gem Rarity";$("rarityName").value=r?.name||"";$("rarityMin").value=r?.min_rarity??1;$("rarityMax").value=r?.max_rarity??"";$("rarityIcon").value=r?.icon||"◆";$("rarityColor").value=r?.color||"#9aa4b2";$("raritySort").value=r?.sort_order??0;$("rarityEnabled").checked=r?.enabled!==false;window.scrollTo({top:$("rarityEditor").offsetTop-80,behavior:"smooth"});}
async function saveRarity(){try{await call("rarity-save",{rarity:{id:editingRarity||undefined,name:$("rarityName").value.trim(),min_rarity:Number($("rarityMin").value),max_rarity:$("rarityMax").value===""?null:Number($("rarityMax").value),icon:$("rarityIcon").value.trim(),color:$("rarityColor").value,sort_order:Number($("raritySort").value)||0,enabled:$("rarityEnabled").checked}});$("rarityEditor").hidden=true;editingRarity=null;renderRarities();status("Rarity saved.");}catch(e){status(e.message,true);}}

function renderPvpWeapons(){
  return call("pvp-list").then(d=>{
    pvpWeapons=d.weapons||[];$("pvpCount").textContent=pvpWeapons.length;
    $("pvpWeaponCards").innerHTML=pvpWeapons.map(w=>`<article class="feature-card ${w.enabled?"":"is-disabled"}"><div class="feature-card__top"><span class="feature-icon">⚔</span><div class="feature-card__identity"><div class="feature-meta">${esc(w.rarity)} · ${w.attacks.length} attacks</div><h3>${esc(w.name)}</h3></div><span class="state-pill ${w.enabled?"on":"off"}">${w.enabled?"ON":"OFF"}</span></div><p>${esc(w.description)}</p><div class="card-actions"><button class="btn btn--sm" data-pvp-edit="${w.id}">Edit</button><button class="btn btn--sm" data-pvp-delete="${w.id}">Delete</button></div></article>`).join("")||empty("No PvP weapons configured.");
    document.querySelectorAll("[data-pvp-edit]").forEach(b=>b.onclick=()=>openPvpWeapon(pvpWeapons.find(w=>w.id===b.dataset.pvpEdit)));
    document.querySelectorAll("[data-pvp-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this PvP weapon?")){await call("pvp-delete",{id:b.dataset.pvpDelete});renderPvpWeapons();}});
  }).catch(e=>status(e.message,true));
}
function pvpAttackRow(a={}){const row=document.createElement("div");row.className="builder-row pvp-attack-row";row.innerHTML=`<div class="builder-row-top"><input class="pvp-attack-name" placeholder="Attack name" value="${esc(a.name||"New Attack")}"><input class="pvp-attack-mult" type="number" step=".05" value="${Number(a.damageMultiplier||1)}"><input class="pvp-attack-cooldown" type="number" step=".1" value="${Number(a.cooldown||1)}"><button class="icon-button remove-pvp-attack">×</button></div><input class="pvp-attack-desc" placeholder="Description" value="${esc(a.description||"")}">`;row.querySelector(".remove-pvp-attack").onclick=()=>row.remove();$("pvpAttackRows").appendChild(row);}
function openPvpWeapon(w=null){editingPvpWeapon=w?.id||null;$("pvpWeaponEditor").hidden=false;$("pvpEditorTitle").textContent=w?"Edit PvP weapon":"New PvP weapon";$("pvpName").value=w?.name||"";$("pvpRarity").value=w?.rarity||"Common";$("pvpDamage").value=w?.base_damage??10;$("pvpDescription").value=w?.description||"";$("pvpEnabled").checked=w?.enabled!==false;$("pvpAttackRows").innerHTML="";(w?.attacks?.length?w.attacks:[{name:"Slash",damageMultiplier:1,cooldown:.5},{name:"Heavy",damageMultiplier:1.7,cooldown:2},{name:"Lunge",damageMultiplier:1.25,cooldown:1.2}]).forEach(pvpAttackRow);window.scrollTo({top:$("pvpWeaponEditor").offsetTop-80,behavior:"smooth"});}
async function savePvpWeapon(){const rows=[...document.querySelectorAll(".pvp-attack-row")];if(rows.length<3){status("Every PvP weapon needs at least 3 attacks.",true);return;}try{const attacks=rows.map((row,i)=>({id:`attack-${i+1}`,name:row.querySelector(".pvp-attack-name").value.trim()||`Attack ${i+1}`,damageMultiplier:Number(row.querySelector(".pvp-attack-mult").value)||1,cooldown:Number(row.querySelector(".pvp-attack-cooldown").value)||0,description:row.querySelector(".pvp-attack-desc").value.trim()}));await call("pvp-save",{weapon:{id:editingPvpWeapon||undefined,name:$("pvpName").value.trim(),rarity:$("pvpRarity").value.trim(),base_damage:Number($("pvpDamage").value)||10,description:$("pvpDescription").value.trim(),enabled:$("pvpEnabled").checked,attacks}});$("pvpWeaponEditor").hidden=true;editingPvpWeapon=null;renderPvpWeapons();status("PvP weapon saved.");}
catch(e){status(e.message,true);}}

$("newRarity").onclick=()=>openRarity();$("rarityCancel").onclick=$("rarityCancelBottom").onclick=()=>{$("rarityEditor").hidden=true;editingRarity=null};$("raritySave").onclick=saveRarity;
$("newPvpWeapon").onclick=()=>openPvpWeapon();$("addPvpAttack").onclick=()=>pvpAttackRow();$("pvpCancel").onclick=()=>{$("pvpWeaponEditor").hidden=true;editingPvpWeapon=null};$("pvpSave").onclick=savePvpWeapon;
// Admin users are already authenticated and authorized by the server, so
// the embedded Feature Lab opens without a second password prompt.
(async function autoOpenAuthorizedFeatureLab(){
  try {
    const user = await ensurePlayerAuth();
    if (!user || !$('gate') || !$('workspace')) return;
    const who = await call('whoami');
    if (who?.allowed && who?.requiresPassword === false) {
      $('gate').hidden = true;
      $('workspace').hidden = false;
      await loadAll();
    }
  } catch {
    // Standalone /upcoming remains password-gated on deployments that do not
    // have an authorized admin session.
  }
})();
