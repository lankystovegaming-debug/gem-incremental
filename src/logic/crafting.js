export function createCraftingState() {
  return {
    activeAutoCraftRecipeId: null,
    progress: {}
  };
}

function getRequirementKey(requirement, index) {
  if (requirement.id) {
    return requirement.id;
  }

  if (requirement.type === "gem-count") {
    return requirement.gem;
  }

  // Consumable/potion requirements are deposited too, keyed by the
  // consumable id — this must match the server (craft_consumable_recipe
  // and manual-deposit), which stores progress under consumableId.
  if (
    requirement.type === "consumable" ||
    requirement.type === "consumable-count" ||
    requirement.type === "potion" ||
    requirement.type === "potion-count"
  ) {
    return (
      requirement.consumableId ??
      requirement.consumable_id ??
      requirement.potionId ??
      requirement.potion_id ??
      `${requirement.type}-${index}`
    );
  }

  return `${requirement.type}-${index}`;
}
export function ensureRecipeProgress(
  craftingState,
  recipe
) {
  if (!craftingState.progress[recipe.id]) {
    craftingState.progress[recipe.id] = {};
  }

  const progress =
    craftingState.progress[recipe.id];

  recipe.requirements.forEach(
    (requirement, index) => {
      const key =
        getRequirementKey(
          requirement,
          index
        );

      if (progress[key] !== undefined) {
        return;
      }

      if (
        requirement.type ===
        "rarity-points"
      ) {
        progress[key] = {
          points: 0,
          gemTypes: []
        };

        return;
      }

      if (
        requirement.type ===
        "gem-range"
      ) {
        progress[key] = {};

        return;
      }

      if (
        requirement.type !== "equipment" &&
        requirement.type !== "lifetime-rolls"
      ) {
        // Consumables are deposit-tracked like gems, so they start at 0.
        progress[key] = 0;
      }
    }
  );

  return progress;
}

export function getRarityPoints(
  specimen
) {
  const rarity =
    specimen.gem.rarity;

  if (rarity >= 500) {
    return 100;
  }

  if (rarity >= 250) {
    return 50;
  }

  if (rarity >= 100) {
    return 20;
  }

  if (rarity >= 50) {
    return 8;
  }

  if (rarity >= 10) {
    return 3;
  }

  return 1;
}

function specimenMatches(
  requirement,
  specimen
) {
  if (
    requirement.gem &&
    specimen.gem.name !==
      requirement.gem
  ) {
    return false;
  }

  if (
    requirement.minimumWeightMultiplier != null &&
    specimen.weightMultiplier <
      requirement.minimumWeightMultiplier
  ) {
    return false;
  }

  if (
    requirement.maximumWeightMultiplier != null &&
    specimen.weightMultiplier >
      requirement.maximumWeightMultiplier
  ) {
    return false;
  }

  if (
    requirement.minimumRarity != null &&
    specimen.gem.rarity <
      requirement.minimumRarity
  ) {
    return false;
  }

  if (
    requirement.maximumRarity != null &&
    specimen.gem.rarity >
      requirement.maximumRarity
  ) {
    return false;
  }

  return true;
}

export function isRequirementComplete(
  craftingState,
  recipe,
  requirement,
  index,
  inventory
) {
  const progress =
    ensureRecipeProgress(
      craftingState,
      recipe
    );

  const key =
    getRequirementKey(
      requirement,
      index
    );

  if (
    requirement.type ===
    "equipment"
  ) {
    return inventory.equipment.some(
      (equipment) =>
        equipment.id ===
        requirement.equipmentId
    );
  }

  if (requirement.type === "consumable") {
    // Checked against deposit progress, not ownership: the potion is
    // consumed when deposited (the server enforces the same).
    return Number(progress[key] ?? 0) >= Number(requirement.amount ?? 0);
  }

  if (requirement.type === "lifetime-rolls") {
    return Number(inventory?.totalRolls ?? 0) >= Number(requirement.rolls ?? 0);
  }

  if (
    requirement.type ===
    "gem-count"
  ) {
    return (
      (progress[key] ?? 0) >=
      requirement.amount
    );
  }

  if (
    requirement.type ===
    "gem-total-weight"
  ) {
    return (
      (progress[key] ?? 0) >=
      requirement.totalWeight
    );
  }

  if (requirement.type === "specimen-total-weight") {
    return (progress[key] ?? 0) >= requirement.totalWeight;
  }

  if (
    requirement.type ===
    "specimen-value-total"
  ) {
    return (
      (progress[key] ?? 0) >=
      requirement.totalValue
    );
  }

  if (
    requirement.type ===
    "gem-min-weight-multiplier" ||
    requirement.type ===
    "gem-max-weight-multiplier" ||
    requirement.type ===
    "specimen-condition"
  ) {
    return (
      (progress[key] ?? 0) >=
      (requirement.amount ?? 1)
    );
  }

  if (
    requirement.type ===
    "rarity-points"
  ) {
    const current =
      progress[key];

    return (
      current.points >=
        requirement.points &&
      current.gemTypes.length >=
        (
          requirement
            .minimumUniqueGemTypes ??
          0
        )
    );
  }

  if (
    requirement.type ===
    "gem-range"
  ) {
    const current =
      progress[key];

    return requirement.gems.every(
      (gemName) =>
        (current[gemName] ?? 0) >=
        (requirement.amountEach ?? 1)
    );
  }

  return true;
}

