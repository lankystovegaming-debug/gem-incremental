import gems from "../src/data/gems.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { gemNameHtml, gemIconHtml, getGemStyle } from "../src/ui/gemStyle.js";
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
const selectedMutationSummary = document.getElementById("selectedMutationSummary");

document.getElementById("searchIcon").innerHTML = icons.search;

let mutationList = Object.values(GEM_MUTATIONS);
let mutationById = new Map(mutationList.map((mutation) => [mutation.id, mutation]));
let mutationOrder = new Map(mutationList.map((mutation, index) => [mutation.id, index]));
let catalogGems = [...gems];
let indexEntries = [];
let loadedPlayerId = null;
let refreshInFlight = null;

const state = {
  index: {},
  combinations: {},
  selectedMutations: new Set(["none"]),
  loading: true
};

function rebuildMutationMaps() {
  mutationById = new Map(mutationList.map((mutation) => [mutation.id, mutation]));
  mutationOrder = new Map(mutationList.map((mutation, index) => [mutation.id, index]));
}

function normalizeMutationIds(ids = []) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? "").trim().toLowerCase())
    .filter((id) => mutationById.has(id))))
    .sort((a, b) => (mutationOrder.get(a) ?? 9999) - (mutationOrder.get(b) ?? 9999));
}

function mutationCombinationKey(ids = []) {
  const normalized = normalizeMutationIds(ids);
  return normalized.length ? normalized.join("+") : "none";
}

function mutationCombinationLabel(ids = []) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return "No Mutation";
  return normalized.map((id) => mutationById.get(id)?.name ?? id).join(" + ");
}

function comboKey(gemName, combinationKey) {
  return `${gemName}::${combinationKey}`;
}

async function loadCombinations(playerId) {
  const { data, error } = await supabase
    .from("player_gem_mutation_combinations")
    .select("gem_name,combination_key,mutation_ids,mutation_multipliers,total_found,highest_value,first_discovered_at")
    .eq("player_id", playerId);

  if (error) {
    console.error("Failed to load mutation combination index:", error);
    return null;
  }

  const result = {};
  for (const entry of data ?? []) {
    const ids = normalizeMutationIds(entry.mutation_ids ?? []);
    const key = comboKey(entry.gem_name, entry.combination_key || mutationCombinationKey(ids));
    result[key] = {
      gemName: entry.gem_name,
      combinationKey: entry.combination_key || mutationCombinationKey(ids),
      mutationIds: ids,
      mutationMultipliers: entry.mutation_multipliers && typeof entry.mutation_multipliers === "object" ? entry.mutation_multipliers : {},
      totalFound: Number(entry.total_found ?? 0),
      highestValue: Number(entry.highest_value ?? 0),
      firstDiscoveredAt: entry.first_discovered_at
    };
  }
  return result;
}

function exactEntryChance(entry) {
  const gemProbability = Number(entry.gem.rarity) > 0 ? 1 / Number(entry.gem.rarity) : 0;
  return entry.mutationIds.reduce((probability, id) => {
    const chance = Number(mutationById.get(id)?.chance ?? 0);
    return probability * (chance > 0 ? Math.min(1, 1 / chance) : 0);
  }, gemProbability);
}

function entryChanceLabel(entry) {
  const probability = exactEntryChance(entry);
  if (!Number.isFinite(probability) || probability <= 0) return "Impossible";
  return `1 in ${Math.max(1, Math.round(1 / probability)).toLocaleString("en-US")}`;
}

function makeEntry(gem, mutationIds) {
  const ids = normalizeMutationIds(mutationIds);
  const combinationKey = mutationCombinationKey(ids);
  return { gem, mutationIds: ids, combinationKey, key: comboKey(gem.name, combinationKey) };
}

/*
 * Never materialize the power-set of mutations. Admins can add arbitrary
 * mutations, and 12 mutations already produce 4,096 combinations per gem.
 * The index now materializes only the currently selected exact combination.
 * "All" shows base gems plus each single mutation; multi-mutation combinations
 * are available by selecting multiple tabs.
 */
function entriesForView() {
  const selected = [...state.selectedMutations].filter((id) => id !== "none");

  if (selected.length) {
    return catalogGems.map((gem) => makeEntry(gem, selected));
  }

  if (state.selectedMutations.has("none")) {
    return catalogGems.map((gem) => makeEntry(gem, []));
  }

  // "All" is deliberately bounded: base + each single mutation. This keeps
  // the page fast even when admins add many custom mutations.
  const entries = catalogGems.map((gem) => makeEntry(gem, []));
  for (const mutation of mutationList) {
    for (const gem of catalogGems) entries.push(makeEntry(gem, [mutation.id]));
  }
  return entries;
}

