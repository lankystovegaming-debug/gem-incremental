# Mutation Surge + Workbench + JA-ore bugfix

## Deploy
1. Run `supabase/migrations/20260819000012_mutation_event_workbench_jaore_bugfix.sql` once.
2. Redeploy the `admin`, `forge`, and `roll` Edge Functions from this ZIP.
3. The `forge` page now loads inventory materials through the Edge Function rather than depending on a direct browser table grant.
4. JA-ore fresh-roll and inventory replay both use the same bespoke scene. The uploaded ore artwork is embedded into `src/ui/jaOreCutscene.js` as a CSS data URI; there is no image file to upload.

## Mutation Surge
The event continues to modify the server-side `mutationChanceMultiplier` after permanent/player modifiers, so all five mutation checks remain independent and can stack. The migration fixes the inherited `admin_events` permission failure that caused `mutation_event_stop_failed`.
