import bundledGems from "../src/data/gems.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { gemNameHtml, gemIconHtml, getGemStyle } from "../src/ui/gemStyle.js";
import { replayGemCutscene } from "../src/ui/cutsceneReplay.js";
import { isCutsceneEligible } from "../src/ui/cutsceneController.js";
import { getSettings } from "../src/ui/settings.js";
import { rarityTier, rarityLabel, formatMoney, formatWeight, formatCount, escapeHtml } from "../src/ui/format.js";
import {
  availabilityState, canonicalMutationIds, canonicalMutationKey, dailyWindows,
  indexCombinationRecords, mutationCombinationIsObtainable, mutationSourceLabel,
  rawCombinationDenominator
} from "../src/logic/gemIndex.js";

const shell = mountShell({ page: "gem-index", base: "../" });
const byId = (id) => document.getElementById(id);
const gemList = byId("gemList");
const mutationTabs = byId("mutationTabs");
const discoveryCount = byId("discoveryCount");
const discoveryMeter = byId("discoveryMeter");
const tierBreakdown = byId("tierBreakdown");
const gemSearch = byId("gemSearch");
const gemFilter = byId("gemFilter");
const gemSort = byId("gemSort");
const selectedMutationSummary = byId("selectedMutationSummary");
const refreshButton = byId("refreshIndex");
byId("searchIcon").innerHTML = icons.search;

const STORAGE_KEY = "gemIncremental.gemIndex.view.v2";
const CODE_ONLY_MUTATIONS = new Set(["ascended", "silly-small", "silly-large", "happy"]);
const PAGE_SIZE = 1000;
const BAND_PAGE_SIZE = 24;
const RARITY_BAND_ORDER = Object.freeze([
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "exotic",
  "exalted", "cosmic", "transcendent", "secret", "anomalous"
]);

let mutationList = [];
let mutationById = new Map();
let catalogGems = [];
let refreshInFlight = null;
let lastRefreshAt = 0;
let entriesCache = null;
let renderedBands = new Map();
const expandedBands = new Set();
const bandLimits = new Map();

const state = {
  combinations: new Map(),
  discoveredGemNames: new Set(),
  selectedMutations: new Set(["none"]),
  loading: true,
  error: null,
  playerId: null
};

function rebuildMutationMaps() {
  mutationById = new Map(mutationList.map((mutation) => [mutation.id, mutation]));
  entriesCache = null;
}

function normalizeMutationIds(ids = []) {
  return canonicalMutationIds(ids, mutationById);
}

function combinationLabel(ids = []) {
  const normalized = normalizeMutationIds(ids);
  return normalized.length
    ? normalized.map((id) => mutationById.get(id)?.name ?? id).join(" + ")
    : "No Mutation";
}

function comboKey(gemName, mutationIds = []) {
  return `${gemName}::${canonicalMutationKey(mutationIds)}`;
}

function makeEntry(gem, mutationIds) {
  const ids = normalizeMutationIds(mutationIds);
  return { gem, mutationIds: ids, combinationKey: canonicalMutationKey(ids), key: comboKey(gem.name, ids) };
}

function selectedMutationIds() {
  return [...state.selectedMutations].filter((id) => id !== "none");
}

function discoveredRecord(entry) {
  return state.combinations.get(entry.key) ?? null;
}

function identityDiscovered(entry) {
  return state.discoveredGemNames.has(entry.gem.name);
}

function exactCombinationDiscovered(entry) {
  return Boolean(discoveredRecord(entry));
}

function isSecretGem(gem) {
  return Number(gem.rarity) >= 10_000_000 || gem.hideRarityUntilDiscovered === true;
}

function isSecretLocked(entry) {
  return isSecretGem(entry.gem) && !identityDiscovered(entry);
}

function displayTier(entry) {
  return rarityTier(entry.gem.rarity, entry.gem.name);
}

