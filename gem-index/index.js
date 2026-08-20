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
import { chanceLabelForResult, rolledResultChance } from "../src/logic/chances.js";
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatWeight,
  formatCount,
  escapeHtml
} from "../src/ui/format.js";

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

function normalizeMutationIds(ids = []) {
  const order = new Map(mutationList.map((mutation, index) => [mutation.id, index]));
  return Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? "").trim().toLowerCase())))
    .filter((id) => order.has(id))
    .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

function mutationCombinationKey(ids = []) {
  const normalized = normalizeMutationIds(ids);
  return normalized.length ? normalized.join("+") : "none";
}

function mutationCombinationLabel(ids = []) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return "No Mutation";
  return normalized.map((id) => mutationList.find((mutation) => mutation.id === id)?.name ?? id).join(" + ");
}

// Secret gems are included in the internal catalog so a discovery can reveal
// them, but they are completely absent from the rendered index beforehand.
let catalogGems = [...gems];
let indexEntries = [];

/*
 * Build exact mutation combinations from the LIVE mutation catalog.
 * Admin-created mutations are stored in game_mutations, so this must not be
 * frozen at module load time.
 */
function buildMutationCombinations() {
  const ids = mutationList.map((m) => m.id);
  const combinations = [];

  // The game normally has only a handful of mutations. Generate the full
  // exact-combination set so every admin mutation behaves like a built-in.
  const activeIds = ids;

  for (let mask = 0; mask < (1 << activeIds.length); mask += 1) {
    const selected = activeIds.filter((_, index) => Boolean(mask & (1 << index)));
    combinations.push({
      mutationIds: normalizeMutationIds(selected),
      combinationKey: mutationCombinationKey(selected)
    });
  }

  return combinations;
}

let mutationCombinations = buildMutationCombinations();

const state = {
  index: {},
  combinations: {},
  selectedMutations: new Set(["none"]),
  loading: true
};

async function loadCombinations(playerId) {
  const { data, error } = await supabase
    .from("player_gem_mutation_combinations")
    .select(`
      gem_name,
      combination_key,
      mutation_ids,
      mutation_multipliers,
      total_found,
      highest_value,
      first_discovered_at
    `)
    .eq("player_id", playerId);

  if (error) {
    console.error("Failed to load mutation combination index:", error);
    return null;
  }

  const result = {};

  for (const entry of data ?? []) {
    const key = `${entry.gem_name}::${entry.combination_key}`;

    result[key] = {
      gemName: entry.gem_name,
      combinationKey: entry.combination_key,
      mutationIds: normalizeMutationIds(entry.mutation_ids ?? []),
      mutationMultipliers:
        entry.mutation_multipliers &&
        typeof entry.mutation_multipliers === "object"
          ? entry.mutation_multipliers
          : {},
      totalFound: Number(entry.total_found ?? 0),
      highestValue: Number(entry.highest_value ?? 0),
      firstDiscoveredAt: entry.first_discovered_at
    };
  }

  return result;
}

/* Base odds mirror roll/index.ts at luck = 1. Player/equipment/potion modifiers are intentionally ignored. */
function exactEntryChance(entry) {
  const gemProbability = entry.gem.rarity > 0 ? 1 / Number(entry.gem.rarity) : 0;
  const mutationProbability = entry.mutationIds.reduce((probability, id) => {
    const mutation = mutationList.find((item) => item.id === id);
    const chance = Number(mutation?.chance ?? 0);
    return probability * (chance > 0 ? Math.min(1, 1 / chance) : 0);
  }, 1);
  return gemProbability * mutationProbability;
}

function entryChanceLabel(entry) {
  const probability = exactEntryChance(entry);
  if (!Number.isFinite(probability) || probability <= 0) return "Impossible";
  return `1 in ${Math.max(1, Math.round(1 / probability)).toLocaleString("en-US")}`;
}

function comboKey(gemName, combinationKey) {
  return `${gemName}::${combinationKey}`;
}

function allEntries() {
  const entries = [];

  for (const gem of catalogGems) {
    for (const combination of mutationCombinations) {
      entries.push({
        gem,
        ...combination,
        key: comboKey(gem.name, combination.combinationKey)
      });
    }
  }

  return entries;
}

indexEntries = allEntries();

function secretGemIsRevealed(gem) {
  if (!gem.hideRarityUntilDiscovered) {
    return true;
  }

  return Object.values(state.combinations).some(
    (record) => record.gemName === gem.name
  );
}

function currentlyIndexableEntries() {
  // Keep secret gems in the index as locked placeholders. Previously hidden
  // gems were removed from the entry list entirely, which made the final
  // catalog gem appear to be missing until it was discovered.
  return indexEntries;
}

