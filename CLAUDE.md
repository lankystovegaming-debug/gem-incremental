# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Gem Incremental (gemincremental.com) is a browser-based incremental game: roll gems, build a collection, craft equipment, and compete through seasonal and social progression. The front end is static HTML/CSS/vanilla-JS ES modules with **no build step**. Supabase is the backend — Postgres (via RPC functions) plus Deno Edge Functions — and it is server-authoritative: every progress-changing action (rolls, sales, crafting, rewards, upgrades) is validated server-side, never trusted from the client.

## Commands

```bash
npm run dev     # start the local dev server (dev-server.mjs) on http://127.0.0.1:5500
npm test        # run the full regression suite (also runs a `pretest` subset first)
```

There is no bundler/lint/typecheck script. To serve the site with something else (ES modules need a real HTTP server, not `file://`):

```bash
python3 -m http.server 8423
```

`dev-server.mjs` is a plain Node static file server with one special case: `/user/<uuid>/` rewrites to `user/index.html` (mirrors the `vercel.json` rewrite used in production).

### Running a single test

Tests are plain Node scripts under `tests/*.mjs`, each runnable directly and independently:

```bash
node tests/research-tree-v0140-test.mjs
```

`npm test` is a long `&&`-chained list of individual `node tests/<file>.mjs` invocations in `package.json` — there is no test runner/framework. When adding a new test file, add its `node tests/<name>.mjs &&` invocation to the `test` (or `pretest`) script in `package.json` or it will not run in CI-equivalent checks.

**Test style is unusual and important to follow:** tests do not import and execute game modules. Instead they `readFileSync` the relevant source files (client JS/CSS/HTML, SQL migrations, Edge Function `.ts` source) as raw text and assert on their content with regex/string matching (`assert.match`, `assert.doesNotMatch`, counting occurrences, etc.). This verifies that a feature's client code, its migration, and its Edge Function all stay wired together consistently — e.g. a test might assert a migration defines a given Postgres function, that the corresponding Edge Function calls it exactly once, and that the UI file references specific DOM hooks and cache keys. Follow this pattern for new tests: assert on source text, not runtime behavior.

## Architecture

### Directory layout

Each top-level feature has its own folder that is both a URL route and a self-contained page: `folder/index.html` + `folder/folder.js` (or similarly named) + often `folder/folder.css`. Examples: `inventory/`, `crafting/`, `enchanting-lab/`, `forge/`, `gem-index/`, `leaderboards/`, `seasons/`, `guilds/`, `expeditions/`, `auctions/`, `lootbox/`, `admin/`, `research-tree/`, `achievements/`. `index.html` at the repo root is the Roll page.

Shared client code lives under `src/`:
- `src/backend/` — the Supabase client (`supabase.js`) and one `cloud*.js` module per server-authoritative feature (`cloudInventory.js`, `cloudCrafting.js`, `cloudAuctions.js`, `cloudMuseum.js`, etc.). These wrap calls to Postgres RPCs / Edge Functions — this is the client's only path to mutate game state.
- `src/data/` — static client-side definitions and display metadata (gems, enchants, recipes, mutations, masterwork, consumables). **Not the source of truth** for the live catalogue — see below.
- `src/logic/` — shared, pure game calculations (rolling odds, weight, crafting math, player stat aggregation) used for client-side prediction/display.
- `src/ui/` — cross-page UI: navigation shell (`shell.js`), feature flags (`featureFlags.js`), dialogs, toasts, formatting, theming, onboarding/tour, chat, cutscenes.
- `src/styles/` — shared design system CSS (`app.css`, etc.), pulled in by page-level CSS.

Server code lives under `supabase/`:
- `supabase/functions/` — Deno Edge Functions, one directory per function (`roll`, `craft-recipe`, `enchant-equipment`, `forge`, `museum`, `pvp`, `world-bosses`, `features`, `admin`, etc.), each with an `index.ts`. These are the server-authoritative endpoints; the client cannot bypass them for anything that changes state.
- `supabase/migrations/` — SQL migrations and RPC (Postgres function) definitions, timestamp-prefixed and applied in order.

`supabase/functions/roll/index.ts` is the largest and most central Edge Function (~4000 lines) — it inlines the roll RNG, weight system, progression/achievement event engine, and reads compiled research effects. Prefer surgical edits over refactors there; regression tests assert on very specific text patterns in this file (see Testing above).

### Feature flags / "Feature Lab"

Many systems (research tree, artifact archives, gem fusion, enchanting lab, collection hall, mining events, merchant caravan, etc.) are gated by server-controlled feature flags so they can ship disabled and be toggled without a redeploy. `src/ui/featureFlags.js` calls the `features` Edge Function (`action: "sections"`) to get a `Map` of section id → enabled. The Admin Panel's "Feature Lab" / Upcoming Features UI (`admin/`) is the source of truth for these configurations; a feature's own public page (e.g. `/research-tree/`) is a player-facing view onto that configuration, not where it's authored. New optional systems should default OFF and only be enabled after QA.

### Gem catalogue

The live/production gem catalogue is stored in Supabase and managed through Feature Lab, not `src/data/gems.js`. Treat client-side gem data as display/prediction scaffolding only — don't assume it matches what's live.

### Accounts

Players start with an anonymous Supabase account (playable immediately). That browser session is the only recovery path for an unlinked guest save. A guest account can be upgraded to permanent (email/password or Google) without changing the player ID. `src/backend/auth.js` / `src/backend/account.js` handle this; auth providers are only shown in the UI when actually enabled on the Supabase project (checked via `loadEnabledProviders()` in `src/backend/supabase.js`).

### Client/server split for automation

Auto Roll / Auto Sell / Auto Keep / Auto Craft are client-driven request loops (`src/ui/autoRoll.js`, `src/ui/globalAutomation.js`), but every individual roll, sale, deposit, and reward is still validated by the corresponding Edge Function/RPC — the client only decides *when* to ask.

## Code style (from docs/CODE_STYLE.md)

- Readable, conventional code — not minified one-liners.
- Prefer named functions for anything reused or with a distinct responsibility; one statement per line.
- Keep game-data object literals/arrays expanded (not condensed) so they stay diffable/tunable.
- Use descriptive variable names, not short generated ones.
- Keep UI event handlers small; move database/API work into named functions.
- Don't change Edge Functions unless a server-side fix is actually required.
- CSS: one declaration per line; group related selectors under a named section comment; reuse existing variables/tokens before adding new hard-coded values.
- HTML: interactive controls on separate lines; semantic sections and descriptive IDs; no large inline styles (shared styling belongs in CSS).
- The old standalone `/upcoming/` route is a compatibility shim for the Admin Panel's Feature Lab — it's not in main navigation and shouldn't be extended.

## Working with Supabase

- Never commit or expose the service-role key or other production secrets; `src/backend/supabase.js` only ever holds the public anon/publishable key by design.
- Database changes go in `supabase/migrations/` (new timestamped file, don't edit old ones). Deploy Edge Functions only after any DB functions/columns they depend on exist remotely.
- Deploy a function with: `supabase functions deploy <function-name> --project-ref <project-ref>`.
- Before applying migrations, diff local vs. remote migration history first — this repo has received migrations from multiple branches, so remote history should not be repaired/rewritten without confirming the exact mismatch.

## Contributing conventions

Feature branches, unrelated changes kept separate, `npm test` before opening a PR into `main`. Call out any required database migrations or Edge Function deployments explicitly in the PR description.
