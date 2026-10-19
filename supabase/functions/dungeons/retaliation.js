import { parseStatMultiplier } from './formulas.js';

export const RETALIATION_VERSION = '2026-10-19';

// All inputs are catalog/server data. Never scale from the entering player's HP.
export function computeRetaliationDamage({ referenceAttack, roomNumber, rank,
  isBoss = false, catalogDamage, regionDamage, zoneDamage, bossRepeat = 0,
  fallbackRoleDamage = 1, mutationDamage = 1 }) {
  const reference = referenceAttack[Number(roomNumber) - 1];
  if (!(reference > 0)) throw new Error('missing_dungeon_retaliation_reference');
  const expectedHealth = 100 + Math.floor(2 * Math.max(0, reference - 10));
  const repeat = isBoss ? 1 + Math.max(0, Number(bossRepeat) || 0) : 1;
  const parsed = parseStatMultiplier(catalogDamage);
  // Catalog damage already includes region/difficulty/boss/repeat factors.
  // Extract only the archetype; rank is encoded by rate, not multiplied twice.
  const role = parsed == null ? fallbackRoleDamage
    : parsed / (regionDamage * zoneDamage * (isBoss ? 6 * repeat : 1));
  const rate = isBoss ? .03 : rank === 'Normal' ? .015 : rank === 'Elite' ? .025 : .03;
  return Math.max(.25, expectedHealth * rate * zoneDamage
    * Math.sqrt(Math.max(.5, Math.min(2, role))) * Math.min(1.6, mutationDamage));
}

// Old fights retain the exact legacy 8% rule; new fights use their saved amount.
export function savedRetaliationDamage(enemy) {
  if (enemy.retaliationVersion === RETALIATION_VERSION) {
    const amount = Number(enemy.retaliationDamage);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_retaliation_snapshot');
    return amount;
  }
  const damage = Number(enemy.damage);
  return (Number.isFinite(damage) ? damage : 10) * .08;
}
