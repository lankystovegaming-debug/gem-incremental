// Request-local only. Canonical rarity remains untouched for every other rule.
export function biomeSelectionPool(catalog: any[], snapshot: any) {
  const occurrence = snapshot?.occurrence;
  const tournament = snapshot?.tournament === true;
  return catalog.filter((gem: any) => {
    const required = snapshot?.exclusiveBiomes?.[gem.name] ?? gem.metadata?.requiredBiome;
    return !required || (!tournament && required === occurrence?.key);
  }).map((gem: any) => ({ ...gem,
    selectionDenominator: !tournament && occurrence?.denominators?.[gem.name] != null
      ? Number(occurrence.denominators[gem.name]) : Number(gem.rarity)
  }));
}

// Explicit deterministic ordering for effective ties; original catalogue order
// (sort_order, rarity desc, name) is carried by the row rather than DB arrival.
export function biomeSelectionOrder(a: any, b: any) {
  return (b.selectionDenominator ?? b.rarity) - (a.selectionDenominator ?? a.rarity)
    || Number(a.biomeTieOrder ?? 0) - Number(b.biomeTieOrder ?? 0)
    || b.rarity - a.rarity
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
