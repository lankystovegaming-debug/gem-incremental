# Unreleased Expansion Features

All five new systems are seeded disabled. Enable them individually from **Upcoming Features → Site Features**.

## Ja-ore cinematic
`src/ui/jaOreCutscene.js` is an original retro pixel-cinema animation inspired by the supplied references' broad visual language: sunset bands, chunky silhouettes, saturated purple/orange/cyan lighting, rhythmic staging, scanlines and an explosive reveal. It uses the supplied JA-ore artwork only as an embedded CSS data URI and does not ship a separate image asset or reproduce the supplied video.

The roll renderer now triggers it specifically for `Ja-ore`. The existing Xy/Heart of Xy scene also accepts both names.

## World Bosses
Tables: `world_boss_definitions`, `world_boss_runs`.

Configurable pieces include HP, attack, defense, enrage threshold, multiple phases, attack patterns, entry requirements, weighted loot and contribution rewards.

## Relic Vault
Tables: `relic_definitions`, `player_relics`.

Relics have slots, passive stats, sockets, socket rules, sets, acquisition rules and salvage rewards.

## Seasons
Tables: `season_definitions`, `player_seasons`.

Season definitions support dates, XP per roll, tier XP, free/premium tier rewards, challenge definitions and seasonal modifiers.

## Bounty Board
Tables: `bounty_definitions`, `bounty_claims`.

Bounties can be permanent or temporary and can target global, self, guild, gem or player activity. Requirements and rewards are JSON-configurable on the server.

## Treasure Expeditions
Tables: `treasure_expedition_definitions`, `player_treasure_expeditions`.

Expeditions support duration, entry requirements, branching nodes, weighted choices/outcomes and configurable boosts.

## Deployment
Run:

`supabase/migrations/20260819000010_unreleased_expansion_features.sql`

Then deploy:

- `world-bosses`
- `relics`
- `seasons`
- `bounties`
- `treasure-expeditions`

The sections remain OFF until explicitly enabled in Upcoming Features.
