// Renders a player's up-to-3 pinned showcase gems as small glowing
// gem icons (used next to names on the leaderboard and on profiles).

import { icons } from "./icons.js";
import { getGemStyle } from "./gemStyle.js";
import { rarityLabel, escapeHtml } from "./format.js";
import { getGemMutation } from "../data/mutations.js";

function pinHtml(gem) {
  const name = String(gem?.gem_name ?? "Gem");
  const style = getGemStyle(name);
  const mutationIds = Array.isArray(gem?.mutation_ids) ? gem.mutation_ids : [];
  const mutationNames = mutationIds
    .map((id) => getGemMutation(id)?.name)
    .filter(Boolean);

  const tip = escapeHtml(
    [name, rarityLabel(gem?.rarity), mutationNames.join(" + ")]
      .filter(Boolean)
      .join(" · ")
  );

  return `<span class="showcase-pin" title="${tip}"
    style="color:${style.color};filter:drop-shadow(0 0 4px ${style.glow ?? "transparent"})">${icons.gem}</span>`;
}

export function showcasePinsHtml(gems) {
  const list = Array.isArray(gems) ? gems.slice(0, 3) : [];
  if (!list.length) return "";
  return `<span class="showcase-pins" aria-label="Showcased gems">${list.map(pinHtml).join("")}</span>`;
}
