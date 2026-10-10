import { canonicalGemTags, type GemdlePrimary, type GemdleSemantic } from "./gemTags.ts";

export type GemdleClassification = {
  id: string;
  name: string;
  family: string;
  kind: "exact" | "relationship" | "alignment" | "mutation_pair" | "primary_cross" | "weight" | "structural";
  bonus: number;
};

type SpecimenLike = {
  gem_name?: unknown;
  weight_multiplier?: unknown;
  mutations?: Array<{ id?: unknown; name?: unknown }>;
  contributions?: { gem?: unknown; weight?: unknown; mutations?: unknown };
};

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("en-US");
const award = (id: string, name: string, family: string, kind: GemdleClassification["kind"], bonus: number): GemdleClassification =>
  ({ id, name, family, kind, bonus });

function mutationSet(specimen: SpecimenLike) {
  const result = new Set<string>();
  for (const mutation of Array.isArray(specimen.mutations) ? specimen.mutations : []) {
    result.add(normalize(mutation.name));
    result.add(normalize(mutation.id));
  }
  return result;
}

function structuralClassifications(gem: any) {
  const metadata = gem?.metadata && typeof gem.metadata === "object" ? gem.metadata : {};
  const specific: GemdleClassification[] = [];
  if (Object.prototype.hasOwnProperty.call(metadata, "deepcore_stage")) specific.push(award("deepcore", "Deepcore", "structural:deepcore", "structural", 0));
  if (metadata.sourceExclusive === true) specific.push(award("source_exclusive", "Source-Exclusive", "structural:source_exclusive", "structural", 0));
  if (metadata.abyssalPotionExclusive === true) specific.push(award("potion_exclusive", "Potion-Exclusive", "structural:potion_exclusive", "structural", 0));
  const anniversary = metadata.milestone === true || metadata.anniversary === true || metadata.anniversaryMarker === true ||
    metadata.anniversary_marker === true || normalize(metadata.source) === "anniversary";
  if (anniversary) specific.push(award("milestone", "Milestone", "structural:milestone", "structural", 0));
  if (gem?.availability_mode === "date_range" && !specific.length) specific.push(award("limited", "Limited", "structural:limited", "structural", 0));

  const result = [...specific];
  if (gem?.affected_by_luck === false) result.push(award("flat", "Flat", "structural:chance", "structural", 0));
  if (gem?.availability_mode === "daily") result.push(award("time_gated", "Time-Gated", "structural:availability", "structural", 0));
  if (gem?.availability_mode === "global_event") result.push(award("event_exclusive", "Event-Exclusive", "structural:availability", "structural", 0));
  const attributed = metadata.community === true || Boolean(String(metadata.creator ?? "").trim()) || /\(by\s+@[^)]+\)/i.test(String(gem?.description ?? ""));
  if (attributed) result.push(award("community", "Community", "structural:attribution", "structural", 0));
  return result;
}

export function specimenBaseRarity(specimen: SpecimenLike) {
  const contributions = specimen?.contributions;
  const parts = [Number(contributions?.gem), Number(contributions?.weight), Number(contributions?.mutations)];
  if (parts.some(value => !Number.isFinite(value) || value <= 0)) throw new Error("invalid_specimen_contributions");
  const rarity = parts[0] * parts[1] * parts[2];
  if (!Number.isFinite(rarity) || rarity < 1) throw new Error("invalid_specimen_rarity");
  return rarity;
}

