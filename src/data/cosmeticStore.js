export const FACET_RATE = 100;

export const FACET_PACKS = [
  { id: 'facets-100', facets: 100, cents: 100 },
  { id: 'facets-250', facets: 250, cents: 250 },
  { id: 'facets-500', facets: 500, cents: 500 },
  { id: 'facets-1000', facets: 1000, cents: 1000 },
  { id: 'facets-2500', facets: 2500, cents: 2500 }
];

const themes = [
  {
    id: 'glitched', name: 'Glitched', style: 'glitched', icon: '⌁',
    description: 'Restrained signal corruption, RGB displacement and fractured interface details.'
  },
  {
    id: 'celestial', name: 'Celestial', style: 'celestial', icon: '✦',
    description: 'A clean midnight starfield with constellations and luminous edges.'
  },
  {
    id: 'overgrown', name: 'Overgrown', style: 'overgrown', icon: '❧',
    description: 'An abandoned mine reclaimed by moss, stone and quiet vines.'
  }
];

const slotDetails = {
  title: { label: 'Title', suffix: 'Title', price: 100 },
  background: { label: 'Profile Background', suffix: 'Profile Background', price: 250 },
  roll_card: { label: 'Roll Card', suffix: 'Roll Card', price: 250 },
  leaderboard_skin: { label: 'Leaderboard', suffix: 'Leaderboard Skin', price: 200 }
};

export const COSMETIC_COLLECTIONS = themes.map(theme => ({
  ...theme,
  price: 600,
  itemIds: Object.keys(slotDetails).map(slot => `${theme.id}-${slot.replace('_', '-')}`)
}));

export const COSMETIC_ITEMS = themes.flatMap(theme => Object.entries(slotDetails).map(([type, detail]) => ({
  id: `${theme.id}-${type.replace('_', '-')}`,
  name: type === 'title' ? `[${theme.name.toUpperCase()}]` : `${theme.name} ${detail.suffix}`,
  type,
  typeLabel: detail.label,
  price: detail.price,
  collectionId: theme.id,
  style: theme.style,
  icon: theme.icon,
  description: theme.description,
  featured: type === 'roll_card'
}))).concat([
  { id: 'gambler-title', name: '[GAMBLER]', type: 'title', typeLabel: 'Title', price: 100, style: 'gambler', icon: '♠', description: 'For players who know the next roll is the one.', featured: false },
  { id: 'quit-99-title', name: '[99% QUIT]', type: 'title', typeLabel: 'Title', price: 100, style: 'quit99', icon: '↻', description: 'A stubborn little reminder to keep digging.', featured: false },
  { id: 'retro-desktop-roll-card', name: 'Retro Desktop', type: 'roll_card', typeLabel: 'Roll Card', price: 250, style: 'retro-desktop', icon: '▣', description: 'Original early-desktop window styling for single and batch rolls. Automatically follows light or dark mode. Concept credit: Flame.', featured: true, credit: 'Flame' }
]);

export const PRISMATIC_ITEMS = [
  { id: 'prismatic-title', name: '[PRISMATIC]', type: 'title', typeLabel: 'Title', shardPrice: 10, style: 'prismatic', icon: '◇', description: 'A title cut from refracted crystal light.' },
  { id: 'prismatic-leaderboard-skin', name: 'Prismatic Leaderboard Skin', type: 'leaderboard_skin', typeLabel: 'Leaderboard', shardPrice: 15, style: 'prismatic', icon: '◇', description: 'Faceted crystal edges and restrained refracted highlights.' },
  { id: 'prismatic-roll-card', name: 'Prismatic Roll Card', type: 'roll_card', typeLabel: 'Roll Card', shardPrice: 20, style: 'prismatic', icon: '◇', description: 'A translucent gem-cut roll surface with shifting refraction.' },
  { id: 'prismatic-background', name: 'Prismatic Profile Background', type: 'background', typeLabel: 'Profile Background', shardPrice: 20, style: 'prismatic', icon: '◇', description: 'Angular crystal planes with subtle split-light highlights.' }
];

export const STORE_SECTIONS = [
  ['featured', 'Featured'], ['collections', 'Collections'], ['title', 'Titles'],
  ['background', 'Profile Backgrounds'], ['roll_card', 'Roll Cards'],
  ['leaderboard_skin', 'Leaderboard'], ['prismatic', 'Prismatic'], ['my-cosmetics', 'My Cosmetics']
];

export const formatFacets = value => `${Number(value || 0).toLocaleString()} Facets`;
export const facetsToSgd = value => `S$${(Number(value || 0) / FACET_RATE).toFixed(2)}`;
export const collectionUpgradePrice = (collection, ownedIds) => {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
  const remaining = COSMETIC_ITEMS
    .filter(item => item.collectionId === collection.id && !owned.has(item.id))
    .reduce((sum, item) => sum + item.price, 0);
  return Math.ceil(remaining * 0.75);
};

export const prismaticCollectionPrice = ownedIds => {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
  const remaining = PRISMATIC_ITEMS.filter(item => !owned.has(item.id)).reduce((sum, item) => sum + item.shardPrice, 0);
  return Math.ceil(remaining * 50 / 65);
};
