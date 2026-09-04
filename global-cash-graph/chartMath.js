export function chartBounds(values) {
  let min = Math.min(...values), max = Math.max(...values);
  // At very large balances, +/- 1 can round back to the original number.
  const padding = Math.max((max - min) * 0.08, Math.abs(max) * 0.01, Math.abs(min) * 0.01, 1);
  return [min - padding, max + padding];
}

export function niceTicks(min, max, count = 4) {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [];
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  // Bound iteration; repeated addition can otherwise stall at float precision.
  for (let i = 0; i < 32; i++) {
    const value = start + i * step;
    if (!Number.isFinite(value) || value > max + step * 0.001) break;
    if (!ticks.length || value > ticks[ticks.length - 1]) ticks.push(value);
  }
  return ticks;
}

export function largeMoney(value, digits = 1) {
  const n = Number(value);
  if (Math.abs(n) >= 1e21) return "$" + n.toExponential(digits);
  if (Math.abs(n) >= 1e18) return "$" + (n / 1e18).toFixed(digits) + "Qi";
  if (Math.abs(n) >= 1e15) return "$" + (n / 1e15).toFixed(digits) + "Qa";
  return null;
}