function isSecretUndiscovered(entry) {
  return Boolean(
    entry.gem.hideRarityUntilDiscovered &&
    !secretGemIsRevealed(entry.gem)
  );
}

function selectedCombination() {
  if (!state.selectedMutations.size) {
    return null;
  }

  if (state.selectedMutations.has("none")) {
    return "none";
  }

  return mutationCombinationKey([...state.selectedMutations]);
}

function selectedEntries() {
  const key = selectedCombination();
  const availableEntries = currentlyIndexableEntries();

  return key === null
    ? availableEntries
    : availableEntries.filter(
        (entry) => entry.combinationKey === key
      );
}

function renderSummary() {
  // With no filter: every one of the 32 exact combinations is counted.
  // With mutations selected: only that EXACT combination is counted.
  // Therefore a selected view is "found / base gems in that rarity", while
  // the unfiltered view is "found / base gems × 32 combinations".
  const scopedEntries = selectedEntries();

  const discovered = scopedEntries.filter(
    (entry) => Boolean(state.combinations[entry.key])
  ).length;

  const total = scopedEntries.length;

  discoveryCount.textContent =
    `${formatCount(discovered)} / ${formatCount(total)} gems discovered`;

  discoveryMeter.style.width =
    `${total ? (discovered / total) * 100 : 0}%`;

  const tiers = new Map();

  for (const entry of scopedEntries) {
    const tier = rarityTier(entry.gem.rarity);
    const bucket =
      tiers.get(tier.id) ??
      { name: tier.name, found: 0, total: 0 };

    bucket.total += 1;

    if (state.combinations[entry.key]) {
      bucket.found += 1;
    }

    tiers.set(tier.id, bucket);
  }

  tierBreakdown.innerHTML = [...tiers.values()]
    .map(
      (bucket) => `
        <div class="tier-stat">
          <span class="tier-stat__name">${escapeHtml(bucket.name)}</span>
          <span class="tier-stat__value">
            ${formatCount(bucket.found)} / ${formatCount(bucket.total)}
          </span>
        </div>
      `
    )
    .join("");
}

function renderSelectedMutationSummary() {
  const selected = [...state.selectedMutations];

  if (!selected.length) {
    return;
  }

  selectedMutationSummary.textContent =
    selected.includes("none")
      ? "Showing exact combination: No Mutation"
      : `Showing exact combination: ${mutationCombinationLabel(selected)}`;
}

function entryMatchesMutationFilter(entry) {
  const key = selectedCombination();

  if (key === null) return true;

  // A selection represents one exact mutation combination.
  // This keeps every mutation view to one exact combination per visible gem.
  return entry.combinationKey === key;
}

function visibleEntries() {
  const query = gemSearch.value.trim().toLowerCase();

  const filtered = currentlyIndexableEntries().filter((entry) => {
    const discovered = Boolean(state.combinations[entry.key]);
    const name = entry.gem.name.toLowerCase();
    const comboLabel = mutationCombinationLabel(entry.mutationIds).toLowerCase();

    if (
      query &&
      !name.includes(query) &&
      !comboLabel.includes(query)
    ) {
      return false;
    }

    if (gemFilter.value === "discovered" && !discovered) return false;
    if (gemFilter.value === "undiscovered" && discovered) return false;

    if (!entryMatchesMutationFilter(entry)) return false;

    return true;
  });

  const mutationOrder = new Map(
    mutationList.map((mutation, index) => [mutation.id, index])
  );

  const compareMutationIds = (a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }

    for (let i = 0; i < a.length; i += 1) {
      const delta =
        (mutationOrder.get(a[i]) ?? 999) -
        (mutationOrder.get(b[i]) ?? 999);

      if (delta) return delta;
    }

    return 0;
  };

  const sorters = {
    rarity: (a, b) => a.gem.rarity - b.gem.rarity,
    "rarity-desc": (a, b) => b.gem.rarity - a.gem.rarity,
    name: (a, b) => a.gem.name.localeCompare(b.gem.name),
    found: (a, b) => {
      const foundDelta =
        (state.combinations[b.key]?.totalFound ?? 0) -
        (state.combinations[a.key]?.totalFound ?? 0);

      if (foundDelta) return foundDelta;

      return a.gem.rarity - b.gem.rarity;
    }
  };

  return [...filtered].sort((a, b) => {
    const comboDelta = compareMutationIds(a.mutationIds, b.mutationIds);
    if (comboDelta) return comboDelta;

    const sortDelta =
      (sorters[gemSort.value] ?? sorters.rarity)(a, b);

    if (sortDelta) return sortDelta;

    return a.combinationKey.localeCompare(b.combinationKey);
  });
}

