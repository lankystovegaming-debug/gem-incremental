# Mutation Expansion + Special Effects

## Run this migration first

Run the complete contents of:

`supabase/migrations/20260908000003_game_mutations_special_effects.sql`

in the Supabase SQL Editor (or deploy it through your normal Supabase migration workflow).

It:
- adds all requested mutations to `public.game_mutations`
- updates existing rows safely if the migration is re-run
- adds server-side temporary effect counters to `public.players`
- adds Misty, Ancient, and Enchanted special mechanics

## Then deploy the updated Roll Edge Function

The special effects are implemented in:

`supabase/functions/roll/index.ts`

Deploy the updated `roll` Edge Function after the migration is applied.

## Special mechanics

### Misty
- Gives ×2.5 mutation chance for the next 10 rolls.
- If another Misty mutation is rolled while active, the stack count increases by 1 and the duration refreshes to 10 rolls.
- Stacks multiply as `2.5^stacks`.

### Ancient
- Gives ×1.3 Ancient Relic chance for the next 3 rolls.

### Enchanted
- Gives ×1.1 chance for all relics for the next 5 rolls.

The triggering roll itself does not consume the newly granted buff; the buff begins on subsequent rolls.
