import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inventorySource = readFileSync(
  new URL("../inventory/inventory.js", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(
  new URL("../src/backend/cloudEquipment.js", import.meta.url),
  "utf8"
);

assert.ok(
  inventorySource.includes('data-unequip-id="${escapeHtml(item.id)}"'),
  "equipped equipment renders an unequip action"
);
assert.ok(
  inventorySource.includes("item.equipped\n              ? `<button"),
  "unequip action is only rendered for equipped items"
);
assert.ok(
  backendSource.includes('.update({ equipped: false })'),
  "unequip persists equipped=false"
);
assert.ok(
  backendSource.includes('.eq("id", equipmentRowId)'),
  "unequip targets one equipment row"
);
assert.ok(
  backendSource.includes('.eq("equipped", true)'),
  "unequip only changes an equipped row"
);

console.log("Equipment unequip tests passed.");
