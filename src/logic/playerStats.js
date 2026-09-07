export function getPlayerStats(inventory) {
  const stats = {
    luck: 1,
    rollSpeed: 1,
    weightLuck: 1,
    weightMultiplier: 1,
    // Mutation luck multiplies mutation chance (lanterns grant it). 1 = no bonus.
    mutationLuck: 1
  };

  for (const equipment of inventory.equipment) {
    if (!equipment.equipped) {
      continue;
    }

    if (equipment.bonus?.luck) {
      stats.luck += equipment.bonus.luck;
    }

    if (equipment.bonus?.rollSpeed) {
      stats.rollSpeed += equipment.bonus.rollSpeed;
    }

    if (equipment.bonus?.weightLuck) {
      stats.weightLuck += equipment.bonus.weightLuck;
    }

    if (equipment.bonus?.weightMultiplier) {
      stats.weightMultiplier +=
        equipment.bonus.weightMultiplier;
    }

    if (equipment.bonus?.mutationLuck) {
      stats.mutationLuck += equipment.bonus.mutationLuck;
    }
  }

  return stats;
}
