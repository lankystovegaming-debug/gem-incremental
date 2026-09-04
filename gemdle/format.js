export const number = value => Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const odds = value => Number(value) >= 1e15 ? Number(value).toExponential(3) : number(Math.round(Number(value)));
export const mutationNames = specimen => specimen.mutations.map(m => m.name).join(" + ") || "No Mutation";
export function shareText(row) {
  const s = row.specimen;
  return `Gemdle ${row.gemdle_date} • ${s.gem_name} • ${number(s.weight_multiplier)}× • ${mutationNames(s)} • 1 in ${odds(s.overall_rarity)}`;
}
export const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