function renderMutationTabs() {
  const tabs = [
    { id: "all", name: "All", special: true },
    { id: "none", name: "No Mutation", special: true },
    ...mutationList.map((mutation) => ({
      id: mutation.id,
      name: mutation.name,
      special: false
    }))
  ];

  mutationTabs.innerHTML = tabs
    .map((tab) => {
      const active = tab.id === "all"
        ? state.selectedMutations.size === 0
        : state.selectedMutations.has(tab.id);

      return `
        <button
          type="button"
          class="mutation-tab mutation-tab--${tab.id}${active ? " is-active" : ""}"
          data-mutation-filter="${tab.id}"
          aria-pressed="${active}"
        >
          ${escapeHtml(tab.name)}
        </button>
      `;
    })
    .join("");
}

function mutationNameHtml(ids) {
  const normalized = normalizeMutationIds(ids);

  if (!normalized.length) {
    return `<span class="index-no-mutation">No Mutation</span>`;
  }

  return `
    <div class="index-card__mutations" aria-label="Mutations">
      ${normalized
        .map((id) => {
          const mutation = GEM_MUTATIONS[id];
          if (!mutation) return "";

          return `
            <span class="mutation-name-effect mutation-name-effect--${id}">
              <span class="mutation-name-effect__fx" aria-hidden="true"></span>
              <span class="mutation-name-effect__text">${escapeHtml(mutation.name)}</span>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function gemCard(entry) {
  const tier = rarityTier(entry.gem.rarity);
  const record = state.combinations[entry.key];
  const discovered = Boolean(record);
  const secretLocked = isSecretUndiscovered(entry);

  if (!discovered) {
    return `
      <article
        class="index-card index-card--locked${secretLocked ? " index-card--secret" : ""} tier-${tier.id}"
        data-combination="${escapeHtml(entry.combinationKey)}"
      >
        <div class="index-card__head">
          <div>
            <div class="index-card__name">???</div>
            <div class="index-card__rarity">
              ${entry.mutationIds.length
                ? mutationCombinationLabel(entry.mutationIds)
                : "No Mutation"}
            </div>
          </div>
          <span class="badge badge--tier">${secretLocked ? "Undiscovered" : escapeHtml(tier.name)}</span>
        </div>

        <p class="index-card__hidden">
          ${secretLocked
            ? "This secret gem is in the index, but its rarity is hidden until discovered."
            : "Roll this exact gem / mutation combination to reveal its entry."}
        </p>

        <div class="index-card__chance">
          <span class="index-card__key">Actual chance</span>
          <span class="index-card__val">${secretLocked ? "Unknown" : escapeHtml(entryChanceLabel(entry))}</span>
        </div>
      </article>
    `;
  }

  const replayable = entry.gem.rarity >= 100000;
  const baseValue = entry.gem.baseWeight * entry.gem.valuePerGram;

  const replayAttrs = entry.mutationIds.length
    ? ` data-replay-mutations="${escapeHtml(entry.mutationIds.join(","))}"`
    : "";

  const gemStyle = getGemStyle(entry.gem.name);

  return `
    <article
      class="index-card tier-${tier.id}"
      data-combination="${escapeHtml(entry.combinationKey)}"
      style="--gem-bg:${escapeHtml(gemStyle.color)};--gem-glow:${escapeHtml(gemStyle.glow || "transparent")}"
    >
      <div class="index-card__head">
        <div class="index-card__gem-icon">${gemIconHtml(entry.gem.name, "gem-icon--index", entry.mutationIds)}</div>
        <div class="index-card__title-block">
          <div class="index-card__name">
            ${gemNameHtml(entry.gem.name, escapeHtml)}
          </div>

          ${mutationNameHtml(entry.mutationIds)}

          <div class="index-card__rarity">
            ${rarityLabel(entry.gem.rarity)}
          </div>
        </div>

        <span class="badge badge--tier">${escapeHtml(tier.name)}</span>
      </div>

      <p class="index-card__desc">
        ${escapeHtml(entry.gem.description ?? "No description available.")}
      </p>

      <div class="index-card__rows">
        <div class="index-card__row">
          <span class="index-card__key">Base weight</span>
          <span class="index-card__val">${formatWeight(entry.gem.baseWeight)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Base value</span>
          <span class="index-card__val">${formatMoney(baseValue)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Actual chance</span>
          <span class="index-card__val">${escapeHtml(entryChanceLabel(entry))}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Combination found</span>
          <span class="index-card__val">${formatCount(record.totalFound)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Highest value</span>
          <span class="index-card__val">${formatMoney(record.highestValue)}</span>
        </div>
      </div>

      ${
        replayable
          ? `
            <button
              class="button gem-replay-button"
              type="button"
              data-replay-gem="${escapeHtml(entry.gem.name)}"
              ${replayAttrs}
            >
              ▶ Replay Cutscene
            </button>
          `
          : ""
      }
    </article>
  `;
}

function renderList() {
  if (state.loading) {
    gemList.innerHTML = Array.from(
      { length: 8 },
      () => '<div class="skeleton skeleton--card"></div>'
    ).join("");
    return;
  }

  const list = visibleEntries();

  gemList.innerHTML = list.length
    ? list.map(gemCard).join("")
    : `
      <div class="empty" style="grid-column:1/-1">
        ${icons.search}
        <p class="empty__title">Nothing matches</p>
        <p>Try a different search or mutation filter.</p>
      </div>
    `;
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
    if (state.selectedMutations.has(id)) {
      state.selectedMutations.delete(id);
    } else {
      state.selectedMutations.add(id);
    }
  }

  renderMutationTabs();
  renderSelectedMutationSummary();
  renderSummary();
  renderList();
});

