import { loadRareRolls, subscribeToRareRolls, unsubscribeFromRareRolls } from "../backend/rareRolls.js";
import { gemNameHtml } from "./gemStyle.js";
import { escapeHtml } from "./format.js";

const MAX_PER_GROUP = 5;

function odds(value) {
  return `1 in ${Math.max(1, Math.round(Number(value) || 1)).toLocaleString("en-US")}`;
}

function age(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function rowHtml(row) {
  const mutationNames = row.mutations.map((mutation) => mutation.name).join(" · ");
  const denominator = row.kind === "mutation" ? row.effectiveRarity : row.rarity;
  return `<article class="rare-roll">
    <div class="rare-roll__copy">
      <span class="rare-roll__player">${escapeHtml(row.username)}</span>
      <strong>${mutationNames ? `<span class="rare-roll__mutations">${escapeHtml(mutationNames)}</span> ` : ""}${gemNameHtml(row.gemName, escapeHtml)}</strong>
    </div>
    <div class="rare-roll__odds"><strong>${escapeHtml(odds(denominator))}</strong><time datetime="${escapeHtml(row.createdAt)}">${escapeHtml(age(row.createdAt))}</time></div>
  </article>`;
}

function renderList(element, rows, emptyText) {
  if (!element) return;
  element.innerHTML = rows.length
    ? rows.slice(0, MAX_PER_GROUP).map(rowHtml).join("")
    : `<p class="rare-rolls__empty">${escapeHtml(emptyText)}</p>`;
}

export function initRareRollsCard() {
  const card = document.getElementById("rareRollsCard");
  const baseList = document.getElementById("rareRollsBaseList");
  const mutationList = document.getElementById("rareRollsMutationList");
  if (!card || !baseList || !mutationList) return;

  let refreshTimer = null;
  async function refresh() {
    try {
      const rows = await loadRareRolls();
      renderList(baseList, rows.filter((row) => row.kind === "base"), "No 1-in-100M+ base discoveries yet.");
      renderList(mutationList, rows.filter((row) => row.kind === "mutation"), "No 1-in-1B+ mutation discoveries yet.");
    } catch (error) {
      console.error("[RARE ROLLS] Could not load discoveries:", error);
      renderList(baseList, [], "Rare rolls are temporarily unavailable.");
      renderList(mutationList, [], "Rare rolls are temporarily unavailable.");
    }
  }

  refresh();
  subscribeToRareRolls(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 150);
  });
  window.addEventListener("beforeunload", () => unsubscribeFromRareRolls(), { once: true });
}