async function loadCombinations(playerId) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("player_gem_mutation_combinations")
      .select("id,gem_name,combination_key,mutation_ids,mutation_multipliers,total_found,highest_value,first_discovered_at,last_discovered_at")
      .eq("player_id", playerId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Discovery history could not be loaded: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return indexCombinationRecords(rows);
}

function unwrapRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap(unwrapRows);
  if (typeof data === "string") {
    try { return unwrapRows(JSON.parse(data)); } catch { return []; }
  }
  if (typeof data !== "object") return [];
  for (const key of ["mutations", "rows", "data", "result", "catalog", "items"]) {
    if (Object.hasOwn(data, key)) {
      const rows = unwrapRows(data[key]);
      if (rows.length) return rows;
    }
  }
  if ("id" in data && "name" in data) return [data];
  return Object.values(data).flatMap(unwrapRows);
}

function normalizeMutationCatalog(rows, { live = true } = {}) {
  const merged = new Map();
  const bundled = Object.values(GEM_MUTATIONS);
  for (const mutation of bundled) {
    if (!live || CODE_ONLY_MUTATIONS.has(mutation.id)) merged.set(mutation.id, mutation);
  }
  for (const row of unwrapRows(rows)) {
    const id = String(row?.id ?? "").trim().toLowerCase();
    const name = String(row?.name ?? "").trim();
    const chance = Number(row?.chance);
    const multiplier = Number(row?.multiplier);
    if (!id || !name || !Number.isFinite(chance) || chance <= 0 ||
        !Number.isFinite(multiplier) || multiplier <= 0 || row.enabled === false) continue;
    merged.set(id, {
      id, name, chance, multiplier,
      description: String(row.description ?? ""),
      descriptionCredit: String(row.description_credit ?? ""),
      icon: String(row.icon ?? "✦"),
      color: String(row.color ?? "#9fdcff"),
      codeOnly: CODE_ONLY_MUTATIONS.has(id)
    });
  }
  return [...merged.values()].sort((a, b) =>
    a.multiplier - b.multiplier || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}

async function loadMutationCatalog() {
  const errors = [];
  for (const rpcName of [
    "get_gem_index_mutation_catalog_v3", "get_public_mutation_catalog",
    "get_gem_index_mutation_catalog", "get_public_mutation_catalog_json",
    "get_public_mutation_catalog_all"
  ]) {
    const { data, error } = await supabase.rpc(rpcName);
    const rows = error ? [] : unwrapRows(data);
    if (rows.length) return normalizeMutationCatalog(rows);
    errors.push(error?.message ?? `${rpcName} returned no rows`);
  }
  const direct = await supabase
    .from("game_mutations")
    .select("id,name,chance,multiplier,description,description_credit,icon,color,enabled")
    .eq("enabled", true)
    .order("multiplier", { ascending: true })
    .order("name", { ascending: true });
  if (!direct.error && direct.data?.length) return normalizeMutationCatalog(direct.data);
  console.warn("[Gem Index] live mutation catalog unavailable", [...errors, direct.error?.message]);
  return normalizeMutationCatalog([], { live: false });
}

function normalizeGem(row) {
  const bundled = bundledGems.find((gem) => gem.name === row.name);
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    title: String(row.title || metadata.title || bundled?.title || ""),
    name: String(row.name),
    rarity: Number(row.rarity),
    baseWeight: Number(row.base_weight),
    valuePerGram: Number(row.value_per_gram),
    description: String(row.description || metadata.description || bundled?.description || ""),
    metadata,
    hideRarityUntilDiscovered:
      row.hide_rarity_until_discovered === true || metadata.hideRarityUntilDiscovered === true,
    affectedByLuck: row.affected_by_luck !== false,
    specialGem: row.special_gem === true,
    availabilityMode: String(row.availability_mode || "always"),
    requiredEventKey: row.required_event_key ? String(row.required_event_key) : null,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    dailyStartTime: row.daily_start_time ?? null,
    dailyEndTime: row.daily_end_time ?? null,
    dailyTimeWindows: Array.isArray(row.daily_time_windows) ? row.daily_time_windows : null,
    availabilityTimezone: String(row.availability_timezone || "Asia/Singapore"),
    sortOrder: Number(row.sort_order ?? 0)
  };
}

