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
import {
  rarityTier,
  rarityLabel,
  formatMoney,
  formatWeight,
  formatCount,
  formatRelativeTime,
  escapeHtml
} from "../src/ui/format.js";


const shell = mountShell({ page: "gem-index", base: "../" });


// =========================================================
// DOM
// =========================================================

const gemList = document.getElementById("gemList");
const gemIndexPanel = document.getElementById("gemIndexPanel");
const mutationIndexPanel = document.getElementById("mutationIndexPanel");
const gemIndexTab = document.getElementById("gemIndexTab");
const mutationIndexTab = document.getElementById("mutationIndexTab");
const mutationList = document.getElementById("mutationList");
const mutationDiscoveryCount = document.getElementById("mutationDiscoveryCount");
const mutationDiscoveryMeter = document.getElementById("mutationDiscoveryMeter");
const mutationTabs = document.getElementById("mutationTabs");
const discoveryCount = document.getElementById("discoveryCount");
const discoveryMeter = document.getElementById("discoveryMeter");
const tierBreakdown = document.getElementById("tierBreakdown");

const gemSearch = document.getElementById("gemSearch");
const gemFilter = document.getElementById("gemFilter");
const gemSort = document.getElementById("gemSort");

document.getElementById("searchIcon").innerHTML = icons.search;


// =========================================================
// STATE
// =========================================================

const state = {
  index: {},
  mutationIndex: {},
  mutationFilter: "all",
  loading: true
};


// =========================================================
// LOAD
// =========================================================

async function loadIndex() {
  const { data, error } = await supabase
    .from("gem_index")
    .select("gem_name, total_rolled, heaviest_weight");

  if (error) {
    console.error("Failed to load the Gem Index:", error);

    return null;
  }

  const byName = {};

  for (const entry of data ?? []) {
    byName[entry.gem_name] = {
      totalRolled: Number(entry.total_rolled ?? 0),
      heaviestWeight: Number(entry.heaviest_weight ?? 0)
    };
  }

  return byName;
}

async function loadMutationIndex() {
  const { data, error } = await supabase
    .from("player_mutation_index")
    .select("mutation_id, total_found, highest_value, best_gem_name, first_discovered_at");

  if (error) {
    console.error("Failed to load the Mutation Index:", error);
    return null;
  }

  return Object.fromEntries((data ?? []).map((entry) => [
    entry.mutation_id,
    {
      totalFound: Number(entry.total_found ?? 0),
      highestValue: Number(entry.highest_value ?? 0),
      bestGemName: entry.best_gem_name,
      firstDiscoveredAt: entry.first_discovered_at
    }
  ]));
}


// =========================================================
// RENDER
// =========================================================

function renderSummary() {
  const discovered = gems.filter((gem) => state.index[gem.name]).length;

  discoveryCount.textContent = `${formatCount(discovered)} of ${formatCount(
    gems.length
  )} gems discovered`;

  discoveryMeter.style.width = `${(discovered / gems.length) * 100}%`;

  // Discovery split per rarity tier.
  const tiers = new Map();

  for (const gem of gems) {
    const tier = rarityTier(gem.rarity);

    const bucket = tiers.get(tier.id) ?? { name: tier.name, found: 0, total: 0 };

    bucket.total += 1;

    if (state.index[gem.name]) {
      bucket.found += 1;
    }

    tiers.set(tier.id, bucket);
  }

  tierBreakdown.innerHTML = [...tiers.entries()]
    .map(
      ([id, bucket]) => `
        <div class="tier-stat tier-${id}">
          <span class="tier-stat__name">${bucket.name}</span>
          <span class="tier-stat__value">${bucket.found} / ${bucket.total}</span>
        </div>
      `
    )
    .join("");
}


function visibleGems() {
  const query = gemSearch.value.trim().toLowerCase();

  let list = gems.filter((gem) => {
    const found = Boolean(state.index[gem.name]);

    // An undiscovered gem's name is a spoiler, so it never
    // matches a search.
    if (query && !(found && gem.name.toLowerCase().includes(query))) {
      return false;
    }

    if (gemFilter.value === "discovered" && !found) {
      return false;
    }

    if (gemFilter.value === "undiscovered" && found) {
      return false;
    }

    return true;
  });

  const sorters = {
    rarity: (a, b) => a.rarity - b.rarity,
    "rarity-desc": (a, b) => b.rarity - a.rarity,
    name: (a, b) => a.name.localeCompare(b.name),
    found: (a, b) =>
      (state.index[b.name]?.totalRolled ?? 0) -
      (state.index[a.name]?.totalRolled ?? 0)
  };

  return [...list].sort(sorters[gemSort.value] ?? sorters.rarity);
}


