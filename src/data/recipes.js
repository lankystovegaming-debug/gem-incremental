const recipes = [
  // =========================================================
  // PICKAXES — LUCK
  // =========================================================

  {
    id: "crude-pickaxe",
    name: "Crude Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "gem-count", gem: "Quartz", amount: 5 },
      { type: "gem-count", gem: "Feldspar", amount: 3 },
      { type: "gem-count", gem: "Fluorite", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 1 }
    ],

    moneyCost: 225,

    reward: {
      id: "crude-pickaxe",
      name: "Crude Pickaxe",
      category: "pickaxe",
      tier: 1,

      bonus: {
        luck: 0.05
      }
    }
  },

  {
    id: "reinforced-pickaxe",
    name: "Reinforced Pickaxe",
    category: "pickaxe",

    requirements: [
      {
        type: "equipment",
        equipmentId: "crude-pickaxe"
      },
      { type: "gem-count", gem: "Hematite", amount: 4 },
      { type: "gem-count", gem: "Obsidian", amount: 3 },
      { type: "gem-count", gem: "Garnet", amount: 2 },
      { type: "gem-count", gem: "Peridot", amount: 1 }
    ],

    moneyCost: 900,

    reward: {
      id: "reinforced-pickaxe",
      name: "Reinforced Pickaxe",
      category: "pickaxe",
      tier: 2,

      bonus: {
        luck: 0.15
      }
    }
  },

  {
    id: "polished-pickaxe",
    name: "Polished Pickaxe",
    category: "pickaxe",

    requirements: [
      {
        type: "equipment",
        equipmentId: "reinforced-pickaxe"
      },
      { type: "gem-count", gem: "Garnet", amount: 1 },
      { type: "gem-count", gem: "Peridot", amount: 1 },
      { type: "gem-count", gem: "Topaz", amount: 1 },
      { type: "gem-count", gem: "Aquamarine", amount: 1 }
    ],

    moneyCost: 3150,

    reward: {
      id: "polished-pickaxe",
      name: "Polished Pickaxe",
      category: "pickaxe",
      tier: 3,

      bonus: {
        luck: 0.50
      }
    }
  },

  {
    id: "refined-pickaxe",
    name: "Refined Pickaxe",
    category: "pickaxe",

    requirements: [
      {
        type: "equipment",
        equipmentId: "polished-pickaxe"
      },
      { type: "gem-count", gem: "Topaz", amount: 1 },
      { type: "gem-count", gem: "Aquamarine", amount: 1 },
      { type: "gem-count", gem: "Tourmaline", amount: 1 },
      { type: "gem-count", gem: "Opal", amount: 1 }
    ],

    moneyCost: 6750,

    reward: {
      id: "refined-pickaxe",
      name: "Refined Pickaxe",
      category: "pickaxe",
      tier: 4,

      bonus: {
        luck: 0.80
      }
    }
  },

  {
    id: "masterwork-pickaxe",
    name: "Masterwork Pickaxe",
    category: "pickaxe",

    requirements: [
      {
        type: "equipment",
        equipmentId: "refined-pickaxe"
      },
      { type: "gem-count", gem: "Quartz", amount: 100 },
      { type: "gem-count", gem: "Feldspar", amount: 50 },
      { type: "gem-count", gem: "Hematite", amount: 25 },
      { type: "gem-count", gem: "Obsidian", amount: 15 },
      { type: "gem-count", gem: "Sapphire", amount: 1 }
    ],

    moneyCost: 18000,

    reward: {
      id: "masterwork-pickaxe",
      name: "Masterwork Pickaxe",
      category: "pickaxe",
      tier: 5,

      bonus: {
        luck: 1.50
      }
    }
  },


  // =========================================================
  // LANTERNS — ROLL SPEED
  // =========================================================

  {
    id: "dim-lantern",
    name: "Dim Lantern",
    category: "lantern",

    requirements: [
      { type: "gem-count", gem: "Calcite", amount: 5 },
      { type: "gem-count", gem: "Fluorite", amount: 3 },
      { type: "gem-count", gem: "Hematite", amount: 2 },
      { type: "gem-count", gem: "Jasper", amount: 1 }
    ],

    moneyCost: 225,

    reward: {
      id: "dim-lantern",
      name: "Dim Lantern",
      category: "lantern",
      tier: 1,

      bonus: {
        rollSpeed: 0.05
      }
    }
  },

  {
    id: "bright-lantern",
    name: "Bright Lantern",
    category: "lantern",

    requirements: [
      {
        type: "equipment",
        equipmentId: "dim-lantern"
      },
      { type: "gem-count", gem: "Fluorite", amount: 4 },
      { type: "gem-count", gem: "Hematite", amount: 3 },
      { type: "gem-count", gem: "Amethyst", amount: 2 },
      { type: "gem-count", gem: "Garnet", amount: 1 }
    ],

    moneyCost: 900,

    reward: {
      id: "bright-lantern",
      name: "Bright Lantern",
      category: "lantern",
      tier: 2,

      bonus: {
        rollSpeed: 0.10
      }
    }
  },

  {
    id: "radiant-lantern",
    name: "Radiant Lantern",
    category: "lantern",

    requirements: [
      {
        type: "equipment",
        equipmentId: "bright-lantern"
      },
      { type: "gem-count", gem: "Peridot", amount: 3 }
    ],

    moneyCost: 3150,

    reward: {
      id: "radiant-lantern",
      name: "Radiant Lantern",
      category: "lantern",
      tier: 3,

      bonus: {
        rollSpeed: 0.25
      }
    }
  },

  {
    id: "beacon-lantern",
    name: "Beacon Lantern",
    category: "lantern",

    requirements: [
      {
        type: "equipment",
        equipmentId: "radiant-lantern"
      },

      {
        id: "beacon-fluorite",
        type: "gem-min-weight-multiplier",
        gem: "Fluorite",
        minimumWeightMultiplier: 3,
        amount: 1
      },

      {
        id: "beacon-hematite",
        type: "gem-min-weight-multiplier",
        gem: "Hematite",
        minimumWeightMultiplier: 2.5,
        amount: 1
      },

      {
        id: "beacon-agate",
        type: "gem-min-weight-multiplier",
        gem: "Agate",
        minimumWeightMultiplier: 2,
        amount: 1
      },

      {
        id: "beacon-amethyst",
        type: "gem-min-weight-multiplier",
        gem: "Amethyst",
        minimumWeightMultiplier: 1.5,
        amount: 1
      }
    ],

    moneyCost: 7200,

    reward: {
      id: "beacon-lantern",
      name: "Beacon Lantern",
      category: "lantern",
      tier: 4,

      bonus: {
        rollSpeed: 0.40
      }
    }
  },

  {
    id: "eternal-lantern",
    name: "Eternal Lantern",
    category: "lantern",

    requirements: [
      {
        type: "equipment",
        equipmentId: "beacon-lantern"
      },

      { type: "gem-count", gem: "Amethyst", amount: 1 },
      { type: "gem-count", gem: "Peridot", amount: 1 },
      { type: "gem-count", gem: "Aquamarine", amount: 1 },
      { type: "gem-count", gem: "Opal", amount: 1 },
      { type: "gem-count", gem: "Sapphire", amount: 1 },
      { type: "gem-count", gem: "Emerald", amount: 1 }
    ],

    moneyCost: 18000,

    reward: {
      id: "eternal-lantern",
      name: "Eternal Lantern",
      category: "lantern",
      tier: 5,

      bonus: {
        rollSpeed: 0.60
      }
    }
  },


  // =========================================================
  // BOOTS — WEIGHT LUCK
  // =========================================================

  {
    id: "miners-boots",
    name: "Miner's Boots",
    category: "boots",

    requirements: [
      { type: "gem-count", gem: "Quartz", amount: 4 },
      { type: "gem-count", gem: "Calcite", amount: 3 },
      { type: "gem-count", gem: "Obsidian", amount: 2 },
      { type: "gem-count", gem: "Jasper", amount: 1 }
    ],

    moneyCost: 225,

    reward: {
      id: "miners-boots",
      name: "Miner's Boots",
      category: "boots",
      tier: 1,

      bonus: {
        weightLuck: 0.05
      }
    }
  },

  {
    id: "reinforced-boots",
    name: "Reinforced Boots",
    category: "boots",

    requirements: [
      {
        type: "equipment",
        equipmentId: "miners-boots"
      },

      { type: "gem-count", gem: "Feldspar", amount: 4 },
      { type: "gem-count", gem: "Hematite", amount: 3 },
      { type: "gem-count", gem: "Jasper", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 1 }
    ],

    moneyCost: 900,

    reward: {
      id: "reinforced-boots",
      name: "Reinforced Boots",
      category: "boots",
      tier: 2,

      bonus: {
        weightLuck: 0.15
      }
    }
  },

  {
    id: "prospectors-boots",
    name: "Prospector's Boots",
    category: "boots",

    requirements: [
      {
        type: "equipment",
        equipmentId: "reinforced-boots"
      },

      {
        id: "prospector-quartz",
        type: "gem-total-weight",
        gem: "Quartz",
        totalWeight: 1000
      },

      {
        id: "prospector-obsidian",
        type: "gem-total-weight",
        gem: "Obsidian",
        totalWeight: 900
      },

      {
        id: "prospector-amethyst",
        type: "gem-total-weight",
        gem: "Amethyst",
        totalWeight: 500
      }
    ],

    moneyCost: 3150,

    reward: {
      id: "prospectors-boots",
      name: "Prospector's Boots",
      category: "boots",
      tier: 3,

      bonus: {
        weightLuck: 0.40
      }
    }
  },

  {
    id: "fortune-boots",
    name: "Fortune Boots",
    category: "boots",

    requirements: [
      {
        type: "equipment",
        equipmentId: "prospectors-boots"
      },

      // Put the strictest high-weight requirement first
      // so Auto Craft doesn't send a 3x specimen into the 2x slot.

      {
        id: "fortune-huge",
        type: "specimen-condition",
        label: "Huge specimen ≥ 3.0×",
        minimumWeightMultiplier: 3,
        maximumRarity: 50,
        amount: 1
      },

      {
        id: "fortune-heavy",
        type: "specimen-condition",
        label: "Heavy specimen ≥ 2.0×",
        minimumWeightMultiplier: 2,
        maximumRarity: 50,
        amount: 1
      },

      {
        id: "fortune-normal",
        type: "specimen-condition",
        label: "Normal specimen 0.90×–1.10×",
        minimumWeightMultiplier: 0.9,
        maximumWeightMultiplier: 1.1,
        maximumRarity: 50,
        amount: 1
      },

      {
        id: "fortune-small",
        type: "specimen-condition",
        label: "Small specimen ≤ 0.75×",
        maximumWeightMultiplier: 0.75,
        maximumRarity: 50,
        amount: 1
      }
    ],

    moneyCost: 7200,

    reward: {
      id: "fortune-boots",
      name: "Fortune Boots",
      category: "boots",
      tier: 4,

      bonus: {
        weightLuck: 0.70
      }
    }
  },

  {
    id: "gravity-boots",
    name: "Gravity Boots",
    category: "boots",

    requirements: [
      {
        type: "equipment",
        equipmentId: "fortune-boots"
      },

      {
        id: "gravity-specimen",
        type: "specimen-condition",
        label: "1/10+ rarity specimen ≥ 5.0×",
        minimumRarity: 10,
        minimumWeightMultiplier: 5,
        amount: 1
      }
    ],

    moneyCost: 18000,

    reward: {
      id: "gravity-boots",
      name: "Gravity Boots",
      category: "boots",
      tier: 5,

      bonus: {
        weightLuck: 1.25
      }
    }
  },


  // =========================================================
  // BAGS — WEIGHT MULTIPLIER
  // =========================================================

  {
    id: "worn-bag",
    name: "Worn Bag",
    category: "bag",

    requirements: [
      { type: "gem-count", gem: "Quartz", amount: 6 },
      { type: "gem-count", gem: "Feldspar", amount: 4 },
      { type: "gem-count", gem: "Hematite", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 1 }
    ],

    moneyCost: 360,

    reward: {
      id: "worn-bag",
      name: "Worn Bag",
      category: "bag",
      tier: 1,

      bonus: {
        weightMultiplier: 0.01
      }
    }
  },

  {
    id: "sturdy-bag",
    name: "Sturdy Bag",
    category: "bag",

    requirements: [
      {
        type: "equipment",
        equipmentId: "worn-bag"
      },

      { type: "gem-count", gem: "Feldspar", amount: 6 },
      { type: "gem-count", gem: "Obsidian", amount: 4 },
      { type: "gem-count", gem: "Jasper", amount: 2 },
      { type: "gem-count", gem: "Garnet", amount: 1 }
    ],

    moneyCost: 1350,

    reward: {
      id: "sturdy-bag",
      name: "Sturdy Bag",
      category: "bag",
      tier: 2,

      bonus: {
        weightMultiplier: 0.03
      }
    }
  },

  {
    id: "reinforced-bag",
    name: "Reinforced Bag",
    category: "bag",

    requirements: [
      {
        type: "equipment",
        equipmentId: "sturdy-bag"
      },

      {
        id: "reinforced-bag-value",
        type: "specimen-value-total",
        totalValue: 7500
      }
    ],

    moneyCost: 2250,

    reward: {
      id: "reinforced-bag",
      name: "Reinforced Bag",
      category: "bag",
      tier: 3,

      bonus: {
        weightMultiplier: 0.06
      }
    }
  },

  {
    id: "gemkeeper-bag",
    name: "Gemkeeper Bag",
    category: "bag",

    requirements: [
      {
        type: "equipment",
        equipmentId: "reinforced-bag"
      },

      {
        id: "gemkeeper-rarity",
        type: "rarity-points",
        points: 500,
        minimumUniqueGemTypes: 5
      }
    ],

    moneyCost: 9000,

    reward: {
      id: "gemkeeper-bag",
      name: "Gemkeeper Bag",
      category: "bag",
      tier: 4,

      bonus: {
        weightMultiplier: 0.10
      }
    }
  },

  {
    id: "bottomless-bag",
    name: "Bottomless Bag",
    category: "bag",

    requirements: [
      {
        type: "equipment",
        equipmentId: "gemkeeper-bag"
      },

      {
        id: "bottomless-gems",
        type: "gem-range",
        label: "One of every gem: Quartz → Sapphire",
        amountEach: 1,

        gems: [
          "Quartz",
          "Calcite",
          "Feldspar",
          "Fluorite",
          "Hematite",
          "Obsidian",
          "Agate",
          "Jasper",
          "Amethyst",
          "Garnet",
          "Peridot",
          "Topaz",
          "Aquamarine",
          "Tourmaline",
          "Opal",
          "Zircon",
          "Spinel",
          "Sapphire"
        ]
      }
    ],

    moneyCost: 22500,

    reward: {
      id: "bottomless-bag",
      name: "Bottomless Bag",
      category: "bag",
      tier: 5,

      bonus: {
        weightMultiplier: 0.15
      }
    }
  }
];

export default recipes;
