import gems from "../src/data/gems.js";
import { GEM_MUTATIONS } from "../src/data/mutations.js";
import consumables, { getConsumableById } from "../src/data/consumables.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { adminRequest } from "../src/backend/cloudAdmin.js";
import { createAdminCode, deleteAdminCode, loadAdminCodes, setAdminCodeActive } from "../src/backend/cloudCodes.js";
import { canManageAdminEvents, loadAdminEvents, startAdminEvent, stopAdminEvent } from "../src/backend/cloudAdminEvents.js";
import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { formatCount, formatMoney, formatWeight, escapeHtml } from "../src/ui/format.js";
import { notify } from "../src/ui/toast.js";

const shell = mountShell({ page: "admin", base: "../" });

const status = document.getElementById("adminStatus");
const searchInput = document.getElementById("playerSearch");
const searchButton = document.getElementById("searchButton");
const auditButton = document.getElementById("auditButton");
const results = document.getElementById("searchResults");
const playerPanel = document.getElementById("playerPanel");
const auditPanel = document.getElementById("auditPanel");
const analyticsButton = document.getElementById("analyticsButton");
const analyticsRefresh = document.getElementById("analyticsRefresh");
const analyticsPanel = document.getElementById("analyticsPanel");
const analyticsContent = document.getElementById("analyticsContent");
const mutationCatalogPanel = document.getElementById("mutationCatalogPanel");
const mutationCatalogRefresh = document.getElementById("mutationCatalogRefresh");
const mutationCatalogList = document.getElementById("mutationCatalogList");
const featureLabButton = document.getElementById("featureLabButton");
const featureLab = document.getElementById("adminFeatureLab");
const featureLabBack = document.getElementById("featureLabBack");
const adminPanelBack = document.getElementById("adminPanelBack");

function setFeatureLab(open) {
  if (!featureLab) return;
  featureLab.hidden = !open;
  document.querySelectorAll(".admin-search, .admin-announce, .admin-codes, .admin-events, .admin-section-controls, .admin-mutation-events, .admin-analytics, #searchResults, #playerPanel, #auditPanel").forEach((el) => {
    if (el) el.hidden = open;
  });
  featureLabButton?.classList.toggle("is-active", open);
  featureLabButton?.setAttribute("aria-pressed", String(open));
  if (open) window.scrollTo({ top: 0, behavior: "smooth" });
}

featureLabButton?.addEventListener("click", () => setFeatureLab(true));

featureLabBack?.addEventListener("click", () => {
  setFeatureLab(false);
});

adminPanelBack?.addEventListener("click", () => {
  setFeatureLab(false);
});

let selectedPlayerId = null;

function isLocked(player) {
  return player.bannedUntil && new Date(player.bannedUntil) > new Date();
}

