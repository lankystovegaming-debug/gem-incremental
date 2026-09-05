import { loadGemCatalog } from "../src/backend/gemCatalog.js";
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
const ipAuditButton = document.getElementById("ipAuditButton");
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
  document.querySelectorAll(".admin-search, .admin-announce, .admin-updates, .admin-codes, .admin-events, .admin-section-controls, .admin-mutation-events, .admin-analytics, .admin-shareholders, .admin-bank, .admin-ip-audit, #searchResults, #playerPanel, #auditPanel").forEach((el) => {
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

// The live gem catalog (private_feature_gems) — loaded once, lazily, and used
// for the Grant Gem dropdown so admins can grant custom/admin-created gems too.
let gemCatalog = [];

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

  // App-level ban status lives in its own SECURITY DEFINER RPC (so banning
  // needs no edge-function redeploy). Fetch it and merge onto the player.
  try {
    const { data: banRows } = await supabase.rpc("admin_get_ban", { p_target: playerId });
    const ban = Array.isArray(banRows) ? banRows[0] : banRows;
    if (ban && data.player) {
      data.player.ban_until = ban.ban_until ?? null;
      data.player.ban_reason = ban.ban_reason ?? null;
    }
  } catch { /* Ban status is best-effort; the rest of the panel still loads. */ }

  // Account creation / last sign-in come from auth.users via an admin-gated
  // RPC (the client can't read the auth schema directly).
  try {
    const { data: metaRows } = await supabase.rpc("admin_get_account_meta", { p_target: playerId });
    const meta = Array.isArray(metaRows) ? metaRows[0] : metaRows;
    if (meta && data.player) {
      data.player.created_at = meta.created_at ?? null;
      data.player.last_sign_in_at = meta.last_sign_in_at ?? null;
      data.player.last_ip = meta.last_ip ?? null;
      data.player.last_ip_at = meta.last_ip_at ?? null;
    }
  } catch { /* Account meta is best-effort; the rest of the panel still loads. */ }

  // Ensure the live gem catalog is loaded before rendering the Grant Gem
  // dropdown (best-effort: an empty catalog just yields an empty select).
  if (!gemCatalog.length) {
    try { gemCatalog = await loadGemCatalog(); }
    catch (catalogError) { console.error("Gem catalog load failed:", catalogError); }
  }

  renderPlayer(data);
}

function renderPlayer(data) {
  const player = data.player;
  const locked = isLocked(player);
  const banned = player.ban_until && new Date(player.ban_until) > new Date();
  const banPermanent = banned && new Date(player.ban_until).getFullYear() > 2100;

  const fmtAccountDate = (value) => {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    const ago = days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
    return `${date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    })} · ${ago}`;
  };

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
          ${stat("Created", fmtAccountDate(player.created_at))}
          ${stat("Last seen", fmtAccountDate(player.last_sign_in_at))}
          ${stat("IP address", player.last_ip ? escapeHtml(player.last_ip) : "Not captured yet")}
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
          <select id="gemName">${gemCatalog.map((gem) => `<option>${escapeHtml(gem.name)}</option>`).join("")}</select>
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
        ${banned ? `<p class="admin-note admin-note--danger">BANNED &mdash; ${banPermanent ? "permanent" : "until " + new Date(player.ban_until).toLocaleString()} &middot; &ldquo;${escapeHtml(player.ban_reason || "No reason")}&rdquo;</p>` : ""}
        <div class="admin-button-row">
          <button class="btn" data-action="reset-cooldown" type="button">Reset roll cooldown</button>
          <button class="btn ${player.leaderboard_hidden ? "btn--primary" : ""}" data-action="leaderboard-visibility" data-hidden="${player.leaderboard_hidden ? "true" : "false"}" type="button">
            ${player.leaderboard_hidden ? "Show on leaderboard" : "Hide from leaderboard"}
          </button>
          <button class="btn btn--danger" data-action="account-lock" data-locked="${locked}" type="button">
            ${locked ? "Unlock account" : "Lock account"}
          </button>
        </div>
        <div class="admin-advanced-row" style="margin-top:12px">
          <select id="banDuration" aria-label="Ban duration">
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24" selected>1 day</option>
            <option value="72">3 days</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
            <option value="0">Permanent</option>
          </select>
          <input id="banReason" type="text" maxlength="300" placeholder="Reason shown to the player" value="${banned ? escapeHtml(player.ban_reason || "") : ""}">
          <button class="btn btn--danger" data-action="ban" type="button">${banned ? "Update ban" : "Ban / Suspend"}</button>
          ${banned ? '<button class="btn" data-action="unban" type="button">Lift ban</button>' : ""}
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

async function runBanAction(button, action) {
  if (!selectedPlayerId) return;
  let rpc, args, successMsg;

  if (action === "ban") {
    const hours = Number(document.getElementById("banDuration").value);
    const reason = document.getElementById("banReason")?.value.trim() || "";
    const label = hours === 0 ? "permanently" : `for ${hours} hour(s)`;
    if (!window.confirm(`Ban this player ${label}? They'll see a ban screen every time they open the game.`)) return;
    rpc = "admin_ban_player";
    args = { p_target: selectedPlayerId, p_hours: hours, p_reason: reason };
    successMsg = "Player banned.";
  } else {
    if (!window.confirm("Lift this player's ban?")) return;
    rpc = "admin_unban_player";
    args = { p_target: selectedPlayerId };
    successMsg = "Ban lifted.";
  }

  button.disabled = true;
  const { error } = await supabase.rpc(rpc, args);
  if (error) {
    notify.error("Ban action failed", error.message);
    button.disabled = false;
    return;
  }
  notify.success("Done", successMsg);
  await inspectPlayer(selectedPlayerId);
}

async function runPlayerAction(button) {
  const action = button.dataset.action;

  // Timed app-level bans go through SECURITY DEFINER RPCs, not the admin
  // edge function, so they work without an edge-function redeploy.
  if (action === "ban" || action === "unban") {
    await runBanAction(button, action);
    return;
  }

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

  // The fee ledger is intentionally unavailable through the public analytics
  // RPC. Only the authenticated admin Edge Function may return its totals.
  const feeResult = await adminRequest("market_fee_analytics", { targetId: null });
  const marketFees = feeResult.error ? null : feeResult.data?.fees;
  const museumResult = await adminRequest("museum_analytics", { targetId: null });
  const museum = museumResult.error ? null : museumResult.data?.museum;

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
    ["Pending one-roll boosts", formatCount(data.pendingOneRollBoosts ?? 0)],
    ...(marketFees ? [
      ["Market fees removed", formatMoney(marketFees.total ?? 0)],
      ["Listing fees", formatMoney(marketFees.listingTotal ?? 0)],
      ["Order fees", formatMoney(marketFees.orderTotal ?? 0)],
      ["Market fees · 24h", formatMoney(marketFees.last24Hours ?? 0)]
    ] : []),
    ...(museum ? [
      ["Museum curators", formatCount(museum.curators ?? 0)],
      ["Museum exhibits", formatCount(museum.exhibits ?? 0)],
      ["Permanent registrations", formatCount(museum.registrations ?? 0)],
      ["Museum Prestige", formatCount(museum.prestige ?? 0)],
      ["Museum expansion sink", formatMoney(museum.moneyRemoved ?? 0)]
    ] : [])
  ];

  const row = (label, value) =>
    `<div class="admin-list-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  // Presence series arrive oldest-first from the RPC, so they read left-to-right
  // in chronological order without reversing.
  const hourlyPoints = (data.hourlyOnline ?? []).slice();
  const dailyPoints = (data.dailyOnlineSeries ?? []).slice();
  const hourlyPeak = Math.max(0, ...hourlyPoints.map((point) => Number(point.users || 0)));
  const dailyPeak = Math.max(0, ...dailyPoints.map((point) => Number(point.users || 0)));
  const hourLabel = (point) => new Date(point.hour).toLocaleTimeString([], { hour: "2-digit" });
  const hourTooltip = (point, users) =>
    `${new Date(point.hour).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${formatCount(users)} users`;
  const dayLabel = (point) => new Date(point.day).toLocaleDateString([], { weekday: "short", day: "numeric" });
  const dayTooltip = (point, users) =>
    `${new Date(point.day).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · ${formatCount(users)} users`;

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

    <section class="admin-section analytics-charts">
      <div class="admin-section-head">
        <div>
          <h3>Online Users</h3>
          <p class="page-head__sub" data-presence-sub>Distinct users seen in each hour over the last 24 hours.</p>
        </div>
        <div class="analytics-toggle" role="tablist" aria-label="Online-users range">
          <button type="button" class="analytics-toggle__btn is-active" data-presence-view="hourly" role="tab" aria-selected="true">Hourly</button>
          <button type="button" class="analytics-toggle__btn" data-presence-view="daily" role="tab" aria-selected="false">Daily</button>
        </div>
      </div>

      <div class="analytics-chart-block" data-presence-block="hourly">
        <div class="analytics-chart-block__head">
          <span class="analytics-peak">Peak ${escapeHtml(formatCount(hourlyPeak))}</span>
        </div>
        ${hourlyPoints.length
          ? renderPresenceChart({ chartId: "analyticsHourlyChart", points: hourlyPoints, labelFor: hourLabel, tooltipFor: hourTooltip })
          : '<p class="page-head__sub">Presence data will appear after players visit the site.</p>'}
      </div>

      <div class="analytics-chart-block" data-presence-block="daily" hidden>
        <div class="analytics-chart-block__head">
          <span class="analytics-peak">Peak ${escapeHtml(formatCount(dailyPeak))}</span>
        </div>
        ${dailyPoints.length
          ? renderPresenceChart({ chartId: "analyticsDailyChart", points: dailyPoints, labelFor: dayLabel, tooltipFor: dayTooltip })
          : '<p class="page-head__sub">Daily presence data will appear after a few days of visits.</p>'}
      </div>
    </section>`;

  wirePresenceTooltips(analyticsContent);
  wirePresenceToggle(analyticsContent);
}

// The Online Users panel shows one chart at a time; the Hourly/Daily segmented
// control swaps which block is visible (and the caption above it) without a
// server round-trip, since both series were already rendered.
const PRESENCE_VIEW_CAPTIONS = {
  hourly: "Distinct users seen in each hour over the last 24 hours.",
  daily: "Distinct users seen on each of the last 14 days."
};

function wirePresenceToggle(root) {
  if (!root) return;
  const buttons = root.querySelectorAll("[data-presence-view]");
  const caption = root.querySelector("[data-presence-sub]");
  const showView = (view) => {
    for (const button of buttons) {
      const isActive = button.dataset.presenceView === view;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    }
    for (const block of root.querySelectorAll("[data-presence-block]")) {
      block.hidden = block.dataset.presenceBlock !== view;
    }
    if (caption && PRESENCE_VIEW_CAPTIONS[view]) {
      caption.textContent = PRESENCE_VIEW_CAPTIONS[view];
    }
  };
  for (const button of buttons) {
    button.addEventListener("click", () => showView(button.dataset.presenceView));
  }
}

// Presence charts (hourly + daily online users) share one renderer so they
// stay visually consistent. Each bar carries data-* hooks read by the hover
// tooltip; the tallest bar is flagged so the peak stands out.
function renderPresenceChart({ chartId, points, labelFor, tooltipFor }) {
  const values = points.map((point) => Number(point.users || 0));
  const max = Math.max(1, ...values);
  const peak = Math.max(0, ...values);
  const bars = points.map((point) => {
    const users = Number(point.users || 0);
    const height = Math.max(3, Math.round(users / max * 100));
    const label = labelFor(point);
    const isPeak = peak > 0 && users === peak;
    return `
      <div class="analytics-bar-wrap${isPeak ? " is-peak" : ""}" data-tooltip="${escapeHtml(tooltipFor(point, users))}">
        <span class="analytics-bar-value">${escapeHtml(formatCount(users))}</span>
        <div class="analytics-bar" style="height:${height}%"></div>
        <span class="analytics-bar-label">${escapeHtml(label)}</span>
      </div>`;
  }).join("");
  return `<div class="analytics-chart" id="${chartId}">${bars}</div>`;
}

// A single shared tooltip element follows the cursor across every bar. Using
// one floating node (rather than the native title attribute) lets the tooltip
// be styled and appear instantly on hover.
function wirePresenceTooltips(root) {
  if (!root) return;
  let tip = document.getElementById("analyticsTooltip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "analyticsTooltip";
    tip.className = "analytics-tooltip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  const position = (event) => {
    tip.style.left = `${event.clientX}px`;
    tip.style.top = `${event.clientY}px`;
  };
  root.querySelectorAll(".analytics-bar-wrap").forEach((wrap) => {
    wrap.addEventListener("mouseenter", (event) => {
      tip.textContent = wrap.dataset.tooltip || "";
      tip.hidden = false;
      position(event);
    });
    wrap.addEventListener("mousemove", position);
    wrap.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
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
  const events = Array.isArray(data) ? data : [];
  const renderEvent = (event) => {
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
  };

  const activeEvents = events.filter((event) => event.active && new Date(event.ends_at).getTime() > now);
  const pastEvents = events.filter((event) => !activeEvents.includes(event));
  list.innerHTML = events.length ? `
    <div class="admin-event-group">
      <h3>Current event</h3>
      ${activeEvents.map(renderEvent).join("") || `<p class="page-head__sub">No event is currently active.</p>`}
    </div>
    ${pastEvents.length ? `<details class="admin-event-archive">
      <summary>Past events <span>${pastEvents.length}</span></summary>
      <div class="admin-event-archive__list">${pastEvents.map(renderEvent).join("")}</div>
    </details>` : ""}
  ` : `<p class="page-head__sub">No events have been run yet.</p>`;

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


// =========================================================
// UPDATE LOG PUBLISHER (admin only)
// =========================================================

function parseUpdateLogContent(value) {
  const sections = [];
  let current = null;

  for (const rawLine of String(value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      if (!heading) throw new Error("Every section needs a heading.");
      current = { heading, bullets: [] };
      sections.push(current);
      continue;
    }

    if (line.startsWith("- ")) {
      if (!current) throw new Error("Add a ## section heading before its bullet points.");
      const bullet = line.slice(2).trim();
      if (!bullet) throw new Error("Bullet points cannot be empty.");
      current.bullets.push(bullet);
      continue;
    }

    throw new Error(`Unsupported line: ${line}`);
  }

  if (!sections.length || sections.some((section) => !section.bullets.length)) {
    throw new Error("Add at least one section with at least one bullet point.");
  }
  return sections;
}

function updateSectionsToText(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => `## ${section.heading}\n${(section.bullets ?? []).map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n\n");
}

function wireUpdateLogPublisher() {
  const panel = document.getElementById("updatesPanel");
  if (!panel) return;
  panel.hidden = false;

  const idInput = document.getElementById("updateLogId");
  const versionInput = document.getElementById("updateLogVersion");
  const dateInput = document.getElementById("updateLogDate");
  const titleInput = document.getElementById("updateLogTitle");
  const contentInput = document.getElementById("updateLogContent");
  const statusLine = document.getElementById("updateLogStatus");
  const list = document.getElementById("updateLogList");
  const draftButton = document.getElementById("updateLogDraft");
  const publishButton = document.getElementById("updateLogPublish");
  const cancelButton = document.getElementById("updateLogCancel");
  const refreshButton = document.getElementById("updateLogRefresh");
  let entries = [];

  const reset = () => {
    idInput.value = "";
    versionInput.value = "";
    titleInput.value = "";
    contentInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    cancelButton.hidden = true;
    statusLine.textContent = "";
  };

  const render = () => {
    list.innerHTML = entries.length ? entries.map((entry) => `
      <div class="admin-update-row">
        <div>
          <strong>${escapeHtml(entry.version)} · ${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.published_on)} · ${entry.published ? "Published" : "Draft"}</span>
        </div>
        <div class="admin-button-row">
          <button class="btn btn--small" type="button" data-update-edit="${entry.id}">Edit</button>
          ${entry.published ? `<button class="btn btn--small" type="button" data-update-unpublish="${entry.id}">Unpublish</button>` : ""}
          <button class="btn btn--danger btn--small" type="button" data-update-delete="${entry.id}">Delete</button>
        </div>
      </div>
    `).join("") : '<p class="admin-note">No database-backed update logs yet.</p>';

    for (const button of list.querySelectorAll("[data-update-edit]")) {
      button.addEventListener("click", () => {
        const entry = entries.find((item) => String(item.id) === button.dataset.updateEdit);
        if (!entry) return;
        idInput.value = entry.id;
        versionInput.value = entry.version;
        titleInput.value = entry.title;
        dateInput.value = entry.published_on;
        contentInput.value = updateSectionsToText(entry.sections);
        cancelButton.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    for (const button of list.querySelectorAll("[data-update-unpublish]")) {
      button.addEventListener("click", () => save(false, button.dataset.updateUnpublish));
    }

    for (const button of list.querySelectorAll("[data-update-delete]")) {
      button.addEventListener("click", async () => {
        if (!window.confirm("Permanently delete this update log?")) return;
        button.disabled = true;
        const { error } = await adminRequest("update_log_delete", { id: Number(button.dataset.updateDelete) });
        if (error) notify.error("Could not delete update", error.message);
        else {
          notify.success("Update deleted", "The entry was removed.");
          await load();
        }
        button.disabled = false;
      });
    }
  };

  const load = async () => {
    refreshButton.disabled = true;
    const { data, error } = await adminRequest("update_logs_list");
    refreshButton.disabled = false;
    if (error) {
      notify.error("Could not load updates", error.message);
      return;
    }
    entries = data?.updates ?? [];
    render();
  };

  const save = async (published, forcedId = null) => {
    let sections;
    try {
      sections = forcedId
        ? entries.find((entry) => String(entry.id) === String(forcedId))?.sections
        : parseUpdateLogContent(contentInput.value);
    } catch (error) {
      notify.error("Invalid update log", error.message);
      return;
    }

    const existing = forcedId
      ? entries.find((entry) => String(entry.id) === String(forcedId))
      : null;
    const payload = existing ? {
      id: existing.id,
      version: existing.version,
      title: existing.title,
      publishedOn: existing.published_on,
      sections: existing.sections,
      published
    } : {
      id: idInput.value ? Number(idInput.value) : null,
      version: versionInput.value.trim(),
      title: titleInput.value.trim(),
      publishedOn: dateInput.value,
      sections,
      published
    };

    draftButton.disabled = true;
    publishButton.disabled = true;
    const { error } = await adminRequest("update_log_save", payload);
    draftButton.disabled = false;
    publishButton.disabled = false;
    if (error) {
      notify.error("Could not save update", error.message);
      return;
    }
    notify.success(published ? "Update published" : "Draft saved", published ? "It is now live on the Updates page." : "Only admins can see this draft.");
    reset();
    await load();
  };

  draftButton.addEventListener("click", () => save(false));
  publishButton.addEventListener("click", () => save(true));
  cancelButton.addEventListener("click", reset);
  refreshButton.addEventListener("click", load);
  reset();
  load();
}


// =========================================================
// SHAREHOLDERS — read-only Exchange holdings overview (admin only)
// =========================================================

const shareholdersPanel = document.getElementById("shareholdersPanel");
const shareholdersRefresh = document.getElementById("shareholdersRefresh");
const shareholdersSummary = document.getElementById("shareholdersSummary");
const shareholdersContent = document.getElementById("shareholdersContent");

function plCell(pl, isPercent) {
  const n = Number(pl ?? 0);
  const up = n >= 0;
  const text = isPercent
    ? `${up ? "+" : "−"}${Math.abs(n).toFixed(1)}%`
    : `${up ? "+" : "−"}${formatMoney(Math.abs(n))}`;
  return `<td class="num ${up ? "is-up" : "is-down"}">${text}</td>`;
}

async function loadShareholders() {
  if (!shareholdersPanel) return;
  shareholdersPanel.hidden = false;
  shareholdersContent.innerHTML = '<div class="skeleton" style="height:180px"></div>';

  const { data, error } = await supabase.rpc("admin_get_shareholders");
  if (error) {
    shareholdersContent.innerHTML =
      `<div class="empty"><p class="empty__title">Could not load shareholders</p><p>${escapeHtml(error.message)}</p></div>`;
    shareholdersSummary.textContent = "Failed to load.";
    return;
  }

  const holders = Array.isArray(data?.holders) ? data.holders : [];
  const price = Number(data?.price ?? 0);
  const totalPl = Number(data?.totalPl ?? 0);
  shareholdersSummary.innerHTML =
    `<strong>${data?.holderCount ?? holders.length}</strong> holder(s) · ` +
    `index <strong>$${price.toFixed(2)}</strong> · ` +
    `invested ${formatMoney(Number(data?.totalInvested ?? 0))} · ` +
    `value ${formatMoney(Number(data?.totalValue ?? 0))} · ` +
    `net P/L <span class="${totalPl >= 0 ? "is-up" : "is-down"}">${totalPl >= 0 ? "+" : "−"}${formatMoney(Math.abs(totalPl))}</span>`;

  if (!holders.length) {
    shareholdersContent.innerHTML = '<div class="empty"><p class="empty__title">No one is holding shares.</p></div>';
    return;
  }

  const rows = holders.map((h) => `
      <tr>
        <td>${escapeHtml(h.username ?? "Unknown")}</td>
        <td class="num">${Number(h.shares ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
        <td class="num">${formatMoney(Number(h.invested ?? 0))}</td>
        <td class="num">${formatMoney(Number(h.value ?? 0))}</td>
        ${plCell(h.pl, false)}
        ${plCell(h.plPct, true)}
      </tr>`).join("");

  shareholdersContent.innerHTML = `
    <div class="shareholders-table-wrap">
      <table class="shareholders-table">
        <thead>
          <tr>
            <th>Player</th>
            <th class="num">Shares</th>
            <th class="num">Invested</th>
            <th class="num">Value</th>
            <th class="num">P/L</th>
            <th class="num">P/L %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

shareholdersRefresh?.addEventListener("click", loadShareholders);


// =========================================================
// BANK ACCOUNTS (admin only)
// =========================================================

const bankPanel = document.getElementById("bankPanel");
const bankRefresh = document.getElementById("bankRefresh");
const bankSummary = document.getElementById("bankSummary");
const bankContent = document.getElementById("bankContent");
const bankFilter = document.getElementById("bankFilter");

let bankAccounts = [];

function bankStatusCell(account) {
  if (account.inDefault) return '<td><span class="bank-chip bank-chip--default">In default</span></td>';
  if (account.borrowFrozen) return '<td><span class="bank-chip bank-chip--frozen">Frozen</span></td>';
  if (Number(account.loanTotal) > 0) return '<td><span class="bank-chip bank-chip--loan">Loan</span></td>';
  return '<td><span class="bank-chip">—</span></td>';
}

function renderBankAccounts() {
  const query = (bankFilter?.value ?? "").trim().toLowerCase();
  const rows = bankAccounts
    .filter((account) => !query || String(account.username ?? "").toLowerCase().includes(query))
    .map((account) => `
      <tr>
        <td>${escapeHtml(account.username ?? "Unknown")}</td>
        <td class="num">${formatMoney(Number(account.balance ?? 0))}</td>
        <td class="num ${Number(account.loanTotal) > 0 ? "is-down" : ""}">${formatMoney(Number(account.loanTotal ?? 0))}</td>
        <td class="num">${Number(account.creditScore ?? 0)}</td>
        <td>${escapeHtml(account.creditBand ?? "")}</td>
        ${bankStatusCell(account)}
      </tr>`).join("");

  bankContent.innerHTML = rows
    ? `<div class="shareholders-table-wrap">
        <table class="shareholders-table">
          <thead>
            <tr>
              <th>Player</th>
              <th class="num">Savings</th>
              <th class="num">Loan owed</th>
              <th class="num">Credit</th>
              <th>Band</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : '<div class="empty"><p class="empty__title">No matching accounts.</p></div>';
}

async function loadBankAccounts() {
  if (!bankPanel) return;
  bankPanel.hidden = false;
  bankContent.innerHTML = '<div class="skeleton" style="height:180px"></div>';

  const { data, error } = await supabase.rpc("admin_get_bank_overview");
  if (error) {
    bankContent.innerHTML =
      `<div class="empty"><p class="empty__title">Could not load bank accounts</p><p>${escapeHtml(error.message)}</p></div>`;
    bankSummary.textContent = "Failed to load.";
    return;
  }

  bankAccounts = Array.isArray(data?.accounts) ? data.accounts : [];
  bankSummary.innerHTML =
    `<strong>${data?.accountCount ?? bankAccounts.length}</strong> account(s) · ` +
    `deposits <strong>${formatMoney(Number(data?.totalDeposits ?? 0))}</strong> · ` +
    `owed <span class="is-down">${formatMoney(Number(data?.totalOwed ?? 0))}</span> · ` +
    `${data?.activeLoans ?? 0} active loan(s) · ` +
    `<span class="${Number(data?.inDefaultCount) > 0 ? "is-down" : ""}">${data?.inDefaultCount ?? 0} in default</span> · ` +
    `avg credit <strong>${data?.avgCredit ?? 0}</strong>`;

  if (!bankAccounts.length) {
    bankContent.innerHTML = '<div class="empty"><p class="empty__title">No bank accounts yet.</p></div>';
    return;
  }
  renderBankAccounts();
}

bankRefresh?.addEventListener("click", loadBankAccounts);
bankFilter?.addEventListener("input", renderBankAccounts);


// =========================================================
// GUILD ROSTER — read-only "who is in which guild" overview (admin only)
// =========================================================

const guildRosterPanel = document.getElementById("guildRosterPanel");
const guildRosterRefresh = document.getElementById("guildRosterRefresh");
const guildRosterSummary = document.getElementById("guildRosterSummary");
const guildRosterContent = document.getElementById("guildRosterContent");
const guildRosterSearch = document.getElementById("guildRosterSearch");

// Cached so the search box can filter without another round-trip.
let guildRosterCache = [];

function guildRoleTag(role) {
  const key = String(role ?? "member").toLowerCase();
  const label = key === "owner" ? "Owner" : key === "officer" ? "Officer" : "Member";
  return `<span class="guild-role guild-role--${key}">${label}</span>`;
}

function guildRosterDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function guildMemberRows(members) {
  return (members ?? []).map((member) => `
      <tr>
        <td>${escapeHtml(member.username ?? "Unknown")}</td>
        <td>${guildRoleTag(member.role)}</td>
        <td class="num">${formatMoney(Number(member.lifetimeContribution ?? 0), { compact: true })}</td>
        <td class="num">${formatMoney(Number(member.weeklyContribution ?? 0), { compact: true })}</td>
        <td class="num">${guildRosterDate(member.joinedAt)}</td>
      </tr>`).join("");
}

function guildRosterCard(guild) {
  const members = Array.isArray(guild.members) ? guild.members : [];
  const capacity = Number(guild.memberCapacity ?? 0);
  const tiers = `L+${Number(guild.luckTier ?? 0)} · S+${Number(guild.speedTier ?? 0)} · W+${Number(guild.weightLuckTier ?? 0)}`;
  return `
    <details class="guild-roster-card" open>
      <summary>
        <span class="guild-roster-card__name">
          ${guild.tag ? `<b class="guild-roster-card__tag">[${escapeHtml(guild.tag)}]</b>` : ""}
          ${escapeHtml(guild.name ?? "Unnamed guild")}
        </span>
        <span class="guild-roster-card__meta">
          <span>${members.length}${capacity ? ` / ${capacity}` : ""} members</span>
          <span>Owner: ${escapeHtml(guild.ownerName ?? "—")}</span>
          <span title="Luck / Speed / Weight-luck tier bonuses (%)">${tiers}</span>
          <span>${formatCount(Number(guild.guildPoints ?? 0))} GP</span>
        </span>
      </summary>
      <div class="guild-roster-table-wrap">
        <table class="guild-roster-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th class="num">Lifetime</th>
              <th class="num">Weekly</th>
              <th class="num">Joined</th>
            </tr>
          </thead>
          <tbody>${members.length ? guildMemberRows(members) : '<tr><td colspan="5" class="guild-roster-empty">No members.</td></tr>'}</tbody>
        </table>
      </div>
    </details>`;
}

function renderGuildRoster() {
  const term = (guildRosterSearch?.value ?? "").trim().toLowerCase();
  const guilds = term
    ? guildRosterCache.filter((guild) => {
        const haystacks = [guild.name, guild.tag, guild.ownerName,
          ...(guild.members ?? []).map((member) => member.username)];
        return haystacks.some((value) => String(value ?? "").toLowerCase().includes(term));
      })
    : guildRosterCache;

  if (!guildRosterCache.length) {
    guildRosterContent.innerHTML = '<div class="empty"><p class="empty__title">No guilds have been formed yet.</p></div>';
    return;
  }
  if (!guilds.length) {
    guildRosterContent.innerHTML = '<div class="empty"><p class="empty__title">No guilds or players match that filter.</p></div>';
    return;
  }
  guildRosterContent.innerHTML = guilds.map(guildRosterCard).join("");
}

async function loadGuildRoster() {
  if (!guildRosterPanel) return;
  guildRosterPanel.hidden = false;
  guildRosterContent.innerHTML = '<div class="skeleton" style="height:180px"></div>';

  const { data, error } = await supabase.rpc("admin_get_guild_roster");
  if (error) {
    guildRosterContent.innerHTML =
      `<div class="empty"><p class="empty__title">Could not load guild roster</p><p>${escapeHtml(error.message)}</p></div>`;
    guildRosterSummary.textContent = "Failed to load.";
    return;
  }

  guildRosterCache = Array.isArray(data?.guilds) ? data.guilds : [];
  guildRosterSummary.innerHTML =
    `<strong>${Number(data?.guildCount ?? guildRosterCache.length)}</strong> guild(s) · ` +
    `<strong>${Number(data?.memberCount ?? 0)}</strong> member(s)`;
  renderGuildRoster();
}

guildRosterRefresh?.addEventListener("click", loadGuildRoster);
guildRosterSearch?.addEventListener("input", renderGuildRoster);


// =========================================================
// SHARED IP AUDIT — flag accounts sharing the same/similar IP (alt detection).
// Server-gated SECURITY DEFINER RPC; IP data is admin-only and never shown to
// players. This is a read-only report — it changes nothing on its own.
// =========================================================

const ipAuditPanel = document.getElementById("ipAuditPanel");
const ipAuditRefresh = document.getElementById("ipAuditRefresh");
const ipAuditSummary = document.getElementById("ipAuditSummary");
const ipAuditContent = document.getElementById("ipAuditContent");
const ipAuditMin = document.getElementById("ipAuditMin");
const ipAuditSubnet = document.getElementById("ipAuditSubnet");
const ipWhitelistInput = document.getElementById("ipWhitelistInput");
const ipWhitelistNote = document.getElementById("ipWhitelistNote");
const ipWhitelistAdd = document.getElementById("ipWhitelistAdd");
const ipWhitelistList = document.getElementById("ipWhitelistList");
const ipWhitelistCount = document.getElementById("ipWhitelistCount");

function ipAuditDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function ipAuditAccountRows(accounts) {
  return (accounts ?? []).map((account) => {
    const bannedTag = account.banned
      ? `<span class="badge badge--danger ip-audit-banned" title="${escapeHtml(account.banUntil ? "Banned until " + ipAuditDate(account.banUntil) : "Currently banned")}">Banned</span>`
      : "";
    const ip = account.lastIp ?? "";
    const whitelistButton = ip
      ? `<button class="btn btn--sm" type="button" data-ip-whitelist="${escapeHtml(ip)}" title="Never flag this IP again">Whitelist IP</button>`
      : "";
    // Already-banned accounts show the tag instead of a redundant ban button.
    const banButton = account.banned
      ? ""
      : `<button class="btn btn--sm btn--danger" type="button" data-ip-ban="${escapeHtml(account.playerId)}" title="Permanently ban this account as an alt">Ban Now</button>`;
    return `
      <tr>
        <td>${escapeHtml(account.username ?? "Unknown")}</td>
        <td>${escapeHtml(account.email ?? "Anonymous")}</td>
        <td class="ip-audit-mono">${escapeHtml(ip || "—")}</td>
        <td>${escapeHtml(ipAuditDate(account.lastSeenAt))}</td>
        <td class="ip-audit-actions">
          ${bannedTag}
          <button class="btn btn--sm" type="button" data-ip-inspect="${escapeHtml(account.playerId)}">Inspect</button>
          ${banButton}
          ${whitelistButton}
        </td>
      </tr>`;
  }).join("");
}

// The canned reason used by the IP-audit "Ban Now" shortcut. The ban screen
// renders the [text](url) appeal link as a real link (see showBanScreen).
const ALT_ACCOUNT_BAN_REASON =
  "alt account. If you think this is wrong, please appeal [here](https://forms.gle/hkQVWTfCNpLZxLyRA).";

async function banAltAccountFromAudit(playerId, button) {
  if (!playerId) return;
  if (!window.confirm("Permanently ban this account as an alt? They'll see a ban screen every time they open the game.")) {
    return;
  }
  if (button) button.disabled = true;
  const { error } = await supabase.rpc("admin_ban_player", {
    p_target: playerId,
    p_hours: 0,
    p_reason: ALT_ACCOUNT_BAN_REASON
  });
  if (error) {
    notify.error("Ban failed", error.message);
    if (button) button.disabled = false;
    return;
  }
  notify.success("Account banned", "Permanently banned as an alt account.");
  loadIpAudit();
}

function ipAuditGroupCard(group) {
  const accounts = Array.isArray(group.accounts) ? group.accounts : [];
  return `
    <details class="ip-audit-group" open>
      <summary>
        <span class="ip-audit-group__key ip-audit-mono">${escapeHtml(group.key ?? "—")}</span>
        <span class="ip-audit-group__count badge badge--danger">${formatCount(Number(group.accountCount ?? accounts.length))} accounts</span>
      </summary>
      <div class="ip-audit-table-wrap">
        <table class="ip-audit-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Email</th>
              <th>IP</th>
              <th>Last seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${ipAuditAccountRows(accounts)}</tbody>
        </table>
      </div>
    </details>`;
}

// ── IP whitelist management ───────────────────────────────────────────────
function renderWhitelist(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (ipWhitelistCount) ipWhitelistCount.textContent = formatCount(list.length);
  if (!ipWhitelistList) return;
  ipWhitelistList.innerHTML = list.length
    ? list.map((entry) => `
        <div class="ip-whitelist__row">
          <span class="ip-audit-mono">${escapeHtml(entry.ip ?? "—")}</span>
          <span class="ip-whitelist__note">${escapeHtml(entry.note ?? "")}</span>
          <button class="btn btn--sm btn--danger" type="button" data-ip-unwhitelist="${escapeHtml(entry.ip ?? "")}">Remove</button>
        </div>`).join("")
    : '<p class="page-head__sub">No whitelisted IPs yet.</p>';

  for (const button of ipWhitelistList.querySelectorAll("[data-ip-unwhitelist]")) {
    button.addEventListener("click", () => removeWhitelist(button.dataset.ipUnwhitelist));
  }
}

async function loadWhitelist() {
  const { data, error } = await supabase.rpc("admin_list_ip_whitelist");
  if (error) {
    notify.error("Whitelist failed", error.message);
    return;
  }
  renderWhitelist(data?.entries);
}

async function addWhitelist(ip, note) {
  const cleanIp = String(ip ?? "").trim();
  if (!cleanIp) {
    notify.error("IP required", "Enter an IP address to whitelist.");
    return;
  }
  const { data, error } = await supabase.rpc("admin_add_ip_whitelist", {
    p_ip: cleanIp,
    p_note: note ?? null
  });
  if (error) {
    notify.error("Could not whitelist IP", error.message);
    return;
  }
  renderWhitelist(data?.entries);
  notify.success("IP whitelisted", `${cleanIp} will no longer be flagged.`);
  if (ipWhitelistInput) ipWhitelistInput.value = "";
  if (ipWhitelistNote) ipWhitelistNote.value = "";
  loadIpAudit();
}

async function removeWhitelist(ip) {
  const { data, error } = await supabase.rpc("admin_remove_ip_whitelist", { p_ip: ip });
  if (error) {
    notify.error("Could not remove IP", error.message);
    return;
  }
  renderWhitelist(data?.entries);
  notify.success("Removed from whitelist", `${ip} can be flagged again.`);
  loadIpAudit();
}

ipWhitelistAdd?.addEventListener("click", () => addWhitelist(ipWhitelistInput?.value, ipWhitelistNote?.value));
ipWhitelistInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addWhitelist(ipWhitelistInput.value, ipWhitelistNote?.value);
});

async function loadIpAudit() {
  if (!ipAuditPanel || !ipAuditContent) return;
  ipAuditPanel.hidden = false;
  loadWhitelist();

  const rawMin = Math.trunc(Number(ipAuditMin?.value ?? 2));
  const minAccounts = Number.isFinite(rawMin) ? Math.min(100, Math.max(2, rawMin)) : 2;
  const includeSubnet = Boolean(ipAuditSubnet?.checked);

  if (ipAuditButton) ipAuditButton.disabled = true;
  if (ipAuditRefresh) ipAuditRefresh.disabled = true;
  ipAuditContent.innerHTML = '<div class="skeleton" style="height:180px"></div>';

  const { data, error } = await supabase.rpc("admin_find_shared_ips", {
    p_min_accounts: minAccounts,
    p_include_subnet: includeSubnet
  });

  if (ipAuditButton) ipAuditButton.disabled = false;
  if (ipAuditRefresh) ipAuditRefresh.disabled = false;

  if (error) {
    ipAuditContent.innerHTML =
      `<div class="empty"><p class="empty__title">Could not run IP audit</p><p>${escapeHtml(error.message)}</p></div>`;
    ipAuditSummary.textContent = "Failed to load.";
    notify.error("IP audit failed", error.message);
    return;
  }

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const modeLabel = data?.mode === "subnet" ? "similar (subnet)" : "exact IP";
  ipAuditSummary.innerHTML =
    `<strong>${formatCount(Number(data?.groupCount ?? groups.length))}</strong> shared ${modeLabel} ` +
    `${(data?.groupCount ?? groups.length) === 1 ? "group" : "groups"} · ` +
    `<strong>${formatCount(Number(data?.accountsFlagged ?? 0))}</strong> accounts flagged · ` +
    `min ${formatCount(Number(data?.minAccounts ?? minAccounts))} per group`;

  ipAuditContent.innerHTML = groups.length
    ? groups.map(ipAuditGroupCard).join("")
    : '<div class="empty"><p class="empty__title">No accounts share an IP at this threshold.</p></div>';

  for (const button of ipAuditContent.querySelectorAll("[data-ip-inspect]")) {
    button.addEventListener("click", () => {
      inspectPlayer(button.dataset.ipInspect);
      playerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  for (const button of ipAuditContent.querySelectorAll("[data-ip-whitelist]")) {
    button.addEventListener("click", () => addWhitelist(button.dataset.ipWhitelist));
  }

  for (const button of ipAuditContent.querySelectorAll("[data-ip-ban]")) {
    button.addEventListener("click", () => banAltAccountFromAudit(button.dataset.ipBan, button));
  }
}

ipAuditButton?.addEventListener("click", loadIpAudit);
ipAuditRefresh?.addEventListener("click", loadIpAudit);

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
  if (ipAuditButton) ipAuditButton.disabled = false;
  analyticsButton.disabled = false;
  if (featureLabButton) featureLabButton.disabled = false;
  wireAnnouncements();
  wireUpdateLogPublisher();
  wireCodes();
  tryWireAdminEvents();
  await loadSectionControls();
  await wireMutationEvents();
  await loadMutationCatalog();
  await loadShareholders();
  await loadBankAccounts();
  await loadGuildRoster();
  searchInput.focus();
}


// =========================================================
// ADMIN TAB NAVIGATION
//
// Groups the admin panels into top-level tabs so the page is a set of
// focused sections instead of one long scroll. Player search + the player
// panel live in their own "Search" tab (separate from Feature Lab). This
// is a thin presentational layer: it moves the existing panels into tab
// pages and reuses their existing loaders, so their behaviour is unchanged.
// =========================================================
(function initAdminTabs() {
  const tabBar = document.getElementById("adminTabs");
  const mainEl = document.querySelector("main.app-main");
  const featureLabShell = document.getElementById("adminFeatureLab");
  if (!tabBar || !mainEl) return;

  // These header buttons are replaced by the Economy / Community tabs (their
  // panels load lazily on tab open). The `.btn` styles override the `hidden`
  // attribute, so hide them explicitly; keep them in the DOM for their loaders.
  ["analyticsButton", "ipAuditButton"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.style.display = "none";
  });

  const GROUPS = {
    search: ["#adminSearchCard", "#searchResults", "#playerPanel", "#auditPanel"],
    economy: ["#analyticsPanel", "#shareholdersPanel", "#bankPanel"],
    content: ["#announcePanel", "#updatesPanel", "#codesPanel", "#eventsPanel", "#mutationEventsPanel", "#mutationCatalogPanel", "#sectionControlsPanel"],
    community: ["#guildRosterPanel", "#ipAuditPanel"]
  };

  // Build one page wrapper per tab and move the matching panels into it.
  const pages = {};
  for (const [name, selectors] of Object.entries(GROUPS)) {
    const page = document.createElement("div");
    page.className = "admin-tab-page";
    page.dataset.adminTabPage = name;
    page.hidden = true;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) page.appendChild(el);
    }
    mainEl.insertBefore(page, featureLabShell || null);
    pages[name] = page;
  }

  // Heavier panels are only loaded when their tab is first opened.
  const LAZY = {
    economy: () => (typeof loadAnalytics === "function" ? loadAnalytics() : null),
    community: () => (typeof loadIpAudit === "function" ? loadIpAudit() : null)
  };
  const loaded = new Set();
  let active = "search";

  function showAdminTab(name) {
    if (!pages[name]) return;
    active = name;
    for (const [tab, page] of Object.entries(pages)) page.hidden = tab !== name;
    tabBar.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminTab === name);
    });
    if (!loaded.has(name) && LAZY[name]) {
      loaded.add(name);
      try { LAZY[name](); } catch (error) { console.error("[ADMIN] tab load failed:", error); }
    }
  }

  tabBar.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => showAdminTab(button.dataset.adminTab));
  });

  // The audit-log button lives in the header; jump to the Search tab (where
  // the audit panel now lives) when it is used.
  document.getElementById("auditButton")?.addEventListener("click", () => showAdminTab("search"));

  function reveal() {
    tabBar.hidden = false;
    showAdminTab(active);
  }

  // Reveal the tabs only once admin access is verified — the same moment the
  // Feature Lab button becomes enabled.
  const flButton = document.getElementById("featureLabButton");
  if (flButton && !flButton.disabled) {
    reveal();
  } else if (flButton) {
    const observer = new MutationObserver(() => {
      if (!flButton.disabled) { observer.disconnect(); reveal(); }
    });
    observer.observe(flButton, { attributes: true, attributeFilter: ["disabled"] });
  } else {
    reveal();
  }

  // Feature Lab is a separate full-page overlay: hide the tabbed area while it
  // is open, and restore the active tab when returning.
  flButton?.addEventListener("click", () => {
    tabBar.hidden = true;
    Object.values(pages).forEach((page) => { page.hidden = true; });
  });
  document.getElementById("featureLabBack")?.addEventListener("click", reveal);
  document.getElementById("adminPanelBack")?.addEventListener("click", reveal);

  window.showAdminTab = showAdminTab;
})();