async function loadGemCatalog() {
  for (const rpcName of ["get_public_gem_index_catalog", "get_public_gem_catalog"]) {
    const result = await supabase.rpc(rpcName);
    if (!result.error && Array.isArray(result.data)) return result.data.map(normalizeGem);
    if (result.error) console.warn(`[Gem Index] ${rpcName} unavailable:`, result.error.message);
  }
  const direct = await supabase
    .from("private_feature_gems")
    .select("id,title,name,rarity,base_weight,value_per_gram,description,metadata,hide_rarity_until_discovered,affected_by_luck,special_gem,enabled,sort_order,starts_at,ends_at,availability_mode,daily_start_time,daily_end_time,daily_time_windows,availability_timezone,required_event_key")
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("rarity", { ascending: false });
  if (direct.error) throw new Error(`Gem catalog could not be loaded: ${direct.error.message}`);
  return (direct.data ?? []).map(normalizeGem);
}

function entriesForView() {
  const signature = [...state.selectedMutations].sort().join("|");
  if (entriesCache?.signature === signature) return entriesCache.entries;
  const selected = selectedMutationIds();
  let entries;
  if (selected.length) {
    entries = mutationCombinationIsObtainable(selected)
      ? catalogGems.map((gem) => makeEntry(gem, selected))
      : [];
  } else if (state.selectedMutations.has("none")) {
    entries = catalogGems.map((gem) => makeEntry(gem, []));
  } else {
    entries = [
      ...catalogGems.map((gem) => makeEntry(gem, [])),
      ...mutationList.flatMap((mutation) => catalogGems.map((gem) => makeEntry(gem, [mutation.id])))
    ];
  }
  entriesCache = { signature, entries };
  return entries;
}

function catalogRarityLabel(gem) {
  return gem.metadata?.rarityClass === "anomalous"
    ? `Anomalous · ${rarityLabel(gem.metadata.rawChanceDenominator || gem.rarity)} raw`
    : rarityLabel(gem.rarity);
}

function rawChanceLabel(entry) {
  const denominator = rawCombinationDenominator(entry.gem.rarity, entry.mutationIds, mutationById);
  return denominator ? `1 in ${denominator.toLocaleString("en-US")} raw` : "Condition-dependent";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "";
}

function availabilityLabels(gem) {
  const labels = [];
  const status = availabilityState(gem);
  const statusText = {
    available: "Available now",
    closed: "Outside its daily window",
    upcoming: "Upcoming",
    expired: "Historical · no longer rollable",
    conditional: "Event-dependent"
  }[status];
  if (statusText) labels.push(statusText);
  if (["daily", "date_range_daily"].includes(gem.availabilityMode)) {
    const windows = dailyWindows(gem)
      .map((window) => `${String(window.start).slice(0, 5)}–${String(window.end).slice(0, 5)}`)
      .join(" and ");
    if (windows) labels.push(`Daily: ${windows} ${gem.availabilityTimezone}`);
  }
  if (gem.startsAt || gem.endsAt) {
    labels.push(`${gem.startsAt ? `Starts ${formatDate(gem.startsAt)}` : ""}${gem.startsAt && gem.endsAt ? " · " : ""}${gem.endsAt ? `Ends ${formatDate(gem.endsAt)}` : ""}`);
  }
  if (gem.availabilityMode === "global_event" || gem.requiredEventKey) {
    labels.push(`Requires global event${gem.requiredEventKey ? `: ${gem.requiredEventKey.replaceAll("_", " ")}` : ""}`);
  }
  if (gem.metadata?.deepcore_stage) {
    labels.push(`Deepcore phase ${String(gem.metadata.deepcore_stage).replace(/^5([12])$/, "5.$1")}${gem.metadata.deepcore_route ? ` · ${gem.metadata.deepcore_route} route` : ""}`);
  }
  if (gem.metadata?.sourceExclusive) labels.push(`${gem.metadata.sourceLabel || "Special source"} exclusive`);
  if (gem.metadata?.abyssalPotionExclusive) labels.push("Abyssal Potion exclusive");
  const biome = gem.metadata?.requiredBiome ?? gem.metadata?.biome;
  if (biome) labels.push(`Biome: ${String(biome)}`);
  if (gem.affectedByLuck === false) labels.push("Flat chance · unaffected by Luck");
  return labels;
}