async function searchPlayers() {
  const query = searchInput.value.trim();
  if (query.length < 2) {
    notify.error("Search too short", "Enter at least two characters.");
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = "Searching…";
  const { data, error } = await adminRequest("search", { query });
  searchButton.disabled = false;
  searchButton.textContent = "Search";

  if (error) {
    notify.error("Search failed", error.message);
    return;
  }

  const players = data.players ?? [];
  results.innerHTML = players.length
    ? players.map((player) => `
        <button class="admin-result" type="button" data-player="${escapeHtml(player.id)}">
          <strong>${escapeHtml(player.username ?? player.email ?? "Unnamed player")}</strong>
          <span>${escapeHtml(player.email ?? (player.isAnonymous ? "Anonymous account" : "No email"))}</span>
          <span>${escapeHtml(player.id)}${isLocked(player) ? " · LOCKED" : ""}</span>
        </button>
      `).join("")
    : '<div class="empty"><p class="empty__title">No players found</p></div>';

  for (const button of results.querySelectorAll("[data-player]")) {
    button.addEventListener("click", () => inspectPlayer(button.dataset.player));
  }
}

async function inspectPlayer(playerId) {
  selectedPlayerId = playerId;
  playerPanel.classList.remove("hidden");
  auditPanel.classList.add("hidden");
  playerPanel.innerHTML = '<div class="skeleton" style="height:360px"></div>';

  const { data, error } = await adminRequest("inspect", { targetId: playerId });
  if (error) {
    notify.error("Could not load player", error.message);
    playerPanel.innerHTML = "";
    return;
  }

  renderPlayer(data);
}

function renderPlayer(data) {
  const player = data.player;
  const locked = isLocked(player);

  playerPanel.innerHTML = `
    <div class="admin-player-head">
      <div>
        <h2>${escapeHtml(player.username ?? player.email ?? "Unnamed player")}</h2>
        <p>${escapeHtml(player.email ?? "Anonymous account")} · ${escapeHtml(player.id)}</p>
      </div>
      <span class="badge ${locked ? "badge--danger" : "badge--positive"}">${locked ? "Locked" : "Active"}</span>
    </div>

    <div class="admin-grid">
      <section class="admin-section">
        <h3>Player Overview</h3>
        <div class="admin-stats">
          ${stat("Money", formatMoney(player.money))}
          ${stat("Coins", formatCount(player.coins))}
          ${stat("Total rolls", formatCount(player.total_rolls))}
          ${stat("Gems", formatCount(player.gemCount))}
          ${stat("Capacity", formatCount(player.inventory_capacity))}
          ${stat("Equipment", formatCount(player.equipmentCount))}
          ${stat("Rarest", player.rarest_gem_name ?? "None")}
        </div>
      </section>

      <section class="admin-section admin-section--title">
        <h3>Player Title</h3>
        <p class="admin-help">Give this player a custom title shown on their profile and next to their name in chat. You can change the colour or remove it at any time.</p>
        <div class="admin-control admin-control--two">
          <input id="playerTitle" maxlength="40" value="${escapeHtml(player.title ?? "")}" placeholder="Celestial Collector" aria-label="Player title">
          <input id="playerTitleColor" type="color" value="${escapeHtml(player.title_color || "#ffd166")}" aria-label="Title colour">
          <button class="btn btn--primary" data-action="player-title-set" type="button">Give / Update</button>
          <button class="btn btn--danger" data-action="player-title-remove" type="button">Remove Title</button>
        </div>
      </section>

      <section class="admin-section">
        <h3>Money</h3>
        <div class="admin-control">
          <input id="moneyAmount" type="number" min="0.01" step="0.01" placeholder="Amount">
          <button class="btn btn--primary" data-action="money-add" type="button">Grant</button>
          <button class="btn btn--danger" data-action="money-remove" type="button">Remove</button>
        </div>
      </section>

      <section class="admin-section">
        <h3>Grant Gem</h3>
        <div class="admin-control admin-control--two">
          <select id="gemName">${gems.map((gem) => `<option>${escapeHtml(gem.name)}</option>`).join("")}</select>
          <input id="gemWeight" type="number" min="0.01" max="1000" step="0.01" value="1" aria-label="Weight multiplier">
          <button class="btn btn--primary" data-action="grant-gem" type="button">Grant gem</button>
        </div>
        <div class="admin-mutations" style="display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:10px">
          ${Object.values(GEM_MUTATIONS).map((m) => `
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:.85rem">
              <input type="checkbox" class="gemMutation" value="${escapeHtml(m.id)}">
              ${escapeHtml(m.name)} <span style="color:var(--text-faint)">×${m.multiplier}</span>
            </label>
          `).join("")}
        </div>
      </section>

      <section class="admin-section">
        <h3>Mutation Luck</h3>
        <p style="margin:0 0 8px;color:var(--text-faint);font-size:.85rem">
          Multiplies this player's chance of every mutation on each roll (1 = normal). Current: <strong>×${escapeHtml(String(player.mutation_luck ?? 1))}</strong>
        </p>
        <div class="admin-control">
          <input id="mutationLuck" type="number" min="1" max="100000" step="1" value="${escapeHtml(String(player.mutation_luck ?? 1))}" aria-label="Mutation luck multiplier">
          <button class="btn btn--primary" data-action="mutation-luck" type="button">Set mutation luck</button>
        </div>
      </section>

      <section class="admin-section">
        <h3>Potions</h3>
        <div class="admin-control">
          <select id="potionId">${consumables.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select>
          <input id="potionAmount" type="number" min="1" step="1" value="1" aria-label="Quantity">
          <button class="btn btn--primary" data-action="potion-add" type="button">Grant</button>
          <button class="btn btn--danger" data-action="potion-remove" type="button">Remove</button>
        </div>
        <div class="admin-list" style="margin-top:12px">
          ${(player.consumables ?? []).map((item) => row(
            getConsumableById(item.consumable_id)?.name ?? item.consumable_id,
            `×${formatCount(item.quantity)}`
          )).join("") || row("Owned potions", "None")}
        </div>
      </section>

      <section class="admin-section admin-section--advanced">
        <h3>Advanced Player Actions</h3>
        <div class="admin-advanced-grid">
          <label class="field"><span>Coins Δ</span><input id="coinsAmount" type="number" step="1" value="0"></label>
          <button class="btn btn--primary" data-action="coins" type="button">Apply coins</button>
          <label class="field"><span>Capacity Δ</span><input id="capacityAmount" type="number" step="1" value="10"></label>
          <button class="btn btn--primary" data-action="capacity" type="button">Apply slots</button>
          <label class="field"><span>Total rolls Δ</span><input id="rollsAmount" type="number" step="1" value="1"></label>
          <button class="btn btn--primary" data-action="rolls" type="button">Apply rolls</button>
        </div>
        <div class="admin-advanced-row">
          <select id="boostFamily">
            <option value="luck">Luck</option>
            <option value="rollSpeed">Roll Speed</option>
            <option value="weightLuck">Weight Luck</option>
            <option value="weightMultiplier">Weight Multiplier</option>
          </select>
          <input id="boostEffect" type="number" min="0.0001" step="0.01" value="1" placeholder="Effect">
          <input id="boostSeconds" type="number" min="1" step="60" value="3600" placeholder="Seconds">
          <button class="btn btn--primary" data-action="boost" type="button">Apply boost</button>
        </div>
        <div class="admin-advanced-row">
          <input id="allPotionQuantity" type="number" min="1" step="1" value="10" placeholder="Quantity">
          <button class="btn" data-action="grant-all-potions" type="button">Grant every potion</button>
          <button class="btn" data-action="grant-all-gems" type="button">Grant every gem</button>
          <button class="btn btn--danger" data-action="clear-inventory" type="button">Clear inventory</button>
        </div>
        <div class="admin-advanced-row">
          <select id="oneRollConsumable" aria-label="One-roll potion">
            <option value="legendary-potion">Legendary potion · +1,000 luck</option>
            <option value="mythic-potion">Mythic potion · +10,000 luck</option>
          </select>
          <input id="oneRollEffect" type="number" min="1" max="1000000" step="1" value="1000" aria-label="One-roll luck">
          <button class="btn" data-action="one-roll-boost" type="button">Grant one-roll boost</button>
        </div>
      </section>

      <section class="admin-section">
        <h3>Account Controls</h3>
        ${player.leaderboard_hidden ? '<p class="admin-note">Hidden from every leaderboard.</p>' : ""}
        <div class="admin-button-row">
          <button class="btn" data-action="reset-cooldown" type="button">Reset roll cooldown</button>
          <button class="btn ${player.leaderboard_hidden ? "btn--primary" : ""}" data-action="leaderboard-visibility" data-hidden="${player.leaderboard_hidden ? "true" : "false"}" type="button">
            ${player.leaderboard_hidden ? "Show on leaderboard" : "Hide from leaderboard"}
          </button>
          <button class="btn btn--danger" data-action="account-lock" data-locked="${locked}" type="button">
            ${locked ? "Unlock account" : "Lock account"}
          </button>
        </div>
      </section>

      <section class="admin-section">
        <h3>Active Boosts</h3>
        <div class="admin-list">
          ${(player.boosts ?? []).map((boost) => row(
            `${boost.family} · Tier ${boost.tier}`,
            `${Number(boost.effect_value) * 100}% · ${new Date(boost.expires_at).toLocaleString()}`
          )).join("") || row("Active boosts", "None")}
        </div>
      </section>

      <section class="admin-section admin-section--wide">
        <h3>Recent Gems</h3>
        <div class="admin-list">
          ${(data.gems ?? []).map((gem) => `
            <div class="admin-list-row admin-gem-row">
              <span>
                <strong>${escapeHtml(gem.gem_name)}</strong>
                <small>${escapeHtml(formatWeight(gem.final_weight))} · ${escapeHtml(formatMoney(gem.value))}${gem.locked ? " · Locked" : ""}${Array.isArray(gem.mutation_ids) && gem.mutation_ids.length ? ` · ${escapeHtml(gem.mutation_ids.join(" · "))}` : ""}</small>
              </span>
              <button class="btn btn--danger btn--small" data-action="delete-gem" data-specimen="${escapeHtml(gem.id)}" type="button">Delete</button>
            </div>
          `).join("") || row("Inventory", "Empty")}
        </div>
      </section>

      <section class="admin-section admin-section--wide">
        <h3>Equipment</h3>
        <div class="admin-list">
          ${(data.equipment ?? []).map((item) => row(
            item.name ?? item.equipment_id,
            `Tier ${item.tier} · ${item.equipped ? "Equipped" : "Unequipped"}`
          )).join("") || row("Equipment", "None")}
        </div>
      </section>
    </div>
  `;

  wirePlayerActions();
}

function stat(label, value) {
  return `<div class="admin-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function row(label, value) {
  return `<div class="admin-list-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function wirePlayerActions() {
  for (const button of playerPanel.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => runPlayerAction(button));
  }
}

