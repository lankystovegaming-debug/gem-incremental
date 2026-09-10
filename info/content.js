// Player-facing copy verified against igrddscmrdrrwtvyspbf on 2026-09-10.
// See docs/info-backend-verification.md before updating mechanic descriptions.
export const events = [
  ['common', 'lucky-hour', 'Lucky Hour', 'Boosts Luck to 1.20×.'],
  ['common', 'overdrive', 'Overdrive', 'Boosts Roll Speed to 1.10×.'],
  ['common', 'heavy-veins', 'Heavy Veins', 'Boosts Weight Luck to 1.25×.'],
  ['common', 'mutation-surge', 'Mutation Surge', 'Boosts eligible mutation chances to 1.25×.'],
  ['common', 'prospectors-eye', "Prospector’s Eye", 'One selected gem with Base Rarity from 1 in 100 to 1 in 25,000 receives 2× Luck.'],
  ['common', 'quality-ore', 'Quality Ore', 'Natural weight below 1× can receive one reroll.'],
  ['common', 'gilded-veins', 'Gilded Veins', 'Gilded mutations are twice as likely.'],
  ['common', 'lucky-roll', 'Lucky Roll', 'Some rolls receive 2× Luck.'],
  ['uncommon', 'gem-rush', 'Gem Rush', 'Gems with Base Rarity of 1 in 1,000 or rarer receive 1.35× Luck.'],
  ['uncommon', 'polished-world', 'Polished World', 'Eligible mutations with value multipliers of 2× or less become 1.75× as likely.'],
  ['uncommon', 'golden-touch', 'Golden Touch', 'New specimens receive 1.20× value, which stays with them after the event ends.'],
  ['uncommon', 'rapid-excavation', 'Rapid Excavation', 'Boosts Roll Speed to 1.25×.'],
  ['uncommon', 'narrowed-veins', 'Narrowed Veins', 'One selected rarity band receives 1.75× Luck.'],
  ['uncommon', 'unstable-luck', 'Unstable Luck', 'Global Luck changes every 30 seconds; some phases lower Luck and others raise it.'],
  ['uncommon', 'heavy-favorites', 'Heavy Favorites', 'Five selected gems with Base Rarity of 1 in 100 or rarer receive 2× Weight Luck.'],
  ['uncommon', 'second-chance', 'Second Chance', 'Some rolls check for a gem twice and keep the rarer base gem. This does not produce two specimens.'],
  ['rare', 'meteor-shower', 'Meteor Shower', 'Meteor event gems become eligible to roll.'],
  ['rare', 'cosmic-alignment', 'Cosmic Alignment', 'Rarer gem ranges receive stronger Luck boosts.'],
  ['rare', 'mutation-storm', 'Mutation Storm', 'Eligible mutations receive 2× chance, and Charged becomes available.'],
  ['rare', 'titans-vein', 'Titan’s Vein', 'The extreme natural-weight tail becomes more likely, including stronger tail continuation.'],
  ['rare', 'falling-stars', 'Falling Stars', 'Eight brief, non-overlapping Starfall windows open during the event. Its event gems require an active Starfall.'],
  ['rare', 'volatile-veins', 'Volatile Veins', 'Each roll gets a Normal, Unstable, Critical, or Volatile state. Stronger states improve Luck and can also improve Weight Luck and Mutation Chance.'],
  ['legendary', 'reality-fracture', 'Reality Fracture', 'Progressively rarer gem ranges receive stronger Luck boosts.'],
  ['legendary', 'total-eclipse', 'Total Eclipse', 'Each roll enters Light, Shadow, or Totality. Light boosts Weight Luck; Shadow boosts Luck; Totality boosts both.'],
  ['legendary', 'singularity', 'Singularity', 'Boosts grow as the event approaches its end. Community rolls build Mass and unlock Roll Speed boosts. Some event gems also require collapse and the final moments.']
].map(([tier, id, title, description]) => ({ tier, id: `event-${id}`, title, description }));