function renderList() {
  if (state.loading) {
    gemList.innerHTML = Array.from(
      { length: 8 },
      () => '<div class="skeleton skeleton--card"></div>'
    ).join("");

    return;
  }

  const list = visibleGems();

  if (list.length === 0) {
    gemList.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        ${icons.search}
        <p class="empty__title">Nothing matches</p>
        <p>Undiscovered gems stay hidden from search.</p>
      </div>
    `;

    return;
  }

  gemList.innerHTML = list.map(gemCard).join("");
}

function renderMutationTabs() {
  const mutations = Object.values(GEM_MUTATIONS);

  mutationTabs.innerHTML = [
    `<button class="mutation-tab ${state.mutationFilter === "all" ? "is-active" : ""}" type="button" data-mutation-filter="all">All</button>`,
    ...mutations.map((mutation) => `
      <button class="mutation-tab mutation-tab--${mutation.id} ${state.mutationFilter === mutation.id ? "is-active" : ""}"
        type="button" data-mutation-filter="${mutation.id}">
        ${escapeHtml(mutation.name)}
      </button>
    `)
  ].join("");
}

function renderMutationIndex() {
  const mutations = Object.values(GEM_MUTATIONS);
  const discovered = mutations.filter((mutation) => state.mutationIndex[mutation.id]).length;

  mutationDiscoveryCount.textContent = `${formatCount(discovered)} of ${formatCount(
    mutations.length
  )} mutations discovered`;
  mutationDiscoveryMeter.style.width = `${(discovered / mutations.length) * 100}%`;

  const visibleMutations = state.mutationFilter === "all"
    ? mutations
    : mutations.filter((mutation) => mutation.id === state.mutationFilter);

  mutationList.innerHTML = visibleMutations.map((mutation) => {
    const entry = state.mutationIndex[mutation.id];

    if (!entry) {
      return `
        <article class="index-card index-card--locked mutation-index-card">
          <div class="index-card__head">
            <div>
              <div class="index-card__name">???</div>
              <div class="index-card__rarity">Undiscovered mutation</div>
            </div>
            <span class="badge badge--tier">Unknown</span>
          </div>
          <p class="index-card__hidden">Roll this mutation once to reveal its entry.</p>
        </article>
      `;
    }

    return `
      <article class="index-card mutation-index-card mutation-${mutation.id}">
        <div class="index-card__head">
          <div>
            <div class="index-card__name mutation-index-card__name">${escapeHtml(mutation.name)}</div>
            <div class="index-card__rarity">1 in ${formatCount(mutation.chance)}</div>
          </div>
          <span class="mutation-index-card__boost">${mutation.multiplier}× value</span>
        </div>
        <p class="index-card__desc">${escapeHtml(mutation.description)}</p>
        <div class="index-card__rows">
          <div class="index-card__row">
            <span class="index-card__key">Times found</span>
            <span class="index-card__val">${formatCount(entry.totalFound)}</span>
          </div>
          <div class="index-card__row">
            <span class="index-card__key">Best specimen</span>
            <span class="index-card__val">${escapeHtml(entry.bestGemName ?? "—")}</span>
          </div>
          <div class="index-card__row">
            <span class="index-card__key">Highest value</span>
            <span class="index-card__val mutation-index-card__value">${formatMoney(entry.highestValue)}</span>
          </div>
          <div class="index-card__row">
            <span class="index-card__key">First discovered</span>
            <span class="index-card__val">${escapeHtml(formatRelativeTime(entry.firstDiscoveredAt))}</span>
          </div>
        </div>
        <button class="button mutation-replay-button" type="button"
          data-replay-mutation="${mutation.id}" data-replay-gem="${escapeHtml(entry.bestGemName ?? "")}">
          ▶ Replay Cutscene
        </button>
      </article>
    `;
  }).join("");
}

function setIndexView(view) {
  const showMutations = view === "mutations";
  gemIndexPanel.classList.toggle("hidden", showMutations);
  mutationIndexPanel.classList.toggle("hidden", !showMutations);

  // Reuse the same selected-tab state as the Coin Shop selector.
  const activeTab = showMutations ? mutationIndexTab : gemIndexTab;
  const inactiveTab = showMutations ? gemIndexTab : mutationIndexTab;
  activeTab.setAttribute("aria-current", "page");
  inactiveTab.removeAttribute("aria-current");
}

gemIndexTab.addEventListener("click", () => setIndexView("gems"));
mutationIndexTab.addEventListener("click", () => setIndexView("mutations"));


function gemCard(gem) {
  const tier = rarityTier(gem.rarity);
  const entry = state.index[gem.name];

  if (!entry) {
    const hiddenRarity = gem.hideRarityUntilDiscovered === true;

    return `
      <article class="index-card index-card--locked ${
        hiddenRarity ? "tier-unknown" : `tier-${tier.id}`
      }">
        <div class="index-card__head">
          <div>
            <div class="index-card__name">???</div>
            <div class="index-card__rarity">${
              hiddenRarity ? "Unknown rarity" : rarityLabel(gem.rarity)
            }</div>
          </div>

          <span class="badge badge--tier">${
            hiddenRarity ? "Unknown" : tier.name
          }</span>
        </div>

        <p class="index-card__hidden">
          Roll this gem at least once to reveal its entry.
        </p>
      </article>
    `;
  }

  const baseValue = gem.baseWeight * gem.valuePerGram;

  return `
    <article class="index-card tier-${tier.id}">
      <div class="index-card__head">
        <div>
          <div class="index-card__name">${gemNameHtml(gem.name, escapeHtml)}</div>
          <div class="index-card__rarity">${rarityLabel(gem.rarity)}</div>
        </div>

        <span class="badge badge--tier">${tier.name}</span>
      </div>

      <p class="index-card__desc">
        ${escapeHtml(gem.description ?? "No description available.")}
      </p>

      <div class="index-card__rows">
        <div class="index-card__row">
          <span class="index-card__key">Base weight</span>
          <span class="index-card__val">${formatWeight(gem.baseWeight)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Base value</span>
          <span class="index-card__val">${formatMoney(baseValue)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Times found</span>
          <span class="index-card__val">${formatCount(entry.totalRolled)}</span>
        </div>

        <div class="index-card__row">
          <span class="index-card__key">Heaviest</span>
          <span class="index-card__val">${formatWeight(
            entry.heaviestWeight
          )}</span>
        </div>
      </div>

      <button class="button gem-replay-button" type="button"
        data-replay-gem="${escapeHtml(gem.name)}">
        ▶ Replay Reveal
      </button>
    </article>
  `;
}


mutationTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mutation-filter]");
  if (!button) return;

  state.mutationFilter = button.dataset.mutationFilter ?? "all";
  renderMutationTabs();
  renderMutationIndex();
});

gemList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-replay-gem]");
  if (!button) return;

  const gem = gems.find((entry) => entry.name === button.dataset.replayGem);
  if (!gem) return;

  button.disabled = true;
  try {
    await replayGemCutscene({ gem });
  } finally {
    button.disabled = false;
  }
});

mutationList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-replay-mutation]");
  if (!button) return;

  const mutationId = button.dataset.replayMutation;
  const gem = gems.find((entry) => entry.name === button.dataset.replayGem);

  if (!gem) {
    notify.warning("Replay unavailable", "This mutation has no recorded specimen to replay yet.");
    return;
  }

  button.disabled = true;
  try {
    await replayGemCutscene({ gem, mutationId });
  } finally {
    button.disabled = false;
  }
});

for (const control of [gemSearch, gemFilter, gemSort]) {
  control.addEventListener("input", renderList);
}


// =========================================================
// STARTUP
// =========================================================

async function refresh() {
  const user = await ensurePlayerAuth();

  if (!user) {
    state.loading = false;

    discoveryCount.textContent = "Could not sign you in. Refresh to try again.";

    notify.error("Sign-in failed", "The game could not reach your account.");

    return;
  }

  const [index, mutationIndex, playerState] = await Promise.all([
    loadIndex(),
    loadMutationIndex(),
    loadCloudPlayerState()
  ]);

  state.loading = false;

  if (index) {
    state.index = index;
  } else {
    notify.error("Could not load the index", "Try refreshing the page.");
  }

  if (mutationIndex) {
    state.mutationIndex = mutationIndex;
  } else {
    notify.error("Could not load mutations", "Try refreshing the page.");
  }

  if (playerState) {
    shell.setWallet(playerState.money);
  }

  renderSummary();
  renderList();
  renderMutationTabs();
  renderMutationIndex();
}


window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refresh();
  }
});


renderList();
refresh();
