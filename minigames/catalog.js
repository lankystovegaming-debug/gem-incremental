export const catalog = [
  [
    "gem-catcher",
    "Gem Catcher",
    "Catch gems, dodge rocks, build your combo.",
    "Highest Score",
  ],
  [
    "ore-slicer",
    "Ore Slicer",
    "Swipe through gems. Keep clear of TNT.",
    "Highest Score",
  ],
  [
    "gem-2048",
    "Gem 2048",
    "Merge your way from Quartz to Glitched Gem.",
    "Highest Tile · score tiebreak",
  ],
  [
    "mine-sweeper",
    "Mine Sweeper",
    "Deduce the MT deposits and preserve every token.",
    "Fastest Perfect Expert Clear",
    true,
  ],
  [
    "gem-stack",
    "Gem Stack",
    "Stack seven shapes, clear lines, climb levels.",
    "Highest Score · lines tiebreak",
  ],
  [
    "prospector",
    "Prospector",
    "Find six deposits with twenty digs and temperature clues.",
    "Highest Score · remaining digs",
  ],
  [
    "explosive-mining",
    "Explosive Mining",
    "Five bombs. One board. Make every chain count.",
    "Highest Score · extraction tiebreak",
  ],
  [
    "gem-tower",
    "Gem Tower",
    "Climb for growing rewards. Collect before collapse.",
    "Highest Floor Cleared",
    true,
  ],
  [
    "crystal-bags",
    "Crystal Bags",
    "Five rounds of transparent odds and different risks.",
    "Personal lifetime statistics",
    true,
  ],
  [
    "price-is-right",
    "Price Is Right",
    "Name the value of ten fictional specimens.",
    "Highest Score · answering time",
  ],
  [
    "perfect-strike",
    "Perfect Strike",
    "Ten strikes. Find the center. Chase a perfect streak.",
    "Highest Score · Perfects · streak",
  ],
  [
    "gemdle",
    "Gemdle",
    "One daily specimen, revealed and saved forever.",
    "Today’s Overall Rarity",
    false,
    true,
  ],
].map(([id, name, description, leaderboard, mt = false, daily = false]) => ({
  id,
  name,
  description,
  leaderboard,
  mt,
  daily,
}));
export const tileNames = [
  "Quartz",
  "Malachite",
  "Sodalite",
  "Tiger’s Eye",
  "Azurite",
  "Opal",
  "Aventurine",
  "Zircon",
  "Moonstone",
  "Kyanite",
  "Iolite",
  "Tanzanite",
  "Mythril",
  "Sapphire",
  "Painite",
  "Bismuth",
  "Lanky Gem",
  "Carmeltazite",
  "Ascendentite",
  "Glitched Gem",
];
export const bags = {
  Safe: [
    [70, 3],
    [25, 6],
    [5, 10],
  ],
  Balanced: [
    [40, 2],
    [40, 4],
    [20, 8],
  ],
  Risky: [
    [50, 0],
    [35, 5],
    [15, 15],
  ],
  Jackpot: [
    [90, 0],
    [8, 10],
    [2, 160],
  ],
  Chaos: [
    [25, 0],
    [25, 2],
    [20, 4],
    [15, 6],
    [10, 10],
    [5, 16],
  ],
};
// Explicit whole-number tables keep choices close in EV, including early rounds.
export const payouts = {
  Safe: [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 10],
    [5, 8, 13],
    [6, 12, 20],
  ],
  Balanced: [
    [1, 2, 4],
    [1, 3, 7],
    [2, 4, 8],
    [3, 6, 12],
    [4, 8, 16],
  ],
  Risky: [
    [0, 3, 6],
    [0, 3, 13],
    [0, 5, 15],
    [0, 9, 19],
    [0, 10, 30],
  ],
  Jackpot: [
    [0, 5, 80],
    [0, 7, 122],
    [0, 10, 160],
    [0, 15, 240],
    [0, 20, 320],
  ],
  Chaos: [
    [0, 1, 2, 3, 5, 8],
    [0, 1, 3, 5, 8, 12],
    [0, 2, 4, 6, 10, 16],
    [0, 3, 6, 9, 15, 24],
    [0, 4, 8, 12, 20, 32],
  ],
};
export const bagTable = (name, round) =>
  bags[name].map(([chance], i) => [chance, payouts[name][round][i]]);
export const points = (r) =>
  r < 10
    ? 10
    : r < 100
      ? 20
      : r < 1000
        ? 40
        : r < 1e4
          ? 75
          : r < 1e5
            ? 125
            : r < 1e6
              ? 200
              : 350;
export const strikeConfig = (i) => ({
  period: i === 9 ? 650 : i < 3 ? 1800 : i < 6 ? 1300 : 950,
  width: i === 9 ? 0.018 : i < 3 ? 0.05 : i < 6 ? 0.035 : 0.025,
});
export function strikeRating(i, t) {
  const c = strikeConfig(i),
    x = Math.abs(((t / c.period) % 2) - 1),
    d = Math.abs(x - 0.5);
  return d <= c.width
    ? "PERFECT"
    : d <= c.width * 2
      ? "GREAT"
      : d <= c.width * 4
        ? "GOOD"
        : d <= 0.38
          ? "WEAK"
          : "MISS";
}
