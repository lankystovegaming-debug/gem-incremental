import { escapeHtml } from './format.js';

const STYLES = new Set(['bronze', 'gold', 'diamond', 'prismatic', 'sunrise', 'stone', 'mutation', 'archive']);
const RARITIES = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Legacy']);
export function cosmeticStyle(item) {
  const style = item?.visual_config?.style;
  return STYLES.has(style) ? style : 'stone';
}
export function cosmeticRarity(item) {
  return RARITIES.has(item?.rarity) ? item.rarity : 'Common';
}
export function cosmeticHtml(item, { trophy = false } = {}) {
  if (!item) return '';
  const rarity = cosmeticRarity(item);
  return `<span class="cosmetic cosmetic--${cosmeticStyle(item)} ${trophy ? 'cosmetic--trophy' : ''}" title="${escapeHtml(`${rarity} · ${item.description || item.name}`)}">
    <span class="cosmetic__icon" aria-hidden="true">${escapeHtml(item.visual_config?.icon || '◆')}</span>
    <span>${escapeHtml(item.name)}${trophy ? `<small>${escapeHtml(rarity)} · ${escapeHtml(item.description || '')}</small>` : ''}</span>
  </span>`;
}
