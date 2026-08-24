# Gem Incremental

Gem Incremental is a browser-based incremental game about rolling gems, building a collection, upgrading equipment, and competing through seasonal and social progression.

Play at [gemincremental.com](https://gemincremental.com).

The website is a static front end backed by Supabase. Progress-changing actions—including rolls, sales, crafting, rewards, and upgrades—are validated by the server through database functions and Edge Functions.

## Game systems

- **Rolling** — discover gems with different rarities, weights, mutations, values, serial numbers, and availability windows.
- **Inventory** — search, filter, lock, sell, delete, and automatically manage specimens. Relics are displayed separately and do not consume inventory slots.
- **Equipment** — craft and equip pickaxes, boots, and bags. Pickaxes provide both Luck and Roll Speed, while higher tiers can offer unique passives.
- **Enchanting** — use Enchant Relics and Ancient Relics to apply one enchant to a pickaxe. Rerolling always changes the current enchant.
- **Masterwork Forge** — improve high-tier equipment through five Masterwork levels and unlock additional passives.
- **Gem Index** — track discovered gems and mutation combinations. Undiscovered endgame gems remain concealed while still showing relevant availability information.
- **Shop and Market** — buy rotating offers, choose rewards from Mining Caches, and trade specimens through the Auction House.
- **Expeditions** — enter daily and weekly expeditions, complete generated objectives, and choose reward packages.
- **Seasons** — progress through a 50-tier free and premium reward track using roll XP and tiered missions.
- **Guilds** — create a guild, manage members and roles, complete missions, purchase upgrades, and compete in rotating guild competitions.
- **Leaderboards and Stats** — compare rolls, earnings, finds, weights, Luck, and historical records while viewing your current calculated bonuses.
- **Feature controls** — selected mechanics can be enabled or disabled without redeploying the website.

## Accounts and saves

Players begin with an anonymous Supabase account so the game can be played immediately. That browser session is the only way to recover an unlinked guest save.

A guest account can be made permanent without changing its player ID through:

- email and password;
- Google account linking, when the provider is enabled.

Registered players can sign back in, upload a profile picture, and request password resets. Authentication providers are only displayed when they are configured for the active Supabase project.

## Automation

Auto Roll, Auto Sell, Auto Keep, and Auto Craft reduce repetitive inventory management. The client controls when these actions are requested, but the server still validates every roll, sale, deposit, and reward.

Session Insights records local session activity such as rolls, kept and sold gems, income, relics, rarity distribution, and notable finds. Players can clear this local summary whenever they choose.

## Project structure

```text
index.html              Roll page
inventory/              Inventory and equipment management
crafting/               Equipment and consumable recipes
enchanting-lab/         Pickaxe enchanting
forge/                  Masterwork Forge
gem-index/              Gem and mutation catalogue
leaderboards/           Public rankings
debug/                   My Stats
seasons/                 Season pass and missions
guilds/                  Guild management and competitions
expeditions/             Daily and weekly expeditions
auctions/                Auction House
lootbox/                 Loot boxes
admin/                   Feature Lab and administration tools
updates/                 Player-facing update log
src/backend/             Supabase client and cloud operations
src/data/                Client-side definitions and display metadata
src/logic/               Shared game calculations
src/ui/                  Navigation, dialogs, formatting, and components
src/styles/              Shared design system
supabase/functions/      Server-authoritative Edge Functions
supabase/migrations/     Database migrations and RPC definitions
tests/                   Node-based regression checks
```

The live gem catalogue is stored in Supabase and can be managed through Feature Lab. Client-side gem data should not be treated as the source of truth for the current production catalogue.

## Running locally

The front end has no compilation step. Serve the repository root with any static web server; ES modules will not work correctly through `file://`.

```bash
python3 -m http.server 8423
```

Then open [http://localhost:8423](http://localhost:8423).

## Testing

Run the complete regression suite with:

```bash
npm test
```

Tests cover the major game systems and also verify that important client, migration, and Edge Function changes remain connected.

## Supabase development

The browser client configuration is located in `src/backend/supabase.js`. Production secrets and the service-role key must never be committed or exposed to the client.

Database changes belong in `supabase/migrations/`. Edge Functions are stored under `supabase/functions/` and should be deployed only after any database functions or columns they require are available remotely.

Typical function deployment:

```bash
supabase functions deploy <function-name> --project-ref <project-ref>
```

Before applying migrations, compare local and remote migration history. This repository has previously received migrations from multiple development branches, so do not repair or rewrite remote migration history without first confirming the exact mismatch.

## Contributing

Create a feature branch, keep unrelated changes separate, run `npm test`, and open a pull request into `main`. Database migrations and Edge Function deployment requirements should be called out clearly in the pull request description.

Please use the in-game bug-report link or the repository issue tracker for reproducible problems.
