# Enchanting handoff

This patch deliberately contains no database migration.

Before deploying the code, the database change owned by the accepting developer must make these fields available on `player_equipment`:

- `enchant_id` — nullable text
- `enchant_grade` — nullable text (`normal` or `ancient`)
- `enchant_state` — non-null JSON object with an empty-object default

The client and both Edge Functions expect authenticated players to be able to read those three fields through the existing `player_equipment` policy. All enchanting writes, relic consumption, random enchant selection, and roll-effect state updates are performed by authenticated Edge Functions with the service-role client.

Deploy both changed functions after the database fields exist:

- `roll`
- `enchant-equipment`
- `sell-gem`

Relics use existing `inventory_gems` rows, so no separate relic table is required. Their names are `Enchant Relic` and `Ancient Relic`; the client presents both as `RELIC`, prevents selling them, and allows locking or deleting them.
