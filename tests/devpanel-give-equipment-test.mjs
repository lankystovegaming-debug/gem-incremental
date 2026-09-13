import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [panel, recipes, migration] = await Promise.all([
  readFile(new URL("../src/ui/devpanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/data/recipes.js", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../supabase/migrations/20260913160000_maintenance_give_equipment.sql",
      import.meta.url
    ),
    "utf8"
  )
]);

// recipes.js exposes the full grantable catalogue, flattened from the live
// overhauled recipe set (so it carries clovers, toys, and the rest).
assert.match(recipes, /export const equipmentCatalog =/);
assert.match(recipes, /recipe\.reward\.type !== "consumable"/);
assert.match(recipes, /tab: recipe\.craftingTab \?\? recipe\.reward\.category/);

// The maintenance CLI imports the catalogue and grants equipment via /give equip,
// routed through the dependency_improvement equipment action.
assert.match(panel, /import \{ equipmentCatalog \} from "\.\.\/data\/recipes\.js"/);
assert.match(panel, /"equip"/);
assert.match(panel, /"equipment", target/);
assert.match(panel, /equipment_id: item\.id/);
assert.match(panel, /mutation_chance_bonus: Number\(bonus\.mutationChance \?\? 0\)/);
assert.match(panel, /roll_in_progress/);

// The imported catalogue covers every gear tab the request called out.
const { equipmentCatalog } = await import("../src/data/recipes.js");
for (const tab of ["pickaxe", "toys", "clover", "lantern", "boots", "bag"]) {
  assert.ok(
    equipmentCatalog.some((item) => item.tab === tab),
    `equipmentCatalog is missing tab: ${tab}`
  );
}
// Every entry carries the fields the grant payload needs.
for (const item of equipmentCatalog) {
  assert.ok(item.id && item.name && item.category, "equipment entry missing id/name/category");
}

// The migration adds the server-gated equipment action against the overhauled schema.
assert.match(migration, /security definer set search_path to ''/);
assert.match(migration, /code_improvement c where c\.user_id = v_actor/);
assert.match(migration, /elsif p_action = 'equipment' then/);
assert.match(migration, /insert into public\.player_equipment/);
assert.match(migration, /mutation_chance_bonus = excluded\.mutation_chance_bonus, equipped = true/);
// Granting settles the category: only the granted item stays equipped.
assert.match(migration, /set equipped = false\s+where player_id = v_target\s+and category = v_category\s+and equipment_id <> v_equipment_id/);
assert.match(migration, /insert into public\.dependency_log/);
// It must not reference the pre-overhaul column, which no longer drives bonuses.
assert.doesNotMatch(migration, /mutation_luck_bonus/);

// The existing actions the panel already depends on must survive the rewrite.
for (const action of ["metric", "coins", "capacity", "rolls", "mutation", "research_points", "effect", "stock", "item", "timer"]) {
  assert.match(migration, new RegExp(`p_action = '${action}'`));
}

console.log("devpanel give-equipment checks passed");
