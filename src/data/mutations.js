export const GEM_MUTATIONS = Object.freeze({
  'ascended': Object.freeze({id:'ascended',name:'Ascended',chance:400,multiplier:2,exclusive:true}),
  'silly-small': Object.freeze({id:'silly-small',name:'Silly',chance:2,multiplier:.5,exclusive:true}),
  'silly-large': Object.freeze({id:'silly-large',name:'Silly',chance:10,multiplier:10,exclusive:true}),
  'happy': Object.freeze({id:'happy',name:'Happy',chance:200,multiplier:50,exclusive:true}),
  polished: Object.freeze({ id: "polished", name: "Polished", chance: 100, multiplier: 1.5, description: "A clean, reflective finish that makes the gem more desirable." }),
  gilded: Object.freeze({ id: "gilded", name: "Gilded", chance: 500, multiplier: 2.5, description: "Fine golden veins run naturally across the gem's surface." }),
  prismatic: Object.freeze({ id: "prismatic", name: "Prismatic", chance: 2500, multiplier: 5, description: "Its colour shifts continuously across the visible spectrum." }),
  celestial: Object.freeze({ id: "celestial", name: "Celestial", chance: 10000, multiplier: 12, description: "A cold, brilliant glow seems to come from somewhere beyond the sky." }),
  corrupted: Object.freeze({ id: "corrupted", name: "Corrupted", chance: 50000, multiplier: 30, description: "Unstable energy twists the gem into something extraordinarily valuable." }),
  soulbound: Object.freeze({id:"soulbound",name:"Soulbound",chance:1050000,multiplier:305,description:"This gem has been locked to a soul on Earth. Once the soul dies it will explode and lock to another soul.",icon:"🫁",color:"#ff79b0"}),
  heated: Object.freeze({id:"heated",name:"Heated",chance:33000,multiplier:28,description:"This gem has been forever heated in its core and may burn you slightly if you touch it.",icon:"🔥",color:"#ff8a24"}),
  discombobulated: Object.freeze({id:"discombobulated",name:"Discombobulated",chance:121000,multiplier:56,description:"This gem's shape has been severely mutated, different for all Discombobulated gems.",icon:"😵‍💫",color:"#ffd83d"}),
  kawaii: Object.freeze({id:"kawaii",name:"Kawaii",chance:77000,multiplier:41,description:"This gem has been in Japan for ONE second and is already feeling kawaii.",icon:"💝",color:"#ff8fc4"}),
  edible: Object.freeze({id:"edible",name:"Edible",chance:79000,multiplier:43,description:"This gem can be somewhat eaten, although the taste might be horrible.",icon:"🎂",color:"#ffd83d"}),
  lanked: Object.freeze({id:"lanked",name:"Lanked",chance:3000000,multiplier:750,description:"This gem has been blessed by lanky.",icon:"👒",color:"#f4d03f"}),
  translucent: Object.freeze({id:"translucent",name:"Translucent",chance:70777,multiplier:38,description:"A translucent gem, kind of like a window but foggy.",icon:"🪟",color:"#f7f7ff"}),
  acidic: Object.freeze({id:"acidic",name:"Acidic",chance:223000,multiplier:70,description:"It's both sour and can dissolve stuff!",icon:"🍋‍🟩",color:"#72e36b"}),
  chaotic: Object.freeze({id:"chaotic",name:"Chaotic",chance:34000,multiplier:23.5,description:"A rare form of gem that even reality failed to make sense of.",icon:"🫟",color:"#a855f7"}),
  aurora: Object.freeze({id:"aurora",name:"Aurora",chance:555000,multiplier:110,description:"The magnificent aurora borealis was witnessed by this gem ages ago.",icon:"🌌",color:"#9b6cff"}),
  withered: Object.freeze({id:"withered",name:"Withered",chance:1050000,multiplier:320,description:"Within shadowy depths is the isolated domain of this gem, altered by phenomenal circumstances.",icon:"🥀",color:"#66606d"}),
  blazing: Object.freeze({id:"blazing",name:"Blazing",chance:1050000,multiplier:320,description:"This gem holds the heated core of the sun itself.",icon:"☀️",color:"#ff5b24"}),
  aether: Object.freeze({id:"aether",name:"Aether",chance:1000000000,multiplier:1500,description:"Who designed this…",icon:"✨",color:"#c9b6ff"}),
  sixty_seven: Object.freeze({id:"sixty_seven",name:"67",chance:676767,multiplier:135,description:"67.",icon:"6️⃣",color:"#ffcf5c"}),
  moldy: Object.freeze({id:"moldy",name:"Moldy",chance:1000,multiplier:2.75,description:"After being left in the dark and in a humid place, mould started growing on it.",icon:"🌱",color:"#55c96b"}),
  habitable: Object.freeze({id:"habitable",name:"Habitable",chance:4000,multiplier:6,description:"A whole ecosystem is living inside the gem somehow!",icon:"🥬",color:"#74c365"}),
  carved: Object.freeze({id:"carved",name:"Carved",chance:160000,multiplier:61,description:"This gem has been carved somewhere in the gem by the gods with a message to the world.",icon:"💬",color:"#f3f4f6"}),
  cosmic: Object.freeze({id:"cosmic",name:"Cosmic",chance:276000,multiplier:77,description:"A cosmic event happened near the gem and was so powerful it mutated everything around it.",icon:"🌌",color:"#9c6bff"}),
  mysterious: Object.freeze({id:"mysterious",name:"Mysterious",chance:177000,multiplier:64.5,description:"It was only a few days ago that this gem had been found, like it had been invisible until this point.",icon:"👤",color:"#9a7bff"}),
  lit: Object.freeze({id:"lit",name:"Lit",chance:5300,multiplier:8.5,description:"This gem could be like a lantern, but not with powers like the ones we have.",icon:"💡",color:"#ffe45c"}),
  amalgamated: Object.freeze({id:"amalgamated",name:"Amalgamated",chance:12345,multiplier:13.7,description:"After multiple rare events happened, it formed an amalgamation.",icon:"🕸️",color:"#62d77b"}),
  misty: Object.freeze({id:"misty",name:"Misty",chance:5000,multiplier:7,description:"The gem's surface is smooth to the touch, yet it seems to hold many secrets. Grants ×2.5 mutation chance for the next 10 rolls; stacks and refreshes if another Misty gem is pulled.",icon:"🌫️",color:"#bfe9ff"}),
  ancient: Object.freeze({id:"ancient",name:"Ancient",chance:123450,multiplier:56,description:"One of the first gems formed. Grants ×1.3 Ancient Relic chance for the next 3 rolls.",icon:"🏚️",color:"#8aa57b"}),
  enchanted: Object.freeze({id:"enchanted",name:"Enchanted",chance:5250,multiplier:9.5,description:"Was enchanted naturally with a relic. Grants ×1.1 chance for all relics for the next 5 rolls.",icon:"📖",color:"#ff86c8"})
});

export function getGemMutation(id, savedMultiplier = null) {
  const mutation = GEM_MUTATIONS[id];

  if (!mutation) return null;

  return {
    ...mutation,
    multiplier: Number(savedMultiplier ?? mutation.multiplier)
  };
}


export function normalizeMutationIds(ids = []) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id ?? "").trim().toLowerCase())
        .filter((id) => Boolean(GEM_MUTATIONS[id]))
    )
  ).sort(
    (a, b) =>
      Object.keys(GEM_MUTATIONS).indexOf(a) -
      Object.keys(GEM_MUTATIONS).indexOf(b)
  );
}

export function mutationCombinationKey(ids = []) {
  const normalized = normalizeMutationIds(ids);
  return normalized.length ? normalized.join("+") : "none";
}

export function mutationCombinationLabel(ids = []) {
  const normalized = normalizeMutationIds(ids);
  if (!normalized.length) return "No Mutation";

  return normalized
    .map((id) => GEM_MUTATIONS[id]?.name ?? id)
    .join(" + ");
}
