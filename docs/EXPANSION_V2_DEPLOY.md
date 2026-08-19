# Expansion Feature Lab v2 deployment

This update adds seven disabled-by-default systems:

- Artifact Archives
- Gem Fusion Lab
- Enchanting Lab
- Collection Hall
- Mining Events
- Merchant Caravan
- Research Tree

## Required SQL

Run:

`supabase/migrations/20260819000011_expansion_feature_lab_v2.sql`

## Edge Functions

Deploy:

- `private-features`
- `expansion-features`

The existing `private-features` function now includes structured CRUD actions:
`expansion-list`, `expansion-save`, `expansion-toggle`, and `expansion-delete`.

The public `expansion-features` function is read-only and only returns definitions whose site section is enabled.

## Upcoming Features

Open **Upcoming → More Systems**. Every seeded system starts OFF. Use the dropdown-based structured builder and optional preset library; no raw JSON editor is required.

## JA-ore replay

Inventory/cutscene replay now routes JA-ore through the bespoke `jaOreCutscene.js` scene instead of the generic ultra-rare replay. The same multi-mutation display and chance label are preserved.

## QA

Run:

`node tests/expansion-feature-test.mjs`

The test verifies the seven page triplets, migration seeds, JA-ore replay integration and the structured Upcoming builder.
