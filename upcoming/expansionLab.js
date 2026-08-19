import presets from "./expansionPresets.js";

const TYPE_META = {
  "artifact-archives": { label:"Artifact Archives", icon:"◈", page:"artifact-archives/" },
  "gem-fusion": { label:"Gem Fusion Lab", icon:"✧", page:"gem-fusion/" },
  "enchanting-lab": { label:"Enchanting Lab", icon:"✦", page:"enchanting-lab/" },
  "collection-hall": { label:"Collection Hall", icon:"▦", page:"collection-hall/" },
  "mining-events": { label:"Mining Events", icon:"⛏", page:"mining-events/" },
  "merchant-caravan": { label:"Merchant Caravan", icon:"◇", page:"merchant-caravan/" },
  "research-tree": { label:"Research Tree", icon:"⌬", page:"research-tree/" }
};

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
let apiCall = null;
let reportStatus = null;
let editing = null;
let definitions = [];
let gems = [];
let initialized = false;

export function initExpansionLab({ call, status, initialGems = [] } = {}) {
  apiCall = call;
  reportStatus = status;
  gems = initialGems;
  if (!initialized) {
    initialized = true;
    bind();
  }
  load();
}

function bind() {
  $("expansionRefresh")?.addEventListener("click", load);
  $("expansionNew")?.addEventListener("click", () => openEditor());
  $("expansionCancel")?.addEventListener("click", closeEditor);
  $("expansionCancelBottom")?.addEventListener("click", closeEditor);
  $("expansionSave")?.addEventListener("click", save);
  $("expansionPreset")?.addEventListener("click", loadPreset);
  $("expansionType")?.addEventListener("change", () => { renderFields({}); refreshPresetSelect(); });
}

async function load() {
  if (!apiCall) return;
  try {
    const result = await apiCall("expansion-list");
    definitions = result.definitions || [];
    $("expansionCount").textContent = String(definitions.length || 7);
    renderCards();
  } catch (error) {
    reportStatus?.(error.message, true);
  }
}

function renderCards() {
  const byType = {};
  definitions.forEach(d => (byType[d.feature_type] ||= []).push(d));
  $("expansionCards").innerHTML = Object.entries(TYPE_META).map(([type, meta]) => {
    const list = byType[type] || [];
    return list.length ? list.map(d => card(d, meta)).join("") : card({
      id:"", feature_type:type, name:`New ${meta.label}`, description:"No configuration yet.",
      enabled:false, permanent:true, config:{}, sort_order:0
    }, meta, true);
  }).join("");
  document.querySelectorAll("[data-exp-edit]").forEach(b => b.onclick = () => openEditor(definitions.find(d => d.id === b.dataset.expEdit)));
  document.querySelectorAll("[data-exp-toggle]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try {
      await apiCall("expansion-toggle", { id:b.dataset.expToggle, enabled:b.dataset.enabled !== "true" });
      await load();
    } catch (e) { reportStatus?.(e.message, true); b.disabled = false; }
  });
  document.querySelectorAll("[data-exp-delete]").forEach(b => b.onclick = async () => {
    if (!confirm("Permanently delete this expansion definition?")) return;
    try { await apiCall("expansion-delete", { id:b.dataset.expDelete }); await load(); }
    catch (e) { reportStatus?.(e.message, true); }
  });
}

function card(d, meta, virtual = false) {
  const live = d.enabled === true;
  const cfg = d.config || {};
  const count = Object.keys(cfg).length;
  return `<article class="feature-card ${live ? "" : "is-disabled"}">
    <div class="card-glow"></div>
    <div class="feature-card__top"><span class="feature-icon">${meta.icon}</span>
      <div class="feature-card__identity"><div class="feature-meta">${esc(meta.label)} · ${d.permanent ? "Permanent" : "Temporary"}</div><h3>${esc(d.name)}</h3></div>
      <span class="state-pill ${live ? "on" : "off"}">${live ? "ON" : "OFF"}</span>
    </div>
    <p>${esc(d.description)}</p>
    <div class="feature-stats"><span>⚙ ${count} config groups</span><span>↗ <a href="../${meta.page}">Page</a></span></div>
    ${virtual ? `<div class="mini-note">Create the first definition for this system.</div>` : `<div class="date-line">Sort ${Number(d.sort_order || 0)} · ${Object.keys(cfg).length} configurable groups</div>`}
    <div class="card-actions">
      ${virtual ? `<button class="btn btn--sm btn--primary" data-exp-edit="">Create</button>` :
        `<button class="btn btn--sm" data-exp-edit="${esc(d.id)}">Edit</button>
         <button class="btn btn--sm" data-exp-toggle="${esc(d.id)}" data-enabled="${live}">${live ? "Disable" : "Enable"}</button>
         <button class="btn btn--sm btn--danger" data-exp-delete="${esc(d.id)}">Delete</button>`}
    </div>
  </article>`;
}

