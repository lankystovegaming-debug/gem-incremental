const gems = [
  {
    name: "Quartz",
    rarity: 2,
    baseWeight: 100,
    valuePerGram: 0.0575,
    description:
      "A common crystalline mineral found in many rocks. It is one of the most abundant minerals in Earth's crust."
  },

  {
    name: "Calcite",
    rarity: 3,
    baseWeight: 110,
    valuePerGram: 0.0736,
    description:
      "A widespread carbonate mineral and a major component of limestone and marble. It often forms clear or white crystals."
  },

  {
    name: "Feldspar",
    rarity: 5,
    baseWeight: 125,
    valuePerGram: 0.092,
    description:
      "A large family of rock-forming minerals that make up much of Earth's crust. Feldspars are common in granite and many other igneous rocks."
  },

  {
    name: "Fluorite",
    rarity: 8,
    baseWeight: 140,
    valuePerGram: 0.115,
    description:
      "A colourful mineral known for its cubic crystals and ability to fluoresce under ultraviolet light. It is commonly used as a source of fluorine."
  },

  {
    name: "Hematite",
    rarity: 12,
    baseWeight: 160,
    valuePerGram: 0.13685,
    description:
      "An iron oxide mineral and one of the most important ores of iron. Its colour can range from metallic grey to reddish brown."
  },

  {
    name: "Obsidian",
    rarity: 18,
    baseWeight: 180,
    valuePerGram: 0.15985,
    description:
      "A naturally occurring volcanic glass formed when lava cools rapidly. Its smooth, dark surface can fracture into extremely sharp edges."
  },

  {
    name: "Agate",
    rarity: 25,
    baseWeight: 200,
    valuePerGram: 0.184,
    description:
      "A banded variety of chalcedony formed in cavities within volcanic rocks. Its layered patterns can appear in many different colours."
  },

  {
    name: "Jasper",
    rarity: 35,
    baseWeight: 225,
    valuePerGram: 0.2093,
    description:
      "An opaque variety of chalcedony often coloured red, yellow, brown or green. Its patterns come from mineral impurities trapped during formation."
  },

  {
    name: "Amethyst",
    rarity: 50,
    baseWeight: 250,
    valuePerGram: 0.253,
    description:
      "A purple variety of quartz whose colour comes from trace iron and natural irradiation. It has been used as a gemstone for thousands of years."
  },

  {
    name: "Garnet",
    rarity: 70,
    baseWeight: 275,
    valuePerGram: 0.3013,
    description:
      "A group of silicate minerals commonly known for deep red gemstones, although garnets can occur in many colours."
  },

  {
    name: "Peridot",
    rarity: 100,
    baseWeight: 300,
    valuePerGram: 0.36455,
    description:
      "The gem-quality form of olivine, recognised by its distinctive green colour. Unlike many gems, it occurs in only a narrow range of colours."
  },

  {
    name: "Topaz",
    rarity: 150,
    baseWeight: 325,
    valuePerGram: 0.47725,
    description:
      "A hard silicate mineral that can occur in many colours, including colourless, blue, yellow, pink and orange."
  },

  {
    name: "Aquamarine",
    rarity: 225,
    baseWeight: 350,
    valuePerGram: 0.60835,
    description:
      "A blue to blue-green variety of beryl. Its colour is caused by small amounts of iron within the crystal."
  },

  {
    name: "Tourmaline",
    rarity: 325,
    baseWeight: 375,
    valuePerGram: 0.76705,
    description:
      "A complex group of minerals famous for its huge variety of colours. Some crystals can even display multiple colours at once."
  },

  {
    name: "Opal",
    rarity: 475,
    baseWeight: 400,
    valuePerGram: 1.035,
    description:
      "A hydrated form of silica that can display flashes of rainbow colour known as play-of-colour. Not all opal shows this effect."
  },

  {
    name: "Zircon",
    rarity: 650,
    baseWeight: 425,
    valuePerGram: 1.2719,
    description:
      "A naturally occurring zirconium silicate mineral known for its brilliant sparkle. Some zircon crystals are among the oldest known minerals on Earth."
  },

  {
    name: "Spinel",
    rarity: 850,
    baseWeight: 450,
    valuePerGram: 1.59735,
    description:
      "A durable gemstone mineral that occurs in many colours. Red spinel was historically mistaken for ruby in several famous royal jewels."
  },

  {
    name: "Sapphire",
    rarity: 1100,
    baseWeight: 475,
    valuePerGram: 2.05735,
    description:
      "A gem variety of corundum most famously known for its blue colour. Corundum of nearly any colour except red can be called sapphire."
  },

  {
    name: "Ruby",
    rarity: 1400,
    baseWeight: 500,
    valuePerGram: 2.53,
    description:
      "The red gemstone variety of corundum. Its colour comes mainly from trace amounts of chromium."
  },

  {
    name: "Emerald",
    rarity: 1800,
    baseWeight: 525,
    valuePerGram: 3.06705,
    description:
      "A green variety of beryl coloured by trace amounts of chromium or vanadium. Fine emeralds are prized for their vivid colour."
  },

  {
    name: "Diamond",
    rarity: 2300,
    baseWeight: 550,
    valuePerGram: 3.8686,
    description:
      "A crystal made almost entirely of carbon. Its tightly bonded structure makes it the hardest naturally occurring material."
  },

  {
    name: "Tanzanite",
    rarity: 2900,
    baseWeight: 575,
    valuePerGram: 4.09975,
    description:
      "A blue-violet gemstone variety of zoisite found primarily in a small region of Tanzania. Its limited source makes it unusually rare."
  },

  {
    name: "Alexandrite",
    rarity: 3600,
    baseWeight: 600,
    valuePerGram: 5.07955,
    description:
      "A rare variety of chrysoberyl famous for changing colour under different lighting. It can appear greenish in daylight and reddish under warmer light."
  },

  {
    name: "Benitoite",
    rarity: 4400,
    baseWeight: 625,
    valuePerGram: 5.52,
    description:
      "A rare blue mineral first discovered in California. It is known for its bright colour and strong fluorescence under ultraviolet light."
  },

  {
    name: "Red Beryl",
    rarity: 5300,
    baseWeight: 650,
    valuePerGram: 6.3687,
    description:
      "An extremely rare red variety of beryl coloured by manganese. Gem-quality crystals are found in only a few locations."
  },

  {
    name: "Black Opal",
    rarity: 6300,
    baseWeight: 675,
    valuePerGram: 7.3255,
    description:
      "A highly valued type of opal with a dark body colour that can make its flashes of colour appear especially vivid."
  },

  {
    name: "Grandidierite",
    rarity: 7400,
    baseWeight: 700,
    valuePerGram: 7.88555,
    description:
      "A rare blue-green mineral first discovered in Madagascar. Transparent gem-quality specimens are particularly uncommon."
  },

  {
    name: "Taaffeite",
    rarity: 8500,
    baseWeight: 725,
    valuePerGram: 8.7239,
    description:
      "An exceptionally rare gemstone first identified from a cut stone that had been mistaken for spinel. It remains far rarer than most familiar gems."
  },

  {
    name: "Musgravite",
    rarity: 9300,
    baseWeight: 750,
    valuePerGram: 9.2,
    description:
      "A very rare member of the taaffeite mineral family. Gem-quality specimens are scarce and highly sought after by collectors."
  },

  {
    name: "Painite",
    rarity: 10000,
    baseWeight: 800,
    valuePerGram: 9.34375,
    description:
      "An exceptionally rare borate mineral first identified in Myanmar. For many years, only a handful of specimens were known."
  },

  {
    name: "Dark Matter",
    rarity: 1000000,
    baseWeight: 2500,
    valuePerGram: 200,
    description:
      "This should not be here. Whatever you rolled, it probably is not a mineral."
  },

  {
    name: "Citrine",
    rarity: 90,
    baseWeight: 290,
    valuePerGram: 0.34,
    description:
      "A golden variety of quartz whose warm colour ranges from pale yellow to deep amber. Its sunny appearance has made it a popular decorative gemstone."
  },

  {
    name: "Moonstone",
    rarity: 750,
    baseWeight: 440,
    valuePerGram: 1.43,
    description:
      "A softly glowing feldspar gemstone that appears to hold drifting moonlight beneath its surface. The effect becomes especially striking as the stone moves."
  },

  {
    name: "Demantoid",
    rarity: 6800,
    baseWeight: 690,
    valuePerGram: 7.6,
    description:
      "A brilliant green variety of garnet prized for its vivid colour and intense sparkle. High-quality specimens can rival even diamond in their flashes of light."
  },

  {
    name: "Jeremejevite",
    rarity: 14000,
    baseWeight: 850,
    valuePerGram: 12,
    description:
      "An exceptionally rare crystal usually found in delicate shades of blue or nearly colourless forms. Clear gem-quality specimens are particularly difficult to obtain."
  },

  {
    name: "Poudretteite",
    rarity: 22000,
    baseWeight: 925,
    valuePerGram: 16,
    description:
      "A remarkably rare mineral with gentle pink and violet tones. Its subtle colour contrasts with the extraordinary scarcity of usable crystals."
  },

  {
    name: "Serendibite",
    rarity: 35000,
    baseWeight: 1000,
    valuePerGram: 22,
    description:
      "A rare mineral ranging from deep blue-green to almost black. Transparent specimens are exceptionally scarce and highly sought after."
  },

  {
    name: "Blue Garnet",
    rarity: 55000,
    baseWeight: 1100,
    valuePerGram: 30,
    description:
      "An extraordinary garnet variety capable of displaying rich blue-green tones under certain lighting. Its unusual colour makes it one of the rarest members of the garnet family."
  },

  {
    name: "Kyawthuite",
    rarity: 85000,
    baseWeight: 1200,
    valuePerGram: 42,
    description:
      "An extremely rare reddish-orange mineral known from only a tiny number of specimens. Its scarcity has given it an almost legendary reputation among collectors."
  },

  {
    name: "Aether Quartz",
    rarity: 140000,
    baseWeight: 1350,
    valuePerGram: 54,
    description:
      "Quartz transformed by prolonged exposure to concentrated aether. Pale energy drifts through its crystal structure like luminous mist trapped beneath glass."
  },

  {
    name: "Void Opal",
    rarity: 250000,
    baseWeight: 1550,
    valuePerGram: 76.5,
    description:
      "An opal formed where ordinary light begins to fail. Its surface displays shifting colours surrounding patches of darkness that seem deeper than the stone itself."
  },

  {
    name: "Chronite",
    rarity: 480000,
    baseWeight: 1800,
    valuePerGram: 112.5,
    description:
      "A crystal that resonates faintly out of sequence with the present. Light passing through it sometimes appears a fraction of a second before the crystal is moved."
  },

  {
    name: "Neutron Crystal",
    rarity: 800000,
    baseWeight: 2200,
    valuePerGram: 157.5,
    description:
      "An impossibly dense crystalline structure created under crushing cosmic pressure. Despite its compact form, it carries the weight of something far larger."
  },

  {
    name: "Antimatter Crystal",
    rarity: 1800000,
    baseWeight: 2900,
    valuePerGram: 270,
    description:
      "A volatile crystal held together by an unknown containment field. Its surface flickers as nearby matter narrowly avoids contact with the energy sealed inside."
  },

  {
    name: "Singularity Shard",
    rarity: 4000000,
    baseWeight: 3600,
    valuePerGram: 472.5,
    description:
      "A fragment formed around the edge of a collapsed point in space. Light bends across its surface, and its true weight seems impossible to measure."
  },

  {
    name: "Lanky Gem",
    rarity: 10000000,
    baseWeight: 40500,
    valuePerGram: 111.1111,
    hideRarityUntilDiscovered: true,
    description:
      "Named after the creator of Gem Incremental, the sheer weight of this \"gem\" represents his actual value in real life. also how did you even get this"
  }
];

export default gems;
