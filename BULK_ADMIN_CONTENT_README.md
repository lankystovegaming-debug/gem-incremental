# Bulk potions + admin content update
Run migration `20260908000009_bulk_consumables_admin_catalog_filters.sql`.

## What changed
- Potion shop quantity is now a free number input (1–1,000,000), one purchase RPC.
- Inventory potion use is now a free number input and bulk use sends one RPC request.
- Inventory filters include custom/standard, specific mutation, and mutation-count ranges.
- Admin Content & events includes editable Potion / Equipment / Recipe catalog rows and disabled future features.

The generic admin catalog is intentionally JSON-configurable so future stats/recipe fields do not require another schema migration.
