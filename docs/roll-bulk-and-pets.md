# Roll Bulk + Pets

## Deployment
1. Apply `supabase/migrations/20260914120000_roll_bulk_and_pets.sql` to the current Supabase project.
2. Deploy the updated `supabase/functions/roll/index.ts` as the `roll` Edge Function.
3. Publish the updated site files.

## Roll Bulk
The existing ×1–×4 rules remain intact. `roll_bulk_bonus` adds one additional batch slot per point above ×4, up to ×100. The existing 500,000 genuine-roll + Celestial gate still applies before any batch larger than ×4 is accepted.

Roll Bulk does not multiply Roll Speed. Batch cooldown remains proportional to the number of rolls, so it is a convenience/throughput-in-one-request stat rather than a hidden speed multiplier.

## Admin equipment
Admin → Equipment creates a live recipe in `game_recipes` and an entry in `admin_content_catalog`. The equipment can be configured to add either Roll Speed or Roll Bulk. The same screen also supports Pet Luck for future/admin-created pet gear.

## Pets
Pets are deliberately not rendered in Inventory yet. The server can roll enabled pets and records them in `player_pets`.

- Default chance: 1 / 100,000,000 per enabled pet.
- Normal gem Luck never changes pet chance.
- Pet Luck is a separate multiplier layer.
- Pet Luck boosts from crafted toys stack additively.
- A successful pet roll clears the entire `petLuck` boost family immediately.
- Pet definitions, odds and stats are admin-editable.

The seeded pets are intentionally strong, but their stat JSON is stored independently so the eventual pet inventory/effects UI can be enabled later without redesigning the roll system.