function mutationNameHtml(ids) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return '<span class="index-no-mutation">No Mutation</span>';
  return `<div class="index-card__mutations" aria-label="Mutations">${normalized.map((id) => {
    const mutation = mutationById.get(id);
    return `<span class="mutation-name-effect mutation-name-effect--${escapeHtml(id)}" style="--mutation-color:${escapeHtml(mutation?.color || "#9fdcff")}"><span class="mutation-name-effect__fx" aria-hidden="true"></span><span class="mutation-name-effect__text">${escapeHtml(mutation?.name || id)}</span></span>`;
  }).join("")}</div>`;
}

function availabilityHtml(gem) {
  return availabilityLabels(gem)
    .map((label) => `<p class="index-card__availability">${escapeHtml(label)}</p>`)
    .join("");
}

function revealedCard(entry, record) {
  const tier = displayTier(entry);
  const baseValue = Number(entry.gem.baseWeight) * Number(entry.gem.valuePerGram);
  const style = getGemStyle(entry.gem.name);
  const replayable = record && isCutsceneEligible({
    rarity: entry.gem.rarity,
    threshold: getSettings().cutsceneMinimumRarity,
    dropType: entry.gem.dropType
  });
  const replayAttrs = entry.mutationIds.length
    ? ` data-replay-mutations="${escapeHtml(entry.mutationIds.join(","))}"`
    : "";
  return `<article class="index-card tier-${escapeHtml(tier.id)}" data-combination="${escapeHtml(entry.combinationKey)}" style="--gem-bg:${escapeHtml(style.color)};--gem-glow:${escapeHtml(style.glow || "transparent")}">
    <div class="index-card__head"><div class="index-card__gem-icon">${gemIconHtml(entry.gem.name, "gem-icon--index", entry.mutationIds)}</div><div class="index-card__title-block"><div class="index-card__gem-title">${escapeHtml(entry.gem.title)}</div><div class="index-card__name">${gemNameHtml(entry.gem.name, escapeHtml)}</div>${mutationNameHtml(entry.mutationIds)}<div class="index-card__rarity">${escapeHtml(catalogRarityLabel(entry.gem))}</div></div><span class="badge badge--tier">${escapeHtml(tier.name)}</span></div>
    <p class="index-card__desc">${escapeHtml(entry.gem.description || "No description available.")}</p>
    ${record ? "" : '<p class="index-card__hidden">Gem identified; this exact mutation combination has not been found.</p>'}
    ${availabilityHtml(entry.gem)}
    ${mutationSourceLabel(entry.mutationIds) ? `<p class="index-card__availability">${escapeHtml(mutationSourceLabel(entry.mutationIds))}</p>` : ""}
    <div class="index-card__rows">
      <div class="index-card__row"><span class="index-card__key">Base weight</span><span class="index-card__val">${formatWeight(entry.gem.baseWeight)}</span></div>
      <div class="index-card__row"><span class="index-card__key">Base value</span><span class="index-card__val">${formatMoney(baseValue)}</span></div>
      <div class="index-card__row"><span class="index-card__key">Base/raw chance</span><span class="index-card__val">${escapeHtml(rawChanceLabel(entry))}</span></div>
      <div class="index-card__row"><span class="index-card__key">Exact combination found</span><span class="index-card__val">${record ? formatCount(record.totalFound) : "Not yet"}</span></div>
      ${record ? `<div class="index-card__row"><span class="index-card__key">Highest value</span><span class="index-card__val">${formatMoney(record.highestValue)}</span></div><div class="index-card__row"><span class="index-card__key">First discovered</span><span class="index-card__val">${escapeHtml(formatDate(record.firstDiscoveredAt))}</span></div><div class="index-card__row"><span class="index-card__key">Last discovered</span><span class="index-card__val">${escapeHtml(formatDate(record.lastDiscoveredAt))}</span></div>` : ""}
    </div>
    ${replayable ? `<button class="button gem-replay-button" type="button" data-replay-gem="${escapeHtml(entry.gem.name)}"${replayAttrs}>▶ Replay Cutscene</button>` : ""}
  </article>`;
}

function gemCard(entry) {
  const record = discoveredRecord(entry);
  if (identityDiscovered(entry)) return revealedCard(entry, record);
  const secret = isSecretLocked(entry);
  const tier = displayTier(entry);
  return `<article class="index-card index-card--locked${secret ? " index-card--secret" : ""} tier-${escapeHtml(tier.id)}" data-combination="${escapeHtml(entry.combinationKey)}">
    <div class="index-card__head"><div><div class="index-card__name">???</div><div class="index-card__rarity">${escapeHtml(combinationLabel(entry.mutationIds))}</div></div><span class="badge badge--tier">${escapeHtml(tier.name)}</span></div>
    <p class="index-card__hidden">${secret ? "This secret gem is hidden until discovered." : "Discover this gem to reveal its index entry."}</p>
    ${secret ? "" : availabilityHtml(entry.gem)}
    <div class="index-card__chance"><span class="index-card__key">Base/raw chance</span><span class="index-card__val">${secret ? "Unknown" : escapeHtml(rawChanceLabel(entry))}</span></div>
  </article>`;
}

function visibleEntries() {
  const query = gemSearch.value.trim().toLowerCase();
  const filtered = entriesForView().filter((entry) => {
    const record = discoveredRecord(entry);
    const searchableName = identityDiscovered(entry) ? entry.gem.name.toLowerCase() : "";
    const combo = combinationLabel(entry.mutationIds).toLowerCase();
    if (query && !searchableName.includes(query) && !combo.includes(query)) return false;
    if (gemFilter.value === "discovered" && !record) return false;
    if (gemFilter.value === "undiscovered" && record) return false;
    return true;
  });
  const sorter = {
    rarity: (a, b) => Number(a.gem.rarity) - Number(b.gem.rarity),
    "rarity-desc": (a, b) => Number(b.gem.rarity) - Number(a.gem.rarity),
    name: (a, b) => a.gem.name.localeCompare(b.gem.name),
    found: (a, b) => (discoveredRecord(b)?.totalFound ?? 0) -
      (discoveredRecord(a)?.totalFound ?? 0) || Number(a.gem.rarity) - Number(b.gem.rarity)
  }[gemSort.value] ?? ((a, b) => Number(a.gem.rarity) - Number(b.gem.rarity));
  return filtered.sort((a, b) =>
    sorter(a, b) || a.combinationKey.localeCompare(b.combinationKey) || a.gem.name.localeCompare(b.gem.name)
  );
}

function renderTierBreakdown(entries) {
  const tiers = new Map();
  for (const entry of entries) {
    const tier = displayTier(entry);
    const bucket = tiers.get(tier.id) ?? { id: tier.id, name: tier.name, found: 0, total: 0 };
    bucket.total += 1;
    if (exactCombinationDiscovered(entry)) bucket.found += 1;
    tiers.set(tier.id, bucket);
  }
  tierBreakdown.innerHTML = [...tiers.values()]
    .sort((a, b) => RARITY_BAND_ORDER.indexOf(a.id) - RARITY_BAND_ORDER.indexOf(b.id))
    .map((bucket) =>
    `<div class="tier-stat"><span class="tier-stat__name">${escapeHtml(bucket.name)}</span><span class="tier-stat__value">${formatCount(bucket.found)} / ${formatCount(bucket.total)}</span></div>`
  ).join("");
}

function renderSummary() {
  const selected = selectedMutationIds();
  const exactView = state.selectedMutations.has("none") || selected.length > 0;
  if (selected.length && !mutationCombinationIsObtainable(selected)) {
    discoveryCount.textContent = "That mutation combination cannot be obtained";
    discoveryMeter.style.width = "0%";
    tierBreakdown.replaceChildren();
    return;
  }
  if (exactView) {
    const entries = entriesForView();
    const found = entries.filter(exactCombinationDiscovered).length;
    discoveryCount.textContent = `${formatCount(found)} / ${formatCount(entries.length)} exact combinations discovered`;
    discoveryMeter.style.width = `${entries.length ? found / entries.length * 100 : 0}%`;
    renderTierBreakdown(entries);
    return;
  }
  const identified = catalogGems.filter((gem) => state.discoveredGemNames.has(gem.name)).length;
  discoveryCount.textContent = `${formatCount(state.combinations.size)} exact combinations across ${formatCount(identified)} / ${formatCount(catalogGems.length)} identified gems`;
  discoveryMeter.style.width = `${catalogGems.length ? identified / catalogGems.length * 100 : 0}%`;
  renderTierBreakdown(catalogGems.map((gem) => makeEntry(gem, [])));
}

function renderSelectedMutationSummary() {
  const selected = selectedMutationIds();
  if (!state.selectedMutations.size) {
    selectedMutationSummary.textContent =
      "All overview: identified gems and saved exact combinations. Cards are limited to base and single-mutation entries.";
  } else if (state.selectedMutations.has("none")) {
    selectedMutationSummary.textContent = "Exact combination: No Mutation";
  } else if (!mutationCombinationIsObtainable(selected)) {
    selectedMutationSummary.textContent =
      "This selection combines mutations that cannot occur on the same roll.";
  } else {
    const source = mutationSourceLabel(selected);
    selectedMutationSummary.textContent =
      `Exact combination: ${combinationLabel(selected)}${source ? ` · ${source}` : ""}`;
  }
}

function renderMutationTabs() {
  const tabs = [{ id: "all", name: "All" }, { id: "none", name: "No Mutation" }, ...mutationList];
  mutationTabs.innerHTML = tabs.map((tab) => {
    const active = tab.id === "all" ? state.selectedMutations.size === 0 : state.selectedMutations.has(tab.id);
    return `<button type="button" class="mutation-tab mutation-tab--${escapeHtml(tab.id)}${active ? " is-active" : ""}" data-mutation-filter="${escapeHtml(tab.id)}" aria-pressed="${active}" style="--mutation-color:${escapeHtml(tab.color || "#9fdcff")}">${tab.icon ? `<span class="mutation-tab__icon" aria-hidden="true">${escapeHtml(tab.icon)}</span>` : ""}<span>${escapeHtml(tab.name)}</span></button>`;
  }).join("");
}

