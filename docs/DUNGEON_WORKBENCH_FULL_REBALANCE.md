# Dungeon + Workbench Full Rebalance

Implemented from the uploaded `Dungeon_Workbench_Full_Rebalance` PDF using the latest `gem-incremental-main.zip` as the code baseline.

## Included

- Full 1,500-room catalog with both catalog pages for every room.
- Exact room difficulty zones and region boundaries from the PDF.
- Seven late-game region bosses and boss repeat bonuses.
- Regional monster rosters, room encounter tables, rank tables, mutation summaries, weapon/armor ladders, and room metadata.
- 66 mob mutations with shard/core Gem Power data.
- 198 new forge materials with their PDF Gem Power values.
- Full Tier 1–14 Workbench recipe catalog, including boss crowns.
- Dungeon material and essence inventory storage.
- Server-authoritative dungeon combat, room entry, reward claiming, material/essence awards, and dungeon gear drops.
- Server-authoritative Workbench crafting with transactional material/essence consumption.
- Existing relic safety and dungeon server-authority checks preserved.

## Deployment

Apply the new migration before deploying the updated `dungeons` and `workbench` Edge Functions.

The frontend catalog lives under `dungeons/catalog/regions/` and is loaded by region so the browser does not download all 1,500 rooms at once.
