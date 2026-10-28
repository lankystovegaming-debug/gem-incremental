# Gem Incremental — released features trailer

This folder contains a 39.63-second promotional trailer built from the live game on 28 October 2026, plus a staged second roll leading into the game's released Almost Secret cinematic.

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

The rarity sequence uses the game's existing mineral artwork and general rarity scale. The Quartz result was captured from the dedicated test account. The second roll is an editorial staging: an animated button leads into a local capture of the existing Almost Secret cinematic; it does not award a gem or change the player's save. Production confirms Almost Secret is enabled, always available, with rarity 999,999,999.

## Storyboard

| Time | Beat |
| --- | --- |
| 0:00–0:05.0 | Roll, discover, roll again: current mining UI and authentic result. |
| 0:05.0–0:06.8 | Second roll: isolated Rolling... button with continuously rotating spinner. |
| 0:06.8–0:07.0 | Fade to black; the frame immediately before cinematic playback is fully black. |
| 0:07.0–0:15.4 | Actual Almost Secret count-up, with a separate dramatic score. |
| 0:15.4–0:15.8 | Hard cut to pure black immediately after the first 999,999,999 frame; silence. |
| 0:15.8–0:16.13 | Fade picture and normal music back in. |
| 0:16.13–0:18.63 | Actual public rare-roll feed: gems, mutations and serials. |
| 0:18.63–0:22.13 | 305 discoveries and the rarity scale, from 1-in-2 to billion-plus odds. |
| 0:22.13–0:24.13 | Nine global biomes and the live Gem Index. |
| 0:24.13–0:27.13 | 1,500 Dungeons rooms, combat loot and Workbench crafting. |
| 0:27.13–0:29.13 | Season 1 — The Interlude: 50 tiers and missions. |
| 0:29.13–0:32.13 | Inventory, Crafting, Player Market and Leaderboards. |
| 0:32.13–0:34.13 | Guilds, Bank and Daily Lottery. |
| 0:34.13–0:37.13 | Minigames, Gem 2048, Gem Reels and Gemdle. |
| 0:37.13–0:39.63 | End card, play call-to-action and the genuine Quartz button. |

Almost Secret frames come from `src/ui/cutsceneScenes.js` and its existing stylesheet, with an offline settings stub and a controlled browser clock. `assets/almost-secret/manifest.json` records every frame's counter value; capture stops at the first 999,999,999, with no subsequent cinematic frame. Blackout frames are pure RGB zero with no progress bar or other overlay.

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

The Quartz ending uses the owner's supplied `vine-boom.mp3`, retained in `assets/audio/` alongside a decoded 48 kHz stereo WAV. Its quiet lead-in is trimmed, the hit starts at 38.983 seconds, and the tail fades over the last 90 ms to fit the ending. The music cuts completely at that point, leaving the boom alone. The music is synthesized by the renderer; the Almost Secret segment uses a separate minor-key drone, low percussion and an accelerating riser.

To recapture the existing cinematic offline, run `node trailer/released-features/capture_almost_secret.mjs` before rendering. It requires no login and sends no game requests.