function depositSpecimen(
  craftingState,
  recipe,
  requirement,
  index,
  specimen
) {
  const progress =
    ensureRecipeProgress(
      craftingState,
      recipe
    );

  const key =
    getRequirementKey(
      requirement,
      index
    );

  if (
    requirement.type ===
    "gem-count"
  ) {
    progress[key] += 1;
    return true;
  }

  if (
    requirement.type ===
    "gem-total-weight"
  ) {
    progress[key] +=
      specimen.finalWeight;

    return true;
  }

  if (requirement.type === "specimen-total-weight") {
    progress[key] += specimen.finalWeight;
    return true;
  }

  if (
    requirement.type ===
    "specimen-value-total"
  ) {
    progress[key] +=
      specimen.value;

    return true;
  }

  if (
    requirement.type ===
      "gem-min-weight-multiplier" ||
    requirement.type ===
      "gem-max-weight-multiplier" ||
    requirement.type ===
      "specimen-condition"
  ) {
    progress[key] += 1;
    return true;
  }

  if (
    requirement.type ===
    "rarity-points"
  ) {
    const current =
      progress[key];

    current.points +=
      getRarityPoints(specimen);

    if (
      !current.gemTypes.includes(
        specimen.gem.name
      )
    ) {
      current.gemTypes.push(
        specimen.gem.name
      );
    }

    return true;
  }

  if (
    requirement.type ===
    "gem-range"
  ) {
    const gemName =
      specimen.gem.name;

    if (
      !requirement.gems.includes(
        gemName
      )
    ) {
      return false;
    }

    const target =
      requirement.amountEach ?? 1;

    const current =
      progress[key][gemName] ?? 0;

    if (current >= target) {
      return false;
    }

    progress[key][gemName] =
      current + 1;

    return true;
  }

  return false;
}

export function tryAutoDeposit(
  craftingState,
  recipe,
  specimen
) {
  const progress =
    ensureRecipeProgress(
      craftingState,
      recipe
    );

  for (
    let index = 0;
    index < recipe.requirements.length;
    index++
  ) {
    const requirement =
      recipe.requirements[index];

    if (
      requirement.type === "equipment" ||
      requirement.type === "consumable" ||
      requirement.type === "lifetime-rolls"
    ) {
      continue;
    }

    if (
      isRequirementComplete(
        craftingState,
        recipe,
        requirement,
        index,
        {
          equipment: []
        }
      )
    ) {
      continue;
    }

    if (
      requirement.type ===
      "gem-range"
    ) {
      if (
        !requirement.gems.includes(
          specimen.gem.name
        )
      ) {
        continue;
      }
    } else if (
      requirement.type !==
        "specimen-value-total" &&
      requirement.type !==
        "rarity-points" &&
      requirement.type !==
        "specimen-total-weight" &&
      !specimenMatches(
        requirement,
        specimen
      )
    ) {
      continue;
    }

    const deposited =
      depositSpecimen(
        craftingState,
        recipe,
        requirement,
        index,
        specimen
      );

    if (deposited) {
      return true;
    }
  }

  return false;
}

