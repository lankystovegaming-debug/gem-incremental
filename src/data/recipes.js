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
        luck: 0.05,
        rollSpeed: 0.05
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
        luck: 0.15,
        rollSpeed: 0.10
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
        luck: 0.50,
        rollSpeed: 0.20
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
        luck: 0.80,
        rollSpeed: 0.30
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
        luck: 1.50,
        rollSpeed: 0.45
      }
    }
  },

  {
    id: "mythic-pickaxe",
    name: "Mythic Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "equipment", equipmentId: "masterwork-pickaxe" },
      { type: "gem-count", gem: "Diamond", amount: 2 },
      { type: "gem-count", gem: "Tanzanite", amount: 2 },
      { type: "gem-count", gem: "Alexandrite", amount: 1 }
    ],

    moneyCost: 25000,

    reward: {
      id: "mythic-pickaxe",
      name: "Mythic Pickaxe",
      category: "pickaxe",
      tier: 6,
      bonus: { luck: 2.50, rollSpeed: 0.60 }
    }
  },

  {
    id: "aether-pickaxe",
    name: "Aether Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "equipment", equipmentId: "mythic-pickaxe" },
      { type: "gem-count", gem: "Benitoite", amount: 2 },
      { type: "gem-count", gem: "Red Beryl", amount: 2 },
      { type: "gem-count", gem: "Black Opal", amount: 1 }
    ],

    moneyCost: 40000,

    reward: {
      id: "aether-pickaxe",
      name: "Aether Pickaxe",
      category: "pickaxe",
      tier: 7,
      bonus: { luck: 4.00, rollSpeed: 0.80 }
    }
  },

  {
    id: "voidbreaker-pickaxe",
    name: "Voidbreaker Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "equipment", equipmentId: "aether-pickaxe" },
      { type: "gem-count", gem: "Grandidierite", amount: 2 },
      { type: "gem-count", gem: "Taaffeite", amount: 1 },
      { type: "gem-count", gem: "Musgravite", amount: 1 }
    ],

    moneyCost: 65000,

    reward: {
      id: "voidbreaker-pickaxe",
      name: "Voidbreaker Pickaxe",
      category: "pickaxe",
      tier: 8,
      bonus: { luck: 7.00, rollSpeed: 1.00 }
    }
  },

  {
    id: "veteran-pickaxe",
    name: "Veteran Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "equipment", equipmentId: "voidbreaker-pickaxe" },
      { type: "gem-count", gem: "Quartz", amount: 200 },
      { type: "gem-count", gem: "Amethyst", amount: 100 },
      { type: "gem-count", gem: "Aquamarine", amount: 50 },
      { type: "gem-count", gem: "Painite", amount: 1 },
      { type: "lifetime-rolls", rolls: 2500 }
    ],

    moneyCost: 110000,

    reward: {
      id: "veteran-pickaxe",
      name: "Veteran Pickaxe",
      category: "pickaxe",
      tier: 9,
      bonus: { luck: 10.00, rollSpeed: 1.15 }
    }
  },

  {
    id: "ascendant-pickaxe",
    name: "Ascendant Pickaxe",
    category: "pickaxe",

    requirements: [
      { type: "equipment", equipmentId: "veteran-pickaxe" },
      { type: "gem-count", gem: "Quartz", amount: 500 },
      { type: "gem-count", gem: "Amethyst", amount: 250 },
      { type: "gem-count", gem: "Aquamarine", amount: 100 },
      { type: "gem-count", gem: "Poudretteite", amount: 1 },
      { type: "lifetime-rolls", rolls: 5000 }
    ],

    moneyCost: 225000,

    reward: {
      id: "ascendant-pickaxe",
      name: "Ascendant Pickaxe",
      category: "pickaxe",
      tier: 10,
      bonus: { luck: 14.00, rollSpeed: 1.30 }
    }
  },

  {
    id: "eclipse-pickaxe",
    name: "Eclipse Pickaxe",
    category: "pickaxe",
    requirements: [
      { type: "equipment", equipmentId: "ascendant-pickaxe" },
      { type: "gem-count", gem: "Aether Quartz", amount: 2 },
      { type: "gem-count", gem: "Black Diamond", amount: 1 },
      { type: "gem-count", gem: "Void Opal", amount: 1 },
      { type: "lifetime-rolls", rolls: 10000 }
    ],
    moneyCost: 500000,
    reward: {
      id: "eclipse-pickaxe",
      name: "Eclipse Pickaxe",
      category: "pickaxe",
      tier: 11,
      bonus: { luck: 16, rollSpeed: 1.40 }
    }
  },

  {
    id: "singularity-pickaxe",
    name: "Singularity Pickaxe",
    category: "pickaxe",
    requirements: [
      { type: "equipment", equipmentId: "eclipse-pickaxe" },
      { type: "gem-count", gem: "Tugtupite", amount: 2 },
      { type: "gem-count", gem: "Chronite", amount: 1 },
      { type: "gem-count", gem: "Meteorite Peridot", amount: 1 },
      { type: "lifetime-rolls", rolls: 20000 }
    ],
    moneyCost: 1100000,
    reward: {
      id: "singularity-pickaxe",
      name: "Singularity Pickaxe",
      category: "pickaxe",
      tier: 12,
      bonus: { luck: 18, rollSpeed: 1.50 }
    }
  },

  {
    id: "transcendent-pickaxe",
    name: "Transcendent Pickaxe",
    category: "pickaxe",
    requirements: [
      { type: "equipment", equipmentId: "singularity-pickaxe" },
      { type: "gem-count", gem: "Ringwoodite", amount: 2 },
      { type: "gem-count", gem: "Pallasite Crystal", amount: 1 },
      { type: "gem-count", gem: "Antimatter Crystal", amount: 1 },
      { type: "lifetime-rolls", rolls: 30000 }
    ],
    moneyCost: 2500000,
    reward: {
      id: "transcendent-pickaxe",
      name: "Transcendent Pickaxe",
      category: "pickaxe",
      tier: 13,
      bonus: { luck: 21, rollSpeed: 1.60 }
    }
  },

  {
    id: "astral-pickaxe",
    name: "Astral Pickaxe",
    category: "pickaxe",
    requirements: [
      { type: "equipment", equipmentId: "transcendent-pickaxe" },
      { type: "gem-count", gem: "Peridot", amount: 750 },
      { type: "gem-count", gem: "Topaz", amount: 500 },
      { type: "gem-count", gem: "Tourmaline", amount: 250 },
      { type: "gem-count", gem: "Antimatter Crystal", amount: 1 },
      { type: "lifetime-rolls", rolls: 40000 }
    ],
    moneyCost: 50000000,
    reward: {
      id: "astral-pickaxe",
      name: "Astral Pickaxe",
      category: "pickaxe",
      tier: 14,
      bonus: { luck: 23, rollSpeed: 1.70 }
    }
  },

  {
    id: "celestial-pickaxe",
    name: "Celestial Pickaxe",
    category: "pickaxe",
    requirements: [
      { type: "equipment", equipmentId: "astral-pickaxe" },
      { type: "gem-count", gem: "Opal", amount: 300 },
      { type: "gem-count", gem: "Zircon", amount: 200 },
      { type: "gem-count", gem: "Moonstone", amount: 150 },
      { type: "gem-count", gem: "Lunar Diamond", amount: 1 },
      { type: "gem-count", gem: "Singularity Shard", amount: 1 },
      { type: "lifetime-rolls", rolls: 60000 }
    ],
    moneyCost: 125000000,
    reward: {
      id: "celestial-pickaxe",
      name: "Celestial Pickaxe",
      category: "pickaxe",
      tier: 15,
      bonus: { luck: 25, rollSpeed: 1.80 }
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

  {
    id: "celestial-lantern",
    name: "Celestial Lantern",
    category: "lantern",

    requirements: [
      { type: "equipment", equipmentId: "eternal-lantern" },
      { type: "gem-count", gem: "Diamond", amount: 2 },
      { type: "gem-count", gem: "Tanzanite", amount: 1 },
      { type: "gem-count", gem: "Alexandrite", amount: 1 }
    ],

    moneyCost: 22000,

    reward: {
      id: "celestial-lantern",
      name: "Celestial Lantern",
      category: "lantern",
      tier: 6,
      bonus: { rollSpeed: 0.80 }
    }
  },

  {
    id: "aether-lantern",
    name: "Aether Lantern",
    category: "lantern",

    requirements: [
      { type: "equipment", equipmentId: "celestial-lantern" },
      { type: "gem-count", gem: "Benitoite", amount: 2 },
      { type: "gem-count", gem: "Red Beryl", amount: 1 },
      { type: "gem-count", gem: "Black Opal", amount: 1 }
    ],

    moneyCost: 35000,

    reward: {
      id: "aether-lantern",
      name: "Aether Lantern",
      category: "lantern",
      tier: 7,
      bonus: { rollSpeed: 1.25 }
    }
  },

  {
    id: "void-lantern",
    name: "Void Lantern",
    category: "lantern",

    requirements: [
      { type: "equipment", equipmentId: "aether-lantern" },
      { type: "gem-count", gem: "Grandidierite", amount: 1 },
      { type: "gem-count", gem: "Taaffeite", amount: 1 },
      { type: "gem-count", gem: "Musgravite", amount: 1 }
    ],

    moneyCost: 55000,

    reward: {
      id: "void-lantern",
      name: "Void Lantern",
      category: "lantern",
      tier: 8,
      bonus: { rollSpeed: 1.80 }
    }
  },

  {
    id: "event-horizon-lantern",
    name: "Event Horizon Lantern",
    category: "lantern",
    requirements: [
      { type: "equipment", equipmentId: "void-lantern" },
      { type: "gem-count", gem: "Blue Garnet", amount: 5 },
      { type: "gem-count", gem: "Kyawthuite", amount: 3 },
      { type: "gem-count", gem: "Natural Moissanite", amount: 2 },
      { type: "gem-count", gem: "Aether Quartz", amount: 1 },
      { type: "lifetime-rolls", rolls: 10000 }
    ],
    moneyCost: 175000,
    reward: {
      id: "event-horizon-lantern",
      name: "Event Horizon Lantern",
      category: "lantern",
      tier: 9,
      bonus: { rollSpeed: 2.1 }
    }
  },

  {
    id: "singularity-lantern",
    name: "Singularity Lantern",
    category: "lantern",
    requirements: [
      { type: "equipment", equipmentId: "event-horizon-lantern" },
      { type: "gem-count", gem: "Aether Quartz", amount: 4 },
      { type: "gem-count", gem: "Black Diamond", amount: 2 },
      { type: "gem-count", gem: "Void Opal", amount: 2 },
      { type: "gem-count", gem: "Tugtupite", amount: 1 },
      { type: "lifetime-rolls", rolls: 20000 }
    ],
    moneyCost: 400000,
    reward: {
      id: "singularity-lantern",
      name: "Singularity Lantern",
      category: "lantern",
      tier: 10,
      bonus: { rollSpeed: 2.4 }
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

  {
    id: "astral-boots",
    name: "Astral Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "gravity-boots" },
      { type: "gem-count", gem: "Diamond", amount: 1 },
      { type: "gem-count", gem: "Tanzanite", amount: 2 },
      { type: "gem-count", gem: "Alexandrite", amount: 1 }
    ],
    moneyCost: 22000,
    reward: {
      id: "astral-boots",
      name: "Astral Boots",
      category: "boots",
      tier: 6,
      bonus: { weightLuck: 1.75 }
    }
  },

  {
    id: "aetherstep-boots",
    name: "Aetherstep Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "astral-boots" },
      { type: "gem-count", gem: "Benitoite", amount: 1 },
      { type: "gem-count", gem: "Red Beryl", amount: 2 },
      { type: "gem-count", gem: "Black Opal", amount: 1 }
    ],
    moneyCost: 35000,
    reward: {
      id: "aetherstep-boots",
      name: "Aetherstep Boots",
      category: "boots",
      tier: 7,
      bonus: { weightLuck: 2.50 }
    }
  },

  {
    id: "voidwalker-boots",
    name: "Voidwalker Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "aetherstep-boots" },
      { type: "gem-count", gem: "Grandidierite", amount: 1 },
      { type: "gem-count", gem: "Taaffeite", amount: 1 },
      { type: "gem-count", gem: "Musgravite", amount: 1 }
    ],
    moneyCost: 55000,
    reward: {
      id: "voidwalker-boots",
      name: "Voidwalker Boots",
      category: "boots",
      tier: 8,
      bonus: { weightLuck: 4.00 }
    }
  },

  {
    id: "eventide-boots",
    name: "Eventide Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "voidwalker-boots" },
      {
        id: "eventide-heavy-rare",
        type: "specimen-condition",
        label: "1/25,000+ rarity specimen ≥ 3.0×",
        minimumRarity: 25000,
        minimumWeightMultiplier: 3,
        amount: 1
      },
      { type: "gem-count", gem: "Natural Moissanite", amount: 2 },
      { type: "gem-count", gem: "Aether Quartz", amount: 1 },
      { type: "gem-count", gem: "Void Opal", amount: 1 },
      { type: "lifetime-rolls", rolls: 10000 }
    ],
    moneyCost: 250000,
    reward: {
      id: "eventide-boots",
      name: "Eventide Boots",
      category: "boots",
      tier: 9,
      bonus: { weightLuck: 4.75 }
    }
  },

  {
    id: "singularity-striders",
    name: "Singularity Striders",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "eventide-boots" },
      {
        id: "singularity-heavy-rare",
        type: "specimen-condition",
        label: "1/100,000+ rarity specimen ≥ 4.0×",
        minimumRarity: 100000,
        minimumWeightMultiplier: 4,
        amount: 1
      },
      { type: "gem-count", gem: "Tugtupite", amount: 2 },
      { type: "gem-count", gem: "Chronite", amount: 1 },
      { type: "gem-count", gem: "Meteorite Peridot", amount: 1 },
      { type: "lifetime-rolls", rolls: 20000 }
    ],
    moneyCost: 600000,
    reward: {
      id: "singularity-striders",
      name: "Singularity Striders",
      category: "boots",
      tier: 10,
      bonus: { weightLuck: 5.75 }
    }
  },

  {
    id: "event-horizon-boots",
    name: "Event Horizon Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "singularity-striders" },
      { type: "gem-count", gem: "Aquamarine", amount: 500 },
      { type: "gem-count", gem: "Tourmaline", amount: 300 },
      { type: "gem-count", gem: "Opal", amount: 200 },
      { type: "gem-count", gem: "Ringwoodite", amount: 1 },
      { type: "lifetime-rolls", rolls: 30000 }
    ],
    moneyCost: 15000000,
    reward: {
      id: "event-horizon-boots", name: "Event Horizon Boots", category: "boots", tier: 11,
      bonus: { weightLuck: 6.50 }
    }
  },

  {
    id: "gravitational-boots",
    name: "Gravitational Boots",
    category: "boots",
    requirements: [
      { type: "equipment", equipmentId: "event-horizon-boots" },
      { type: "gem-count", gem: "Opal", amount: 400 },
      { type: "gem-count", gem: "Zircon", amount: 250 },
      { type: "gem-count", gem: "Moonstone", amount: 150 },
      { type: "gem-count", gem: "Pallasite Crystal", amount: 1 },
      { type: "lifetime-rolls", rolls: 50000 },
      { id: "gravitational-heavy-rare", type: "roll-history-condition", label: "Rolled a 1/100,000+ base-rarity specimen at ≥5× natural weight", minimumRarity: 100000, minimumWeightMultiplier: 5 }
    ],
    moneyCost: 40000000,
    reward: {
      id: "gravitational-boots", name: "Gravitational Boots", category: "boots", tier: 12,
      bonus: { weightLuck: 7.25 }
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
  },

  {
    id: "colossal-bag",
    name: "Colossal Bag",
    category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "bottomless-bag" },
      { type: "gem-count", gem: "Alexandrite", amount: 2 },
      { type: "gem-count", gem: "Benitoite", amount: 2 },
      { type: "gem-count", gem: "Black Opal", amount: 1 }
    ],
    moneyCost: 45000,
    reward: {
      id: "colossal-bag",
      name: "Colossal Bag",
      category: "bag",
      tier: 6,
      bonus: { weightMultiplier: 0.25 }
    }
  },

  {
    id: "aetherwoven-bag",
    name: "Aetherwoven Bag",
    category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "colossal-bag" },
      { type: "gem-count", gem: "Musgravite", amount: 2 },
      { type: "gem-count", gem: "Painite", amount: 1 },
      { type: "gem-count", gem: "Jeremejevite", amount: 1 }
    ],
    moneyCost: 90000,
    reward: {
      id: "aetherwoven-bag",
      name: "Aetherwoven Bag",
      category: "bag",
      tier: 7,
      bonus: { weightMultiplier: 0.40 }
    }
  },

  {
    id: "dimensional-bag",
    name: "Dimensional Bag",
    category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "aetherwoven-bag" },
      { type: "gem-count", gem: "Poudretteite", amount: 1 },
      { type: "gem-count", gem: "Serendibite", amount: 1 },
      { type: "gem-count", gem: "Blue Garnet", amount: 1 }
    ],
    moneyCost: 175000,
    reward: {
      id: "dimensional-bag",
      name: "Dimensional Bag",
      category: "bag",
      tier: 8,
      bonus: { weightMultiplier: 0.65 }
    }
  },

  {
    id: "riftwoven-bag", name: "Riftwoven Bag", category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "dimensional-bag" },
      { type: "gem-count", gem: "Sapphire", amount: 250 },
      { type: "gem-count", gem: "Ruby", amount: 175 },
      { type: "gem-count", gem: "Emerald", amount: 125 },
      { type: "lifetime-rolls", rolls: 20000 }
    ],
    moneyCost: 10000000,
    reward: { id: "riftwoven-bag", name: "Riftwoven Bag", category: "bag", tier: 9, bonus: { weightMultiplier: 0.75 } }
  },
  {
    id: "vault-of-plenty", name: "Vault of Plenty", category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "riftwoven-bag" },
      { type: "gem-count", gem: "Tanzanite", amount: 150 },
      { type: "gem-count", gem: "Alexandrite", amount: 100 },
      { type: "gem-count", gem: "Benitoite", amount: 75 },
      { type: "gem-count", gem: "Ringwoodite", amount: 1 },
      { type: "lifetime-rolls", rolls: 35000 }
    ],
    moneyCost: 35000000,
    reward: { id: "vault-of-plenty", name: "Vault of Plenty", category: "bag", tier: 10, bonus: { weightMultiplier: 0.85 } }
  },
  {
    id: "dimensional-vault", name: "Dimensional Vault", category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "vault-of-plenty" },
      { type: "gem-count", gem: "Black Opal", amount: 100 },
      { type: "gem-count", gem: "Grandidierite", amount: 75 },
      { type: "gem-count", gem: "Taaffeite", amount: 50 },
      { type: "gem-count", gem: "Pallasite Crystal", amount: 1 },
      { type: "lifetime-rolls", rolls: 50000 }
    ],
    moneyCost: 90000000,
    reward: { id: "dimensional-vault", name: "Dimensional Vault", category: "bag", tier: 11, bonus: { weightMultiplier: 0.95 } }
  },
  {
    id: "singularity-vault", name: "Singularity Vault", category: "bag",
    requirements: [
      { type: "equipment", equipmentId: "dimensional-vault" },
      { type: "gem-count", gem: "Musgravite", amount: 75 },
      { type: "gem-count", gem: "Painite", amount: 50 },
      { type: "gem-count", gem: "Unlucky Gem", amount: 1 },
      { type: "gem-count", gem: "Antimatter Crystal", amount: 1 },
      { type: "lifetime-rolls", rolls: 75000 },
      { id: "singularity-vault-heavy-rare", type: "roll-history-condition", label: "Rolled a 1/1,000,000+ base-rarity specimen at ≥6× natural weight", minimumRarity: 1000000, minimumWeightMultiplier: 6 }
    ],
    moneyCost: 200000000,
    reward: { id: "singularity-vault", name: "Singularity Vault", category: "bag", tier: 12, bonus: { weightMultiplier: 1.05 } }
  },
  {
    id: "bottomless-singularity", name: "Bottomless Singularity", category: "bag",
    description: "At some point, calling this a bag stopped making sense.",
    requirements: [
      { type: "equipment", equipmentId: "singularity-vault" },
      { type: "gem-count", gem: "Sapphire", amount: 10000 },
      { type: "gem-count", gem: "Diamond", amount: 5000 },
      { type: "gem-count", gem: "Alexandrite", amount: 2500 },
      { type: "gem-count", gem: "Black Opal", amount: 1000 },
      { type: "gem-count", gem: "Grandidierite", amount: 750 },
      { type: "gem-count", gem: "Taaffeite", amount: 500 },
      { type: "gem-count", gem: "Musgravite", amount: 350 },
      { type: "gem-count", gem: "Painite", amount: 250 },
      { type: "gem-count", gem: "Ringwoodite", amount: 10 },
      { type: "gem-count", gem: "Pallasite Crystal", amount: 7 },
      { type: "gem-count", gem: "Antimatter Crystal", amount: 5 },
      { type: "gem-count", gem: "Unlucky Gem", amount: 10 },
      { type: "lifetime-rolls", rolls: 400000 },
      { id: "bottomless-singularity-heavy-rare", type: "roll-history-condition", label: "Rolled a 1/1,000,000+ base-rarity specimen at ≥8× natural weight", minimumRarity: 1000000, minimumWeightMultiplier: 8 }
    ],
    moneyCost: 750000000,
    reward: { id: "bottomless-singularity", name: "Bottomless Singularity", category: "bag", tier: 13, bonus: { weightMultiplier: 2.00 } }
  },

  // =========================================================
  // POTIONS — REPEATABLE CONSUMABLE RECIPES
  // =========================================================

  {
    id: "lucky-potion-2", name: "Lucky Potion II", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "lucky-potion-1", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 3 }
    ],
    moneyCost: 300,
    reward: { type: "consumable", id: "lucky-potion-2", name: "Lucky Potion II", family: "luck", tier: 2, amount: 1, effectValue: 0.25 }
  },
  {
    id: "lucky-potion-3", name: "Lucky Potion III", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "lucky-potion-2", amount: 2 },
      { type: "gem-count", gem: "Topaz", amount: 3 },
      { type: "gem-count", gem: "Opal", amount: 2 }
    ],
    moneyCost: 1000,
    reward: { type: "consumable", id: "lucky-potion-3", name: "Lucky Potion III", family: "luck", tier: 3, amount: 1, effectValue: 0.50 }
  },
  {
    id: "legendary-potion", name: "Legendary Potion", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "lucky-potion-3", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 5 },
      { type: "gem-count", gem: "Topaz", amount: 3 },
      { type: "gem-count", gem: "Sapphire", amount: 2 }
    ],
    moneyCost: 0,
    reward: { type: "consumable", id: "legendary-potion", name: "Legendary Potion", family: "luck", tier: 4, amount: 1, effectValue: 1000, oneRoll: true }
  },
  {
    id: "mythic-potion", name: "Mythic Potion", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "legendary-potion", amount: 3 },
      { type: "gem-count", gem: "Ruby", amount: 5 },
      { type: "gem-count", gem: "Diamond", amount: 3 },
      { type: "gem-count", gem: "Black Opal", amount: 2 }
    ],
    moneyCost: 0,
    reward: { type: "consumable", id: "mythic-potion", name: "Mythic Potion", family: "luck", tier: 4, amount: 1, effectValue: 10000, oneRoll: true }
  },
  {
    id: "speed-potion-2", name: "Speed Potion II", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "speed-potion-1", amount: 2 },
      { type: "gem-count", gem: "Garnet", amount: 3 }
    ],
    moneyCost: 250,
    reward: { type: "consumable", id: "speed-potion-2", name: "Speed Potion II", family: "rollSpeed", tier: 2, amount: 1, effectValue: 0.25 }
  },
  {
    id: "speed-potion-3", name: "Speed Potion III", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "speed-potion-2", amount: 2 },
      { type: "gem-count", gem: "Topaz", amount: 3 },
      { type: "gem-count", gem: "Aquamarine", amount: 2 }
    ],
    moneyCost: 750,
    reward: { type: "consumable", id: "speed-potion-3", name: "Speed Potion III", family: "rollSpeed", tier: 3, amount: 1, effectValue: 0.50 }
  },
  {
    id: "fortune-potion-2", name: "Fortune Potion II", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "fortune-potion-1", amount: 2 },
      { type: "gem-count", gem: "Amethyst", amount: 2 },
      { id: "fortune-potion-2-heavy", type: "specimen-condition", label: "Any gem at 2.0x weight or more", minimumWeightMultiplier: 2, amount: 1 }
    ],
    moneyCost: 250,
    reward: { type: "consumable", id: "fortune-potion-2", name: "Fortune Potion II", family: "weightLuck", tier: 2, amount: 1, effectValue: 0.25 }
  },
  {
    id: "fortune-potion-3", name: "Fortune Potion III", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "fortune-potion-2", amount: 2 },
      { type: "gem-count", gem: "Aquamarine", amount: 2 },
      { id: "fortune-potion-3-heavy", type: "specimen-condition", label: "Any gem at 3.0x weight or more", minimumWeightMultiplier: 3, amount: 1 }
    ],
    moneyCost: 750,
    reward: { type: "consumable", id: "fortune-potion-3", name: "Fortune Potion III", family: "weightLuck", tier: 3, amount: 1, effectValue: 0.50 }
  },
  {
    id: "mass-potion-2", name: "Mass Potion II", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "mass-potion-1", amount: 2 },
      { type: "gem-count", gem: "Topaz", amount: 2 },
      { id: "mass-potion-2-weight", type: "gem-total-weight", label: "Additional sacrificed gem weight", totalWeight: 7500 }
    ],
    moneyCost: 400,
    reward: { type: "consumable", id: "mass-potion-2", name: "Mass Potion II", family: "weightMultiplier", tier: 2, amount: 1, effectValue: 0.15 }
  },
  {
    id: "mass-potion-3", name: "Mass Potion III", category: "potion",
    requirements: [
      { type: "consumable", consumableId: "mass-potion-2", amount: 2 },
      { type: "gem-count", gem: "Opal", amount: 2 },
      { id: "mass-potion-3-weight", type: "gem-total-weight", label: "Additional sacrificed gem weight", totalWeight: 20000 }
    ],
    moneyCost: 1000,
    reward: { type: "consumable", id: "mass-potion-3", name: "Mass Potion III", family: "weightMultiplier", tier: 3, amount: 1, effectValue: 0.25 }
  }
];

export default recipes.filter((recipe) => recipe.category !== "lantern");