async function runPlayerAction(button) {
  const action = button.dataset.action;
  let request;

  if (action === "player-title-set") {
    const title = document.getElementById("playerTitle")?.value.trim() || "";
    const color = document.getElementById("playerTitleColor")?.value || "#ffd166";
    if (!title) { notify.error("Title required", "Enter a title or use Remove Title."); return; }
    request = ["player_title_set", { title, color }];
  } else if (action === "player-title-remove") {
    request = ["player_title_remove", {}];
  } else if (action === "money-add" || action === "money-remove") {
    const value = Math.abs(Number(document.getElementById("moneyAmount").value));
    request = ["money", { amount: action === "money-add" ? value : -value }];
  } else if (action === "grant-gem") {
    const mutationIds = [...document.querySelectorAll(".gemMutation:checked")]
      .map((box) => box.value);
    request = ["grant_gem", {
      gemName: document.getElementById("gemName").value,
      weightMultiplier: Number(document.getElementById("gemWeight").value),
      mutationIds
    }];
  } else if (action === "mutation-luck") {
    request = ["mutation_luck", {
      mutationLuck: Number(document.getElementById("mutationLuck").value)
    }];
  } else if (action === "coins") {
    request = ["coins", {
      amount: Number(document.getElementById("coinsAmount").value)
    }];
  } else if (action === "capacity") {
    request = ["capacity", {
      amount: Math.trunc(Number(document.getElementById("capacityAmount").value))
    }];
  } else if (action === "rolls") {
    request = ["rolls", {
      amount: Math.trunc(Number(document.getElementById("rollsAmount").value))
    }];
  } else if (action === "boost") {
    request = ["boost", {
      family: document.getElementById("boostFamily").value,
      effect: Number(document.getElementById("boostEffect").value),
      seconds: Math.trunc(Number(document.getElementById("boostSeconds").value))
    }];
  } else if (action === "grant-all-potions") {
    request = ["grant_all_potions", {
      quantity: Math.trunc(Number(document.getElementById("allPotionQuantity").value))
    }];
  } else if (action === "grant-all-gems") {
    const mutationIds = [...document.querySelectorAll(".gemMutation:checked")]
      .map((box) => box.value);
    request = ["grant_all_gems", {
      mutationIds
    }];
  } else if (action === "one-roll-boost") {
    request = ["one_roll_boost", {
      consumableId: document.getElementById("oneRollConsumable").value,
      effectValue: Number(document.getElementById("oneRollEffect").value)
    }];
  } else if (action === "clear-inventory") {
    if (!window.confirm("Delete every gem in this player's inventory? This cannot be undone.")) return;
    request = ["clear_inventory", {}];
  } else if (action === "delete-gem") {
    if (!window.confirm("Delete this gem permanently?")) return;
    request = ["delete_gem", {
      specimenId: button.dataset.specimen
    }];
  } else if (action === "potion-add" || action === "potion-remove") {
    const value = Math.abs(Math.trunc(Number(document.getElementById("potionAmount").value)));
    request = ["potion", {
      consumableId: document.getElementById("potionId").value,
      amount: action === "potion-add" ? value : -value
    }];
  } else if (action === "reset-cooldown") {
    request = ["reset_cooldown", {}];
  } else if (action === "leaderboard-visibility") {
    const currentlyHidden = button.dataset.hidden === "true";
    request = ["leaderboard_visibility", { hidden: !currentlyHidden }];
  } else if (action === "account-lock") {
    const currentlyLocked = button.dataset.locked === "true";
    if (!currentlyLocked && !window.confirm("Lock this player account?")) return;
    request = ["account_lock", { locked: !currentlyLocked }];
  }

  if (!request) return;
  button.disabled = true;
  const { error } = await adminRequest(request[0], {
    targetId: selectedPlayerId,
    ...request[1]
  });

  if (error) {
    notify.error("Admin action failed", error.message);
    button.disabled = false;
    return;
  }

  notify.success("Admin action complete", "The player record was updated.");
  await inspectPlayer(selectedPlayerId);
}




