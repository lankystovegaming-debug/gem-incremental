export const DEEP_SEA_TIMES = Object.freeze({
  startsAt: "2026-10-10T00:00:00.000Z",
  endsAt: "2026-10-24T00:00:00.000Z",
  redemptionEndsAt: "2026-10-31T00:00:00.000Z"
});

export function deepSeaPhase(now = Date.now()) {
  const value = Number(now);
  if (value < Date.parse(DEEP_SEA_TIMES.startsAt)) return "teaser";
  if (value < Date.parse(DEEP_SEA_TIMES.endsAt)) return "active";
  if (value < Date.parse(DEEP_SEA_TIMES.redemptionEndsAt)) return "redemption";
  return "archived";
}

export const DEEP_SEA_GEMS = Object.freeze([
  ["Water",1,1000,0.00000324,"There's nothing here. At least you didn't come back completely empty-handed."],
  ["Clay",1000,250,0.4,"Soft sediment dredged from the ocean floor. There is an awful lot of it down here."],
  ["Salt Crystal",2500,100,2,"A crystal formed where ancient seawater once gathered. Somehow, it's still salty."],
  ["Seaweed",6000,500,1,"It survived where sunlight barely reaches. You're not sure why you brought it back."],
  ["Sand Rock",15000,750,2,"Layers of seabed compressed into a surprisingly sturdy rock. It's mostly sand pretending to be important."],
  ["Sea Salt Rock",40000,400,10,"A chunk of mineral-rich salt hardened beneath the waves. Do not lick the specimen."],
  ["Prismarine Fragment",100000,125,80,"A strange blue-green crystal recovered from the depths. It seems to shimmer differently underwater."],
  ["Ancient Coin",250000,30,1000,"A weathered coin from something long since swallowed by the sea. Whatever bought it originally is probably gone too."],
  ["Pearl",600000,20,4000,"A near-perfect pearl formed far beneath the surface. Simple, valuable, and surprisingly difficult to find."],
  ["Pearl of the Sea",1500000,100,2500,"A pearl infused with the colour of the deepest ocean. Holding it feels strangely like hearing distant waves."],
  ["Nautilii",4000000,600,1000,"An ancient shell carrying patterns that seem almost deliberate. The ocean has been working on this one for a very long time."],
  ["Sunken Treasure",10000000,2500,600,"Riches recovered from a vessel forgotten beneath the waves. Apparently nobody else found the map."],
  ["Abyssal Coral",25000000,750,4000,"Coral that somehow flourished far below the reach of sunlight. Its branches glow faintly in the darkness."],
  ["Trenchstone",60000000,5000,1500,"A stone shaped under the crushing pressure of an ocean trench. Bringing it to the surface feels like disturbing something."],
  ["Coral",125000000,1250,12000,"An extraordinary colony preserved from the deepest reaches of the sea. It seems almost too perfect to have formed naturally."],
  ["Leviathan Scale",250000000,4000,7500,"A colossal scale belonging to something you would rather not meet. Whatever shed it is probably still down there."],
  ["Heart of the Sea",500000000,500,120000,"The ocean seems to pulse within this crystal. For a moment, the waves around you feel perfectly still."],
  ["Neptune's Tear",1000000000,50,2500000,"A single tear said to have fallen from Neptune himself. Even outside the ocean, it never seems to dry."],
  ["Soul of the Sea God",2500000000,2500,100000,"The depths fall silent around it. You have found something the ocean was never supposed to surrender."]
].map(([name, rarity, baseWeight, valuePerGram, description], sortOrder) => Object.freeze({ name, rarity, baseWeight, valuePerGram, description, sortOrder })));

export const NEPTUNE_RECIPE = Object.freeze({
  money: 250000,
  gems: Object.freeze({ Clay:500,"Salt Crystal":250,Seaweed:100,"Sand Rock":50,"Sea Salt Rock":25,"Prismarine Fragment":10,"Ancient Coin":5,Pearl:5,"Pearl of the Sea":1 })
});

export const NEPTUNE_STATS = Object.freeze({ luck:30, rollSpeed:0.7, mutationChance:1.5, weightLuck:1.2, weightMultiplier:1.2, deepSeaRarityDivisor:10 });
export const tideTokensFor = rarity => rarity <= 1 ? 0 : Math.floor(Math.pow(Number(rarity), 0.4));

export const DEPTHS_REWARDS = Object.freeze([
  ["lucky-potion-1",2],["speed-potion-1",2],["fortune-potion-1",2],["mass-potion-1",2],["diver",1],
  ["lucky-potion-2",2],["speed-potion-2",2],["fortune-potion-2",2],["mass-potion-2",2],["supply-crate",1],
  ["diver",1],["pressure",1],["tidal-rush",1],["lucky-potion-3",2],["supply-crate",2],
  ["diver",2],["pressure",1],["tidal-rush",2],["treasure-tonic",1],["offering",1],
  ["diver",3],["pressure",2],["tidal-rush",3],["treasure-tonic",2],["offering",2],
  ["diver",5],["pressure",3],["treasure-tonic",3],["offering",3],["abyssal-potion",1]
]);

export const DEEP_SEA_SHOP = Object.freeze([
  ["lucky-potion-2",1000],["fortune-potion-2",1000],["speed-potion-2",1000],["mass-potion-2",1250],
  ["lucky-potion-3",2500],["fortune-potion-3",2500],["speed-potion-3",2500],["mass-potion-3",3000],
  ["offering",5000],["diver",7500],["pressure",8500],["tidal-rush",10000],["supply-crate",12500],["treasure-tonic",1250],["abyssal-potion",750000]
].map(([id,cost])=>Object.freeze({id,cost})));