export function classifySpecimen(gem: any, specimen: SpecimenLike) {
  const canonical = canonicalGemTags(specimen.gem_name ?? gem?.name);
  const primary: GemdlePrimary | null = canonical?.primary ?? null;
  const semantic: GemdleSemantic[] = canonical ? [...canonical.semantic] : [];
  const semanticSet = new Set<string>(semantic);
  const mutations = mutationSet(specimen);
  const has = (...names: string[]) => names.some(name => mutations.has(normalize(name)));
  const tagged = (name: GemdleSemantic) => semanticSet.has(name);
  const classifications: GemdleClassification[] = [];
  const suppressedAlignments = new Set<string>();
  const gemName = String(specimen.gem_name ?? gem?.name ?? "");

  // 1. Exact named overrides. Each replaces its generic semantic family.
  if (gemName === "Meteorite Peridot" && has("Celestial")) {
    classifications.push(award("written_in_the_stars", "Written in the Stars", "alignment:celestial", "exact", 0.18));
    suppressedAlignments.add("celestial");
  }
  if (gemName === "Uranium" && has("Radioactive")) {
    classifications.push(award("critical_mass", "Critical Mass", "alignment:radioactive", "exact", 0.65));
    suppressedAlignments.add("radioactive");
  }
  if (gemName === "Bloodstone" && has("Bloody")) {
    classifications.push(award("bloodbath", "Bloodbath", "alignment:bloody", "exact", 0.65));
    suppressedAlignments.add("bloody");
  }
  if (gemName === "Sunstone" && has("Radiant")) {
    classifications.push(award("solar_flare", "Solar Flare", "alignment:radiant", "exact", 0.50));
    suppressedAlignments.add("radiant");
  }

  // 2. Semantic contradictions and cross-semantic relationships.
  if ((tagged("Fiery") && has("Frozen")) || (tagged("Frozen") && has("Heated", "Blazing")))
    classifications.push(award("against_nature", "Against Nature", "relationship:thermal", "relationship", 0.65));
  if (tagged("Radiant") && has("Shadowed", "Voidtouched", "Abyssal"))
    classifications.push(award("radiant_paradox", "Radiant Paradox", "relationship:radiant_void", "relationship", 0.65));
  if (tagged("Organic/Living") && has("Fossilised", "Zombified", "Withered"))
    classifications.push(award("deathly_paradox", "Deathly Paradox", "relationship:living_dead", "relationship", 0.65));
  if (tagged("Ancient/Fossil") && has("Alive", "Verdant"))
    classifications.push(award("living_fossil", "Living Fossil", "relationship:living_fossil", "relationship", 0.75));
  if (tagged("Toxic") && has("Edible"))
    classifications.push(award("toxic_cuisine", "Toxic Cuisine", "relationship:toxic_cuisine", "relationship", 0.85));
  if (tagged("Corrupted/Glitched") && has("Balanced"))
    classifications.push(award("perfectly_balanced", "Perfectly Balanced", "relationship:corrupted_balance", "relationship", 0.30));

  // 3. Generic semantic alignments. Aliases in one family yield one award.
  const align = (tag: GemdleSemantic, mutationNames: string[], key: string, name: string, bonus: number) => {
    if (tagged(tag) && has(...mutationNames) && !suppressedAlignments.has(key))
      classifications.push(award(`${key}_alignment`, name, `alignment:${key}`, "alignment", bonus));
  };
  align("Aquatic", ["Aquatic"], "aquatic", "Aquatic Alignment", 0.55);
  align("Celestial", ["Celestial", "Cosmic", "Starstruck"], "celestial", "Celestial Alignment", 0.50);
  align("Fiery", ["Heated", "Blazing"], "infernal", "Infernal Alignment", 0.65);
  align("Frozen", ["Frozen"], "cryogenic", "Cryogenic Alignment", 0.75);
  align("Radioactive", ["Radioactive"], "radioactive", "Radioactive Alignment", 1.00);
  // Bloody is currently fully covered by the Bloodstone exact override.
  align("Radiant", ["Radiant", "Lit"], "radiant", "Radiant Alignment", 0.50);
  align("Dark/Void", ["Shadowed", "Voidtouched", "Abyssal"], "void", "Void Alignment", 0.50);
  align("Organic/Living", ["Alive", "Verdant"], "living", "Living Alignment", 0.75);
  align("Ancient/Fossil", ["Ancient", "Fossilised"], "ancient", "Ancient Alignment", 0.65);
  align("Toxic", ["Poisonous", "Acidic"], "toxic", "Toxic Alignment", 0.85);
  align("Corrupted/Glitched", ["Corrupted", "Discombobulated"], "corrupted", "Corrupted Alignment", 0.65);

  // 4. Mutation-pair classifications. Strongest member wins inside a family.
  if (has("Small")) {
    const size = [
      ["Gargantuan", "tiny_gargantuan", "Tiny Gargantuan", 0.40],
      ["Titanic", "pocket_titanic", "Pocket Titanic", 0.30],
      ["Colossal", "tiny_colossus", "Tiny Colossus", 0.25],
      ["Massive", "size_paradox", "Size Paradox", 0.20],
      ["Giant", "tiny_giant", "Tiny Giant", 0.18],
      ["Big", "mixed_signals", "Mixed Signals", 0.075]
    ] as const;
    const strongest = size.find(([mutation]) => has(mutation));
    if (strongest) classifications.push(award(strongest[1], strongest[2], "mutation:size", "mutation_pair", strongest[3]));
  }
  if (has("Balanced") && has("Chaotic")) classifications.push(award("perfect_chaos", "Perfect Chaos", "mutation:balance", "mutation_pair", 0.25));
  if (has("Frozen") && has("Heated", "Blazing")) classifications.push(award("thermal_paradox", "Thermal Paradox", "mutation:thermal", "mutation_pair", 0.80));
  if (has("Alive") && has("Fossilised", "Zombified")) classifications.push(award("living_dead", "Living Dead", "mutation:life", "mutation_pair", 1.10));
  if (has("Angelic") && has("Devilish")) classifications.push(award("divine_conflict", "Divine Conflict", "mutation:divine", "mutation_pair", 1.40));
  if (has("Gilded") && has("Golden")) classifications.push(award("fools_gold", "Fool's Gold", "mutation:gold", "mutation_pair", 0.65));
  if (has("Edible") && has("Rotten")) classifications.push(award("rotten_cuisine", "Rotten Cuisine", "mutation:cuisine", "mutation_pair", 1.05));
  else if (has("Edible") && has("Moldy")) classifications.push(award("questionable_cuisine", "Questionable Cuisine", "mutation:cuisine", "mutation_pair", 0.65));

  // 5. Primary-type crosses.
  if (primary === "Real" && has("Fake")) classifications.push(award("impostor", "Impostor", "primary:fake", "primary_cross", 0.15));
  if (primary === "Fictional" && has("Fake")) classifications.push(award("double_fiction", "Double Fiction", "primary:fake", "primary_cross", 0.45));
  if (primary === "Stupid" && has("Godlike")) classifications.push(award("comedy_of_the_gods", "Comedy of the Gods", "primary:godlike", "primary_cross", 0.65));

  // 6. Raw weight-pattern classifications.
  const weight = Number(specimen.weight_multiplier);
  if (Number.isFinite(weight)) {
    if (weight <= 0.510) classifications.push(award("bare_minimum", "Bare Minimum", "weight:light", "weight", 0.15));
    else if (weight <= 0.550) classifications.push(award("very_light", "Very Light", "weight:light", "weight", 0.06));
    if (Math.abs(weight - 1) <= 0.005) classifications.push(award("near_perfect", "Near Perfect", "weight:perfect", "weight", 0.07));
    if (weight >= 2 && Math.abs(weight - Math.round(weight)) <= 0.005)
      classifications.push(award("suspiciously_precise", "Suspiciously Precise", "weight:integer", "weight", 0.25));
  }

  // 7. Structural/display-only classifications.
  classifications.push(...structuralClassifications(gem));
  const bonus = classifications.reduce((sum, classification) => sum + classification.bonus, 0);
  return {
    gem_tags: { primary, semantic, structural: classifications.filter(item => item.kind === "structural").map(item => item.name) },
    classifications,
    classification_bonus: bonus
  };
}

export function scoreSpecimen(gem: any, specimen: SpecimenLike) {
  const specimenRarity = specimenBaseRarity(specimen);
  const classified = classifySpecimen(gem, specimen);
  const overallRarity = specimenRarity * (1 + classified.classification_bonus);
  if (!Number.isFinite(overallRarity) || overallRarity < 1) throw new Error("invalid_classified_rarity");
  return { ...classified, specimen_rarity: specimenRarity, overall_rarity: overallRarity };
}
