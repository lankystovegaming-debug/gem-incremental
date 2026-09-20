const POTION_DURATION_MS = 60 * 1000;

export const MARKET_REFERENCE_PRICES = Object.freeze({
  "lucky-potion-1": 100,
  "speed-potion-1": 100,
  "fortune-potion-1": 100,
  "mass-potion-1": 100,
  "lucky-potion-2": 40000,
  "speed-potion-2": 40000,
  "fortune-potion-2": 40000,
  "mass-potion-2": 40000,
  "lucky-potion-3": 150000,
  "speed-potion-3": 150000,
  "fortune-potion-3": 150000,
  "mass-potion-3": 150000,
  "lucky-potion-4": 500000,
  "speed-potion-4": 500000,
  "fortune-potion-4": 500000,
  "mass-potion-4": 500000,
  "legendary-potion": 3000000,
  "mythic-potion": 15000000,
  "relic-potion": 50000,
  "seismic-potion": 1750000,
  "unstable-core": 10000000,
  "deepcore-catalyst": 300000,
  "pressurized-catalyst": 2500000,
  "deepcore-crate": 3000000,
  "diver": 1000000,
  "tidal-rush": 1250000,
  "pressure": 12500000,
  "offering": 3000000,
  "treasure-tonic": 2500000,
  "supply-crate": 4000000,
  "abyssal-potion": 60000000,
  "pet-luck-treat": 500000,
  "enchanted-pet-toy": 2000000,
  "celestial-pet-charm": 7500000,
  "mythic-pet-whistle": 20000000,
  "plastic-bag": 0.10
});

const consumables = [
  ["lucky", "Lucky", "luck", [0.10, 0.25, 0.50, 0.75], 200],
  ["speed", "Speed", "rollSpeed", [0.10, 0.25, 0.50, 0.75], 150],
  ["fortune", "Fortune", "weightLuck", [0.10, 0.25, 0.50, 0.75], 200],
  ["mass", "Mass", "weightMultiplier", [0.05, 0.15, 0.25, 0.50], 300]
].flatMap(([slug, name, family, effects, price]) =>
  effects.map((effectValue, index) => ({
    id: `${slug}-potion-${index + 1}`,
    name: `${name} Potion ${["I", "II", "III", "IV"][index]}`,
    family,
    tier: index + 1,
    durationMs: POTION_DURATION_MS,
    effectValue,
    marketReferencePrice: MARKET_REFERENCE_PRICES[`${slug}-potion-${index + 1}`] ?? 0,
    shop: {
      purchasable: index === 0,
      price: index === 0 ? price : null
    }
  }))
);

consumables.push(
  {
    id: "legendary-potion",
    name: "Legendary Potion",
    family: "luck",
    tier: 4,
    durationMs: null,
    effectValue: 1000,
    oneRoll: true,
    marketReferencePrice: 0,
    shop: { purchasable: false, price: null }
  },
  {
    id: "mythic-potion",
    name: "Mythic Potion",
    family: "luck",
    tier: 4,
    durationMs: null,
    effectValue: 10000,
    oneRoll: true,
    marketReferencePrice: 0,
    shop: { purchasable: false, price: null }
  }
);

consumables.push(
  { id: "deepcore-catalyst", name: "Deepcore Catalyst", family: "weightLuck", tier: 4, durationMs: null, effectValue: .5, oneRoll: false, description: "×1.5 Weight Luck for the next 25 genuine rolls.", shop: { purchasable: false, price: null } },
  { id: "pressurized-catalyst", name: "Pressurized Catalyst", family: "weightLuck", tier: 4, durationMs: 60_000, effectValue: 1, description: "×2 Weight Luck and ×1.15 Weight Multiplier for 60 seconds.", shop: { purchasable: false, price: null } },
  { id: "seismic-potion", name: "Seismic Potion", family: "luck", tier: 4, durationMs: 60_000, effectValue: 4, description: "×5 Luck, ×2 mutation chance and ×1.25 Deepcore chance for 60 seconds.", shop: { purchasable: false, price: null } },
  { id: "unstable-core", name: "Unstable Core", family: "luck", tier: 4, durationMs: null, effectValue: 25, oneRoll: false, description: "×25 Deepcore chance and ×5 Special chance for the next 10 genuine rolls.", shop: { purchasable: false, price: null } },
  { id: "deepcore-crate", name: "Deepcore Crate", family: "material", tier: 1, material: true, effectValue: 0, description: "Contains one weighted Deepcore reward and an independent Roll Card chance.", shop: { purchasable: false, price: null } }
);

