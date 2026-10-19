export function formatHealth(value) {
  const number = Math.max(0, Number(value) || 0);
  // Preserve fractional loss without making large health values hard to scan.
  if (number > 0 && number < .01) return '<0.01';
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function counterattackFeedback(result, previousRun) {
  // Support frontend-first rollout against an older backend response as well.
  const explicit = Number(result.retaliationDamage);
  const previous = Number(previousRun?.player_health), current = Number(result.run?.player_health);
  const amount = Number.isFinite(explicit) ? explicit
    : Number.isFinite(previous) && Number.isFinite(current) ? Math.max(0, previous - current) : 0;
  if (amount > 0) return ` ${result.retaliationEnemy || 'The enemy'} counterattacked for ${formatHealth(amount)} damage.`;
  return result.defeated ? ' Defeated before it could counterattack.' : '';
}
