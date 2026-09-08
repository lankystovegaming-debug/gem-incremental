# Fixed build
- Inventory chances no longer import formatHugeInteger from format.js. They use local BigInt formatting.
- Live mutations load ordered by multiplier ascending, with no sort_order dependency.
- Potion shop supports selected quantities: 1, 5, 10, 25, 50, 100.
- Gem Index and Mutation Index sort mutations by multiplier ascending.
- Active Misty/Ancient/Enchanted temporary effects are displayed with remaining rolls.
- Run migration 20260908000006_fix_mutation_catalog_order_and_effects.sql and redeploy roll.