function orderedRarityBands(bands) {
  const ascending = RARITY_BAND_ORDER.filter((id) => bands.has(id));
  const ids = gemSort.value === "rarity-desc"
    ? ["secret", "anomalous", ...ascending.filter((id) => !["secret", "anomalous"].includes(id)).reverse()]
    : ascending;
  return new Map(ids.filter((id) => bands.has(id)).map((id) => [id, bands.get(id)]));
}

function bandContentHtml(id, band) {
  const limit = bandLimits.get(id) ?? BAND_PAGE_SIZE;
  const shown = band.entries.slice(0, limit);
  const remaining = band.entries.length - shown.length;
  return `${shown.map(gemCard).join("")}${remaining > 0 ? `<button class="button index-band__more" type="button" data-show-more="${escapeHtml(id)}">Show ${formatCount(Math.min(BAND_PAGE_SIZE, remaining))} more</button>` : ""}`;
}

function renderBandContents(element, id) {
  const band = renderedBands.get(id);
  const grid = element?.querySelector(".index-band__grid");
  if (!band || !grid) return;
  grid.innerHTML = bandContentHtml(id, band);
}

function renderList() {
  if (state.loading) {
    gemList.innerHTML = '<div class="skeleton skeleton--card"></div>'.repeat(4);
    return;
  }
  if (state.error) {
    gemList.innerHTML = `<div class="empty index-error"><p class="empty__title">Gem Index unavailable</p><p>${escapeHtml(state.error)}</p><button class="button" type="button" data-retry-index>Retry</button></div>`;
    return;
  }
  const list = visibleEntries();
  if (!list.length) {
    const impossible = selectedMutationIds().length &&
      !mutationCombinationIsObtainable(selectedMutationIds());
    gemList.innerHTML = `<div class="empty">${icons.search}<p class="empty__title">${impossible ? "Impossible combination" : "Nothing matches"}</p><p>${impossible ? "These mutations require incompatible equipment or are mutually exclusive." : "Try a different search or filter."}</p></div>`;
    return;
  }
  const bands = new Map();
  if (["name", "found"].includes(gemSort.value)) {
    const label = gemSort.value === "name" ? "All gems A–Z" : "Most found";
    bands.set("sorted", { tier: { id: "sorted", name: label }, entries: list });
  } else {
    for (const entry of list) {
      const tier = displayTier(entry);
      if (!bands.has(tier.id)) bands.set(tier.id, { tier, entries: [] });
      bands.get(tier.id).entries.push(entry);
    }
  }
  renderedBands = ["name", "found"].includes(gemSort.value) ? bands : orderedRarityBands(bands);
  if (![...renderedBands.keys()].some((id) => expandedBands.has(id))) {
    expandedBands.add(renderedBands.keys().next().value);
  }
  gemList.innerHTML = [...renderedBands.entries()].map(([id, band]) => {
    const open = expandedBands.has(id);
    const found = band.entries.filter(exactCombinationDiscovered).length;
    return `<details class="index-band tier-${escapeHtml(id)}" data-tier-band="${escapeHtml(id)}" ${open ? "open" : ""}><summary class="index-band__summary"><span><strong>${escapeHtml(band.tier.name)}</strong><small>${formatCount(found)} exact combinations found</small></span><span class="index-band__count">${formatCount(band.entries.length)} cards</span></summary><div class="index-band__grid grid grid--cards">${open ? bandContentHtml(id, band) : ""}</div></details>`;
  }).join("");
}

