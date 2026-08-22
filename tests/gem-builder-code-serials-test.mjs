import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const upcomingHtml = read("upcoming/index.html");
const upcomingJs = read("upcoming/upcoming.js");
const privateFeatures = read("supabase/functions/private-features/index.ts");
const gemIndex = read("gem-index/index.js");
const adminHtml = read("admin/index.html");
const adminJs = read("admin/admin.js");
const codesJs = read("codes/codes.js");
const cloudCodes = read("src/backend/cloudCodes.js");
const cloudInventory = read("src/backend/cloudInventory.js");
const inventory = read("inventory/inventory.js");
const migration = read("supabase/migrations/20260822000004_gem_descriptions_code_bundles_serials.sql");
const catalogMigration = read("supabase/migrations/20260822000007_live_gem_mutation_catalog_rpc.sql");

assert.match(upcomingHtml, /id="gemTitle"/);
assert.match(upcomingHtml, /id="gemDescription"/);
assert.match(upcomingJs, /title:\$\("gemTitle"\)\.value\.trim\(\)/);
assert.match(upcomingJs, /description:\$\("gemDescription"\)\.value\.trim\(\)/);
assert.match(privateFeatures, /title: String\(body\.title/);
assert.match(privateFeatures, /description: String\(body\.description/);
assert.match(gemIndex, /get_public_gem_catalog/);
assert.match(gemIndex, /get_public_mutation_catalog/);
assert.match(gemIndex, /\.from\("private_feature_gems"\)\s*\.select\("id,title,name,rarity,base_weight,value_per_gram,description/);
assert.match(gemIndex, /index-card__desc/);
assert.match(gemIndex, /index-card__gem-title/);
assert.match(gemIndex, /mutation-tab__custom/);

assert.match(adminHtml, /id="codePotionAdd"/);
assert.match(adminHtml, /id="codePotionRows"/);
assert.match(adminJs, /function addCodePotionRow/);
assert.match(adminJs, /function readCodePotionRewards/);
assert.match(cloudCodes, /admin_set_code_consumable_rewards/);
assert.match(codesJs, /Array\.isArray\(data\.consumables\)/);

assert.match(catalogMigration, /add column if not exists public\.private_feature_gems|add column if not exists title text/);
assert.match(catalogMigration, /get_public_mutation_catalog/);
assert.match(catalogMigration, /get_public_gem_catalog/);
assert.match(catalogMigration, /game_mutations_enabled_public_read/);
assert.match(migration, /add column if not exists serial_number bigint/);
assert.match(migration, /partition by gem_name/);
assert.match(migration, /assign_inventory_gem_serial/);
assert.match(migration, /p_owner, r\.serial_number/);
assert.match(cloudInventory, /serial_number/);
assert.match(inventory, />Serial</);

console.log("Gem Builder, code bundle, and specimen serial checks passed.");
