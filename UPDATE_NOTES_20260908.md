# Update notes
Run migration `20260908000005_catalog_numbers_settings_cleanup.sql`.
Redeploy Edge Functions: `admin` (required). The roll function does not need replacement for this specific patch.
Main changes: multiplier-only mutation ordering; sort_order removed from game_mutations/admin; huge money/chance formatting; exact BigInt odds; mutation credits; Mutation Index; bulk potion buying; browser auto-craft notifications; cloud-backed settings; cutscene z-index safety; requested retired tables dropped when present.