function saveView() {
  const payload = {
    selected: [...state.selectedMutations],
    filter: gemFilter.value,
    sort: gemSort.value,
    expanded: [...expandedBands]
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  const url = new URL(location.href);
  const selected = [...state.selectedMutations];
  url.searchParams.set("mutations", selected.length ? selected.join(",") : "all");
  url.searchParams.set("filter", gemFilter.value);
  url.searchParams.set("sort", gemSort.value);
  history.replaceState(null, "", url);
}

function restoreView() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}
  const url = new URL(location.href);
  const selectedText = url.searchParams.get("mutations");
  const selected = selectedText === "all"
    ? []
    : selectedText ? selectedText.split(",") : saved.selected;
  if (Array.isArray(selected)) state.selectedMutations = new Set(selected.map(String));
  gemFilter.value = url.searchParams.get("filter") || saved.filter || "all";
  gemSort.value = url.searchParams.get("sort") || saved.sort || "rarity";
  if (Array.isArray(saved.expanded)) saved.expanded.forEach((id) => expandedBands.add(String(id)));
}

function resetViewRendering() {
  entriesCache = null;
  expandedBands.clear();
  bandLimits.clear();
}

mutationTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mutation-filter]");
  if (!button) return;
  const id = button.dataset.mutationFilter;
  if (id === "all") state.selectedMutations.clear();
  else if (id === "none") state.selectedMutations = new Set(["none"]);
  else {
    state.selectedMutations.delete("none");
    if (state.selectedMutations.has(id)) state.selectedMutations.delete(id);
    else state.selectedMutations.add(id);
  }
  resetViewRendering();
  saveView();
  renderMutationTabs();
  renderSelectedMutationSummary();
  renderSummary();
  renderList();
});

