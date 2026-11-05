# Phase 5 — shared menus, dialogs and secondary interactions

Implemented November 5, 2026. Frontend-only changes built on main `e6db9fd`.

## Accepted-phase audit

| Phase | Actual repository status | Focused findings and action |
| --- | --- | --- |
| 1 — foundation | `c812af6`: shared responsive spacing/forms/tabs/action bars, viewport constraints and MobileSheet are present. `ed6be43` already fixes hidden sheet focus targets. | Confirmation focus trapping only considered buttons, including buttons embedded in the body as final actions. It omitted inputs/links and could compete with an underlying sheet. Fixed with one visible-focus helper and a modal focus stack; only explicit footer actions resolve a confirmation. Long bodies now scroll independently of final actions. |
| 2 — navigation | `93be9fd`: seven desktop priorities, four mobile priorities plus More/search, Explore grouping, Settings/help and saved navigation settings are present. | Dynamic menu Escape nulled the trigger before returning focus. Explore/Utilities and dynamic menus had separate dismissal/positioning behavior; dynamic menus had no first-open arrow-key support. Fixed via one interaction controller on existing `.menu` surfaces. Navigation hierarchy, storage and settings are unchanged. |
| 4 — utility pages | `9008d1d`: Settings category index, Crafting category sidebar/mobile picker, Inventory/Equipment filters/management and Market review flow are present. | No new page-layout or transaction regression found in the seven-width fixture suite. Shared confirmation fixes apply to their workflows. Market's existing complex final lot/fee review uses an optional wider desktop size; the explicit final confirmation and request sequence are unchanged. |

Other shared findings fixed: wallet expansion had no expanded state, blur/outside/Escape dismissal or reliable large-value wrapping; mobile announcement truncation had no disclosure; toast accumulation had no cap or keyboard dismissal; mobile global-cash panel lacked focus containment/return and coordination with other modal surfaces.

**UI Phase 3 remains excluded.** The repository already reverted it in `4f57498`. This change touches no Roll HTML, Roll page JS/CSS, rare-roll ordering, dashboard structure, gameplay calculations or backend files. Shared shell/styles apply to Roll as they do to every page. The separate World 2 backend phases in the weekly PR are unrelated to UI Phase 3.

## Implementation

- Reuse Phase 1 menu surfaces and MobileSheet rather than introducing new visual components. A shared popover controller portals menus outside filtered ancestors, measures the visual viewport, chooses above/below placement, constrains width/height and scrolls internally, and repositions on scrolling/resizing. It coordinates one open menu, outside-pointer and focus dismissal, Escape/trigger focus return, ArrowUp/Down/Home/End, Tab exit and hidden-trigger cleanup. Explore retains native details/summary links. Appearance uses ordinary toggle buttons and retains focus/scroll when rerendered.
- Share visible/disabled/hidden-aware focus discovery and a modal stack across confirmations, mobile sheets, quick navigation and mobile global cash. Escape affects the top surface, focus returns to its invoker, and modal body scrolling is locked. Sheet state changes are idempotent. Cutscenes retain focus and Escape priority; the optimized cutscene implementation is unchanged.
- Keep mobile confirmation sheets and sized desktop dialogs. Only long body content scrolls; title and final actions remain reachable. Destructive dialogs default to Cancel unless a caller explicitly chooses otherwise. Preserve existing Enter guards, final-action labels and extra-action results. Add an opt-in dismissal guard and a wider desktop review variant. Backdrop cancellation requires a press starting on the backdrop to avoid drag-out dismissal.
- Expose the wallet's full exact value accessibly, bound its expansion below the header, wrap large values and support keyboard/outside dismissal. No precision/number-format calculation changes.
- Add measured Read more/Show less announcement disclosure with expanded/control relationships. Preserve safe URL rendering and persisted dismissals. Resize observation keeps disclosure availability responsive.
- Provide labeled hover/focus tooltips for shell icon controls without moving Settings, Appearance or Help or resetting saved navigation preferences.
- Consolidate normal floating layers: toast 1250, sheet/backdrop 1301/1300, menu 1400, confirmation 1500; keep authored immersive/top-layer/native dialogs above these. Toasts use the existing floating/safe-area clearance, move above chat, stay behind modal surfaces, show at most three and scroll if necessary. Add explicit keyboard dismiss buttons and pause expiry during hover/focus. Existing chat/global-cash launchers retain opposite corners above bottom navigation.
- Standardize visible focus, disabled/busy and pressed button presentation; wrap menu rows/identities and constrain native selects. Native select dropdowns remain browser/OS controlled.

