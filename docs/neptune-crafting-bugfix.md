# Neptune inventory deposits and Auto Forge

The deployed Deep Sea implementation only auto-fed future rolls. It had no
inventory deposit action or automatic final forge, and its page loaded progress
only on initial load and explicit actions. Counters therefore stayed stale while
the player watched Auto Roll.

This fix adds **Add inventory materials** and an opt-in **Auto Forge** toggle to
the Neptune panel. Inventory deposits fill only outstanding requirements using
unlocked, unexhibited specimens. Auto Forge costs the existing $250,000, requires
all deposited materials, and stores Neptune without changing equipped equipment
mid-batch. Manual crafting continues to accept outstanding inventory materials
and equip Neptune.

The existing atomic Deep Sea commit attempts an enabled forge after updating
material progress. Roll charges, feed deposits and forging share the surrounding
roll transaction. First discoveries, Neptune feed priority, token calculations
and event cutoffs retain their deployed behavior. An enabled forge can also
finish while the Neptune panel is viewed, including if the player earns the cash
cost after filling materials during redemption. Archived events cannot forge.

The panel refreshes on opening, after rolls (throttled to once per second), every
five seconds while visible, and on returning to the browser tab. Requests are
coalesced and stale responses cannot replace newer action results.

## Deployment order

1. Apply `supabase/migrations/20261012063502_fix_neptune_inventory_deposit_and_auto_forge.sql`.
2. Deploy the updated `supabase/functions/deep-sea/index.ts` Edge Function.
3. Publish the frontend changes.

The optimized `roll` Edge Function requires no redeployment. No backend changes
were deployed while preparing this PR. Existing event state and deposits are
retained; Auto Forge defaults to off.

## Verification

- `npm run test:neptune-crafting`: inventory top-ups, protected rows, ownership,
  exactly-once payment, first discovery, full inventory, rollback, redemption,
  archive, action routing, and live progress / stale response behavior.
- `npm run test:deep-sea` and `node tests/equipment-overhaul-handler-test.mjs`.
- Isolated browser checks of the actual page at 1280px and 390px: inventory add,
  Auto Forge toggle, roll-driven progress refresh and no horizontal overflow.