export function manuallyDepositRequirement(
  craftingState,
  recipe,
  inventory,
  requirementIndex
) {
  const requirement =
    recipe.requirements[
      requirementIndex
    ];

  if (!requirement) {
    return false;
  }

  const progress = ensureRecipeProgress(craftingState, recipe);

  if (requirement.type === "consumable") {
    const key = getRequirementKey(requirement, requirementIndex);
    const current = Number(progress[key] ?? 0);
    const target = Number(requirement.amount ?? 0);
    const owned = inventory.consumables?.find(
      (item) => item.consumable_id === requirement.consumableId
    );

    if (!owned || current >= target || Number(owned.quantity ?? 0) <= 0) {
      return false;
    }

    const move = Math.min(
      Number(owned.quantity ?? 0),
      target - current
    );

    progress[key] = current + move;
    owned.quantity = Number(owned.quantity ?? 0) - move;
    return move > 0;
  }

  if (
    requirement.type === "equipment" ||
    requirement.type === "lifetime-rolls"
  ) {
    return false;
  }

  // Consumables deposit from the player's bag into recipe progress.
  if (requirement.type === "consumable") {
    const progress = ensureRecipeProgress(craftingState, recipe);
    const key = getRequirementKey(requirement, requirementIndex);
    const current = Number(progress[key] ?? 0);
    const target = Number(requirement.amount ?? 0);

    const owned = inventory.consumables?.find(
      (item) => item.consumable_id === requirement.consumableId
    );

    if (!owned || current >= target || Number(owned.quantity ?? 0) <= 0) {
      return false;
    }

    const move = Math.min(Number(owned.quantity ?? 0), target - current);

    if (move <= 0) {
      return false;
    }

    progress[key] = current + move;
    owned.quantity = Number(owned.quantity ?? 0) - move;

    return true;
  }

  if (
    isRequirementComplete(
      craftingState,
      recipe,
      requirement,
      requirementIndex,
      inventory
    )
  ) {
    return false;
  }

  const eligible =
    inventory.gems
      .map((item, index) => ({
        item,
        index
      }))
      .filter(({ item }) => {
        if (item.locked) {
          return false;
        }

        if (
          requirement.type ===
          "specimen-value-total" ||
          requirement.type ===
          "rarity-points" ||
          requirement.type ===
          "specimen-total-weight"
        ) {
          return true;
        }

        if (
          requirement.type ===
          "gem-range"
        ) {
          return requirement.gems.includes(
            item.gem.name
          );
        }

        return specimenMatches(
          requirement,
          item
        );
      })
      .sort(
        (a, b) =>
          a.item.finalWeight -
          b.item.finalWeight
      );

  if (eligible.length === 0) {
    return false;
  }

  let selected = null;

  for (const candidate of eligible) {
    const testState =
      structuredClone(
        craftingState
      );

    if (
      depositSpecimen(
        testState,
        recipe,
        requirement,
        requirementIndex,
        candidate.item
      )
    ) {
      selected = candidate;
      break;
    }
  }

  if (!selected) {
    return false;
  }

  const deposited =
    depositSpecimen(
      craftingState,
      recipe,
      requirement,
      requirementIndex,
      selected.item
    );

  if (!deposited) {
    return false;
  }

  inventory.gems.splice(
    selected.index,
    1
  );

  return true;
}

// Keeps existing Pickaxe UI/code working.
export function manuallyDepositGem(
  craftingState,
  recipe,
  inventory,
  gemName
) {
  const index =
    recipe.requirements.findIndex(
      (requirement) =>
        requirement.type ===
          "gem-count" &&
        requirement.gem ===
          gemName
    );

  if (index === -1) {
    return false;
  }

  return manuallyDepositRequirement(
    craftingState,
    recipe,
    inventory,
    index
  );
}

export function isRecipeReady(
  craftingState,
  recipe,
  player,
  inventory
) {
  const requirementsComplete =
    recipe.requirements.every(
      (requirement, index) =>
        isRequirementComplete(
          craftingState,
          recipe,
          requirement,
          index,
          inventory
        )
    );

  const moneyComplete =
    player.money >=
    recipe.moneyCost;

  return (
    requirementsComplete &&
    moneyComplete
  );
}

export function resetRecipeProgress(
  craftingState,
  recipeId
) {
  delete craftingState.progress[
    recipeId
  ];

  if (
    craftingState
      .activeAutoCraftRecipeId ===
    recipeId
  ) {
    craftingState
      .activeAutoCraftRecipeId =
      null;
  }
}
