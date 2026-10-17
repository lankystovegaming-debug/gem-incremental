import { canonicalEnemyName, equipmentGemPower, parseStatMultiplier } from './formulas.js';

export const BALANCE_VERSION = '2026-10-17';

export function combatMutationMultiplier(value = 1) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new Error('invalid_mutation_value');
  return Math.min(12, 1 + Math.log2(Number(value)));
}

// Keep collectible/raw GP unchanged. Round once, after applying combat scaling.
export function combatGemPower(gear, mutations = new Map()) {
  const raw = Math.max(0, Number(gear.gem_power) || 0);
  if (!gear.mutation_name || gear.quality === 'Workbench') return raw;
  const value = Number(mutations.get(gear.mutation_name)?.value_multiplier ?? 1);
  const multiplier = combatMutationMultiplier(value);
  const item = { components: gear.stats?.components ?? gear.components,
    quality: gear.quality, level: '+' + (gear.upgrade_level || 0) };
  // Canonical drops can be reconstructed exactly, including pre-rounding GP.
  // Preserve customized/legacy power by converting its actual stored value.
  if (gear.room_number > 0 && item.components && equipmentGemPower(gear.room_number, item, value) === raw) {
    return equipmentGemPower(gear.room_number, item, multiplier);
  }
  return Math.max(1, Math.round(raw / value * multiplier));
}

export async function loadCombatMutations(client) {
  const { data, error } = await client.from('dungeon_mutations').select('name,value_multiplier');
  if (error) throw error;
  return new Map((data || []).map(row => [row.name, row]));
}

export async function annotateCombatGear(client, gear) {
  const mutations = gear.some(item => item.mutation_name) ? await loadCombatMutations(client) : new Map();
  return gear.map(item => ({ ...item, combat_gem_power: combatGemPower(item, mutations) }));
}

// Convert BEFORE choosing the best item: the raw-GP top ten may omit it.
// Keyset pagination avoids the Data API row cap and growing OFFSET scans.
export async function bestCombatGemPower(client, playerId) {
  const mutations = await loadCombatMutations(client);
  let best = 0, after = null;
  const pageSize = 500;
  while (true) {
    let query = client.from('dungeon_gear')
      .select('id,room_number,quality,upgrade_level,gem_power,mutation_name,stats')
      .eq('player_id', playerId).order('id').limit(pageSize);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) throw error;
    for (const item of data || []) best = Math.max(best, combatGemPower(item, mutations));
    if (!data || data.length < pageSize) return best;
    after = data.at(-1).id;
  }
}

export function balancedEnemyHealth(reference, room, row, rankHp, mutationHp,
  regionHp, zoneHp, isBoss = false, bossRepeat = 0) {
  const attack = reference[Number(room.room_number) - 1];
  if (!(attack > 0)) throw new Error('missing_dungeon_balance_reference');
  const repeat = isBoss ? 1 + Math.max(0, Number(bossRepeat) || 0) : 1;
  // Catalog HP already includes region, difficulty and boss/repeat factors.
  // Remove those before reapplying them to the new fixed progression curve.
  const base = parseStatMultiplier(row.hp) ?? regionHp * zoneHp *
    (isBoss ? 15 * repeat : canonicalEnemyName(row.name) === 'Mimic' ? 1.2 : 1);
  const role = base / (regionHp * zoneHp * (isBoss ? 15 * repeat : 1));
  const bonus = isBoss ? mutationHp : Math.min(12, rankHp * mutationHp);
  return Math.max(1, Math.round(attack * (isBoss ? 10.5 : 3.25) * role * zoneHp * repeat * bonus));
}
