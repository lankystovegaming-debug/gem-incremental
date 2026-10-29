// The supplied table is rounded to whole points; multipliers use the exact ratio.
export const minesScore = (revealed) => Math.round(25000 / (25 - revealed));
export const minesMultiplier = (revealed) => 25 / (25 - revealed);
export const minesRisk = (revealed) => 100 / (25 - revealed);
