# Phase 1–2 audit and Phase 3 Roll presentation

Baseline: `1115740` (current main, including merged weekly update 5 and dungeon fixes). Audit gate completed before Roll markup/style changes.

## Phase 1–2 audit

- Phase 1 contracts pass: PageHero, FormRow, ResponsiveTabs, MobileSheet, ActionBar, shared card spacing, 44px mobile targets, constrained menus/dialogs, shared safe-area/floating tokens and min-width protections.
- Existing browser suite passes Roll, Settings, Crafting, Auctions and Inventory at 360, 390, 430, 768, 1366 and 1600px. Form stacking and internal crafting-tab scrolling pass. Equipment is an Inventory tab; populated equipment validation is tracked separately below.
- Fixed a shared sheet keyboard trap edge case: controls inside hidden ancestors were counted as focusable. Require rendered client rectangles, so filtered navigation and hidden inventory controls cannot break Tab/Shift+Tab wrapping. Dedicated regression verifies both directions, Escape and trigger focus restoration.
- Phase 2 browser suite passes fixed four destinations + More, open/search/close, current-page markup, saved custom navigation (excess destinations retained in More/Explore), desktop seven-link cap, keyboard Explore/Escape and closed-sheet invisibility.
- Additional browser audit passes 360, 390, 430, 768, 1366 and 2560px with long announcements, usernames and large wallet amounts. Source review confirms icon fallbacks retain labels/titles; utility/appearance controls remain separate from destination navigation.
- No other clear foundation/navigation regressions found in this coverage. Existing compact Rare Rolls above gameplay and discovery-only desktop sidebar are Phase 3 hierarchy issues, not shared foundation fixes.

Tests use local pages and isolated UI fixtures. They do not claim live authenticated gameplay, physical-device notch testing or real server latency coverage. No production account/data/backend changes.

## Phase 3 implementation

- Roll workspace is first in document/keyboard order. Controls precede the reveal and every batch result so even a large batch cannot push the next Roll below the results. The same control IDs, live regions, reveal renderer and backend calls remain.
- Below 1180px: one gameplay-first column, daily Gemdle link, immediate summary, Automation and Crafting progress. At 1180px and up: gameplay/Gemdle main column with summary, Automation and Crafting beside it; maximum content width 1440px. No sticky feed competes with gameplay.
- Discoveries sit below the workspace at every width. One newest discovery per category by default, with the existing Show all/Show less action exposing all five per category. Both categories remain visible on mobile without horizontal swipe discovery. Empty/loading/error handling and realtime subscriptions remain intact.
- Native Session disclosure starts closed at every width. History and insights continue updating while closed, retain independent Clear actions, and appear side by side when expanded on desktop. Space/Enter operates the disclosure; the global roll shortcut excludes SUMMARY elements.
- Potion HUD now flows below controls, avoiding overlap with the primary button. Long gem/mutation/session labels wrap within their cards. Shared card/form/touch/safe-area contracts remain in use, and server-controlled hidden sections stay hidden inside the new layout.
- Removed obsolete shared Roll-only sidebar CSS and keep Phase 3 layout in the Roll stylesheet.

## Validation performed

All checks below pass against final implementation:

- Existing Phase 1 foundation and Phase 2 navigation contracts and browser suites; additional audit stress/focus browser test. Representative pages: Roll, Settings, Crafting, Auctions, Inventory; Equipment tab and filter sheet checked by the extended mobile suite.
- Actual Roll controller and renderers with isolated backend fixtures at **360×900, 390×900, 430×900, 768×900, 1366×768 and 2560×1440**. Verified gameplay-first positions, desktop support column, controls above reveal/batch, potion HUD clearance, no page overflow, default-collapsed Session, empty/populated history/insights/crafting, Clear actions, batches 1 and 5, successful reveal, disabled cooldown, inventory-full state, auto-roll on/off, queue lock during cinematics, large money/total_rolls, long names/mutations, compact/expanded populated rare feeds and empty rare feeds. Loading placeholders remain in markup.
- Existing mining-card browser checks: single/five outcomes, animation setting on/off, reduced motion, House Edge/pet, rapid rerenders and equipped card skins at 320/360/390/768/1440px. A timing-sensitive opacity assertion failed once while multiple suites competed; isolated rerun passed without changing animation code.
- Cutscene centering: **90** reveal layouts pass, including mutations, shared/Roll CSS, landscape phone, phone and desktop.
- Existing Crafting browser regression passes with populated recipes, deposits and responsive dialogs.
- Extended mobile shell checks at 320/375/390/430/768/1280px: Inventory/Equipment, filter sheet, open chat, Global Cash when enabled, More plus long toast, touch targets and no overflow. More clears the bottom navigation.
- Responsiveness/shell layout, batch rules, crafting deposit UI, rare-roll luck, optimized Roll hot-path context/retention, Phase 5 and Phase 6 request-amplification regression checks; syntax and whitespace checks.

Run browser suites with the repository's existing Playwright environment-variable overrides. This workstation used bundled Playwright and installed Chrome; its bundled headless-shell version was unavailable. New commands: `npm run test:roll-presentation`, `npm run test:ui-audit`.

## Risks, limitations and deferred work

No known regression remains in the completed checks. Local browser fixtures do not validate a live signed-in account, actual network timing, persisted remote settings writes, physical notch safe areas, or screen-reader announcements on a real device. A queue fixture checks Roll locking; actual overlay layout is covered separately by the cinematic suite. Equipment audit covers its tab/empty-state shell; populated recipe/equipment-related Crafting flows are covered separately, not every Equipment loadout.

The full all-feature/database `npm test` suite was not run for this presentation change. History and insights intentionally start collapsed; expanding them can produce a long page. The control position and all-width compact discoveries are intentional presentation changes. Phase 4 Settings/Crafting/Inventory/Market restructuring, broader navigation redesign and brand/theme changes are deferred.

**No Supabase source, migration, Edge Function or gameplay formula was changed.** Base cooldown remains 2.5 seconds per roll before batching; lifetime display continues to use `total_rolls`. Nothing was deployed. The owner retains all migration/Edge Function deployment responsibility; this change requires frontend publication only.