function discoveredRecord(entry) {
  return state.combinations[entry.key] ?? null;
}

function isSecretUndiscovered(entry) {
  // The live Supabase catalog is authoritative. Enforce the threshold from
  // the rarity itself so legacy rows cannot leak before their backfill lands.
  if (Number(entry.gem.rarity) < 10_000_000 && !entry.gem.hideRarityUntilDiscovered) return false;
  return !Object.values(state.combinations).some((record) => record.gemName === entry.gem.name);
}

function dailyAvailabilityLabel(gem) {
  if (!["daily", "date_range_daily"].includes(gem.availabilityMode) || !gem.dailyStartTime || !gem.dailyEndTime) return "";
  const source = `${String(gem.dailyStartTime).slice(0,5)}–${String(gem.dailyEndTime).slice(0,5)} ${gem.availabilityTimezone || "Asia/Singapore"}`;
  if ((gem.availabilityTimezone || "Asia/Singapore") !== "Asia/Singapore") return `Available daily: ${source}`;
  const makeDate = (value) => { const [hour, minute] = String(value).split(":").map(Number); return new Date(Date.UTC(2026,0,1,hour-8,minute)); };
  const format = (value) => makeDate(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Available daily: ${format(gem.dailyStartTime)}–${format(gem.dailyEndTime)} your time (${source})`;
}

function selectedCombination() {
  const selected = [...state.selectedMutations];
  if (!selected.length) return null;
  if (selected.includes("none")) return "none";
  return mutationCombinationKey(selected);
}

function renderSummary() {
  const selected = [...state.selectedMutations];
  const mutationCount = mutationList.length;
  const combinationCount = mutationCount >= 52 ? "very large" : Math.pow(2, mutationCount).toLocaleString("en-US");

  if (selected.length && !selected.includes("none")) {
    const entries = catalogGems.map((gem) => makeEntry(gem, selected));
    const discovered = entries.filter((entry) => discoveredRecord(entry)).length;
    const total = entries.length;
    discoveryCount.textContent = `${formatCount(discovered)} / ${formatCount(total)} gems discovered`;
    discoveryMeter.style.width = `${total ? (discovered / total) * 100 : 0}%`;
    renderTierBreakdown(entries);
    return;
  }

  if (selected.includes("none")) {
    const entries = catalogGems.map((gem) => makeEntry(gem, []));
    const discovered = entries.filter((entry) => discoveredRecord(entry)).length;
    const total = entries.length;
    discoveryCount.textContent = `${formatCount(discovered)} / ${formatCount(total)} gems discovered`;
    discoveryMeter.style.width = `${total ? (discovered / total) * 100 : 0}%`;
    renderTierBreakdown(entries);
    return;
  }

  // All view: calculate the full theoretical total without creating it.
  const total = catalogGems.length * Math.pow(2, mutationCount);
  const discovered = Object.values(state.combinations).filter((record) => catalogGems.some((gem) => gem.name === record.gemName)).length;
  discoveryCount.textContent = `${formatCount(discovered)} / ${mutationCount >= 52 ? combinationCount : formatCount(total)} combinations discovered`;
  discoveryMeter.style.width = `${total ? Math.min(100, (discovered / total) * 100) : 0}%`;
  renderTierBreakdown(catalogGems.map((gem) => makeEntry(gem, [])));
}

function renderTierBreakdown(entries) {
  const tiers = new Map();
  for (const entry of entries) {
    const tier = rarityTier(entry.gem.rarity);
    const bucket = tiers.get(tier.id) ?? { name: tier.name, found: 0, total: 0 };
    bucket.total += 1;
    if (discoveredRecord(entry)) bucket.found += 1;
    tiers.set(tier.id, bucket);
  }
  tierBreakdown.innerHTML = [...tiers.values()].map((bucket) => `
    <div class="tier-stat">
      <span class="tier-stat__name">${escapeHtml(bucket.name)}</span>
      <span class="tier-stat__value">${formatCount(bucket.found)} / ${formatCount(bucket.total)}</span>
    </div>
  `).join("");
}

function renderSelectedMutationSummary() {
  const selected = [...state.selectedMutations];
  if (!selected.length) {
    selectedMutationSummary.textContent = "Showing the fast All view: base gems + single mutations. Custom mutations from the live catalog are included. Select multiple mutation tabs for an exact combination.";
    return;
  }
  selectedMutationSummary.textContent = selected.includes("none")
    ? "Showing exact combination: No Mutation"
    : `Showing exact combination: ${mutationCombinationLabel(selected)}`;
}

function mutationNameHtml(ids) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return `<span class="index-no-mutation">No Mutation</span>`;
  return `<div class="index-card__mutations" aria-label="Mutations">${normalized.map((id) => {
    const mutation = mutationById.get(id);
    return `<span class="mutation-name-effect mutation-name-effect--${escapeHtml(id)}" style="--mutation-color:${escapeHtml(mutation?.color || "#9fdcff")}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(mutation?.name || id)}</span></span>`;
  }).join("")}</div>`;
}

function gemCard(entry) {
  const tier = rarityTier(entry.gem.rarity);
  const record = discoveredRecord(entry);
  const secretLocked = isSecretUndiscovered(entry);

  if (!record) {
    return `<article class="index-card index-card--locked${secretLocked ? " index-card--secret" : ""} tier-${tier.id}" data-combination="${escapeHtml(entry.combinationKey)}">
      <div class="index-card__head"><div><div class="index-card__name">???</div><div class="index-card__rarity">${escapeHtml(mutationCombinationLabel(entry.mutationIds))}</div></div><span class="badge badge--tier">${secretLocked ? "Undiscovered" : escapeHtml(tier.name)}</span></div>
      <p class="index-card__hidden">${secretLocked ? "This secret gem is hidden until discovered." : "Roll this exact gem / mutation combination to reveal its entry."}</p>
      <div class="index-card__chance"><span class="index-card__key">Actual chance</span><span class="index-card__val">${secretLocked ? "Unknown" : escapeHtml(entryChanceLabel(entry))}</span></div>
    </article>`;
  }

  const replayable = Number(entry.gem.rarity) >= 100000;
  const baseValue = Number(entry.gem.baseWeight) * Number(entry.gem.valuePerGram);
  const replayAttrs = entry.mutationIds.length ? ` data-replay-mutations="${escapeHtml(entry.mutationIds.join(","))}"` : "";
  const gemStyle = getGemStyle(entry.gem.name);

  return `<article class="index-card tier-${tier.id}" data-combination="${escapeHtml(entry.combinationKey)}" style="--gem-bg:${escapeHtml(gemStyle.color)};--gem-glow:${escapeHtml(gemStyle.glow || "transparent")}">
    <div class="index-card__head"><div class="index-card__gem-icon">${gemIconHtml(entry.gem.name, "gem-icon--index", entry.mutationIds)}</div><div class="index-card__title-block"><div class="index-card__gem-title">${escapeHtml(entry.gem.title || "")}</div><div class="index-card__name">${gemNameHtml(entry.gem.name, escapeHtml)}</div>${mutationNameHtml(entry.mutationIds)}<div class="index-card__rarity">${rarityLabel(entry.gem.rarity)}</div></div><span class="badge badge--tier">${escapeHtml(tier.name)}</span></div>
    <p class="index-card__desc">${escapeHtml(entry.gem.description ?? "No description available.")}</p>
    ${dailyAvailabilityLabel(entry.gem) ? `<p class="index-card__availability">${escapeHtml(dailyAvailabilityLabel(entry.gem))}</p>` : ""}
    <div class="index-card__rows"><div class="index-card__row"><span class="index-card__key">Base weight</span><span class="index-card__val">${formatWeight(entry.gem.baseWeight)}</span></div><div class="index-card__row"><span class="index-card__key">Base value</span><span class="index-card__val">${formatMoney(baseValue)}</span></div><div class="index-card__row"><span class="index-card__key">Actual chance</span><span class="index-card__val">${escapeHtml(entryChanceLabel(entry))}</span></div><div class="index-card__row"><span class="index-card__key">Combination found</span><span class="index-card__val">${formatCount(record.totalFound)}</span></div><div class="index-card__row"><span class="index-card__key">Highest value</span><span class="index-card__val">${formatMoney(record.highestValue)}</span></div></div>
    ${replayable ? `<button class="button gem-replay-button" type="button" data-replay-gem="${escapeHtml(entry.gem.name)}"${replayAttrs}>▶ Replay Cutscene</button>` : ""}
  </article>`;
}

function visibleEntries() {
  const query = gemSearch.value.trim().toLowerCase();
  const selected = selectedCombination();
  const entries = entriesForView();

  const filtered = entries.filter((entry) => {
    const record = discoveredRecord(entry);
    const comboLabel = mutationCombinationLabel(entry.mutationIds).toLowerCase();
    const name = entry.gem.name.toLowerCase();
    if (query && !name.includes(query) && !comboLabel.includes(query)) return false;
    if (gemFilter.value === "discovered" && !record) return false;
    if (gemFilter.value === "undiscovered" && record) return false;
    if (selected !== null && entry.combinationKey !== selected) return false;
    return true;
  });

  const sorters = {
    rarity: (a, b) => Number(a.gem.rarity) - Number(b.gem.rarity),
    "rarity-desc": (a, b) => Number(b.gem.rarity) - Number(a.gem.rarity),
    name: (a, b) => a.gem.name.localeCompare(b.gem.name),
    found: (a, b) => (discoveredRecord(b)?.totalFound ?? 0) - (discoveredRecord(a)?.totalFound ?? 0) || Number(a.gem.rarity) - Number(b.gem.rarity)
  };

  return filtered.sort((a, b) => {
    const ad = normalizeMutationIds(a.mutationIds);
    const bd = normalizeMutationIds(b.mutationIds);
    if (ad.length !== bd.length) return ad.length - bd.length;
    for (let i = 0; i < ad.length; i += 1) {
      const delta = (mutationOrder.get(ad[i]) ?? 9999) - (mutationOrder.get(bd[i]) ?? 9999);
      if (delta) return delta;
    }
    return (sorters[gemSort.value] ?? sorters.rarity)(a, b) || a.gem.name.localeCompare(b.gem.name);
  });
}

function renderMutationTabs() {
  const tabs = [
    { id: "all", name: "All", special: true },
    { id: "none", name: "No Mutation", special: true },
    ...mutationList.map((mutation) => ({ id: mutation.id, name: mutation.name, special: false, mutation }))
  ];

  mutationTabs.innerHTML = tabs.map((tab) => {
    const active = tab.id === "all"
      ? state.selectedMutations.size === 0
      : state.selectedMutations.has(tab.id);
    const mutation = tab.mutation ?? mutationById.get(tab.id);
    const customBadge = mutation?.isCustom
      ? `<span class="mutation-tab__custom" title="Custom mutation">CUSTOM</span>`
      : "";

    return `<button type="button" class="mutation-tab mutation-tab--${escapeHtml(tab.id)}${active ? " is-active" : ""}" data-mutation-filter="${escapeHtml(tab.id)}" aria-pressed="${active}"${mutation ? ` style="--mutation-color:${escapeHtml(mutation.color || "#9fdcff")}"` : ""}>${mutation?.icon ? `<span class="mutation-tab__icon" aria-hidden="true">${escapeHtml(mutation.icon)}</span>` : ""}<span>${escapeHtml(tab.name)}</span>${customBadge}</button>`;
  }).join("");
}

function renderList() {
  if (state.loading) {
    gemList.innerHTML = '<div class="skeleton skeleton--card"></div>'.repeat(6);
    return;
  }
  const list = visibleEntries();
  gemList.innerHTML = list.length ? list.map(gemCard).join("") : `<div class="empty" style="grid-column:1/-1">${icons.search}<p class="empty__title">Nothing matches</p><p>Try a different search or mutation filter.</p></div>`;
}

mutationTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mutation-filter]");
  if (!button) return;
  const id = button.dataset.mutationFilter;
  if (id === "all") {
    state.selectedMutations.clear();
  } else if (id === "none") {
    state.selectedMutations.clear();
    state.selectedMutations.add("none");
  } else {
    state.selectedMutations.delete("none");
    if (state.selectedMutations.has(id)) state.selectedMutations.delete(id);
    else state.selectedMutations.add(id);
  }
  renderMutationTabs();
  renderSelectedMutationSummary();
  renderSummary();
  renderList();
});

gemList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-replay-gem]");
  if (!button) return;
  const gem = catalogGems.find((entry) => entry.name === button.dataset.replayGem);
  if (!gem) return;
  const mutationIds = (button.dataset.replayMutations ?? "").split(",").filter(Boolean);
  button.disabled = true;
  try { await replayGemCutscene({ gem, mutationIds }); }
  finally { button.disabled = false; }
});

let filterRenderTimer = null;
function scheduleListRender() {
  clearTimeout(filterRenderTimer);
  filterRenderTimer = setTimeout(renderList, 80);
}
for (const control of [gemSearch, gemFilter, gemSort]) {
  control.addEventListener("input", scheduleListRender);
  control.addEventListener("change", scheduleListRender);
}

function normalizeLiveMutationCatalog(rows) {
  const builtInById = new Map(Object.values(GEM_MUTATIONS).map((mutation, index) => [String(mutation.id), { ...mutation, icon: mutation.icon ?? "✦", color: mutation.color ?? "#9fdcff", sortOrder: index * 10, isCustom: false }]));
  for (const row of rows ?? []) {
    const id = String(row?.id ?? "").trim().toLowerCase();
    const chance = Number(row?.chance);
    const multiplier = Number(row?.multiplier);
    if (!id || !Number.isFinite(chance) || chance <= 0 || !Number.isFinite(multiplier) || multiplier <= 0 || row?.enabled === false) continue;
    builtInById.set(id, { id, name: String(row?.name ?? id), chance, multiplier, description: String(row?.description ?? ""), icon: String(row?.icon ?? "✦"), color: String(row?.color ?? "#9fdcff"), sortOrder: Number(row?.sort_order ?? 0), isCustom: !Object.prototype.hasOwnProperty.call(GEM_MUTATIONS, id) });
  }
  return [...builtInById.values()].sort((a,b) => Number(a.sortOrder)-Number(b.sortOrder) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

async function refresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const user = await ensurePlayerAuth();
    if (!user) {
      state.loading = false;
      discoveryCount.textContent = "Could not sign you in. Refresh to try again.";
      notify.error("Sign-in failed", "The game could not reach your account.");
      return;
    }
    loadedPlayerId = user.id;

    const [combinations, playerState, privateGemsRpcResult, mutationRpcResult] = await Promise.all([
      loadCombinations(user.id),
      loadCloudPlayerState(),
      supabase.rpc("get_public_gem_catalog"),
      supabase.rpc("get_public_mutation_catalog")
    ]);

    // RPCs are the primary path because they remain readable even when a
    // project has an older/misconfigured RLS policy. Direct catalog reads are
    // retained as a compatibility fallback for partially migrated projects.
    let privateGemsResult = privateGemsRpcResult;
    let mutationCatalogResult = mutationRpcResult;
    if (privateGemsResult.error) {
      console.warn("Public gem catalog RPC unavailable; trying direct catalog read:", privateGemsResult.error.message);
      privateGemsResult = await supabase
        .from("private_feature_gems")
        .select("id,title,name,rarity,base_weight,value_per_gram,description,metadata,hide_rarity_until_discovered,enabled,sort_order,starts_at,ends_at,updated_at,availability_mode,daily_start_time,daily_end_time,availability_timezone")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("rarity", { ascending: true });
    }
    if (mutationCatalogResult.error) {
      console.warn("Public mutation catalog RPC unavailable; trying direct catalog read:", mutationCatalogResult.error.message);
      mutationCatalogResult = await supabase
        .from("game_mutations")
        .select("id,name,chance,multiplier,description,icon,color,enabled,sort_order,updated_at")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    }

    if (combinations) state.combinations = combinations;

    if (!mutationCatalogResult.error && Array.isArray(mutationCatalogResult.data)) {
      mutationList = normalizeLiveMutationCatalog(mutationCatalogResult.data);
      rebuildMutationMaps();
      state.selectedMutations = new Set([...state.selectedMutations].filter((id) => id === "none" || mutationById.has(id)));
      if (!state.selectedMutations.size) state.selectedMutations.add("none");
    } else if (mutationCatalogResult.error) {
      console.warn("Live mutation catalog unavailable; using bundled catalog:", mutationCatalogResult.error.message);
      mutationList = normalizeLiveMutationCatalog([]);
      rebuildMutationMaps();
    }

    if (!privateGemsResult.error && Array.isArray(privateGemsResult.data)) {
      const builtInNames = new Set(gems.map((gem) => gem.name));
      const custom = privateGemsResult.data.filter((gem) => !builtInNames.has(gem.name)).map((gem) => ({
        title: String(gem.title ?? gem.metadata?.title ?? ""), name: String(gem.name), rarity: Number(gem.rarity), baseWeight: Number(gem.base_weight), valuePerGram: Number(gem.value_per_gram),
        description: String(gem.description ?? gem.metadata?.description ?? "Admin-created gem."),
        hideRarityUntilDiscovered: gem.hide_rarity_until_discovered === true || gem.metadata?.hideRarityUntilDiscovered === true
        ,availabilityMode: String(gem.availability_mode || "always"), dailyStartTime: gem.daily_start_time, dailyEndTime: gem.daily_end_time, availabilityTimezone: String(gem.availability_timezone || "Asia/Singapore")
      }));
      catalogGems = [...gems, ...custom];
    } else if (privateGemsResult.error) {
      console.warn("Live gem catalog unavailable; using bundled gems:", privateGemsResult.error.message);
      catalogGems = [...gems];
    }

    state.loading = false;
    if (playerState) shell.setWallet(playerState.money);
    renderSummary();
    renderMutationTabs();
    renderSelectedMutationSummary();
    renderList();
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

window.addEventListener("pageshow", (event) => { if (event.persisted) refresh(); });
renderList();
renderMutationTabs();
renderSelectedMutationSummary();
refresh();