gemList.addEventListener("toggle", (event) => {
  const band = event.target.closest?.("[data-tier-band]");
  if (!band || event.target !== band || !band.isConnected || !gemList.contains(band)) return;
  if (band.open) {
    expandedBands.add(band.dataset.tierBand);
    renderBandContents(band, band.dataset.tierBand);
  } else {
    expandedBands.delete(band.dataset.tierBand);
    band.querySelector(".index-band__grid")?.replaceChildren();
  }
  saveView();
}, true);

gemList.addEventListener("click", async (event) => {
  if (event.target.closest("[data-retry-index]")) {
    await refresh({ force: true });
    return;
  }
  const more = event.target.closest("[data-show-more]");
  if (more) {
    const id = more.dataset.showMore;
    bandLimits.set(id, (bandLimits.get(id) ?? BAND_PAGE_SIZE) + BAND_PAGE_SIZE);
    renderBandContents(more.closest("[data-tier-band]"), id);
    return;
  }
  const button = event.target.closest("[data-replay-gem]");
  if (!button) return;
  const gem = catalogGems.find((entry) => entry.name === button.dataset.replayGem);
  if (!gem) return;
  button.disabled = true;
  try {
    await replayGemCutscene({
      gem,
      mutationIds: (button.dataset.replayMutations ?? "").split(",").filter(Boolean)
    });
  } finally {
    button.disabled = false;
  }
});

