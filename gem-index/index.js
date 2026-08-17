import gems from "../src/data/gems.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { gemNameHtml } from "../src/ui/gemStyle.js";
import { replayGemCutscene } from "../src/ui/cutsceneReplay.js";
import { rarityTier, rarityLabel, formatMoney, formatWeight, formatCount, escapeHtml } from "../src/ui/format.js";

const shell = mountShell({ page: "gem-index", base: "../" });
const gemList = document.getElementById("gemList");
const mutationTabs = document.getElementById("mutationTabs");
const discoveryCount = document.getElementById("discoveryCount");
const discoveryMeter = document.getElementById("discoveryMeter");
const tierBreakdown = document.getElementById("tierBreakdown");
const gemSearch = document.getElementById("gemSearch");
const gemFilter = document.getElementById("gemFilter");
const gemSort = document.getElementById("gemSort");
document.getElementById("searchIcon").innerHTML = icons.search;

const mutationList = Object.values(GEM_MUTATIONS);
const state = { index: {}, mutationByGem: {}, selectedMutations: new Set(), loading: true };

async function loadIndex() {
  const { data, error } = await supabase.from("gem_index").select("gem_name, total_rolled, heaviest_weight");
  if (error) { console.error("Failed to load the Gem Index:", error); return null; }
  return Object.fromEntries((data ?? []).map(e => [e.gem_name, { totalRolled:Number(e.total_rolled??0), heaviestWeight:Number(e.heaviest_weight??0) }]));
}

async function loadMutationByGem() {
  const { data, error } = await supabase.from("player_gem_mutation_index").select("gem_name, mutation_id, total_found, highest_value, first_discovered_at");
  if (error) { console.error("Failed to load Gem Mutation Index:", error); return null; }
  const result = {};
  for (const e of data ?? []) {
    (result[e.gem_name] ??= {})[e.mutation_id] = {
      totalFound:Number(e.total_found??0), highestValue:Number(e.highest_value??0), firstDiscoveredAt:e.first_discovered_at
    };
  }
  return result;
}

function renderSummary() {
  const discovered = gems.filter(g => state.index[g.name]).length;
  discoveryCount.textContent = `${formatCount(discovered)} of ${formatCount(gems.length)} gems discovered`;
  discoveryMeter.style.width = `${gems.length ? (discovered/gems.length)*100 : 0}%`;
  const tiers = new Map();
  for (const gem of gems) {
    const tier = rarityTier(gem.rarity);
    const bucket = tiers.get(tier.id) ?? {name:tier.name, found:0, total:0};
    bucket.total++;
    if (state.index[gem.name]) bucket.found++;
    tiers.set(tier.id,bucket);
  }
  tierBreakdown.innerHTML = [...tiers.values()].map(b => `<div class="tier-stat"><span class="tier-stat__name">${escapeHtml(b.name)}</span><span class="tier-stat__value">${b.found} / ${b.total}</span></div>`).join("");
}

function gemMatchesMutationFilter(gem) {
  if (!state.selectedMutations.size) return true;

  const records = state.mutationByGem[gem.name] ?? {};
  const hasAnyMutation = Object.keys(records).some(id => id !== "none");

  // "No Mutation" is an exclusive filter. The click handler also clears
  // every other selected tab when it is chosen.
  if (state.selectedMutations.has("none")) {
    return Boolean(state.index[gem.name]) && !hasAnyMutation;
  }

  // Mutation tabs are multi-select and use OR semantics:
  // selecting Corrupted + Celestial shows gems discovered with either.
  return [...state.selectedMutations].some(id => Boolean(records[id]));
}

function visibleGems() {
  const query = gemSearch.value.trim().toLowerCase();
  let list = gems.filter(gem => {
    const found = Boolean(state.index[gem.name]);
    if (query && !(found && gem.name.toLowerCase().includes(query))) return false;
    if (gemFilter.value === "discovered" && !found) return false;
    if (gemFilter.value === "undiscovered" && found) return false;
    if (!gemMatchesMutationFilter(gem)) return false;
    return true;
  });
  const sorters = {
    rarity:(a,b)=>a.rarity-b.rarity,
    "rarity-desc":(a,b)=>b.rarity-a.rarity,
    name:(a,b)=>a.name.localeCompare(b.name),
    found:(a,b)=>(state.index[b.name]?.totalRolled??0)-(state.index[a.name]?.totalRolled??0)
  };
  return [...list].sort(sorters[gemSort.value] ?? sorters.rarity);
}

function renderMutationTabs() {
  const tabs = [
    {id:"none", name:"No Mutation", special:true},
    ...mutationList.map(m=>({id:m.id,name:m.name,special:false}))
  ];
  mutationTabs.innerHTML = tabs.map(tab => {
    const active = state.selectedMutations.has(tab.id);
    return `<button type="button" class="mutation-tab mutation-tab--${tab.id}${active?" is-active":""}" data-mutation-filter="${tab.id}" aria-pressed="${active}">${escapeHtml(tab.name)}</button>`;
  }).join("");
}

function discoveredMutationIds(gemName) {
  return Object.keys(state.mutationByGem[gemName] ?? {}).filter(id => id !== "none");
}

