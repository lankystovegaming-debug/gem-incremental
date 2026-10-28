# Gem Incremental — released features trailer

This folder contains a 28.5-second promotional trailer built from the live game on 28 October 2026. It replaces the earlier concept's unreleased-feature montage with current, verifiably released systems.

## Released-feature policy

The trailer uses live captures of:

- Roll and the current pickaxe mining animation
- the Gem Index and nine global biomes from Weekly Update 6
- Dungeons and its 1,500-room progression
- the Dungeon Workbench
- Season 1 — The Interlude and its 50-tier reward track
- Inventory, Crafting, the Player Market and Leaderboards
- Guilds, Bank and Daily Lottery
- the released Minigames hub, Gem 2048, Gem Reels and Gemdle

The production `game_section_settings` table was checked before capture. Disabled sections—including Enchanting Lab, Merchant Caravan, Mining Events, Islands, PvP, quests, bounties, Gem Fusion, Relic Vault, Wars, World Bosses and Treasure Expeditions—are not shown or named.

The rarity sequence uses the game's existing mineral artwork and general rarity scale. It does not fabricate a named Secret roll, mutation, weight or result. The only depicted roll result is the genuine Quartz roll captured from the dedicated test account.

## Storyboard

| Time | Beat |
| --- | --- |
| 0:00–0:03.2 | Current Roll animation and authentic result: one click opens the game. |
| 0:03.2–0:06.2 | 305 discoveries and the rarity scale, from 1-in-2 to billion-plus odds. |
| 0:06.2–0:09.1 | Nine global biomes and the live Gem Index. |
| 0:09.1–0:13.1 | 1,500 Dungeons rooms, combat loot and Workbench crafting. |
| 0:13.1–0:16.1 | Season 1 — The Interlude: 50 tiers and missions. |
| 0:16.1–0:20.1 | Inventory, Crafting, Player Market and Leaderboards. |
| 0:20.1–0:23.1 | Guilds, Bank and Daily Lottery. |
| 0:23.1–0:26.0 | Minigames, Gem 2048, Gem Reels and Gemdle. |
| 0:26.0–0:28.5 | End card, play call-to-action and the genuine Quartz button. |

## Rebuild

Capture screens from the live game (credentials are provided through environment variables and are never stored):

```sh
GEM_TRAILER_EMAIL='...' GEM_TRAILER_PASSWORD='...' node trailer/released-features/capture_live.mjs
```

Render the soundtrack, motion graphics and H.264/AAC MP4:

```sh
/Users/lanky/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 trailer/released-features/build_trailer.py
```

Outputs are written to `trailer/released-features/dist/`.

The Quartz ending uses the owner's supplied `vine-boom.mp3`, retained in `assets/audio/` alongside a decoded 48 kHz stereo WAV. Its quiet lead-in is trimmed, the hit starts at 27.85 seconds, and the tail fades over the last 90 ms to fit the existing ending. The other transition sounds and picture timing are unchanged. The music is synthesized by the renderer.
