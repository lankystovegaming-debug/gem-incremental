# Gem Incremental UI / Reliability Overhaul

## Scope

This pass is deliberately focused on the existing game. It does not introduce
new gameplay systems. It improves presentation, navigation, reliability,
observability, automation safety, cinematic presentation, and the existing
Workbench beta.

## Workbench reliability

The public name and route are now consistently:

- `workbench/`
- `workbench/index.html`
- `workbench/workbench.js`
- `workbench/workbench.css`
- `supabase/functions/workbench/index.ts`

The historical database storage names remain `forge_config`,
`forge_sessions`, and `forge_items`. This is intentional: renaming database
tables would break existing saved Workbench creations.

The Edge Function now:

1. authenticates the caller;
2. verifies administrator access server-side;
3. validates the selected material IDs;
4. clamps timing scores to 0..1;
5. rejects invalid stage numbers;
6. expires stale sessions;
7. prevents a completed stage from being replayed;
8. snapshots selected materials into the server-side session;
9. only consumes materials after an item has been persisted;
10. returns structured JSON errors instead of leaking exceptions.

Run the latest migrations before testing:

`20260820000002_workbench_runtime_compatibility.sql`
`20260820000003_admin_observability_hotfix.sql`

Then redeploy the `workbench` Edge Function.

## Admin observability

Analytics now prefers the aggregate `get_admin_analytics()` SECURITY DEFINER
RPC. The RPC recognizes the administrator table and the legacy
`code_improvement` allow-list.

The detailed analytics fallback is intentionally non-fatal: if an optional
table is missing in an older deployment, core player/economy metrics can still
render instead of turning the whole Analytics panel into a 500.

The Audit Log has the same graceful degradation behavior. The service-role
table is recreated by the observability migration if necessary.

## Navigation

The utility links previously shown as a permanent vertical stack are now
inside a single `More` control. The menu contains:

- How to play
- Contribute
- Report a bug
- Codes
- Update log
- Support the game

The How to Play control is still the existing onboarding modal; it was not
converted into a new gameplay page.

## Session insights

Session Insights are wired back into the Roll page and use the existing
`sessionStorage` implementation. The panel tracks:

- session duration
- rolls
- kept rolls
- auto-kept rolls
- auto-sold rolls
- auto-sell income
- relics
- auto-crafted results
- rarest effective result
- rarest base result
- heaviest result
- most valuable result
- rarity breakdown
- notable mutation/rare results

The store remains local to the current browser session.

## Auto Keep

Auto Keep is a safety override for the existing Auto Sell system.

If Auto Keep is enabled, a result at or above the selected tier is protected
from the Auto Sell request. The default protects Legendary and above.

This does not bypass the server. Selling is still performed by the existing
server-authoritative `sell-gem` function.

## Pure CSS gem icons

Gem icons are generated entirely with HTML spans and CSS clip-paths,
gradients, facets, highlights, and shadows.

No gem image files are required.

Mutation variants now alter the icon itself:

- Polished: stronger reflective highlight
- Gilded: gold facets and ring
- Prismatic: animated spectrum facets
- Celestial: orbit ring and cold aura
- Corrupted: fractured silhouette and unstable glow

The same icon renderer is used by the roll reveal, profile showcase, index,
leaderboard showcase pins, and cinematic replay.

## Theme design

The existing themes were retained and two calm themes were added:

- Midnight Glass
- Misty Slate

The intent is to keep gradients atmospheric rather than saturated. Surfaces
use low-contrast layered gradients, restrained borders, and soft shadows.

## Cinematics

The generic rarity cinematics now use the existing scene system with stronger
depth, a glass reveal card, larger CSS gem artwork, improved typography, and
mutation-specific gem visuals.

The JA-ore scene retains its retro pixel/canvas language and the phrase:

`With our powers combined`

The scene continues to avoid a separate image dependency for the ore artwork.

## Regression corpus

`tests/fixtures/ui-regression-cases.json` contains combinations of the game's
known gem names, mutation states, and theme modes. It is intended for visual
regression tooling and does not participate in gameplay.

## Validation performed for this source package

- JavaScript syntax check: all JS files passed.
- TypeScript transpile/parse check: all TS files passed.
- Old `forge/` frontend directory removed.
- Old `supabase/functions/forge/` directory removed.
- Workbench client invokes the `workbench` function.
- Mutation-aware CSS icon classes are emitted by the shared gem renderer.
