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
const selectedMutationSummary = document.getElementById("selectedMutationSummary");

document.getElementById("searchIcon").innerHTML = icons.search;

const mutationList = Object.values(GEM_MUTATIONS);

/*
 * The hidden Lanky Gem is intentionally not part of the public Gem Index.
 * That leaves 45 indexable base gems, so every exact mutation combination is
 * always "out of 45".
 */
const indexableGems = gems.filter((gem) => !gem.hideRarityUntilDiscovered);

/*
 * Five independent mutations => 32 exact combinations per gem.
 * 45 indexable base gems => 1,440 possible index entries.
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

const TOTAL_ENTRIES = indexableGems.length * MUTATION_COMBINATIONS.length;

const state = {
  index: {},
  combinations: {},
  selectedMutations: new Set(),
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

/*
 * Odds mirror roll/index.ts:
 * - non-Quartz gems are checked from rarest -> most common
 * - each check succeeds at min(luck / rarity, 1)
 * - Quartz is the fallback after every other gem fails
 *
 * The Gem Index displays base odds (luck = 1), so the number is stable
 * and represents the actual RNG probability of the base game roll.
 */
const BASE_ROLL_LUCK = 1;

function gemRollChance(gem, luck = BASE_ROLL_LUCK) {
  const safeLuck = Math.max(0, Number(luck) || 0);

  if (gem.name === "Quartz") {
    return indexableGems
      .filter((candidate) => candidate.name !== "Quartz")
      .sort((a, b) => b.rarity - a.rarity)
      .reduce(
        (probability, candidate) =>
          probability * (1 - Math.min(safeLuck / candidate.rarity, 1)),
        1
      );
  }

  const rollable = indexableGems
    .filter((candidate) => candidate.name !== "Quartz")
    .sort((a, b) => b.rarity - a.rarity);

  const position = rollable.findIndex(
    (candidate) => candidate.name === gem.name
  );

  if (position < 0) return 0;

  const ownChance = Math.min(safeLuck / gem.rarity, 1);

  return (
    rollable
      .slice(0, position)
      .reduce(
        (probability, candidate) =>
          probability * (1 - Math.min(safeLuck / candidate.rarity, 1)),
        1
      ) * ownChance
  );
}

function mutationChance(id) {
  const mutation = GEM_MUTATIONS[id];
  if (!mutation) return 0;
  return Math.min(1 / Number(mutation.chance), 1);
}

function exactMutationCombinationChance(ids) {
  const selected = new Set(normalizeMutationIds(ids));

  return mutationList.reduce((probability, mutation) => {
    const chance = mutationChance(mutation.id);
    return probability * (
      selected.has(mutation.id)
        ? chance
        : (1 - chance)
    );
  }, 1);
}

function exactEntryChance(entry) {
  return gemRollChance(entry.gem) *
    exactMutationCombinationChance(entry.mutationIds);
}

function formatChance(probability) {
  if (!Number.isFinite(probability) || probability <= 0) {
    return "Impossible";
  }

  const denominator = 1 / probability;

  if (denominator > 1e15) {
    return `1 in ${denominator.toExponential(2).replace("e+", "e")}`;
  }

  const rounded = Math.max(1, Math.round(denominator));

  return `1 in ${rounded.toLocaleString("en-US")}`;
}

function entryChanceLabel(entry) {
  return formatChance(exactEntryChance(entry));
}

function comboKey(gemName, combinationKey) {
  return `${gemName}::${combinationKey}`;
}

function allEntries() {
  const entries = [];

  for (const gem of indexableGems) {
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

  return key === null
    ? indexEntries
    : indexEntries.filter(
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
  // This keeps every mutation view at exactly 45 possible gems.
  return entry.combinationKey === key;
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

        <div class="index-card__chance">
          <span class="index-card__key">Actual chance</span>
          <span class="index-card__val">${escapeHtml(entryChanceLabel(entry))}</span>
        </div>
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
  renderSelectedMutationSummary();
  renderSummary();
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

  const [combinations, playerState] = await Promise.all([
    loadCombinations(user.id),
    loadCloudPlayerState()
  ]);

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

renderList();
renderMutationTabs();
renderSelectedMutationSummary();
refresh();
