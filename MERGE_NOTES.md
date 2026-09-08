# Final merged build

This build uses `gem-incremental-codex-qol-gem-filter-buffs-loadouts` as the base and preserves its QoL gem filters, buffs, loadouts, settings, and Roll Edge Function changes.

Merged in the latest fixes for:
- Mutation Index rebuilt UI
- Bulk consumable O(1) server-side consumption
- Achievement page/AP leaderboard performance migration
- Exact-to-1 quadrillion / 3-SF suffix money formatting
- Inventory anti-flashing potion timer updates
- Rare individual-sale confirmation

Migrations additionally included:
- 20260908000010_performance_and_safe_sell.sql (guarded/fixed)
- 20260908000011_bulk_consume_fast_achievements.sql
- 20260908124328_qol_gem_filter_buffs_loadouts.sql (from Codex QoL build)
