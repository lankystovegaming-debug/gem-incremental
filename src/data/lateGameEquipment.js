// Bonuses are additive to the backend's 1× baseline.
// Boots retain the existing bonus convention (+8 / +8.75 / +9.5), as confirmed by the user.
const tiers = [
  ['Legendary', 1000, 9999], ['Mythic', 10000, 99999],
  ['Exotic', 100000, 999999], ['Exalted', 1000000, 9999999],
  ['Cosmic', 10000000, 99999999], ['Transcendent', 100000000, 999999999]
];

function equipment(id, name, category, tier, previous, bonus, moneyCost, rolls, counts, specimens) {
  return {
    id, name, category, moneyCost, includedSpecimens: true,
    description: 'Heavy specimens are included in the material totals. Each gem fills at most one specimen slot. Deposit specimens first; remaining space is reserved for them.',
    requirements: [
      { type: 'equipment', equipmentId: previous },
      ...counts.flatMap((amount, i) => amount ? [{
        id: `${id}-${tiers[i][0].toLowerCase()}`, type: 'gem-count',
        label: tiers[i][0], minimumRarity: tiers[i][1], maximumRarity: tiers[i][2], amount
      }] : []),
      ...specimens.map(([rarityIndex, weight, amount], i) => ({
        id: `${id}-specimen-${i}`, type: 'specimen-condition', includedInBulk: true,
        minimumRarity: tiers[rarityIndex][1], minimumWeightMultiplier: weight, amount,
        label: `${amount} ${tiers[rarityIndex][0]}+ ≥${weight}× final weight (included in totals)`
      })),
      { type: 'lifetime-rolls', rolls }
    ],
    reward: { id, name, category, tier, bonus }
  };
}

export const lateGameEquipment = [
  equipment('bottomless-singularity', 'Bottomless Singularity Bag', 'bag', 13, 'singularity-vault', { weightMultiplier: 1.20 }, 200000000, 200000, [600,200,10,1], [[0,4,10]]),
  equipment('event-horizon-vault', 'Event Horizon Vault', 'bag', 14, 'bottomless-singularity', { weightMultiplier: 1.35 }, 325000000, 325000, [1500,500,25,1], [[0,5,20],[1,5,5]]),
  equipment('omnidimensional-vault', 'Omnidimensional Vault', 'bag', 15, 'event-horizon-vault', { weightMultiplier: 1.50 }, 500000000, 425000, [3000,1200,75,2,1], [[0,5,30],[1,6,15]]),
  equipment('plastic-shopping-bag', 'Plastic Shopping Bag', 'bag', 16, 'omnidimensional-vault', { weightMultiplier: 1.55 }, 500000000.10, 1000000, [10000,4000,500,50,0,1], [[1,7,15],[2,8,5],[3,8,1]]),
  equipment('neutron-boots', 'Neutron Boots', 'boots', 13, 'gravitational-boots', { weightLuck: 8 }, 100000000, 200000, [500,175,10], [[0,5,15],[1,5,5]]),
  equipment('spacetime-walkers', 'Spacetime Walkers', 'boots', 14, 'neutron-boots', { weightLuck: 8.75 }, 200000000, 325000, [1250,450,25,1], [[0,5,25],[1,6,10]]),
  equipment('reality-breakers', 'Reality Breakers', 'boots', 15, 'spacetime-walkers', { weightLuck: 9.5 }, 350000000, 425000, [2500,1000,75,2,1], [[0,6,40],[1,6,20]]),
  equipment('empyrean-pickaxe', 'Empyrean Pickaxe', 'pickaxe', 16, 'celestial-pickaxe', { luck: 26, rollSpeed: 1.9 }, 350000000, 350000, [3000,1200,75,2,1], [[0,5,30],[1,5,15]]),
  equipment('eternity-pickaxe', 'Eternity Pickaxe', 'pickaxe', 17, 'empyrean-pickaxe', { luck: 27, rollSpeed: 2 }, 500000000, 425000, [6000,2500,200,3,2], [[0,6,50],[1,6,25]])
];
const plastic = lateGameEquipment.find(item => item.id === 'plastic-shopping-bag');
plastic.description = 'Somehow holds more than the Omnidimensional Vault. Costs 10¢ at checkout. Heavy specimens are included in bulk totals.';
plastic.requirements.push({ type: 'consumable', consumableId: 'plastic-bag', amount: 67 });