let renderTimer = null;
function scheduleRender({ reset = false } = {}) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (reset) resetViewRendering();
    saveView();
    renderList();
  }, 100);
}
gemSearch.addEventListener("input", () => scheduleRender());
gemFilter.addEventListener("change", () => scheduleRender({ reset: true }));
gemSort.addEventListener("change", () => scheduleRender({ reset: true }));
refreshButton?.addEventListener("click", () => refresh({ force: true }));

async function refresh({ force = false, quiet = false } = {}) {
  if (refreshInFlight) return refreshInFlight;
  if (!force && Date.now() - lastRefreshAt < 10_000) return;
  refreshInFlight = (async () => {
    if (!quiet) {
      state.loading = true;
      state.error = null;
      refreshButton?.setAttribute("aria-busy", "true");
      renderList();
    }
    try {
      const user = await ensurePlayerAuth();
      if (!user) throw new Error("Could not sign in to load your discoveries.");
      state.playerId = user.id;
      const [discoveries, playerState, gems, mutations] = await Promise.all([
        loadCombinations(user.id),
        loadCloudPlayerState(),
        loadGemCatalog(),
        loadMutationCatalog()
      ]);
      state.combinations = discoveries.combinations;
      state.discoveredGemNames = discoveries.discoveredGemNames;
      catalogGems = gems;
      mutationList = mutations;
      rebuildMutationMaps();
      state.selectedMutations = new Set(
        [...state.selectedMutations].filter((id) => id === "none" || mutationById.has(id))
      );
      if (playerState) shell.setWallet(playerState.money);
      state.error = null;
      lastRefreshAt = Date.now();
    } catch (error) {
      console.error("Gem Index refresh failed:", error);
      const message = error?.message || "The index could not be loaded.";
      if (!quiet || !catalogGems.length) state.error = message;
      if (!quiet) notify.error("Gem Index unavailable", message);
    } finally {
      state.loading = false;
      refreshButton?.removeAttribute("aria-busy");
      renderMutationTabs();
      renderSelectedMutationSummary();
      renderSummary();
      renderList();
    }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

restoreView();
renderList();
renderMutationTabs();
renderSelectedMutationSummary();
refresh({ force: true });
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id && session.user.id !== state.playerId) refresh({ force: true });
});
