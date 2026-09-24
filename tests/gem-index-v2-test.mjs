import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  availabilityState,
  canonicalMutationIds,
  canonicalMutationKey,
  dailyWindowIsOpen,
  indexCombinationRecords,
  mutationCombinationIsObtainable,
  mutationSourceLabel,
  rawCombinationDenominator
} from "../src/logic/gemIndex.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("gem-index/index.js");
const migration = read("supabase/migrations/20260923142634_repair_gem_index_v2.sql");
const roll = read("supabase/functions/roll/index.ts");
const mutationIndex = read("mutation-index/index.js");

assert.deepEqual(canonicalMutationIds([" Polished ", "gilded", "polished"]), ["gilded", "polished"]);
assert.equal(canonicalMutationKey(["polished", "gilded"]), "gilded+polished");
assert.equal(canonicalMutationKey([]), "none");

const records = indexCombinationRecords([
  { gem_name: "Ruby", combination_key: "polished+gilded", mutation_ids: ["polished", "gilded"], total_found: 2, highest_value: 10, first_discovered_at: "2026-01-02", last_discovered_at: "2026-01-03" },
  { gem_name: "Ruby", combination_key: "gilded+polished", mutation_ids: ["gilded", "polished"], total_found: 3, highest_value: 12, first_discovered_at: "2026-01-01", last_discovered_at: "2026-01-04" }
]);
assert.equal(records.combinations.size, 1);
assert.equal(records.combinations.get("Ruby::gilded+polished").totalFound, 5);
assert.equal(records.combinations.get("Ruby::gilded+polished").highestValue, 12);
assert.equal(records.combinations.get("Ruby::gilded+polished").firstDiscoveredAt, "2026-01-01");

assert.equal(mutationCombinationIsObtainable(["shifted", "polished"]), false);
assert.equal(mutationCombinationIsObtainable(["balanced", "ascended"]), false);
assert.equal(mutationCombinationIsObtainable(["supersizer-small", "supersizer-big"]), false);
assert.equal(mutationCombinationIsObtainable(["tryhard", "polished"]), true);
assert.equal(mutationCombinationIsObtainable(["polished", "gilded"]), true);
assert.equal(mutationSourceLabel(["happy"]), "Silly Fun Happy Pickaxe only");
assert.equal(mutationSourceLabel(["tryhard", "polished"]), "All-In Pickaxe only");
assert.equal(rawCombinationDenominator(100, ["gilded"], new Map([["gilded", { chance: 500 }]])), 50000);

const dailyGem = { availabilityMode: "daily", dailyStartTime: "20:00", dailyEndTime: "06:00", availabilityTimezone: "UTC" };
assert.equal(dailyWindowIsOpen(dailyGem, new Date("2026-09-23T23:00:00Z")), true);
assert.equal(dailyWindowIsOpen(dailyGem, new Date("2026-09-23T12:00:00Z")), false);
assert.equal(availabilityState({ startsAt: "2027-01-01T00:00:00Z", availabilityMode: "date_range" }, new Date("2026-09-23T00:00:00Z")), "upcoming");
assert.equal(availabilityState({ endsAt: "2026-01-01T00:00:00Z", availabilityMode: "date_range" }, new Date("2026-09-23T00:00:00Z")), "expired");

assert.match(migration, /create or replace function public\.canonical_gem_mutation_key/);
assert.match(migration, /returns public\.player_gem_mutation_combinations/);
assert.match(migration, /where gem\.enabled = true/);
assert.doesNotMatch(migration.slice(migration.indexOf("get_public_gem_index_catalog")), /now\(\).*starts_at|ends_at.*now\(\)/,
  "historical enabled gems must remain in the index catalog");
assert.match(roll, /new Set\(mutationIds\.map\(\(id\) => String\(id\)\.trim\(\)\.toLowerCase\(\)\)\.filter\(Boolean\)\)/u);
assert.match(roll, /\['balanced','shifted','tryhard'\]\.includes\(mutation\.id\)/);
assert.match(roll, /Number\(player\.total_rolls \?\? 0\) \+ 1/);
assert.doesNotMatch(roll.slice(roll.indexOf("const rollNumber"), roll.indexOf("const rollNumber") + 200), /equipment_genuine_rolls/);
assert.doesNotMatch(page, /Math\.pow\(2|2 \*\*/);
assert.doesNotMatch(page, /private_feature_gems[\s\S]{0,500}\.order\("multiplier"/);
assert.match(page, /const BAND_PAGE_SIZE = 24/);
assert.match(page, /"transcendent", "secret", "anomalous"/,
  "Anomalous must render directly below Secret");
assert.match(page, /renderBandContents\(band, band\.dataset\.tierBand\)/,
  "opening a band should render only that band instead of rebuilding the full index");
assert.match(page, /\["name", "found"\]\.includes\(gemSort\.value\)/,
  "non-rarity sorts must remain global rather than being re-sorted into rarity bands");
assert.doesNotMatch(page, /window\.addEventListener\("focus"|visibilitychange|postgres_changes/,
  "the index must not refresh itself while the player is reading it");
assert.match(mutationIndex, /"ascended", "silly-small", "silly-large", "happy"/);

console.log("Gem Index v2 checks passed.");
