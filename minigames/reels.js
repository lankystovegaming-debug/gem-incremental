// Independent of normal rolling: exact integer weights out of 10,000.
export const reelSymbols = [
  'Quartz', 'Malachite', 'Sodalite', 'Tiger’s Eye', 'Azurite', 'Opal',
  'Aventurine', 'Zircon', 'Moonstone', 'Kyanite', 'Mythril', 'Sapphire',
  'Prismatic Shard',
];
export const reelWeights = [1485,1485,1485,990,990,990,594,594,594,231,231,231,100];
export const reelMultiplier = (id) => [1,2,4,8][Math.floor(id / 3)];
export const reelHands = ['No Cluster','Pair','Two Pair','Triple','Gem Run','Full Cluster','Quad Cluster','Perfect Cluster'];
export const reelBases = [0,50,125,200,300,450,750,2000];
export const reelReward = (score) => score < 1750 ? 8 : score < 2500 ? 14 : score < 3250 ? 20 : score < 4250 ? 26 : score < 5500 ? 32 : score < 7500 ? 40 : 50;