const article = (id, title, definition, paragraphs, extra = {}) => ({ id, title, definition, paragraphs, ...extra });
export const groups = [
  { id: 'rolling-gems', title: '🎲 Rolling & Gems', description: 'Rarity, selection, Luck and genuine rolls', articles: [
    article('base-rarity', 'Base Rarity', 'The gem’s listed, inherent “1 in X” rarity.', [
      'A larger denominator means a rarer base gem. This describes the gem itself, before its mutations and before applicable Luck.',
      'Availability is a separate condition: a listed rarity only applies while the gem is eligible to roll.'
    ], { callout: 'Base Rarity ≠ Actual Chance. Mutations contribute to the specimen’s Actual Chance.', related: ['actual-chance', 'availability'] }),
    article('gem-selection', 'How gems are chosen', 'Eligible gems are checked from rarest to most common, stopping at the first success.', [
      'Each gem has its own rarity check. The game does not normalize all displayed rarities into one table totaling 100%. A successful rarer check stops selection before the commoner checks.',
      'Availability, equipment rules and Luck can affect which gems are eligible. With higher Luck, ordinary gems below the current rarity floor drop out. If every check fails, selection falls back to the commonest eligible Luck-affected gem, or the commonest eligible gem if none are Luck-affected.'
    ], { callout: 'Gem rarities do not need to add up to 100%.', related: ['luck', 'flat-chance'] }),
    article('luck', 'Luck', 'Makes the individual checks for Luck-affected gems easier.', [
      'Base Luck comes primarily from your Pickaxe and Clover. Personal Luck combines bonuses such as enchants, guild benefits and Research. Flat Luck adds a fixed amount, while Special Luck multiplies the ordinary Luck built so far.',
      'One-Roll Luck adds a bonus for a charged roll. Admin Event Luck applies at the end; Random Events can also affect this final stage or particular gem checks. Equipment with special rules can override the normal order.'
    ], { advanced: ['Broad order: ((Base Luck × Personal Luck + Flat Luck) × Special Luck + One-Roll Luck) × Admin Event Luck.', 'This is the broad order, not a complete formula for every build. Gem-specific bonuses and Maximum Luck can further affect a check.'], related: ['effective-rarity', 'maximum-luck'] }),
    article('effective-rarity', 'Effective Rarity', 'How easy a Luck-affected gem’s individual check becomes after applicable Luck.', [
      'For an ordinary Luck-affected check, divide the gem’s Base Rarity denominator by the Luck applicable to that gem, with a minimum denominator of 1. For example, a 1 in 1,000 gem checked with 10× Luck has a 1 in 100 individual check.',
      'This is not a guarantee of the overall chance of receiving that gem: rarer checks happen first, and availability or special rules still apply. Mutation rarity is a separate concept.'
    ], { related: ['gem-selection', 'actual-chance', 'raw-rarity'] }),
    article('flat-chance', 'Flat Chance', 'A gem check that ordinary Luck does not improve.', [
      'The Gem Index’s Flat Chance indicator means the gem is not affected by ordinary Luck. Raising your Luck does not simply divide its listed denominator.',
      'Explicit equipment effects can still improve a flat check, such as a bonus specifically affecting Special Gems. Availability restrictions still apply.'
    ], { related: ['special-gem', 'availability'] }),
    article('genuine-roll', 'Genuine Rolls', 'The accepted rolls that advance the game’s genuine-roll counter.', [
      'Rolling manually or through Auto Roll advances the counter when the server accepts the roll. Extra specimens created by passives are not additional genuine rolls.',
      'Genuine-roll milestones and equipment counters follow these accepted rolls, rather than the number of specimens added to Inventory. Generated specimens can still count as discoveries.'
    ]),
    article('maximum-luck', 'Maximum Luck', 'An optional ceiling on Luck used for gem selection.', [
      'Set Maximum Luck in Settings to limit both the ordinary Luck used for selection and the final Luck used by each Luck-affected gem check. Leaving it empty applies no user-set cap.',
      'A cap can keep lower-rarity gems in the eligible pool. It does not raise your Luck or cap Mutation Chance, Weight Luck or Weight Multiplier.'
    ], { links: [['../settings/', 'Open Settings']] }),
    article('raw-rarity', 'Raw Rarity / Raw Roll', 'The Raw Rare Roll leaderboard’s base-gem score, adjusted by recorded Luck.', [
      'Raw Chance is Base Rarity divided by the Luck recorded for that roll, with a minimum denominator of 1. Mutations are ignored.',
      '“Raw” here does not mean unmodified Base Rarity. This is the current leaderboard score; recorded Luck is not a reconstruction of every gem-specific or flat-chance exception.'
    ], { aliases: ['raw rare roll', 'raw chance', 'raw luck'], related: ['base-rarity', 'actual-chance'], links: [['../leaderboards/', 'Open Leaderboards']] })
  ]},
  { id: 'weight-value', title: '⚖️ Weight & Value', description: 'Natural weight, heavier rolls and specimen value', articles: [
    article('weight', 'Base, Natural & Final Weight', 'Weight is built in stages, starting with the gem’s Base Weight.', [
      'Base Weight is the reference weight for that gem. Natural Weight is Base Weight multiplied by the natural roll’s weight factor. A natural 2× specimen has twice its Base Weight before final-weight bonuses.',
      'Final Weight applies Weight Multiplier and any applicable final-weight effects to that natural result. This is the finished specimen’s weight.'
    ], { aliases: ['base weight', 'natural weight', 'final weight', 'rolled weight'], related: ['weight-luck', 'weight-multiplier'] }),
    article('weight-luck', 'Weight Luck', 'Improves your natural-weight outcomes.', [
      'Higher Weight Luck shifts natural rolls toward heavier outcomes. It has diminishing returns: increasing an already high stat gives a smaller improvement, and it does not guarantee an extremely heavy specimen.'
    ], { aliases: ['wl', 'tail', 'diminishing returns'], callout: 'Weight Luck ≠ Weight Multiplier. One changes natural outcomes; the other multiplies the result.', advanced: ['Once the natural roll reaches the ordinary 2×+ tail, each further tail step has a 1-in-3 continuation chance.', 'Specific effects, such as Titan’s Vein or a Pickaxe passive, can change tail behavior. The 1-in-3 rule describes ordinary continuation, not the chance of entering the tail.'], related: ['weight-multiplier'] }),
    article('weight-multiplier', 'Weight Multiplier', 'Multiplies the resulting weight after natural weight is determined.', [
      'With no other final-weight effects, a natural 10 g result and a 3× Weight Multiplier produce a 30 g specimen. A Bag improves this stat; Boots improve Weight Luck instead.'
    ], { aliases: ['wm', 'bag'], related: ['weight', 'weight-luck'] }),
    article('gem-value', 'Gem Value', 'The specimen’s value depends on its final weight, gem type and applicable value effects.', [
      'The core calculation is Final Weight × the gem’s Value per Gram × its mutation value multipliers. Other applicable value bonuses can increase the result.',
      'Mutation value multipliers and mutation rarity are different numbers. Actual Chance compares specimen rarity; it is not a sale-price formula.'
    ], { related: ['mutation-rarity', 'actual-chance'] })
  ]},
  { id: 'equipment-buffs', title: '⛏️ Equipment & Buffs', description: 'Builds, secondary stats, potions and settings', articles: [
    article('pickaxes', 'Pickaxes', 'Your Pickaxe defines the core of your build.', [
      'Pickaxes combine core stats with distinctive passives and tradeoffs. Their rules can change how a build rolls, so read the equipped Pickaxe’s description rather than choosing only by its Luck number.'
    ], { related: ['passives', 'toys'], links: [['../inventory/', 'Open equipment in Inventory']] }),
    article('secondary-equipment', 'Secondary Equipment', 'Secondary slots support your build through their main stat.', [
      'Clover = Luck. Lantern = Mutation Chance. Boots = Weight Luck. Bag = Weight Multiplier.',
      'Normal secondary equipment has no passives. Pickaxes define builds; secondary gear supplies supporting stats. Toys with unusual rules are separate exceptions.'
    ], { aliases: ['clover', 'lantern', 'boots', 'bag'], related: ['toys'] }),
    article('passives', 'Passives', 'Equipment effects that activate automatically under their stated conditions.', [
      'A passive may depend on a counter, a gem type, a natural-weight outcome or a special roll. Its description explains the trigger and benefit.',
      'When a passive specifies genuine rolls, extra generated specimens do not advance that counter.'
    ], { related: ['genuine-roll'] }),
    article('toys', 'Toys', 'Deliberately gimmicky equipment outside normal progression.', [
      'Toys explore unusual rules and tradeoffs. They are not a straight upgrade ladder, and their special behavior can differ from ordinary equipment. Check each Toy’s description before building around it.'
    ]),
    article('enchants', 'Enchants', 'Additional effects attached to eligible equipment.', [
      'An enchant’s type and grade determine its effect. Some give stats; others activate under particular conditions or after building a counter. Check the item’s enchant description alongside its Pickaxe passive.'
    ]),
    article('potions', 'Potions', 'Consumable boosts with durations or roll charges.', [
      'Timed boosts last for their displayed duration. One-roll potions supply charged Luck for an accepted roll. Their place in the Luck order differs from ordinary flat or special boosts.',
      'Read the potion’s family, tier and remaining duration or charges in the boost display.'
    ], { related: ['luck', 'genuine-roll'], links: [['../boosts/', 'Open Shop & boosts']] }),
    article('disable-all-buffs', 'Disable All Buffs', 'Use the Enable Buffs switch in Settings to turn off the four core stat bonuses.', [
      'Turning Enable Buffs off makes Luck, Roll Speed, Weight Luck and Weight Multiplier use 1×. One-roll Luck charges are not spent while it is off.',
      'This is not a universal reset of every mechanic: mutation effects, some equipment-specific rules and value effects can still apply. Gem availability and event requirements remain in force.'
    ], { aliases: ['enable buffs', 'buffs disabled', 'unbuffed'], links: [['../settings/', 'Open Settings']] })
  ]},
  { id: 'mutations-chance', title: '✨ Mutations & Actual Chance', description: 'Mutation checks and standardized specimen rarity', articles: [
    article('mutation-chance', 'Mutation Chance', 'Improves the checks for eligible mutations on a specimen.', [
      'Mutation checks are separate from the base-gem selection. Each eligible mutation uses its own listed chance, adjusted by applicable mutation bonuses.',
      'For an ordinary mutation, doubling Mutation Chance doubles its check probability, up to a guaranteed check. Exclusive mutations and equipment overrides can follow special rules.'
    ], { related: ['multiple-mutations', 'exclusive-mutations'] }),
    article('multiple-mutations', 'Multiple Mutations', 'A specimen can carry multiple compatible mutations.', [
      'Eligible mutations are checked independently, rather than choosing only one winner. Multiple checks can succeed on the same specimen; their applicable value multipliers multiply together.'
    ]),
    article('mutation-rarity', 'Mutation Rarity', 'The listed “1 in X” chance of a mutation before applicable chance buffs.', [
      'Use the listed chance denominator when comparing standardized specimen rarity. A mutation’s value multiplier describes its effect on value, not how rare it is.'
    ], { related: ['actual-chance'], links: [['../mutation-index/', 'Open Mutation Index']] }),
    article('actual-chance', 'Actual Chance', 'The standardized rarity of the base gem and its mutation combination.', [
      'Actual Chance = gem Base Rarity × mutation rarity 1 × mutation rarity 2 × …, using the listed “1 in X” denominators.',
      'For example, a 1 in 1,000 gem with a 1 in 100 mutation has an Actual Chance of 1 in 100,000. With no mutations, Actual Chance equals Base Rarity.',
      'Inventory and the Rarest Gem / Best Roll leaderboards use this specimen rarity. Rarest Gem compares current inventory specimens; Best Roll uses recorded roll history.',
      'Luck and Mutation Chance buffs can make the underlying checks easier. Actual Chance uses listed/base chances, so it is not the literal probability of producing that specimen with your current buffs.'
    ], { callout: 'Base Rarity describes the gem; Actual Chance also includes its mutations.', related: ['base-rarity', 'effective-rarity', 'raw-rarity'] }),
    article('exclusive-mutations', 'Exclusive & Event Mutations', 'Some mutations need specific equipment or an active event.', [
      'Shifted requires Reality Shifter’s special roll, Balanced requires All Rounder Toy, and Charged requires Mutation Storm. Raising ordinary Mutation Chance does not unlock a missing requirement.'
    ], { related: ['random-events', 'mutation-index'] })
  ]},
  { id: 'world-mechanics', title: '🌍 World Mechanics', description: 'Availability windows, Special Gems and all 25 events', articles: [
    article('availability', 'Gem Availability', 'A gem must be available before its rarity can be checked.', [
      'Normal gems are ordinarily available at any time. Daily Window gems require a recurring time window. Random Event gems need their event. Limited gems require a date range. Special Source describes gems obtained through another source or special condition.',
      'These conditions can overlap. The Gem Index already shows Flat Chance and availability indicators, including localized times; use those indicators to check a particular gem.'
    ], { aliases: ['normal', 'special source'], related: ['daily-windows', 'limited-gems', 'event-gem'], links: [['../gem-index/', 'Open Gem Index']] }),
    article('daily-windows', 'Daily Windows', 'Recurring times of day when a gem becomes eligible.', [
      'Outside its window, the gem cannot be selected. Its listed rarity describes the check while available, without folding the waiting time into the denominator.',
      'The Gem Index shows the window in your local time alongside the configured reference time, normally Singapore time. Some windows cross midnight; follow the displayed availability indicator.'
    ]),
    article('limited-gems', 'Limited Gems', 'Gems available only during a specified date range.', [
      'The date restriction is separate from rarity, and some Limited gems also have a Daily Window. An expired gem can remain part of your discovery history even though it is no longer eligible to roll.'
    ]),
    article('special-gem', 'Special Gem', 'A catalog designation used by effects that specifically target Special Gems.', [
      'For example, the Resonator’s Special Gem Chance bonus checks this designation. It is not another name for every rare, flat-chance or event-only gem.',
      'Special status, Luck sensitivity and availability are separate properties. Check the gem’s indicators and the effect’s description.'
    ], { related: ['flat-chance', 'event-gem'] }),
    article('random-events', 'Random Events', 'Temporary world events that change roll conditions while active.', [
      'The active-event banner shows the current event and remaining time, then disappears when the event ends. Event mechanics can boost stats, target certain gems, change natural weight or unlock event gems.',
      'The full catalog below is grouped by event tier. Each description explains what happens during the event.'
    ], { callout: 'Event tier ≠ gem rarity. A Legendary event does not make every gem Legendary.', events: true, related: ['event-gem'] }),
    article('event-gem', 'Event Gems', 'Gems that require a particular Random Event, sometimes with extra conditions.', [
      'A listed event-gem rarity only applies while its required event and conditions are active. It does not include how often the event occurs.',
      'Some gems also require a Starfall window, a particular roll state, or Singularity’s collapse and final moments. An active event alone may not satisfy every requirement.'
    ], { related: ['random-events', 'availability'] })
  ]},
  { id: 'progression', title: '📈 Progression', description: 'Research, collections and long-term goals', articles: [
    article('research', 'Research', 'Account upgrades purchased with Research Points.', [
      'Spend Research Points along branches to improve different parts of progression. Owned upgrades apply across equipment changes where their conditions are met.',
      'The Research Tree shows prerequisites, costs, effects and your available points. It also offers a reset with its own cost and cooldown.'
    ], { links: [['../research-tree/', 'Open Research Tree']] }),
    article('museum', 'Museum', 'Build a collection to earn Museum Prestige and benefits.', [
      'Permanent registration consumes the selected specimen and records it in the Museum. Exhibiting is different: it locks the specimen in a display slot until you remove it.',
      'Review which action you are taking before submitting a valuable specimen. The Museum shows current benefits and collection progress.'
    ], { links: [['../museum/', 'Open Museum']] }),
    article('bundles', 'Bundles', 'Long-term collection challenges requiring specific sets of specimens.', [
      'Contributed specimens are consumed, and progress is recorded toward the bundle’s requirements. Automatic routing, when enabled, can send eligible new rolls toward a requirement.',
      'Bundles are designed as long-term goals and are not expected to be completed quickly. Check all specimen requirements before contributing.'
    ]),
    article('gem-index', 'Gem Index', 'Your record of discovered gems and mutation combinations.', [
      'Discovery records remain after you sell, use or donate the specimen. Use the Index to inspect gem rarity, mutation combinations, Flat Chance and availability.'
    ], { links: [['../gem-index/', 'Open Gem Index']] }),
    article('mutation-index', 'Mutation Index', 'Your record of discovered mutation types and discovery counts.', [
      'The Mutation Index collects mutation discoveries across your recorded gem combinations. It shows listed mutation chances and value multipliers alongside your progress.',
      'Discovering a mutation type is different from discovering every gem-and-mutation combination. A specimen with several mutations can contribute to several mutation types.'
    ], { links: [['../mutation-index/', 'Open Mutation Index']], related: ['mutation-chance'] }),
    article('achievements', 'Achievements', 'Goals that recognize progress and unlock claimable rewards.', [
      'Each achievement has its own condition. Check the Achievements page for progress, rewards and Achievement Point milestones, and claim completed rewards there.'
    ], { links: [['../achievements/', 'Open Achievements']] }),
    article('minigames', 'Minigames', 'Side activities with their own rules and progression.', [
      'Choose a game and read its instructions before starting. Practice and rewarded play are available where supported; eligibility and rewards depend on the selected game and mode.'
    ], { links: [['../minigames/', 'Open Minigames']] })
  ]}
];
