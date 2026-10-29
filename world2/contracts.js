// Phase 1 reference arithmetic only. Never import this module into the W1 hot path.
export const PHASE1_ENABLED = false;
export function requireWorld1(world = 1) {
  if (world !== 1) throw new Error('world2_disabled');
  return 1;
}
export function adaptationFactor(level) {
  if (!Number.isInteger(level) || level < 0 || level > 5) throw new RangeError('adaptation_level');
  return (50 + 5 * level) / 100;
}
function finite(value) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('nonnegative_finite_value');
  return value;
}
export function adaptMultiplier(native, level) {
  finite(native);
  const a = adaptationFactor(level);
  return native > 1 ? 1 + a * (native - 1) : native;
}
export function adaptAdditive(native, level) {
  if (!Number.isFinite(native)) throw new RangeError('finite_value');
  const a = adaptationFactor(level);
  return native > 0 ? a * native : native;
}
export function adaptOpportunity(probability, level) {
  finite(probability);
  if (probability > 1) throw new RangeError('probability');
  return probability * adaptationFactor(level);
}
export function adaptProbabilityReplacement(baseline, native, level) {
  if ([baseline, native].some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new RangeError('probability');
  const a = adaptationFactor(level);
  return native > baseline ? baseline + a * (native - baseline) : native;
}
export function adaptSupersizerSize(size, level) {
  finite(size);
  const a = adaptationFactor(level);
  return size > 1 ? Math.sqrt(1 + a * (size * size - 1)) : size;
}
export function epochStartMs(serverTimeMs) {
  if (!Number.isSafeInteger(serverTimeMs) || serverTimeMs < 0) throw new RangeError('server_time');
  return Math.floor(serverTimeMs / 43200000) * 43200000;
}
// Stage 1 measures final weight/base weight before Abyssal Laws, not raw R.
// Stage 2 explicitly measures raw R. Neither is wired into progression in Phase 1.
export function questSpecimenQualifies(stage, outcome) {
  if (outcome.acceptedGenuine !== true || outcome.sourceWorld !== 1 || outcome.isBonus !== false ||
      !Number.isSafeInteger(outcome.sequence) || !Number.isSafeInteger(outcome.activationSequence) ||
      outcome.sequence <= outcome.activationSequence) return false;
  if (stage === 1) return outcome.gemName === 'Quartz' && Array.isArray(outcome.allMutationIds) &&
    outcome.allMutationIds.length === 0 && Number.isFinite(outcome.ordinaryFinalWeightRatio) &&
    outcome.ordinaryFinalWeightRatio >= 0 && outcome.ordinaryFinalWeightRatio < 1;
  if (stage === 2) return Number.isFinite(outcome.rawRolledWeightMultiplier) && outcome.rawRolledWeightMultiplier > 5;
  if (stage === 3) return outcome.gemName === 'Black Opal' &&
    Array.isArray(outcome.allMutationIds) && outcome.allMutationIds.includes('glossy');
  return false;
}