async function loadMutationCatalog() {
  if (!mutationCatalogPanel) return;

  mutationCatalogPanel.hidden = false;
  mutationCatalogList.innerHTML = '<p class="page-head__sub">Loading mutations…</p>';

  const { data, error } = await adminRequest("mutation_list", { targetId: null });

  if (error) {
    mutationCatalogList.innerHTML = `<p class="page-head__sub">${escapeHtml(error.message)}</p>`;
    return;
  }

  const mutations = data?.mutations ?? [];

  mutationCatalogList.innerHTML = mutations.map((mutation) => `
    <div class="admin-mutation-row">
      <div class="admin-mutation-preview" style="--mutation-color:${escapeHtml(mutation.color)}">
        <span class="admin-mutation-icon">${escapeHtml(mutation.icon)}</span>
        <div>
          <strong>${escapeHtml(mutation.name)}</strong>
          <span>${escapeHtml(mutation.id)} · 1 in ${Number(mutation.chance).toLocaleString()} · ×${Number(mutation.multiplier).toLocaleString()}</span>
        </div>
      </div>
      <div class="admin-button-row">
        <button class="btn btn--small" type="button" data-mutation-edit="${escapeHtml(mutation.id)}">Edit</button>
        <button class="btn btn--small" type="button" data-mutation-toggle="${escapeHtml(mutation.id)}" data-enabled="${mutation.enabled}">${mutation.enabled ? "Disable" : "Enable"}</button>
        <button class="btn btn--danger btn--small" type="button" data-mutation-delete="${escapeHtml(mutation.id)}">Delete</button>
      </div>
    </div>
  `).join("") || '<p class="page-head__sub">No mutations configured.</p>';

  for (const button of mutationCatalogList.querySelectorAll("[data-mutation-edit]")) {
    button.addEventListener("click", () => {
      const mutation = mutations.find((item) => item.id === button.dataset.mutationEdit);
      if (!mutation) return;
      document.getElementById("mutationId").value = mutation.id;
      document.getElementById("mutationName").value = mutation.name;
      document.getElementById("mutationChance").value = mutation.chance;
      document.getElementById("mutationMultiplier").value = mutation.multiplier;
      document.getElementById("mutationIcon").value = mutation.icon || "✦";
      document.getElementById("mutationColor").value = mutation.color || "#9fdcff";
      document.getElementById("mutationSort").value = mutation.sort_order ?? 0;
      document.getElementById("mutationDescription").value = mutation.description || "";
      document.getElementById("mutationEnabled").checked = mutation.enabled !== false;
      mutationCatalogPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  for (const button of mutationCatalogList.querySelectorAll("[data-mutation-toggle]")) {
    button.addEventListener("click", async () => {
      const mutation = mutations.find((item) => item.id === button.dataset.mutationToggle);
      if (!mutation) return;
      button.disabled = true;
      const { error: toggleError } = await adminRequest("mutation_save", {
        targetId: null,
        mutation: { ...mutation, enabled: mutation.enabled !== true }
      });
      if (toggleError) notify.error("Mutation update failed", toggleError.message);
      await loadMutationCatalog();
    });
  }

  for (const button of mutationCatalogList.querySelectorAll("[data-mutation-delete]")) {
    button.addEventListener("click", async () => {
      const id = button.dataset.mutationDelete;
      if (!window.confirm(`Delete mutation ${id}? Existing gems keep their saved mutation id, but future rolls will stop using it.`)) return;
      button.disabled = true;
      const { error: deleteError } = await adminRequest("mutation_delete", { targetId: null, id });
      if (deleteError) notify.error("Mutation deletion failed", deleteError.message);
      await loadMutationCatalog();
    });
  }
}

mutationCatalogRefresh?.addEventListener("click", loadMutationCatalog);
document.getElementById("mutationSave")?.addEventListener("click", async () => {
  const mutation = {
    id: document.getElementById("mutationId").value.trim(),
    name: document.getElementById("mutationName").value.trim(),
    chance: Number(document.getElementById("mutationChance").value),
    multiplier: Number(document.getElementById("mutationMultiplier").value),
    icon: document.getElementById("mutationIcon").value,
    color: document.getElementById("mutationColor").value,
    sort_order: Number(document.getElementById("mutationSort").value || 0),
    description: document.getElementById("mutationDescription").value,
    enabled: document.getElementById("mutationEnabled").checked
  };

  const { error } = await adminRequest("mutation_save", { targetId: null, mutation });
  if (error) {
    notify.error("Mutation save failed", error.message);
    return;
  }

  notify.success("Mutation saved", `${mutation.name} is now in the mutation catalog.`);
  await loadMutationCatalog();
});

document.getElementById("mutationClear")?.addEventListener("click", () => {
  ["mutationId", "mutationName", "mutationDescription"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  document.getElementById("mutationChance").value = "1000";
  document.getElementById("mutationMultiplier").value = "3";
  document.getElementById("mutationIcon").value = "✦";
  document.getElementById("mutationColor").value = "#9fdcff";
  document.getElementById("mutationSort").value = "60";
  document.getElementById("mutationEnabled").checked = true;
});

analyticsButton?.addEventListener("click", loadAnalytics);
analyticsRefresh?.addEventListener("click", loadAnalytics);

async function loadAnalytics() {
  if (!analyticsPanel || !analyticsContent) return;

  analyticsButton.disabled = true;
  analyticsRefresh.disabled = true;
  analyticsContent.innerHTML = '<div class="skeleton" style="height:220px"></div>';

  // Analytics is a global admin view, not a player action. Prefer the
  // dedicated SECURITY DEFINER RPC so a stale targetPlayerId can never make
  // the analytics request look like an invalid-player request. The Edge
  // Function remains the compatibility fallback for older deployments.
  let data = null;
  let error = null;

  const rpcResult = await supabase.rpc("get_admin_analytics");
  if (!rpcResult.error && rpcResult.data) {
    data = rpcResult.data;
  } else {
    const fallback = await adminRequest("analytics", { targetId: null });
    data = fallback.data;
    error = fallback.error;
  }

  analyticsButton.disabled = false;
  analyticsRefresh.disabled = false;

  if (error || !data) {
    analyticsPanel.hidden = false;
    analyticsContent.innerHTML = `
      <div class="analytics-error">
        <strong>Analytics could not be loaded.</strong>
        <span>${escapeHtml(error?.message ?? "The analytics service returned no data.")}</span>
      </div>`;
    notify.error("Analytics failed", error?.message ?? "No analytics data returned.");
    return;
  }

  analyticsPanel.hidden = false;
  document.getElementById("analyticsGenerated").textContent =
    `Generated ${new Date(data.generatedAt ?? Date.now()).toLocaleString()}`;

  const cards = [
    ["Players", formatCount(data.players)],
    ["Current online", formatCount(data.currentOnline ?? 0)],
    ["Daily online", formatCount(data.dailyOnline ?? 0)],
    ["Weekly online", formatCount(data.weeklyOnline ?? 0)],
    ["D1 retention", `${Number(data.retention1d ?? 0).toFixed(1)}%`],
    ["D7 retention", `${Number(data.retention7d ?? 0).toFixed(1)}%`],
    ["Total rolls", formatCount(data.totalRolls)],
    ["Inventory gems", formatCount(data.totalInventoryGems)],
    ["Mutated gems", `${formatCount(data.mutatedGems)} (${(Number(data.mutationRate || 0) * 100).toFixed(2)}%)`],
    ["Money in economy", formatMoney(data.totalMoney)],
    ["Inventory value", formatMoney(data.totalInventoryValue)],
    ["Rare announcements", formatCount(data.rareAnnouncements ?? 0)],
    ["Mutation coverage", `${(Number(data.announcementMutationCoverage ?? 1) * 100).toFixed(2)}%`],
    ["Pending one-roll boosts", formatCount(data.pendingOneRollBoosts ?? 0)]
  ];

  const row = (label, value) =>
    `<div class="admin-list-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  analyticsContent.innerHTML = `
    <div class="analytics-cards">
      ${cards.map(([label, value]) =>
        `<div class="analytics-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      ).join("")}
    </div>

    <div class="analytics-columns">
      <section class="admin-section">
        <h3>Most Rolled Gems</h3>
        <div class="admin-list">
          ${(data.topGems ?? []).map(item => row(item.name, formatCount(item.count))).join("") || row("No data", "—")}
        </div>
      </section>

      <section class="admin-section">
        <h3>Mutation Distribution</h3>
        <div class="admin-list">
          ${(data.mutations ?? []).map(item => row(item.name, formatCount(item.count))).join("") || row("No mutations recorded", "—")}
        </div>
      </section>

      <section class="admin-section">
        <h3>Active Boosts</h3>
        <div class="admin-list">
          ${Object.entries(data.activeBoosts ?? {}).map(([family, count]) => row(family, formatCount(count))).join("") || row("No active boosts", "—")}
        </div>
      </section>

      <section class="admin-section">
        <h3>Announcement Mutation Health</h3>
        <div class="admin-list">
          ${row("Announcements with mutations", formatCount(data.announcementsWithMutations ?? 0))}
          ${row("Announcements still empty", formatCount(data.emptyAnnouncementMutations ?? 0))}
          ${row("Coverage", `${(Number(data.announcementMutationCoverage ?? 1) * 100).toFixed(2)}%`)}
        </div>
      </section>
    </div>

    <section class="admin-section analytics-hourly">
      <div class="admin-section-head">
        <div>
          <h3>Hourly Online Users</h3>
          <p class="page-head__sub">Distinct users seen in each hour over the last 24 hours.</p>
        </div>
      </div>
      <div class="analytics-bars">
        ${(data.hourlyOnline ?? []).slice().reverse().map((point) => {
          const max = Math.max(1, ...(data.hourlyOnline ?? []).map((item) => Number(item.users || 0)));
          const height = Math.max(4, Math.round(Number(point.users || 0) / max * 100));
          const hour = new Date(point.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return `<div class="analytics-bar-wrap" title="${escapeHtml(hour)} · ${formatCount(point.users)} users"><div class="analytics-bar" style="height:${height}%"></div><span>${escapeHtml(hour)}</span></div>`;
        }).join("") || '<p class="page-head__sub">Presence data will appear after players visit the site.</p>'}
      </div>
    </section>`;
}
async function loadAudit() {
  auditButton.disabled = true;
  const { data, error } = await adminRequest("audit");
  auditButton.disabled = false;
  if (error) {
    notify.error("Could not load audit log", error.message);
    return;
  }

  playerPanel.classList.add("hidden");
  auditPanel.classList.remove("hidden");
  auditPanel.innerHTML = `
    <section class="admin-section">
      <h2>Recent Administrative Actions</h2>
      <div style="overflow:auto">
        <table class="audit-table">
          <thead><tr><th>Time</th><th>Action</th><th>Player</th><th>Details</th></tr></thead>
          <tbody>${(data.entries ?? []).map((entry) => `
            <tr>
              <td>${escapeHtml(new Date(entry.created_at).toLocaleString())}</td>
              <td>${escapeHtml(entry.action)}</td>
              <td>${escapeHtml(entry.target_player_id ?? "—")}</td>
              <td>${escapeHtml(JSON.stringify(entry.details ?? {}))}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>`;
}

function wireCodes() {
  const panel = document.getElementById("codesPanel");
  const createButton = document.getElementById("codeCreate");
  const refreshButton = document.getElementById("codesRefresh");

  panel.hidden = false;
  document.getElementById("codePotionAdd").addEventListener("click", () => addCodePotionRow());

  document.getElementById("newCode").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  });

  createButton.addEventListener("click", createCode);
  refreshButton.addEventListener("click", loadCodes);
  loadCodes();
}

function addCodePotionRow(reward = {}) {
  const row = document.createElement("div");
  row.className = "code-potion-row";
  row.innerHTML = `
    <label class="field"><span>Potion</span><select class="code-potion-id">${consumables.map((item) =>
      `<option value="${escapeHtml(item.id)}"${item.id === reward.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`
    ).join("")}</select></label>
    <label class="field"><span>Quantity</span><input class="code-potion-quantity" type="number" min="1" step="1" value="${Math.max(1, Number(reward.quantity) || 1)}"></label>
    <button class="btn btn--danger code-potion-remove" type="button">Remove</button>`;
  row.querySelector(".code-potion-remove").addEventListener("click", () => row.remove());
  document.getElementById("codePotionRows").appendChild(row);
}

function readCodePotionRewards() {
  const combined = new Map();
  for (const row of document.querySelectorAll(".code-potion-row")) {
    const id = row.querySelector(".code-potion-id").value;
    const quantity = Math.max(1, Math.trunc(Number(row.querySelector(".code-potion-quantity").value) || 1));
    combined.set(id, (combined.get(id) || 0) + quantity);
  }
  return [...combined].map(([id, quantity]) => ({ id, quantity }));
}

async function tryWireAdminEvents() {
  const { data: allowed, error } = await canManageAdminEvents();
  if (error || !allowed) return;

  const panel = document.getElementById("eventsPanel");
  panel.hidden = false;
  document.getElementById("eventStart").addEventListener("click", startEvent);
  document.getElementById("eventsRefresh").addEventListener("click", loadEvents);
  await loadEvents();
}

async function startEvent() {
  const button = document.getElementById("eventStart");
  const event = {
    name: document.getElementById("eventName").value.trim(),
    durationMinutes: Math.trunc(Number(document.getElementById("eventDuration").value)),
    luckBonus: Math.max(0, Number(document.getElementById("eventLuck").value) || 0) / 100,
    rollSpeedBonus: Math.max(0, Number(document.getElementById("eventRollSpeed").value) || 0) / 100,
    weightLuckBonus: Math.max(0, Number(document.getElementById("eventWeightLuck").value) || 0) / 100,
    weightMultiplierBonus: Math.max(0, Number(document.getElementById("eventWeightMultiplier").value) || 0) / 100,
    luckMultiplier: readEventMultiplier("eventLuckMultiplier"),
    rollSpeedMultiplier: readEventMultiplier("eventRollSpeedMultiplier"),
    weightLuckMultiplier: readEventMultiplier("eventWeightLuckMultiplier"),
    weightMultiplierMultiplier: readEventMultiplier("eventWeightMultiplierMultiplier")
  };

  if (event.name.length < 3) {
    notify.error("Invalid event", "Enter an event name of at least three characters.");
    return;
  }
  if (!Number.isFinite(event.durationMinutes) || event.durationMinutes < 1 || event.durationMinutes > 10080) {
    notify.error("Invalid duration", "Choose between 1 minute and 7 days.");
    return;
  }
  const multipliers = [
    event.luckMultiplier,
    event.rollSpeedMultiplier,
    event.weightLuckMultiplier,
    event.weightMultiplierMultiplier
  ];
  if (multipliers.some((value) => !Number.isFinite(value) || value < 0.01 || value > 10000)) {
    notify.error("Invalid multiplier", "Multipliers must be between 0.01× and 10,000×.");
    return;
  }
  if (
    event.luckBonus + event.rollSpeedBonus + event.weightLuckBonus + event.weightMultiplierBonus <= 0 &&
    multipliers.every((value) => value === 1)
  ) {
    notify.error("No boosts", "Set an additive bonus or change at least one multiplier.");
    return;
  }
  if (!window.confirm(`Start ${event.name} now? This will stop any currently active event.`)) return;

  button.disabled = true;
  const { error } = await startAdminEvent(event);
  button.disabled = false;

  if (error) {
    notify.error("Could not start event", error.message);
    return;
  }

  document.getElementById("eventName").value = "";
  notify.success("Event started", `${event.name} is now active for every player.`);
  await loadEvents();
}

async function loadEvents() {
  const list = document.getElementById("eventsList");
  const { data, error } = await loadAdminEvents();

  if (error) {
    list.innerHTML = `<p class="page-head__sub">Could not load events.</p>`;
    return;
  }

  const now = Date.now();
  list.innerHTML = (data ?? []).map((event) => {
    const running = event.active && new Date(event.ends_at).getTime() > now;
    const boosts = [
      Number(event.luck_bonus) > 0 ? `+${formatPercent(event.luck_bonus)} Luck` : null,
      Number(event.roll_speed_bonus) > 0 ? `+${formatPercent(event.roll_speed_bonus)} Roll speed` : null,
      Number(event.weight_luck_bonus) > 0 ? `+${formatPercent(event.weight_luck_bonus)} Weight luck` : null,
      Number(event.weight_multiplier_bonus) > 0 ? `+${formatPercent(event.weight_multiplier_bonus)} Weight multiplier` : null,
      Number(event.luck_multiplier) !== 1 ? `${formatEventMultiplier(event.luck_multiplier)} Luck` : null,
      Number(event.roll_speed_multiplier) !== 1 ? `${formatEventMultiplier(event.roll_speed_multiplier)} Roll speed` : null,
      Number(event.weight_luck_multiplier) !== 1 ? `${formatEventMultiplier(event.weight_luck_multiplier)} Weight luck` : null,
      Number(event.weight_multiplier_multiplier) !== 1 ? `${formatEventMultiplier(event.weight_multiplier_multiplier)} Weight multiplier` : null
    ].filter(Boolean).join(" · ");

    return `<div class="admin-event-row">
      <div><strong>${escapeHtml(event.name)}</strong><span>${escapeHtml(boosts)}</span></div>
      <div><span>${running ? "Active" : "Ended"}</span><span>${escapeHtml(new Date(event.ends_at).toLocaleString())}</span></div>
      ${running ? `<button class="btn btn--danger" data-event-stop="${escapeHtml(event.id)}" type="button">Stop event</button>` : ""}
    </div>`;
  }).join("") || `<p class="page-head__sub">No events have been run yet.</p>`;

  for (const button of list.querySelectorAll("[data-event-stop]")) {
    button.addEventListener("click", async () => {
      if (!window.confirm("Stop this event immediately?")) return;
      button.disabled = true;
      const { error: stopError } = await stopAdminEvent(button.dataset.eventStop);
      if (stopError) notify.error("Could not stop event", stopError.message);
      else {
        notify.success("Event stopped", "The global boosts are no longer active.");
        await loadEvents();
      }
    });
  }
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function readEventMultiplier(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 1;
}

function formatEventMultiplier(value) {
  return `×${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

async function createCode() {
  const button = document.getElementById("codeCreate");
  const code = document.getElementById("newCode").value.trim();
  const moneyReward = Math.max(0, Number(document.getElementById("codeMoney").value) || 0);
  const consumableRewards = readCodePotionRewards();
  const expiresValue = document.getElementById("codeExpires").value;
  const limitValue = document.getElementById("codeLimit").value;

  if (code.length < 3) {
    notify.error("Invalid code", "Use at least three letters or numbers.");
    return;
  }
  if (moneyReward <= 0 && consumableRewards.length === 0) {
    notify.error("No rewards", "Add money, a potion reward, or both.");
    return;
  }

  button.disabled = true;
  const { error } = await createAdminCode({
    code,
    moneyReward,
    consumableRewards,
    expiresAt: expiresValue ? new Date(expiresValue).toISOString() : null,
    maxRedemptions: limitValue ? Math.max(1, Math.trunc(Number(limitValue))) : null
  });
  button.disabled = false;

  if (error) {
    notify.error("Could not create code", error.message);
    return;
  }

  document.getElementById("newCode").value = "";
  document.getElementById("codePotionRows").innerHTML = "";
  notify.success("Code created", `${code} is ready to redeem.`);
  await loadCodes();
}

async function loadCodes() {
  const list = document.getElementById("codesList");
  const { data, error } = await loadAdminCodes();

  if (error) {
    list.innerHTML = `<p class="page-head__sub">Could not load codes.</p>`;
    return;
  }

  list.innerHTML = (data ?? []).map((code) => {
    const potionRewards = Array.isArray(code.consumable_rewards) && code.consumable_rewards.length
      ? code.consumable_rewards
      : (code.consumable_id ? [{ id: code.consumable_id, quantity: code.consumable_quantity }] : []);
    const rewards = [
      Number(code.money_reward) > 0 ? formatMoney(code.money_reward) : null,
      ...potionRewards.map((reward) => `${formatCount(reward.quantity)}× ${getConsumableById(reward.id)?.name ?? reward.id}`)
    ].filter(Boolean).join(" + ");
    const limit = code.max_redemptions == null
      ? `${formatCount(code.redemption_count)} uses`
      : `${formatCount(code.redemption_count)} / ${formatCount(code.max_redemptions)} uses`;
    const expiry = code.expires_at
      ? `Expires ${new Date(code.expires_at).toLocaleString()}`
      : "No expiry";

    return `<div class="admin-code-row">
      <div><strong>${escapeHtml(code.code)}</strong><span>${escapeHtml(rewards)}</span></div>
      <div><span>${escapeHtml(limit)}</span><span>${escapeHtml(expiry)}</span></div>
      <div class="admin-code-actions">
        <button class="btn ${code.active ? "btn--danger" : "btn--primary"}"
          data-code-toggle="${escapeHtml(code.id)}" data-code-active="${code.active}" type="button">
          ${code.active ? "Disable" : "Enable"}
        </button>
        <button class="btn btn--danger" data-code-delete="${escapeHtml(code.id)}"
          data-code-name="${escapeHtml(code.code)}" type="button">Delete</button>
      </div>
    </div>`;
  }).join("") || `<p class="page-head__sub">No codes created yet.</p>`;

  for (const button of list.querySelectorAll("[data-code-toggle]")) {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const active = button.dataset.codeActive !== "true";
      const { error: toggleError } = await setAdminCodeActive(button.dataset.codeToggle, active);
      if (toggleError) notify.error("Could not update code", toggleError.message);
      else await loadCodes();
    });
  }

  for (const button of list.querySelectorAll("[data-code-delete]")) {
    button.addEventListener("click", async () => {
      const codeName = button.dataset.codeName;
      if (!window.confirm(`Permanently delete code ${codeName} and its redemption history?`)) return;

      button.disabled = true;
      const { data: deleted, error: deleteError } = await deleteAdminCode(button.dataset.codeDelete);

      if (deleteError || !deleted) {
        notify.error("Could not delete code", deleteError?.message ?? "The code no longer exists.");
        button.disabled = false;
        return;
      }

      notify.success("Code deleted", `${codeName} was permanently deleted.`);
      await loadCodes();
    });
  }
}


// =========================================================
// MAIN PAGE SECTION CONTROLS
// =========================================================

async function loadSectionControls() {
  const panel = document.getElementById("sectionControlsPanel");
  const list = document.getElementById("sectionControlsList");
  if (!panel || !list) return;
  panel.hidden = false;
  const { data, error } = await adminRequest("section_settings");
  if (error) {
    list.innerHTML = `<p class="page-head__sub">${escapeHtml(error.message)}</p>`;
    return;
  }
  list.innerHTML = (data.sections ?? []).map(section => `
    <div class="section-control-row">
      <div><strong>${escapeHtml(section.label)}</strong><span>${escapeHtml(section.description || "")}</span></div>
      <div class="section-control-actions">
        <button class="btn ${section.enabled ? "btn--primary" : ""}" data-section-id="${escapeHtml(section.id)}" data-section-enabled="${section.enabled}">
          ${section.enabled ? "Enabled" : "Disabled"}
        </button>
        <button class="btn ${section.admin_only ? "btn--primary" : ""}" data-section-admin-id="${escapeHtml(section.id)}" data-section-admin-only="${section.admin_only}">
          ${section.admin_only ? "Admins only" : "Public"}
        </button>
      </div>
    </div>
  `).join("") || `<p class="page-head__sub">No configurable sections.</p>`;

  for (const button of list.querySelectorAll("[data-section-admin-id]")) {
    button.onclick = async () => {
      button.disabled = true;
      const adminOnly = button.dataset.sectionAdminOnly !== "true";
      const { error: toggleError } = await adminRequest("section_access_toggle", { id: button.dataset.sectionAdminId, adminOnly });
      if (toggleError) {
        notify.error("Could not change feature access", toggleError.message);
        button.disabled = false;
      } else {
        await loadSectionControls();
        notify.success(adminOnly ? "Feature restricted" : "Feature made public", adminOnly ? "Only administrators will see this section." : "The section is public again.");
      }
    };
  }

  for (const button of list.querySelectorAll("[data-section-id]")) {
    button.onclick = async () => {
      button.disabled = true;
      const enabled = button.dataset.sectionEnabled !== "true";
      const { error: toggleError } = await adminRequest("section_toggle", { id: button.dataset.sectionId, enabled });
      if (toggleError) {
        notify.error("Could not change section", toggleError.message);
        button.disabled = false;
      } else {
        await loadSectionControls();
        notify.success(enabled ? "Section enabled" : "Section disabled", "The main page will update on its next load.");
      }
    };
  }
}

async function startMutationLuckEvent() {
  const button = document.getElementById("mutationEventStart");
  const event = {
    name: document.getElementById("mutationEventName").value.trim(),
    durationMinutes: Math.trunc(Number(document.getElementById("mutationEventDuration").value)),
    mutationLuckBonus: Math.max(0, Number(document.getElementById("mutationEventBonus").value) || 0),
    mutationLuckMultiplier: Math.max(0.01, Number(document.getElementById("mutationEventMultiplier").value) || 1)
  };
  if (event.name.length < 3 || !Number.isFinite(event.durationMinutes) || event.durationMinutes < 1 || event.durationMinutes > 10080) {
    notify.error("Invalid mutation event", "Use a name and a duration between 1 minute and 7 days.");
    return;
  }
  button.disabled = true;
  const { error } = await adminRequest("start_mutation_event", event);
  button.disabled = false;
  if (error) {
    notify.error("Could not start mutation event", error.message);
    return;
  }
  notify.success("Mutation Surge started", `${event.mutationLuckMultiplier}× mutation luck for ${event.durationMinutes} minutes.`);
  document.getElementById("mutationEventsPanel").hidden = false;
}

async function wireMutationEvents() {
  const panel = document.getElementById("mutationEventsPanel");
  if (!panel) return;
  panel.hidden = false;
  document.getElementById("mutationEventStart").addEventListener("click", startMutationLuckEvent);
}

// =========================================================
// ANNOUNCEMENTS (admin only)
// =========================================================

function wireAnnouncements() {
  const panel = document.getElementById("announcePanel");

  if (!panel) {
    return;
  }

  panel.hidden = false;

  const body = document.getElementById("announceBody");
  const tone = document.getElementById("announceTone");
  const postButton = document.getElementById("announcePost");
  const clearButton = document.getElementById("announceClear");
  const announceStatus = document.getElementById("announceStatus");

  postButton.addEventListener("click", async () => {
    const text = body.value.trim();

    if (!text) {
      notify.error("Nothing to post", "Write a message first.");
      return;
    }

    postButton.disabled = true;

    const { error } = await supabase.rpc("post_announcement", {
      p_body: text,
      p_tone: tone.value
    });

    postButton.disabled = false;

    if (error) {
      notify.error("Could not post", error.message);
      announceStatus.textContent = "";
      announceStatus.classList.add("error");
      return;
    }

    body.value = "";
    announceStatus.classList.remove("error");
    announceStatus.textContent = "Announcement posted.";
    notify.success("Posted", "Players see it at the top of the game.");
  });

  clearButton.addEventListener("click", async () => {
    if (!window.confirm("Clear all active announcements?")) {
      return;
    }

    clearButton.disabled = true;

    const { data, error } = await supabase.rpc("clear_announcements", {});

    clearButton.disabled = false;

    if (error) {
      notify.error("Could not clear", error.message);
      return;
    }

    announceStatus.classList.remove("error");
    announceStatus.textContent = `Cleared ${data ?? 0} announcement(s).`;
    notify.success("Cleared", "No announcements are showing now.");
  });
}


searchButton.addEventListener("click", searchPlayers);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlayers();
});
auditButton.addEventListener("click", loadAudit);

const user = await ensurePlayerAuth();

// Admin status comes from the server, not a hardcoded id. Every
// admin action is enforced server-side regardless, so this only
// controls what the page shows.
const { data: whoami } = user ? await adminRequest("whoami") : { data: null };

if (!user || !whoami?.isAdmin) {
  status.textContent = "You do not have permission to use this page.";
  notify.error("Access denied", "Administrator access is required.");
} else {
  const { data: ownPlayer } = await supabase
    .from("players")
    .select("money")
    .eq("id", user.id)
    .maybeSingle();
  shell.setWallet(ownPlayer?.money ?? null);
  status.textContent = "Administrator access verified.";
  searchButton.disabled = false;
  auditButton.disabled = false;
  analyticsButton.disabled = false;
  if (featureLabButton) featureLabButton.disabled = false;
  wireAnnouncements();
  wireCodes();
  tryWireAdminEvents();
  await loadSectionControls();
  await wireMutationEvents();
  await loadMutationCatalog();
  searchInput.focus();
}