gemList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-replay-gem]");
  if (!button) return;

  const gem = catalogGems.find(
    (entry) => entry.name === button.dataset.replayGem
  );

  if (!gem) return;

  const mutationIds = (button.dataset.replayMutations ?? "")
    .split(",")
    .filter(Boolean);

  button.disabled = true;

  try {
    await replayGemCutscene({ gem, mutationIds });
  } finally {
    button.disabled = false;
  }
});

for (const control of [gemSearch, gemFilter, gemSort]) {
  control.addEventListener("input", renderList);
  control.addEventListener("change", renderList);
}

async function refresh() {
  const user = await ensurePlayerAuth();

  if (!user) {
    state.loading = false;
    discoveryCount.textContent =
      "Could not sign you in. Refresh to try again.";
    notify.error(
      "Sign-in failed",
      "The game could not reach your account."
    );
    return;
  }

  const [combinations, playerState, privateGemsResult, mutationCatalogResult] = await Promise.all([
    loadCombinations(user.id),
    loadCloudPlayerState(),
    supabase
      .from("private_feature_gems")
      .select("*")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("rarity", { ascending: true }),
    supabase
      .from("game_mutations")
      .select("id,name,chance,multiplier,description,icon,color,sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
  ]);

  if (!mutationCatalogResult.error && Array.isArray(mutationCatalogResult.data) && mutationCatalogResult.data.length) {
    mutationList = mutationCatalogResult.data.map((mutation) => ({
      id: String(mutation.id),
      name: String(mutation.name),
      chance: Number(mutation.chance),
      multiplier: Number(mutation.multiplier),
      description: String(mutation.description ?? ""),
      icon: String(mutation.icon ?? "✦"),
      color: String(mutation.color ?? "#9fdcff"),
      sortOrder: Number(mutation.sort_order ?? 0)
    }));
    mutationCombinations = buildMutationCombinations();
  }

  // Admin-created enabled gems are part of the live catalogue. They are
  // read through the restricted public-read policy added by the migration,
  // so disabled/unreleased admin gems remain hidden from normal players.
  if (!privateGemsResult.error && Array.isArray(privateGemsResult.data)) {
    const builtInNames = new Set(gems.map((gem) => gem.name));
    const custom = privateGemsResult.data
      .filter((gem) => !builtInNames.has(gem.name))
      .map((gem) => ({
        name: String(gem.name),
        rarity: Number(gem.rarity),
        baseWeight: Number(gem.base_weight),
        valuePerGram: Number(gem.value_per_gram),
        description: String(gem.description ?? gem.metadata?.description ?? "Admin-created gem."),
        hideRarityUntilDiscovered: gem.hide_rarity_until_discovered === true || gem.metadata?.hideRarityUntilDiscovered === true
      }));
    catalogGems = [...gems, ...custom];
  }

  // Rebuild after the live gem + mutation catalogs are loaded.
  indexEntries = allEntries();

  state.loading = false;

  if (combinations) {
    state.combinations = combinations;
  } else {
    notify.error(
      "Could not load mutation discoveries",
      "Run the mutation combination migration first."
    );
  }

  if (playerState) {
    shell.setWallet(playerState.money);
  }

  renderSummary();
  renderMutationTabs();
  renderSelectedMutationSummary();
  renderList();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refresh();
});

// Keep the index in sync immediately when an administrator adds, edits,
// enables, disables, or removes a custom gem. This avoids the old behaviour
// where the database was correct but the index stayed on its bundled list
// until a hard reload.
const gemCatalogChannel = supabase
  .channel("public-gem-catalog")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "private_feature_gems" },
    () => refresh()
  )
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "game_mutations" },
    () => refresh()
  )
  .subscribe();

window.addEventListener("beforeunload", () => {
  supabase.removeChannel(gemCatalogChannel);
});

renderList();
renderMutationTabs();
renderSelectedMutationSummary();
refresh();