function openEditor(d = null) {
  editing = d?.id || null;
  $("expansionEditor").hidden = false;
  $("expansionEditorTitle").textContent = d ? `Edit ${TYPE_META[d.feature_type]?.label || "system"}` : "New system";
  $("expansionType").value = d?.feature_type || "artifact-archives";
  $("expansionName").value = d?.name || "";
  $("expansionDescription").value = d?.description || "";
  $("expansionSort").value = d?.sort_order ?? 10;
  $("expansionPermanent").value = d?.permanent === false ? "temporary" : "permanent";
  $("expansionStarts").value = d?.starts_at ? new Date(d.starts_at).toISOString().slice(0,16) : "";
  $("expansionEnds").value = d?.ends_at ? new Date(d.ends_at).toISOString().slice(0,16) : "";
  $("expansionEnabled").checked = d?.enabled === true;
  renderFields(d?.config || {});
  refreshPresetSelect();
  window.scrollTo({ top:$("expansionEditor").offsetTop - 80, behavior:"smooth" });
}

function closeEditor() {
  $("expansionEditor").hidden = true;
  editing = null;
}

function pairsToObject(text) {
  const out = {};
  String(text || "").split(/\n|,/).map(x => x.trim()).filter(Boolean).forEach(pair => {
    const [k,...rest] = pair.split(":");
    const key = String(k || "").trim();
    if (!key) return;
    const raw = rest.join(":").trim();
    const num = Number(raw);
    out[key] = raw !== "" && Number.isFinite(num) ? num : raw;
  });
  return out;
}
function objectToPairs(obj) {
  return Object.entries(obj || {}).map(([k,v]) => `${k}:${v}`).join("\n");
}
function gemOptions(selected = "") {
  return `<option value="">Choose gem</option>${gems.map(g => `<option value="${esc(g.name)}" ${g.name === selected ? "selected" : ""}>${esc(g.name)}</option>`).join("")}`;
}
function rowHtml(cls, fields, values = {}) {
  const inputs = fields.map(f => {
    if (f.type === "select") {
      return `<label>${esc(f.label)}<select class="${cls}-${f.key}">${f.options.map(o => `<option value="${esc(o)}" ${String(values[f.key] ?? f.default ?? "") === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    }
    return `<label>${esc(f.label)}<input class="${cls}-${f.key}" type="${f.type || "text"}" step="${f.step || "any"}" value="${esc(values[f.key] ?? f.default ?? "")}" placeholder="${esc(f.placeholder || "")}"></label>`;
  }).join("");
  return `<div class="builder-row ${cls}"><div class="condition-grid">${inputs}<button type="button" class="icon-button remove-exp-row">×</button></div></div>`;
}

function renderFields(config) {
  const type = $("expansionType").value;
  const host = $("expansionFields");
  host.innerHTML = "";
  if (type === "artifact-archives") renderArtifacts(host, config);
  else if (type === "gem-fusion") renderFusion(host, config);
  else if (type === "enchanting-lab") renderEnchanting(host, config);
  else if (type === "collection-hall") renderCollections(host, config);
  else if (type === "mining-events") renderMining(host, config);
  else if (type === "merchant-caravan") renderMerchants(host, config);
  else if (type === "research-tree") renderResearch(host, config);
}

function sectionTitle(host, title, text, buttonId) {
  const el = document.createElement("div");
  el.className = "builder-head";
  el.innerHTML = `<div><h3>${esc(title)}</h3><p>${esc(text)}</p></div><button id="${buttonId}" class="btn btn--sm">＋ Add</button>`;
  host.appendChild(el);
  return el;
}
function wireRemove(host) {
  host.querySelectorAll(".remove-exp-row").forEach(b => b.onclick = () => b.closest(".builder-row")?.remove());
}

function renderArtifacts(host, c) {
  const base = document.createElement("div");
  base.className = "form-grid";
  base.innerHTML = `<label>Slots<input id="artSlots" value="${esc((c.slots || ["core","lens","sigil"]).join(", "))}"></label>
    <label>Set ID<input id="artSetId" value="${esc(c.sets?.[0]?.id || "")}"></label>
    <label>Set name<input id="artSetName" value="${esc(c.sets?.[0]?.name || "")}"></label>
    <label>Set pieces<input id="artSetPieces" type="number" value="${Number(c.sets?.[0]?.pieces || 3)}"></label>
    <label>Set bonus key:value<textarea id="artSetBonus" rows="2">${esc(objectToPairs(c.sets?.[0]?.bonus || {}))}</textarea></label>
    <label>Default salvage rewards<textarea id="artSalvage" rows="2" placeholder="coins:10">${esc(objectToPairs(c.salvage || {}))}</textarea></label>`;
  host.appendChild(base);
  const sec = sectionTitle(host,"Artifacts","Every row becomes a configurable artifact definition.","addArtifact");
  const list = document.createElement("div"); list.id = "artifactRows"; list.className = "builder-list"; host.appendChild(list);
  (c.artifacts || []).forEach(x => addArtifactRow(x));
  $("addArtifact").onclick = () => addArtifactRow();
}
function addArtifactRow(x={}) {
  const row=document.createElement("div"); row.className="builder-row artifact-row";
  row.innerHTML=`<div class="builder-row-top">
    <input class="art-name" placeholder="Artifact name" value="${esc(x.name || "")}">
    <input class="art-rarity" placeholder="Rarity" value="${esc(x.rarity || "Rare")}">
    <input class="art-slot" placeholder="Slot" value="${esc(x.slot || "core")}">
    <input class="art-sockets" type="number" min="0" value="${Number(x.sockets || 0)}">
    <button type="button" class="icon-button remove-exp-row">×</button>
  </div><div class="condition-grid"><label>Stats key:value<textarea class="art-stats" rows="2">${esc(objectToPairs(x.stats || {}))}</textarea></label><label>Acquisition<textarea class="art-acq" rows="2">${esc(objectToPairs(x.acquisition || {}))}</textarea></label></div>`;
  $("artifactRows").appendChild(row); row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderFusion(host,c) {
  const top=document.createElement("div"); top.className="form-grid";
  top.innerHTML=`<label>Recipe station name<input id="fusionStation" value="${esc(c.stationName || "Fusion Chamber")}"></label>
    <label>Catalysts allowed<input id="fusionCatalysts" value="${esc((c.catalysts || []).join(", "))}"></label>
    <label>Global success bonus %<input id="fusionBonus" type="number" step=".01" value="${Number(c.successBonus || 0)}"></label>`;
  host.appendChild(top);
  sectionTitle(host,"Fusion recipes","Each recipe has inputs, a success chance and explicit success/failure outcomes.","addFusion");
  const list=document.createElement("div"); list.id="fusionRows";list.className="builder-list";host.appendChild(list);
  (c.recipes || []).forEach(x=>addFusionRow(x)); $("addFusion").onclick=()=>addFusionRow();
}
function addFusionRow(x={}) {
  const row=document.createElement("div");row.className="builder-row fusion-row";
  row.innerHTML=`<div class="builder-row-top"><input class="fusion-name" placeholder="Recipe name" value="${esc(x.name || "")}"><input class="fusion-chance" type="number" min="0" max="1" step=".01" value="${Number(x.successChance ?? .25)}"><input class="fusion-output" placeholder="Output gem / item" value="${esc(x.onSuccess?.gemName || x.onSuccess?.itemId || "")}"><button type="button" class="icon-button remove-exp-row">×</button></div>
    <div class="condition-grid"><label>Inputs (gem:amount)<textarea class="fusion-inputs" rows="2">${esc((x.inputs || []).map(i=>`${i.gem}:${i.amount}`).join(", "))}</textarea></label><label>Failure refund %<input class="fusion-refund" type="number" min="0" max="100" value="${Number((x.onFailure?.percent || 0) * 100)}"></label><label>Bonus reward<textarea class="fusion-bonus-reward" rows="2">${esc(objectToPairs(x.bonus || {}))}</textarea></label></div>`;
  $("fusionRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderEnchanting(host,c) {
  const top=document.createElement("div");top.className="form-grid";
  top.innerHTML=`<label>Equipment types<input id="enchTypes" value="${esc((c.equipmentTypes || ["pickaxe","bag","weapon","armor"]).join(", "))}"></label><label>Effect keys<input id="enchEffects" value="${esc((c.effects || ["vitalityPercent","attackPercent","attackSpeedPercent"]).join(", "))}"></label><label>Max enchant level<input id="enchMax" type="number" value="${Number(c.maxLevel || 10)}"></label>`;
  host.appendChild(top);
  sectionTitle(host,"Enchanting blueprints","Configure gem costs, stat effects and coin/money costs.","addEnchant");
  const list=document.createElement("div");list.id="enchantRows";list.className="builder-list";host.appendChild(list);
  (c.blueprints || []).forEach(x=>addEnchantRow(x));$("addEnchant").onclick=()=>addEnchantRow();
}
function addEnchantRow(x={}) {
  const row=document.createElement("div");row.className="builder-row enchant-row";
  row.innerHTML=`<div class="builder-row-top"><input class="ench-name" placeholder="Blueprint name" value="${esc(x.name || "")}"><input class="ench-equipment" placeholder="Equipment" value="${esc(x.equipmentType || "weapon")}"><input class="ench-cost" type="number" value="${Number(x.cost?.coins || 0)}"><button type="button" class="icon-button remove-exp-row">×</button></div>
    <div class="condition-grid"><label>Required gems<textarea class="ench-gems" rows="2">${esc((x.requiredGems || []).map(i=>`${i.gem}:${i.amount}`).join(", "))}</textarea></label><label>Effects key:value<textarea class="ench-effect-values" rows="2">${esc(objectToPairs(x.effects || {}))}</textarea></label><label>Prerequisites<input class="ench-prereq" value="${esc((x.prerequisites || []).join(", "))}"></label></div>`;
  $("enchantRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderCollections(host,c) {
  const top=document.createElement("div");top.className="form-grid";
  top.innerHTML=`<label>Collection title<input id="colTitle" value="${esc(c.title || "Collection Hall")}"></label><label>Completion bonus key:value<textarea id="colBonus" rows="2">${esc(objectToPairs(c.completionBonus || {}))}</textarea></label>`;
  host.appendChild(top);
  sectionTitle(host,"Collection sets","Build virtually any combination of unique-gem, rarity, mutation or custom milestones.","addCollection");
  const list=document.createElement("div");list.id="collectionRows";list.className="builder-list";host.appendChild(list);
  (c.sets || []).forEach(x=>addCollectionRow(x));$("addCollection").onclick=()=>addCollectionRow();
}
function addCollectionRow(x={}) {
  const row=document.createElement("div");row.className="builder-row collection-row";
  row.innerHTML=`<div class="builder-row-top"><input class="col-name" placeholder="Set name" value="${esc(x.name || "")}"><input class="col-id" placeholder="Set ID" value="${esc(x.id || "")}"><button type="button" class="icon-button remove-exp-row">×</button></div>
    <div class="condition-grid"><label>Requirements key:value<textarea class="col-req" rows="2">${esc(objectToPairs(x.requirements || {}))}</textarea></label><label>Rewards key:value<textarea class="col-rewards" rows="2">${esc(objectToPairs(x.rewards || {}))}</textarea></label><label>Bonus key:value<textarea class="col-bonus" rows="2">${esc(objectToPairs(x.bonus || {}))}</textarea></label></div>`;
  $("collectionRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderMining(host,c) {
  const top=document.createElement("div");top.className="form-grid";
  top.innerHTML=`<label>Duration minutes<input id="mineDuration" type="number" value="${Number(c.durationMinutes || 30)}"></label><label>Spawn weight<input id="mineWeight" type="number" step=".01" value="${Number(c.spawnWeight || 1)}"></label><label>Boosts key:value<textarea id="mineBoosts" rows="2">${esc(objectToPairs(c.boosts || {}))}</textarea></label></div>`;
  host.appendChild(top);
  sectionTitle(host,"Event phases","Create build-up, peak, eclipse and fade phases with custom multipliers.","addMiningPhase");
  const list=document.createElement("div");list.id="miningRows";list.className="builder-list";host.appendChild(list);
  (c.phases || []).forEach(x=>addMiningPhase(x));$("addMiningPhase").onclick=()=>addMiningPhase();
  sectionTitle(host,"Event loot","Weighted loot entries can be gems, potions, money, coins or custom IDs.","addMiningLoot");
  const loot=document.createElement("div");loot.id="miningLootRows";loot.className="builder-list";host.appendChild(loot);
  (c.loot || []).forEach(x=>addMiningLoot(x));$("addMiningLoot").onclick=()=>addMiningLoot();
}
function addMiningPhase(x={}) {
  const row=document.createElement("div");row.className="builder-row mining-phase-row";
  row.innerHTML=`<div class="builder-row-top"><input class="mine-phase-name" placeholder="Phase name" value="${esc(x.name || "")}"><input class="mine-phase-seconds" type="number" value="${Number(x.seconds || 300)}"><input class="mine-phase-mult" type="number" step=".01" value="${Number(x.multiplier || 1)}"><button type="button" class="icon-button remove-exp-row">×</button></div>`;
  $("miningRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}
function addMiningLoot(x={}) {
  const row=document.createElement("div");row.className="builder-row mining-loot-row";
  row.innerHTML=`<div class="builder-row-top"><select class="mine-loot-type"><option value="coins">Coins</option><option value="money">Money</option><option value="gem">Gem</option><option value="potion">Potion</option><option value="custom">Custom</option></select><input class="mine-loot-id" placeholder="Item / gem / potion ID" value="${esc(x.gemName || x.id || "")}"><input class="mine-loot-weight" type="number" step=".01" value="${Number(x.weight || 1)}"><button type="button" class="icon-button remove-exp-row">×</button></div>`;
  $("miningLootRows").appendChild(row);row.querySelector(".mine-loot-type").value=x.type||"coins";row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderMerchants(host,c) {
  const top=document.createElement("div");top.className="form-grid";
  top.innerHTML=`<label>Rotation hours<input id="merchantRotation" type="number" step=".5" value="${Number(c.rotationHours || 12)}"></label><label>Currencies<input id="merchantCurrencies" value="${esc((c.currencies || ["money","coins"]).join(", "))}"></label>`;
  host.appendChild(top);
  sectionTitle(host,"Merchants","Each merchant can have its own inventory, stock and currency.","addMerchant");
  const list=document.createElement("div");list.id="merchantRows";list.className="builder-list";host.appendChild(list);
  (c.merchants || []).forEach(x=>addMerchantRow(x));$("addMerchant").onclick=()=>addMerchantRow();
}
function addMerchantRow(x={}) {
  const row=document.createElement("div");row.className="builder-row merchant-row";
  row.innerHTML=`<div class="builder-row-top"><input class="merchant-name" placeholder="Merchant name" value="${esc(x.name || "")}"><button type="button" class="icon-button remove-exp-row">×</button></div>
    <div class="condition-grid"><label>Inventory item type<input class="merchant-item-type" value="${esc(x.inventory?.[0]?.itemType || "gem")}"></label><label>Item ID<input class="merchant-item-id" value="${esc(x.inventory?.[0]?.itemId || "")}"></label><label>Price<input class="merchant-price" type="number" step="any" value="${Number(x.inventory?.[0]?.price || 0)}"></label><label>Currency<input class="merchant-currency" value="${esc(x.inventory?.[0]?.currency || "coins")}"></label><label>Stock<input class="merchant-stock" type="number" value="${Number(x.inventory?.[0]?.stock || 1)}"></label></div>`;
  $("merchantRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function renderResearch(host,c) {
  sectionTitle(host,"Research nodes","Build a branching tree. Prerequisites are comma-separated node IDs.","addResearch");
  const list=document.createElement("div");list.id="researchRows";list.className="builder-list";host.appendChild(list);
  (c.nodes || []).forEach(x=>addResearchRow(x));$("addResearch").onclick=()=>addResearchRow();
}
function addResearchRow(x={}) {
  const row=document.createElement("div");row.className="builder-row research-row";
  row.innerHTML=`<div class="builder-row-top"><input class="research-id" placeholder="Node ID" value="${esc(x.id || "")}"><input class="research-name" placeholder="Node name" value="${esc(x.name || "")}"><input class="research-cost" type="number" value="${Number(x.cost?.coins || 0)}"><button type="button" class="icon-button remove-exp-row">×</button></div>
    <div class="condition-grid"><label>Prerequisites<input class="research-requires" value="${esc((x.requires || []).join(", "))}"></label><label>Effects key:value<textarea class="research-effects" rows="2">${esc(objectToPairs(x.effects || {}))}</textarea></label><label>Unlock IDs<input class="research-unlocks" value="${esc((x.unlocks || []).join(", "))}"></label></div>`;
  $("researchRows").appendChild(row);row.querySelector(".remove-exp-row").onclick=()=>row.remove();
}

function collectConfig() {
  const type=$("expansionType").value;
  if(type==="artifact-archives") return {
    slots:$("artSlots").value.split(",").map(x=>x.trim()).filter(Boolean),
    sets:[{id:$("artSetId").value.trim(),name:$("artSetName").value.trim(),pieces:Number($("artSetPieces").value)||1,bonus:pairsToObject($("artSetBonus").value)}],
    salvage:pairsToObject($("artSalvage").value),
    artifacts:[...document.querySelectorAll(".artifact-row")].map(r=>({name:r.querySelector(".art-name").value.trim(),rarity:r.querySelector(".art-rarity").value.trim(),slot:r.querySelector(".art-slot").value.trim(),sockets:Number(r.querySelector(".art-sockets").value)||0,stats:pairsToObject(r.querySelector(".art-stats").value),acquisition:pairsToObject(r.querySelector(".art-acq").value)}))
  };
  if(type==="gem-fusion") return {
    stationName:$("fusionStation").value.trim(),catalysts:$("fusionCatalysts").value.split(",").map(x=>x.trim()).filter(Boolean),successBonus:Number($("fusionBonus").value)||0,
    recipes:[...document.querySelectorAll(".fusion-row")].map(r=>({name:r.querySelector(".fusion-name").value.trim(),successChance:Number(r.querySelector(".fusion-chance").value)||0,inputs:r.querySelector(".fusion-inputs").value.split(",").map(x=>{const [gem,...rest]=x.trim().split(":");return {gem,amount:Number(rest.join(":"))||1}}).filter(x=>x.gem),onSuccess:{type:"gem",gemName:r.querySelector(".fusion-output").value.trim()},onFailure:{type:"refund",percent:(Number(r.querySelector(".fusion-refund").value)||0)/100},bonus:pairsToObject(r.querySelector(".fusion-bonus-reward").value)}))
  };
  if(type==="enchanting-lab") return {
    equipmentTypes:$("enchTypes").value.split(",").map(x=>x.trim()).filter(Boolean),effects:$("enchEffects").value.split(",").map(x=>x.trim()).filter(Boolean),maxLevel:Number($("enchMax").value)||1,
    blueprints:[...document.querySelectorAll(".enchant-row")].map(r=>({name:r.querySelector(".ench-name").value.trim(),equipmentType:r.querySelector(".ench-equipment").value.trim(),requiredGems:r.querySelector(".ench-gems").value.split(",").map(x=>{const [gem,...rest]=x.trim().split(":");return {gem,amount:Number(rest.join(":"))||1}}).filter(x=>x.gem),effects:pairsToObject(r.querySelector(".ench-effect-values").value),cost:{coins:Number(r.querySelector(".ench-cost").value)||0},prerequisites:r.querySelector(".ench-prereq").value.split(",").map(x=>x.trim()).filter(Boolean)}))
  };
  if(type==="collection-hall") return {
    title:$("colTitle").value.trim(),completionBonus:pairsToObject($("colBonus").value),
    sets:[...document.querySelectorAll(".collection-row")].map(r=>({name:r.querySelector(".col-name").value.trim(),id:r.querySelector(".col-id").value.trim(),requirements:pairsToObject(r.querySelector(".col-req").value),rewards:pairsToObject(r.querySelector(".col-rewards").value),bonus:pairsToObject(r.querySelector(".col-bonus").value)}))
  };
  if(type==="mining-events") return {
    durationMinutes:Number($("mineDuration").value)||1,spawnWeight:Number($("mineWeight").value)||1,boosts:pairsToObject($("mineBoosts").value),
    phases:[...document.querySelectorAll(".mining-phase-row")].map(r=>({name:r.querySelector(".mine-phase-name").value.trim(),seconds:Number(r.querySelector(".mine-phase-seconds").value)||1,multiplier:Number(r.querySelector(".mine-phase-mult").value)||1})),
    loot:[...document.querySelectorAll(".mining-loot-row")].map(r=>({type:r.querySelector(".mine-loot-type").value,id:r.querySelector(".mine-loot-id").value.trim(),gemName:r.querySelector(".mine-loot-type").value==="gem"?r.querySelector(".mine-loot-id").value.trim():undefined,weight:Number(r.querySelector(".mine-loot-weight").value)||0}))
  };
  if(type==="merchant-caravan") return {
    rotationHours:Number($("merchantRotation").value)||1,currencies:$("merchantCurrencies").value.split(",").map(x=>x.trim()).filter(Boolean),
    merchants:[...document.querySelectorAll(".merchant-row")].map(r=>({name:r.querySelector(".merchant-name").value.trim(),inventory:[{itemType:r.querySelector(".merchant-item-type").value.trim(),itemId:r.querySelector(".merchant-item-id").value.trim(),price:Number(r.querySelector(".merchant-price").value)||0,currency:r.querySelector(".merchant-currency").value.trim(),stock:Number(r.querySelector(".merchant-stock").value)||0}]}))
  };
  return {
    nodes:[...document.querySelectorAll(".research-row")].map(r=>({id:r.querySelector(".research-id").value.trim(),name:r.querySelector(".research-name").value.trim(),cost:{coins:Number(r.querySelector(".research-cost").value)||0},requires:r.querySelector(".research-requires").value.split(",").map(x=>x.trim()).filter(Boolean),effects:pairsToObject(r.querySelector(".research-effects").value),unlocks:r.querySelector(".research-unlocks").value.split(",").map(x=>x.trim()).filter(Boolean)}))
  };
}

async function save() {
  const name=$("expansionName").value.trim();
  if(!name){reportStatus?.("Give the system a name.",true);return;}
  const permanent=$("expansionPermanent").value==="permanent";
  const definition={
    id:editing || undefined,feature_type:$("expansionType").value,name,description:$("expansionDescription").value.trim(),
    enabled:$("expansionEnabled").checked,permanent,sort_order:Number($("expansionSort").value)||0,
    starts_at:permanent?null:($("expansionStarts").value?new Date($("expansionStarts").value).toISOString():null),
    ends_at:permanent?null:($("expansionEnds").value?new Date($("expansionEnds").value).toISOString():null),
    config:collectConfig(),metadata:{}
  };
  try{await apiCall("expansion-save",{definition});closeEditor();await load();reportStatus?.("Expansion system saved.");}
  catch(e){reportStatus?.(e.message,true);}
}

function refreshPresetSelect() {
  const type = $("expansionType").value;
  const select = $("expansionPresetSelect");
  if (!select) return;
  const list = presets.filter(p => p.feature_type === type);
  select.innerHTML = `<option value="">Preset library…</option>` +
    list.slice(0, 100).map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("");
}

function loadPreset() {
  const type = $("expansionType").value;
  const list = presets.filter(p => p.feature_type === type);
  const index = Number($("expansionPresetSelect")?.value);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    reportStatus?.("Choose a preset from the dropdown first.");
    return;
  }
  const p = list[index];
  $("expansionName").value = p.name;
  $("expansionDescription").value = p.description;
  renderFields(p.config);
  $("expansionPresetSelect").value = "";
  reportStatus?.(`Loaded preset: ${p.name}. Review it before saving.`);
}
