const LISTING_FEE_RATES = new Map([
  [1, 0.025],
  [6, 0.035],
  [12, 0.045],
  [24, 0.06],
  [48, 0.08],
  [72, 0.10]
]);

export function saleFeeRate(_price, hours) {
  return LISTING_FEE_RATES.get(Number(hours)) ?? LISTING_FEE_RATES.get(24);
}

export function orderFeeRate(_price) {
  return 0.05;
}

export function feeAmount(price, rate) {
  return Math.round(Math.max(0, price) * rate * 100) / 100;
}
