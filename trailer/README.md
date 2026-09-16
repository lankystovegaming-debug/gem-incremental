# Gem Incremental promotional trailer

This folder contains a finished 25.5-second, 1280×720 promotional trailer built from live captures of [gemincremental.com](https://gemincremental.com), the game's existing mineral artwork, and original generated audio.

## Storyboard

| Time | Beat |
| --- | --- |
| 0:00–0:03 | Introduce the Roll screen and the one-click premise. |
| 0:03–0:07 | Escalate from a common 1-in-2 gem to a 1-in-8.7-billion result. |
| 0:07–0:11 | Inventory, crafting, enchanting, and equipment: BUILD • UPGRADE • OPTIMISE. |
| 0:11–0:15 | Absurd weight, double mutation, and Secret-tier reveal. |
| 0:15–0:19 | Merchant, global events, Market, Bundles, and leaderboards. |
| 0:19–0:22 | Gem 2048, Explosive Mining, Gem Catcher, and Gemdle. |
| 0:22–0:25.5 | End card, Roll click, and the intentionally anticlimactic 1-in-2 Feldspar. |

## Render

The renderer uses Pillow and NumPy for motion graphics, then macOS AVFoundation for H.264/AAC MP4 encoding:

```sh
/Users/lanky/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 trailer/build_trailer.py
```

Outputs are written to `trailer/dist/`. The audio is synthesized by the renderer and does not use third-party music.
