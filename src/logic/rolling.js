import gems from "../data/gems.js";

import {
  random01
} from "./random.js";

/**
 * Rolls a gem using the player's current Luck.
 *
 * Gems are checked from rarest to most common.
 * For a gem with rarity 1/r:
 *
 * chance = luck / r
 *
 * Quartz is the fallback if no other gem succeeds.
 *
 * @param {number} luck Player's total Luck multiplier.
 * @returns {object} The gem that was rolled.
 */
export function rollGem(luck = 1) {
  const safeLuck = Math.max(1, luck);
  const maximumRarity = Math.max(...gems.map((gem) => gem.rarity));
  const rarityFloor = Math.min(safeLuck, maximumRarity);

  // Luck sets the minimum eligible rarity. A gem at exactly the Luck
  // denominator remains eligible; only more-common gems are removed.
  const rollableGems = gems
    .filter((gem) => gem.rarity >= rarityFloor)
    .sort((a, b) => b.rarity - a.rarity);

  const fallbackGem = rollableGems[rollableGems.length - 1];

  for (const gem of rollableGems) {
    // Prevent probability from ever exceeding 100%.
    const chance = Math.min(safeLuck / gem.rarity, 1);

    if (random01() < chance) {
      return gem;
    }
  }

  return fallbackGem;
}