## Validation evidence

Browser fixtures use actual frontend modules and isolated backend responses; external requests are blocked in the Phase 5 suite. They do **not** establish production concurrency or deployed Phase 5 behavior.

Passed:

- `npm run test:ui-interactions` at **320, 360, 390, 430, 768, 1366×768 and 1920×768** in Chromium: account menu first-open keyboard access, internal arrow/end navigation, Tab exit, outside click, Escape and focus return; viewport-edge long popovers; large wallet values/long usernames; actual announcement expansion; long confirmation bodies including inputs and an embedded non-final button; destructive Cancel focus; nested sheet/dialog Escape order; backdrop cancellation; guarded dismissal and Enter; quick-navigation over a sheet; real cutscene-controller focus/Skip/Escape priority over a sheet; theme rerender focus; accessible tooltips; three-toast limit/keyboard dismissal; chat + toast + sheet ordering; mobile cash focus return; 150% root text, reduced motion and a simulated 24px bottom safe area. Zero captured page errors or horizontal overflow.
- Phase 1 responsive foundation browser suite: representative pages at 360/390/430/768/1366/1600px.
- Phase 1–2 stress browser audit: long names/values/announcements and hidden-ancestor focus at 360/390/430/768/1366/2560px.
- Phase 2 navigation browser suite: mobile More/search, desktop Explore, keyboard/focus and preference behavior.
- Phase 4 utility-page browser suite at 320/360/390/430/768/1366×768/2560×768: Settings deep links/categories; Crafting groups/locks; Inventory filters/locked items/cleanup cancellation; Equipment/loadouts/long names; Market validation, lot/fee review and cancellation without listing submission.
- Black Market desktop/mobile browse, purchase/listing confirmation, disclosures and closed-state fixture flows.
- Cutscene browser suite: 90 centered reveal layouts including phone/landscape, mutations, shared and Roll styles. Cutscene reliability source/unit suite.
- Foundation/navigation contracts; topbar, responsive shell, Crafting deposit UI, inventory pagination, market pricing and market fee checks.
- Syntax checks for changed JS and `git diff --check`.

The existing utility-page fixture was updated to suppress independently tested weekly/dungeon onboarding dialogs: newly merged release announcements otherwise interrupted unrelated interaction tests. No production announcement scheduling or acknowledgments were changed.

Production smoke check: the dedicated account signed in successfully at `gemincremental.com`; Settings and Inventory shells loaded. No setting, crafting, purchase, auction, sale or roll was intentionally submitted. This is deployed-baseline smoke evidence only, at the browser's normal desktop size; responsive Phase 5 evidence above comes from local fixtures.

Full `npm test` was attempted. Its pretest reaches the existing update-history suite and fails two unchanged assertions: PR #514 is now published although the test asserts it is absent, and newest weekly PR is #526 although the test expects #496. Those test/data files are unchanged by this work. No lint or build script exists in package.json; the application is served directly as ES modules.

Screenshots: `artifacts/phase-5/confirmation-{390,1366}.png` and `interaction-{390,1366}.png` show mobile/desktop long confirmations and zoomed account-menu states. These are fixture data, not player data.

## Limits and deferred work

- Chromium automation, not physical devices, Safari/WebKit or screen-reader testing. 150% root text simulates larger type; pinch zoom/browser UI zoom and hardware keyboards on phones were not tested. Safe areas are CSS simulations, not physical notches. Touch-target dimensions are covered by shared CSS and existing foundation tests; no physical touch test was performed.
- Menus are viewport bounded through VisualViewport, but native selects use OS positioning. Arbitrary bespoke feature popups are not wholesale migrated; this targets shared/high-traffic surfaces. No exhaustive audit of every secondary dialog or recipe/event.
- Announcement scheduling, immersive art/animations, chat resizing/business logic, all-page visual redesign and broader edge-case inventory remain unchanged. UI Phases 6 and 7 are deferred.
- Phase 5 requires frontend publication only. No Supabase migration, API, Edge Function, game formula, roll cooldown or total-roll counting changed. World 1 remains 2.5 seconds before batching and `total_rolls` remains canonical. No backend deployment was performed; existing independent weekly backend work remains the owner's deployment responsibility.
