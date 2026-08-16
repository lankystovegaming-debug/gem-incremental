import gems from "../src/data/gems.js";
import consumables, { getConsumableById } from "../src/data/consumables.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { adminRequest } from "../src/backend/cloudAdmin.js";
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
          ${stat("Total rolls", formatCount(player.total_rolls))}
          ${stat("Gems", formatCount(player.gemCount))}
          ${stat("Capacity", formatCount(player.inventory_capacity))}
          ${stat("Equipment", formatCount(player.equipmentCount))}
          ${stat("Rarest", player.rarest_gem_name ?? "None")}
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

      <section class="admin-section">
        <h3>Account Controls</h3>
        <button class="btn" data-action="reset-cooldown" type="button">Reset roll cooldown</button>
        <button class="btn btn--danger" data-action="account-lock" data-locked="${locked}" type="button">
          ${locked ? "Unlock account" : "Lock account"}
        </button>
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
          ${(data.gems ?? []).map((gem) => row(
            gem.gem_name,
            `${formatWeight(gem.final_weight)} · ${formatMoney(gem.value)}${gem.locked ? " · Locked" : ""}`
          )).join("") || row("Inventory", "Empty")}
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

  if (action === "money-add" || action === "money-remove") {
    const value = Math.abs(Number(document.getElementById("moneyAmount").value));
    request = ["money", { amount: action === "money-add" ? value : -value }];
  } else if (action === "grant-gem") {
    request = ["grant_gem", {
      gemName: document.getElementById("gemName").value,
      weightMultiplier: Number(document.getElementById("gemWeight").value)
    }];
  } else if (action === "potion-add" || action === "potion-remove") {
    const value = Math.abs(Math.trunc(Number(document.getElementById("potionAmount").value)));
    request = ["potion", {
      consumableId: document.getElementById("potionId").value,
      amount: action === "potion-add" ? value : -value
    }];
  } else if (action === "reset-cooldown") {
    request = ["reset_cooldown", {}];
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
// controls what the page shows. The whoami edge function is primary;
// if it isn't deployed on this project, fall back to the am_i_admin()
// RPC that reads the same allow-list table.
let hasAdminAccess = false;

if (user) {
  const { data: whoami } = await adminRequest("whoami");
  hasAdminAccess = whoami?.isAdmin === true;

  if (!hasAdminAccess) {
    const { data: rpcAdmin } = await supabase.rpc("am_i_admin");
    hasAdminAccess = rpcAdmin === true;
  }
}

if (!user || !hasAdminAccess) {
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
  wireAnnouncements();
  searchInput.focus();
}
