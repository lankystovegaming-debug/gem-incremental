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
