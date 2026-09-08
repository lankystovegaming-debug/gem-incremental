# Player Profiles + Cosmetics v1

Implemented on `feature/player-profiles-cosmetics-v1`, based on `origin/main` at `d47be9c`. The live schema and relevant reward/profile functions in Supabase project `igrddscmrdrrwtvyspbf` were inspected on 8 September 2026 before editing. No live database or Edge Function changes were made.

## Deploy

1. Apply **only** `supabase/migrations/20260908075320_player_profiles_cosmetics_v1.sql` to `igrddscmrdrrwtvyspbf`, using your normal migration process or the Supabase SQL editor. It is transactional and intended to run once. Do not bulk replay the repository's older migrations against production.
2. Deploy the frontend changes after the migration succeeds. This project serves browser modules directly; no new frontend build dependency is needed.
3. Open an existing player's profile, then your own profile. Confirm preserved rewards appear in **Customize Profile**, save a title/frame/badges, and check the same profile from a signed-out session. Check that role titles still appear independently in profile/chat.

**No Edge Functions need deployment.** Existing Achievement/Season reward writers are bridged by database triggers. No roll functions, game formulas, paid cosmetics, or gameplay rewards were changed.

## Changed files

- `supabase/migrations/20260908075320_player_profiles_cosmetics_v1.sql`: catalogue, ownership, loadouts, RLS/grants, equipment validation, backfills, reward bridges, enhanced public profile and chat title resolution.
- `user/profile.js`, `user/profile.css`, `user/index.html`: cosmetic hero, compact statistics, larger three-gem showcase, labels, Trophy Case, Bundle Legacy/Crown Jewel and retained rarest specimen.
- `user/customize.js`: owner-only editor populated from the authenticated ownership RPC.
- `src/ui/cosmetics.js`, `src/styles/app.css`: shared escaped cosmetic rendering and presentation styles.
- `src/backend/chat.js`, `chat-ui.js`: show collectible titles alongside the existing role/title identity.
- `tests/player-cosmetics-database-test.mjs`, `tests/player-cosmetics-ui-test.mjs`, `tests/fixtures/cosmetics-live-*.sql`: local PostgreSQL integration fixtures and renderer security checks.
- `tests/profile-preview-server.mjs`, `package.json`: repeatable, isolated visual preview and test commands.

## Catalogue and persistence

The initial catalogue includes the eleven named Achievement/Season/Research rewards plus four Museum rewards. `master-gem-incremental` is one owned object supporting both the title and badge slots; this also recovers the treatment lost by the legacy single-ID primary key.

Museum mappings:

| Existing reward | Unified item | Slot |
| --- | --- | --- |
| Founding Curator plaque | `founding-curator` | Trophy |
| Mutation gallery trim | `mutation-gallery-trim` | Profile decor |
| Stone curator title | `stone-curator` | Title |
| Archive display case | `archive-display-case` | Profile decor |

Each existing bundle becomes a pinnable completion trophy using its actual backend name/icon. There are no additional bundle stat rewards, invented collector titles, or extra frames.

Season Zero was still active when inspected. First Light starts as Legendary and Season Zero as Epic; their public presentation becomes Legacy after the end date sourced from the season definition during migration. If you later extend that season, update these definitions' `legacy_after` timestamps too.

Background equipment is supported, with a default appearance and no filler catalogue entries. Renderer styles are deliberately allowlisted (`bronze`, `gold`, `diamond`, `prismatic`, `sunrise`, `stone`, `mutation`, `archive`); new artwork requires a renderer update rather than accepting arbitrary CSS/HTML.

Achievement and Season ownership records are retained in their existing tables and copied into `player_cosmetics` with their earliest earned dates. Claimed Achievement milestones, current Research purchases, permanent Museum completions, current qualifying Museum exhibits and Bundle completions are backfilled. Unknown old cosmetic IDs are preserved as disabled catalogue entries for later classification rather than discarded.

The old Achievement and Season tables remain compatibility inputs for existing reward writers. They are not used as an inventory or equipment authority. New event/paid/bundle integrations can define catalogue items and grant ownership through trusted backend code using the same table. Browser roles cannot create ownership, edit loadouts directly, or call private grant helpers.

Research and Museum cosmetics become permanent after earning, including after a research reset or exhibit removal. Historical Research purchases already deleted by a pre-migration reset, and old showcase arrangements removed before migration, cannot be reconstructed from current rows. This limitation does not affect existing Achievement or Season ownership records.

The Trophy Case defaults to up to five earned trophies until first customization; players can then pin up to five trophies or other earned collectibles. Titles, frames, backgrounds and decor each have one slot, plus three unique badges. Showcase labels are limited to 32 characters each. Existing gem selection continues through Inventory.

## Validation

Run `npm run test:cosmetics` for the local PostgreSQL and rendering tests. They apply the complete migration to an isolated PGlite database with column definitions and relevant functions captured from the live backend, then exercise:

- Legacy backfills, original earned timestamps, master badge/title compatibility, and unknown-ID preservation.
- New Achievement, Season, Research, Museum and Bundle grants; repeat grant idempotence; permanent research/exhibit unlocks.
- Owned/type-compatible equipment, duplicate and slot limits, malformed payloads, cross-player ownership rejection and atomic failed saves.
- Ownership RLS, denied direct writes/private helper access, unauthenticated rejection, public ownership revalidation, disabled items, unequip, and separate role/collectible titles.
- Legacy rarity timing, no filler backgrounds, and HTML/style escaping.

Existing Museum, Research, Season Zero and admin title/catalog tests pass. The existing `chat-auto-keep-hotfix-test.mjs` cannot run under the installed Node runtime because its unchanged dependency graph imports the browser-only HTTPS Supabase module. The entire legacy test suite was not claimed as passing.

Browser QA uses `npm run preview:cosmetics` and `http://localhost:5517/user/00000000-0000-4000-8000-000000000001`. Add `?visitor=1` to test signed-out presentation. The harness serves real profile/editor modules with synthetic local RPC data and no live backend access. Desktop/mobile layouts, editor save, duplicate feedback, and hidden visitor customization were checked. This validates UI behavior separately from the actual SQL tests; live post-deployment smoke testing remains necessary.