function mutationBadges(gemName) {
  return discoveredMutationIds(gemName).map(id => {
    const m=GEM_MUTATIONS[id];
    return m ? `<span class="index-mutation-badge mutation-badge--${id}">${escapeHtml(m.name)}</span>` : "";
  }).join("");
}

function gemCard(gem) {
  const tier = rarityTier(gem.rarity);
  const entry = state.index[gem.name];
  if (!entry) return `<article class="index-card index-card--locked"><div class="index-card__head"><div><div class="index-card__name">???</div><div class="index-card__rarity">${gem.hideRarityUntilDiscovered ? "Unknown rarity" : rarityLabel(gem.rarity)}</div></div><span class="badge badge--tier">${gem.hideRarityUntilDiscovered ? "Unknown" : tier.name}</span></div><p class="index-card__hidden">Roll this gem at least once to reveal its entry.</p></article>`;
  const replayable = gem.rarity >= 10000;
  const selected = [...state.selectedMutations].filter(id=>id!=="none");
  const replayMutationIds = selected.length ? selected.filter(id => (state.mutationByGem[gem.name] ?? {})[id]) : discoveredMutationIds(gem.name);
  const replayAttrs = replayMutationIds.length ? ` data-replay-mutations="${escapeHtml(replayMutationIds.join(","))}"` : "";
  const baseValue = gem.baseWeight * gem.valuePerGram;
  const discoveredIds = discoveredMutationIds(gem.name);
  const mutationNameClasses = discoveredIds.map(id => `gem-styled--mutation-${id}`).join(" ");
  return `<article class="index-card tier-${tier.id}">
    <div class="index-card__head"><div><div class="index-card__name">${gemNameHtml(gem.name,escapeHtml,mutationNameClasses)}</div><div class="index-card__rarity">${rarityLabel(gem.rarity)}</div></div><div class="index-card__badges"><span class="badge badge--tier">${tier.name}</span>${mutationBadges(gem.name)}</div></div>
    <p class="index-card__desc">${escapeHtml(gem.description ?? "No description available.")}</p>
    <div class="index-card__rows"><div class="index-card__row"><span class="index-card__key">Base weight</span><span class="index-card__val">${formatWeight(gem.baseWeight)}</span></div><div class="index-card__row"><span class="index-card__key">Base value</span><span class="index-card__val">${formatMoney(baseValue)}</span></div><div class="index-card__row"><span class="index-card__key">Times found</span><span class="index-card__val">${formatCount(entry.totalRolled)}</span></div><div class="index-card__row"><span class="index-card__key">Heaviest</span><span class="index-card__val">${formatWeight(entry.heaviestWeight)}</span></div></div>
    ${replayable ? `<button class="button gem-replay-button" type="button" data-replay-gem="${escapeHtml(gem.name)}"${replayAttrs}>▶ Replay Cutscene</button>` : ""}
  </article>`;
}

function renderList() {
  if (state.loading) { gemList.innerHTML = Array.from({length:8},()=>'<div class="skeleton skeleton--card"></div>').join(""); return; }
  const list=visibleGems();
  gemList.innerHTML = list.length ? list.map(gemCard).join("") : `<div class="empty" style="grid-column:1/-1">${icons.search}<p class="empty__title">Nothing matches</p><p>Try a different search or mutation filter.</p></div>`;
}

mutationTabs.addEventListener("click", event => {
  const button=event.target.closest("[data-mutation-filter]"); if(!button) return;
  const id=button.dataset.mutationFilter;
  if(id === "none") {
    state.selectedMutations.clear();
    state.selectedMutations.add("none");
  } else {
    state.selectedMutations.delete("none");
    if(state.selectedMutations.has(id)) state.selectedMutations.delete(id); else state.selectedMutations.add(id);
  }
  renderMutationTabs(); renderList();
});

gemList.addEventListener("click", async event => {
  const button=event.target.closest("[data-replay-gem]"); if(!button) return;
  const gem=gems.find(g=>g.name===button.dataset.replayGem); if(!gem) return;
  const mutationIds=(button.dataset.replayMutations||"").split(",").filter(Boolean);
  button.disabled=true;
  try { await replayGemCutscene({gem, mutationIds}); } finally { button.disabled=false; }
});

for (const control of [gemSearch,gemFilter,gemSort]) control.addEventListener("input",renderList);

async function refresh() {
  const user=await ensurePlayerAuth();
  if(!user){ state.loading=false; discoveryCount.textContent="Could not sign you in. Refresh to try again."; notify.error("Sign-in failed","The game could not reach your account."); return; }
  const [index,mutationByGem,playerState]=await Promise.all([loadIndex(),loadMutationByGem(),loadCloudPlayerState()]);
  state.loading=false;
  if(index) state.index=index; else notify.error("Could not load the index","Try refreshing the page.");
  if(mutationByGem) state.mutationByGem=mutationByGem; else notify.error("Could not load mutation discoveries","Try refreshing the page.");
  if(playerState) shell.setWallet(playerState.money);
  renderSummary(); renderMutationTabs(); renderList();
}
window.addEventListener("pageshow",event=>{if(event.persisted) refresh();});
renderList(); renderMutationTabs(); refresh();