consumables.push({ id: "plastic-bag", name: "Plastic Bag", family: "material", tier: 0,
  material: true, effectValue: 0, marketReferencePrice: 0.10, shop: { purchasable: false, price: null } });

consumables.push({id:'relic-potion',name:'Relic Potion',family:'relic',tier:1,durationMs:60000,effectValue:1.5,description:'Normal secondary bonus portions ×1.5 for 60 seconds. Excavator-exclusive.',shop:{purchasable:false,price:null}});
consumables.push(
  {id:'pet-luck-treat',name:'Pet Luck Treat',family:'petLuck',tier:1,durationMs:null,effectValue:0.25,description:'Adds +0.25 Pet Luck. Stays active until you successfully roll a pet.',shop:{purchasable:false,price:null}},
  {id:'enchanted-pet-toy',name:'Enchanted Pet Toy',family:'petLuck',tier:2,durationMs:null,effectValue:0.75,description:'Adds +0.75 Pet Luck. Stays active until you successfully roll a pet.',shop:{purchasable:false,price:null}},
  {id:'celestial-pet-charm',name:'Celestial Pet Charm',family:'petLuck',tier:3,durationMs:null,effectValue:2,description:'Adds +2 Pet Luck. Stays active until you successfully roll a pet.',shop:{purchasable:false,price:null}},
  {id:'mythic-pet-whistle',name:'Mythic Pet Whistle',family:'petLuck',tier:4,durationMs:null,effectValue:5,description:'Adds +5 Pet Luck. Stays active until you successfully roll a pet.',shop:{purchasable:false,price:null}}
);

consumables.push(
  {id:'diver',name:'Diver',family:'luck',tier:4,durationMs:300000,effectValue:0.5,event:'deep-sea',description:'Boosts Deep Sea Luck for 5 minutes.',shop:{purchasable:false,price:null}},
  {id:'tidal-rush',name:'Tidal Rush',family:'rollSpeed',tier:4,durationMs:300000,effectValue:0.5,event:'deep-sea',description:'Boosts Deep Sea roll speed for 5 minutes.',shop:{purchasable:false,price:null}},
  {id:'pressure',name:'Pressure Flask',family:'weightLuck',tier:4,durationMs:300000,effectValue:1,event:'deep-sea',description:'Boosts Deep Sea Weight Luck and Weight Multiplier for 5 minutes.',shop:{purchasable:false,price:null}},
  {id:'offering',name:'Offering to Neptune',family:'material',tier:4,durationMs:null,effectValue:1,event:'deep-sea',description:'Empowers one Neptune roll.',shop:{purchasable:false,price:null}},
  {id:'treasure-tonic',name:'Treasure Tonic',family:'material',tier:4,durationMs:null,effectValue:100,event:'deep-sea',description:'Doubles Tide Tokens for 100 rolls.',shop:{purchasable:false,price:null}},
  {id:'supply-crate',name:'Deep Sea Supply Crate',family:'material',tier:4,durationMs:null,effectValue:1,event:'deep-sea',description:'Contains a guaranteed bundle of Deep Sea supplies.',shop:{purchasable:false,price:null}},
  {id:'abyssal-potion',name:'Abyssal Potion',family:'material',tier:4,durationMs:null,effectValue:1,event:'deep-sea',description:'Unlocks an Abyssal roll.',shop:{purchasable:false,price:null}}
);

for (const consumable of consumables) {
  consumable.marketReferencePrice = MARKET_REFERENCE_PRICES[consumable.id];
}

export function getConsumableById(id) {
  return consumables.find((item) => item.id === id) ?? null;
}

export default consumables;
