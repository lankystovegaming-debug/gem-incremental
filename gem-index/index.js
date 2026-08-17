import gems from "../src/data/gems.js";
import {
  GEM_MUTATIONS,
  normalizeMutationIds,
  mutationCombinationKey,
  mutationCombinationLabel
} from "../src/data/mutations.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { loadCloudPlayerState } from "../src/backend/cloudInventory.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";
import { gemNameHtml } from "../src/ui/gemStyle.js";
import { replayGemCutscene } from "../src/ui/cutsceneReplay.js";
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

document.getElementById("searchIcon").innerHTML = icons.search;

const mutationList = Object.values(GEM_MUTATIONS);

/*
 * Five independent mutations => 32 combinations per gem.
 * 46 base gems => 1,472 possible index entries.
 */
const MUTATION_COMBINATIONS = (() => {
  const ids = mutationList.map((m) => m.id);
  const combinations = [];

  for (let mask = 0; mask < (1 << ids.length); mask += 1) {
    const selected = ids.filter((_, index) => Boolean(mask & (1 << index)));
    combinations.push({
      mutationIds: normalizeMutationIds(selected),
      combinationKey: mutationCombinationKey(selected)
    });
  }

  return combinations;
})();

const TOTAL_ENTRIES = gems.length * MUTATION_COMBINATIONS.length;

const state = {
  index: {},
  combinations: {},
  selectedMutations: new Set(),
  loading: true
};

async function loadIndex() {
  const { data, error } = await supabase
    .from("gem_index")
    .select("gem_name, total_rolled, heaviest_weight");

  if (error) {
    console.error("Failed to load the Gem Index:", error);
    return null;
  }

  return Object.fromEntries(
    (data ?? []).map((entry) => [
      entry.gem_name,
      {
        totalRolled: Number(entry.total_rolled ?? 0),
        heaviestWeight: Number(entry.heaviest_weight ?? 0)
      }
    ])
  );
}

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

function comboKey(gemName, combinationKey) {
  return `${gemName}::${combinationKey}`;
}

function allEntries() {
  const entries = [];

  for (const gem of gems) {
    for (const combination of MUTATION_COMBINATIONS) {
      entries.push({
        gem,
        ...combination,
        key: comboKey(gem.name, combination.combinationKey)
      });
    }
  }

  return entries;
}

const indexEntries = allEntries();

function renderSummary() {
  const discovered = indexEntries.filter(
    (entry) => Boolean(state.combinations[entry.key])
  ).length;

  discoveryCount.textContent =
    `${formatCount(discovered)} of ${formatCount(TOTAL_ENTRIES)} ` +
    `gem / mutation combinations discovered`;

  discoveryMeter.style.width =
    `${TOTAL_ENTRIES ? (discovered / TOTAL_ENTRIES) * 100 : 0}%`;

  const tiers = new Map();

  for (const entry of indexEntries) {
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
          <span class="tier-stat__value">${bucket.found} / ${bucket.total}</span>
        </div>
      `
    )
    .join("");
}

function entryMatchesMutationFilter(entry) {
  if (!state.selectedMutations.size) return true;

  if (state.selectedMutations.has("none")) {
    return entry.mutationIds.length === 0;
  }

  /*
   * Multiple selected mutations use AND semantics.
   * Example: Polished + Gilded shows only combinations containing
   * both mutations.
   */
  return [...state.selectedMutations].every((id) =>
    entry.mutationIds.includes(id)
  );
}

function visibleEntries() {
  const query = gemSearch.value.trim().toLowerCase();

  const filtered = indexEntries.filter((entry) => {
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

  const sorters = {
    rarity: (a, b) => a.gem.rarity - b.gem.rarity,
    "rarity-desc": (a, b) => b.gem.rarity - a.gem.rarity,
    name: (a, b) => {
      const nameSort = a.gem.name.localeCompare(b.gem.name);
      if (nameSort) return nameSort;
      return a.combinationKey.localeCompare(b.combinationKey);
    },
    found: (a, b) =>
      (state.combinations[b.key]?.totalFound ?? 0) -
      (state.combinations[a.key]?.totalFound ?? 0)
  };

  return [...filtered].sort(sorters[gemSort.value] ?? sorters.rarity);
}

function renderMutationTabs() {
  const tabs = [
    { id: "none", name: "No Mutation", special: true },
    ...mutationList.map((mutation) => ({
      id: mutation.id,
      name: mutation.name,
      special: false
    }))
  ];

  mutationTabs.innerHTML = tabs
    .map((tab) => {
      const active = state.selectedMutations.has(tab.id);

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

  if (!discovered) {
    return `
      <article
        class="index-card index-card--locked tier-${tier.id}"
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
          <span class="badge badge--tier">${escapeHtml(tier.name)}</span>
        </div>

        <p class="index-card__hidden">
          Roll this exact gem / mutation combination to reveal its entry.
        </p>
      </article>
    `;
  }

  const replayable = entry.gem.rarity >= 10000;
  const baseValue = entry.gem.baseWeight * entry.gem.valuePerGram;

  const replayAttrs = entry.mutationIds.length
    ? ` data-replay-mutations="${escapeHtml(entry.mutationIds.join(","))}"`
    : "";

  return `
    <article
      class="index-card tier-${tier.id}"
      data-combination="${escapeHtml(entry.combinationKey)}"
    >
      <div class="index-card__head">
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

  if (id === "none") {
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
  renderList();
});

gemList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-replay-gem]");
  if (!button) return;

  const gem = gems.find(
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

  const [index, combinations, playerState] = await Promise.all([
    loadIndex(),
    loadCombinations(user.id),
    loadCloudPlayerState()
  ]);

  state.loading = false;

  if (index) {
    state.index = index;
  }

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
  renderList();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) refresh();
});

renderList();
renderMutationTabs();
refresh();
