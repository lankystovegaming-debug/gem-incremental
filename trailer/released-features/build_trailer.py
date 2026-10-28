#!/usr/bin/env python3
"""Render the released-features-only Gem Incremental trailer."""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parents[1]
CAPTURES_DIR = BASE / "assets" / "captures"
DIST = BASE / "dist"
GEMS_DIR = PROJECT / "src" / "assets" / "photoreal" / "specimens2"

W, H = 1280, 720
FPS = 30
DURATION = 28.5
FRAME_COUNT = int(DURATION * FPS)

BG = (5, 8, 17)
PANEL = (14, 19, 35)
INK = (247, 249, 255)
MUTED = (174, 184, 208)
VIOLET = (126, 124, 255)
CYAN = (76, 222, 255)
MAGENTA = (255, 88, 202)
GREEN = (86, 244, 164)
GOLD = (255, 207, 91)
RED = (255, 96, 114)

FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_MONO = "/System/Library/Fonts/Menlo.ttc"


def font(size: int, style: str = "bold") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype({
        "black": FONT_BLACK,
        "bold": FONT_BOLD,
        "regular": FONT_REGULAR,
        "mono": FONT_MONO,
    }[style], size)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def pulse(value: float, width: float = 0.09) -> float:
    return math.exp(-((value / width) ** 2))


captures = {p.stem: Image.open(p).convert("RGB") for p in CAPTURES_DIR.glob("*.png")}
gems = {p.stem: Image.open(p).convert("RGBA") for p in GEMS_DIR.glob("*.webp")}


def cover(image: Image.Image, width: int = W, height: int = H, zoom: float = 1.0,
          focus_x: float = 0.5, focus_y: float = 0.5) -> Image.Image:
    scale = max(width / image.width, height / image.height) * zoom
    resized = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
    left = int((resized.width - width) * clamp(focus_x))
    top = int((resized.height - height) * clamp(focus_y))
    return resized.crop((left, top, left + width, top + height))


def vignette(image: Image.Image, strength: float = 0.58) -> Image.Image:
    yy, xx = np.ogrid[:H, :W]
    dx = (xx - W / 2) / (W / 2)
    dy = (yy - H / 2) / (H / 2)
    mask = np.clip((dx * dx + dy * dy - 0.18) / 1.15, 0, 1) * strength
    array = np.asarray(image).astype(np.float32)
    array *= 1 - mask[..., None]
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))


def ui_frame(name: str, phase: float, darken: int = 26, zoom_from: float = 1.0,
             zoom_to: float = 1.055, focus_x: float = 0.5, focus_y: float = 0.48) -> Image.Image:
    zoom = zoom_from + (zoom_to - zoom_from) * ease(phase)
    image = cover(captures[name], zoom=zoom, focus_x=focus_x, focus_y=focus_y)
    image = ImageEnhance.Contrast(image).enhance(1.03)
    if darken:
        image = Image.alpha_composite(
            image.convert("RGBA"), Image.new("RGBA", image.size, (2, 4, 12, darken))
        ).convert("RGB")
    return vignette(image)


def bottom_fade(image: Image.Image, start: int = 430, opacity: int = 225) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for y in range(start, H):
        alpha = int(opacity * ((y - start) / max(1, H - start)) ** 1.45)
        draw.line((0, y, W, y), fill=(3, 6, 14, alpha))
    out = image.convert("RGBA")
    out.alpha_composite(layer)
    return out


def badge(draw: ImageDraw.ImageDraw, text: str, color=VIOLET, x: int = 50, y: int = 48) -> None:
    fnt = font(17, "bold")
    box = draw.textbbox((0, 0), text, font=fnt)
    width = box[2] - box[0] + 30
    draw.rounded_rectangle((x, y, x + width, y + 38), 19, fill=(*color, 48), outline=(*color, 185), width=2)
    draw.text((x + 15, y + 19), text, font=fnt, fill=color, anchor="lm")


def glow_text(image: Image.Image, xy: tuple[int, int], text: str, fnt: ImageFont.FreeTypeFont,
              color=INK, glow=VIOLET, radius: int = 18, anchor: str = "mm") -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.text(xy, text, font=fnt, fill=(*glow, 220), anchor=anchor,
              stroke_width=2, stroke_fill=(*glow, 220))
    image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius)))
    ImageDraw.Draw(image).text(xy, text, font=fnt, fill=color, anchor=anchor)


def cut_flash(image: Image.Image, phase: float, strength: int = 95) -> Image.Image:
    out = image.convert("RGBA")
    out.alpha_composite(Image.new("RGBA", out.size, (255, 255, 255, int(strength * pulse(phase)))))
    return out.convert("RGB")


def progress_bar(image: Image.Image, t: float) -> None:
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, H - 5, W, H), fill=(26, 31, 53))
    draw.rectangle((0, H - 5, int(W * clamp(t / DURATION)), H), fill=VIOLET)


def scene_roll(t: float) -> Image.Image:
    phase = t / 3.2
    names = ["roll", "roll-impact", "roll-result"]
    index = min(2, int(t / (3.2 / 3)))
    local = (t - index * (3.2 / 3)) / (3.2 / 3)
    image = ui_frame(names[index], local, darken=42, zoom_from=1.01, zoom_to=1.08, focus_x=0.43).convert("RGBA")
    draw = ImageDraw.Draw(image)
    badge(draw, "LIVE GAMEPLAY", GREEN)
    shade = Image.new("RGBA", image.size, (0, 0, 0, 90))
    image.alpha_composite(shade)
    alpha = int(255 * ease(clamp(phase / 0.18)))
    glow_text(image, (W // 2, 290), "ONE CLICK.", font(68, "black"), color=(*INK, alpha), glow=VIOLET)
    draw = ImageDraw.Draw(image)
    draw.text((W // 2, 370), "AN ENTIRE GAME OPENS UP.", font=font(29, "bold"), fill=(*CYAN, alpha), anchor="mm")
    if t > 2.45:
        p = (t - 2.45) / 0.75
        radius = int(25 + 160 * ease(p))
        ring_alpha = int(230 * (1 - ease(p)))
        draw.ellipse((W // 2 - radius, 520 - radius, W // 2 + radius, 520 + radius),
                     outline=(*VIOLET, ring_alpha), width=5)
    return cut_flash(image.convert("RGB"), local, 60)


def gem_strip(local: float) -> Image.Image:
    image = Image.new("RGBA", (W, H), (*BG, 255))
    draw = ImageDraw.Draw(image)
    colors = [CYAN, VIOLET, MAGENTA, GREEN, GOLD]
    names = ["quartz", "amethyst", "diamond", "opal", "green-prismatic"]
    for i, (name, color) in enumerate(zip(names, colors)):
        angle = local * 1.7 + i * 1.3
        x = int(145 + i * 245 + math.sin(angle) * 18)
        y = int(270 + math.cos(angle * 0.9) * 28)
        stone = gems[name].copy()
        stone.thumbnail((230, 210), Image.Resampling.LANCZOS)
        glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse((x - 115, y - 115, x + 115, y + 115), fill=(*color, 48))
        image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(45)))
        image.alpha_composite(stone, (x - stone.width // 2, y - stone.height // 2))
    draw.text((W // 2, 82), "305 DISCOVERIES. 13 RARITY TIERS.", font=font(41, "black"), fill=INK, anchor="mm")
    rarity_steps = ["1 IN 2", "1 IN 1,000,000+", "1 IN 1,000,000,000+"]
    index = min(2, int(local * 3))
    draw.text((W // 2, 530), rarity_steps[index], font=font(65, "mono"), fill=colors[index + 1], anchor="mm")
    draw.text((W // 2, 606), "EVERY RESULT HAS WEIGHT, VALUE AND A STORY.", font=font(21, "bold"), fill=MUTED, anchor="mm")
    return image.convert("RGB")


def scene_rarity(t: float) -> Image.Image:
    local = (t - 3.2) / 3.0
    image = gem_strip(local).convert("RGBA")
    if local < 0.20:
        real = ui_frame("roll-result", local / 0.2, darken=100, zoom_from=1.0, zoom_to=1.06, focus_x=0.40).convert("RGBA")
        real.putalpha(int(255 * (1 - ease(local / 0.2))))
        image.alpha_composite(real)
    return cut_flash(image.convert("RGB"), (local * 3) % 1, 80)


def scene_biomes(t: float) -> Image.Image:
    local = (t - 6.2) / 2.9
    image = ui_frame("gem-index", local, darken=58, zoom_from=1.0, zoom_to=1.08, focus_y=0.55).convert("RGBA")
    aurora = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ad = ImageDraw.Draw(aurora)
    for i, color in enumerate([CYAN, GREEN, VIOLET, MAGENTA]):
        x = int((i * 370 + local * 420) % (W + 420) - 210)
        ad.ellipse((x - 230, -150, x + 230, H + 120), fill=(*color, 38))
    image.alpha_composite(aurora.filter(ImageFilter.GaussianBlur(95)))
    # Deterministic drifting biome motes.
    draw = ImageDraw.Draw(image)
    for i in range(34):
        x = int((i * 191 + local * (90 + i % 5 * 18)) % W)
        y = int((i * 83 + local * (50 + i % 7 * 14)) % H)
        r = 2 + i % 3
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(*(CYAN if i % 2 else GREEN), 145))
    overlay = bottom_fade(image.convert("RGB"), 365, 235)
    draw = ImageDraw.Draw(overlay)
    badge(draw, "RELEASED · WEEKLY UPDATE 6", CYAN)
    draw.text((W // 2, 510), "9 GLOBAL BIOMES", font=font(59, "black"), fill=INK, anchor="mm")
    draw.text((W // 2, 577), "NATIVE GEMS • HIDDEN PHENOMENA • TOURNAMENT MODE", font=font(22, "bold"), fill=CYAN, anchor="mm")
    return overlay.convert("RGB")


def scene_dungeons(t: float) -> Image.Image:
    local = t - 9.1
    index = 0 if local < 2 else 1
    phase = (local % 2) / 2
    name = "dungeons" if index == 0 else "workbench"
    image = ui_frame(name, phase, darken=30, zoom_from=1.0, zoom_to=1.065, focus_y=0.54).convert("RGBA")
    draw = ImageDraw.Draw(image)
    badge(draw, "DUNGEONS" if index == 0 else "WORKBENCH", GOLD)
    image = bottom_fade(image.convert("RGB"), 410, 238)
    draw = ImageDraw.Draw(image)
    headline = "1,500 ROOMS." if index == 0 else "LOOT BECOMES POWER."
    draw.text((W // 2, 555), headline, font=font(51, "black"), fill=INK, anchor="mm")
    draw.text((W // 2, 620), "FIGHT • LOOT • CRAFT • PUSH DEEPER", font=font(24, "bold"), fill=GOLD, anchor="mm")
    return cut_flash(image.convert("RGB"), phase, 75)


def scene_season(t: float) -> Image.Image:
    local = (t - 13.1) / 3.0
    image = ui_frame("season", local, darken=35, zoom_from=1.0, zoom_to=1.07, focus_y=0.45).convert("RGBA")
    # Rising tier markers echo the reward track without fabricating rewards.
    draw = ImageDraw.Draw(image)
    for i in range(10):
        x = 120 + i * 116
        y = 500 - int(ease(clamp(local * 1.5 - i * 0.035)) * (80 + (i % 3) * 16))
        draw.rounded_rectangle((x, y, x + 78, y + 78), 14, fill=(20, 27, 49, 210), outline=(*VIOLET, 170), width=2)
        draw.text((x + 39, y + 39), str(i * 5 + 5), font=font(21, "bold"), fill=INK, anchor="mm")
    image = bottom_fade(image.convert("RGB"), 430, 240)
    draw = ImageDraw.Draw(image)
    badge(draw, "LIVE NOW", GREEN)
    draw.text((W // 2, 545), "SEASON 1 — THE INTERLUDE", font=font(48, "black"), fill=INK, anchor="mm")
    draw.text((W // 2, 610), "50 TIERS • DAILY + WEEKLY MISSIONS • EXCLUSIVE COSMETICS", font=font(21, "bold"), fill=VIOLET, anchor="mm")
    return image.convert("RGB")


def montage_frame(entries: list[tuple[str, str, tuple[int, int, int]]], local: float,
                  headline: str, subline: str) -> Image.Image:
    slot = 1 / len(entries)
    index = min(len(entries) - 1, int(local / slot))
    phase = (local - index * slot) / slot
    name, title, color = entries[index]
    image = ui_frame(name, phase, darken=24, zoom_from=1.0, zoom_to=1.07).convert("RGBA")
    draw = ImageDraw.Draw(image)
    badge(draw, title, color)
    image = bottom_fade(image.convert("RGB"), 430, 240)
    draw = ImageDraw.Draw(image)
    draw.text((W // 2, 550), headline, font=font(45, "black"), fill=INK, anchor="mm")
    draw.text((W // 2, 614), subline, font=font(22, "bold"), fill=color, anchor="mm")
    return cut_flash(image.convert("RGB"), phase, 72)


def scene_progression(t: float) -> Image.Image:
    return montage_frame([
        ("inventory", "INVENTORY", CYAN),
        ("crafting", "CRAFTING", VIOLET),
        ("market", "PLAYER MARKET", MAGENTA),
        ("leaderboards", "LEADERBOARDS", GOLD),
    ], (t - 16.1) / 4.0, "BUILD A LOADOUT. BUILD A LEGACY.", "COLLECT • CRAFT • TRADE • CLIMB")


def scene_economy(t: float) -> Image.Image:
    return montage_frame([
        ("guilds", "GUILDS", GREEN),
        ("bank", "BANK", CYAN),
        ("lottery", "DAILY LOTTERY", GOLD),
    ], (t - 20.1) / 3.0, "A LIVING PLAYER ECONOMY.", "TEAM UP • SAVE • BORROW • TAKE YOUR SHOT")


def scene_minigames(t: float) -> Image.Image:
    return montage_frame([
        ("minigames", "MINIGAMES", MAGENTA),
        ("gem-2048", "GEM 2048", CYAN),
        ("gem-reels", "GEM REELS", GOLD),
        ("gemdle", "GEMDLE", VIOLET),
    ], (t - 23.1) / 2.9, "ROLLING IS ONLY THE BEGINNING.", "GEM 2048 • GEM REELS • GEMDLE • AND MORE")


def scene_end(t: float) -> Image.Image:
    local = t - 26.0
    image = Image.new("RGBA", (W, H), (*BG, 255))
    names = ["amethyst", "diamond", "emerald", "ruby", "opal", "sapphire", "green-prismatic"]
    for i, name in enumerate(names):
        stone = gems[name].copy()
        stone.thumbnail((260, 230), Image.Resampling.LANCZOS)
        x = int((i * 220 + local * (30 if i % 2 else -24)) % (W + 360) - 180)
        y = 45 + (i % 3) * 235
        stone.putalpha(stone.getchannel("A").point(lambda a: int(a * 0.23)))
        image.alpha_composite(stone, (x, y))
    image.alpha_composite(Image.new("RGBA", image.size, (3, 6, 14, 120)))
    alpha = int(255 * ease(clamp(local / 0.28)))
    glow_text(image, (W // 2, 255), "GEM INCREMENTAL", font(70, "black"), color=(*INK, alpha), glow=VIOLET, radius=24)
    draw = ImageDraw.Draw(image)
    draw.text((W // 2, 342), "HOW LUCKY ARE YOU?", font=font(31, "bold"), fill=(*CYAN, alpha), anchor="mm")
    draw.rounded_rectangle((495, 430, 785, 514), 24, fill=(*VIOLET, alpha), outline=(*INK, min(170, alpha)), width=2)
    draw.text((W // 2, 472), "PLAY FREE", font=font(29, "black"), fill=(*BG, alpha), anchor="mm")
    draw.text((W // 2, 585), "gemincremental.com", font=font(23, "mono"), fill=(*MUTED, alpha), anchor="mm")
    if local > 1.85:
        p = ease(clamp((local - 1.85) / 0.24))
        card = cover(captures["roll-result"], 660, 370, zoom=1.05, focus_x=0.33, focus_y=0.52)
        card = card.resize((int(660 * p), int(370 * p)), Image.Resampling.LANCZOS)
        card_rgba = card.convert("RGBA")
        frame = Image.new("RGBA", card_rgba.size, (0, 0, 0, 0))
        fd = ImageDraw.Draw(frame)
        fd.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), 28, outline=(*CYAN, 220), width=4)
        card_rgba.alpha_composite(frame)
        image.alpha_composite(card_rgba, ((W - card.width) // 2, (H - card.height) // 2))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((475, 590, 805, 646), 18, fill=(5, 8, 17, 230), outline=(*CYAN, 180), width=2)
        draw.text((W // 2, 618), "…AND SOMETIMES IT'S QUARTZ.", font=font(18, "bold"), fill=CYAN, anchor="mm")
    return image.convert("RGB")


def render_frame(t: float) -> Image.Image:
    if t < 3.2:
        image = scene_roll(t)
    elif t < 6.2:
        image = scene_rarity(t)
    elif t < 9.1:
        image = scene_biomes(t)
    elif t < 13.1:
        image = scene_dungeons(t)
    elif t < 16.1:
        image = scene_season(t)
    elif t < 20.1:
        image = scene_progression(t)
    elif t < 23.1:
        image = scene_economy(t)
    elif t < 26.0:
        image = scene_minigames(t)
    else:
        image = scene_end(t)
    progress_bar(image, t)
    return image


def add_tone(track: np.ndarray, start: float, length: float, frequency: float, amplitude: float,
             wave_type: str = "sine", pan: float = 0.5, attack: float = 0.004,
             release: float = 0.08) -> None:
    sample_rate = 48_000
    start_index = max(0, int(start * sample_rate))
    count = min(int(length * sample_rate), len(track) - start_index)
    if count <= 0:
        return
    tt = np.arange(count) / sample_rate
    phase = 2 * np.pi * frequency * tt
    if wave_type == "saw":
        signal = 2 * ((frequency * tt) % 1) - 1
    elif wave_type == "square":
        signal = np.tanh(2.2 * np.sin(phase))
    else:
        signal = np.sin(phase)
    envelope = np.minimum(1, tt / max(attack, 1e-4)) * np.minimum(1, (length - tt) / max(release, 1e-4))
    signal *= np.clip(envelope, 0, 1) * amplitude
    track[start_index:start_index + count, 0] += signal * math.cos(pan * math.pi / 2)
    track[start_index:start_index + count, 1] += signal * math.sin(pan * math.pi / 2)


def add_noise(track: np.ndarray, start: float, length: float, amplitude: float,
              seed: int, pan: float = 0.5, decay: float = 14) -> None:
    sample_rate = 48_000
    start_index = int(start * sample_rate)
    count = min(int(length * sample_rate), len(track) - start_index)
    if count <= 0:
        return
    rng = np.random.default_rng(seed)
    tt = np.arange(count) / sample_rate
    signal = rng.normal(0, 1, count) * np.exp(-decay * tt) * amplitude
    track[start_index:start_index + count, 0] += signal * math.cos(pan * math.pi / 2)
    track[start_index:start_index + count, 1] += signal * math.sin(pan * math.pi / 2)


def build_audio(path: Path) -> None:
    sample_rate = 48_000
    track = np.zeros((int(DURATION * sample_rate), 2), dtype=np.float64)
    bpm = 136
    beat = 60 / bpm
    chords = [[110, 164.81, 220], [98, 146.83, 196], [130.81, 196, 261.63], [123.47, 185, 246.94]]
    for bar_start in np.arange(0, DURATION, beat * 4):
        chord = chords[int(bar_start / (beat * 4)) % len(chords)]
        for note in chord:
            add_tone(track, bar_start, beat * 3.8, note, 0.025, "saw", (note % 100) / 100, 0.10, 0.28)
        add_tone(track, bar_start, beat * 3.6, chord[0] / 2, 0.13, "sine", 0.5, 0.02, 0.2)
    for i, ts in enumerate(np.arange(0.22, DURATION, beat)):
        add_tone(track, ts, 0.16, 52, 0.44, "sine", 0.5, 0.002, 0.13)
        if i % 2:
            add_noise(track, ts, 0.13, 0.15, 700 + i, 0.5, 29)
        add_noise(track, ts + beat / 2, 0.04, 0.05, 1700 + i, 0.25 if i % 2 else 0.75, 48)
    cuts = [1.06, 2.13, 3.2, 4.2, 5.2, 6.2, 9.1, 11.1, 13.1, 16.1,
            17.1, 18.1, 19.1, 20.1, 21.1, 22.1, 23.1, 23.83, 24.56, 25.29, 26.0, 27.85]
    for i, ts in enumerate(cuts):
        major = ts in (3.2, 6.2, 9.1, 13.1, 16.1, 20.1, 23.1, 26.0)
        add_noise(track, ts, 0.24, 0.21 if major else 0.10, 3100 + i, 0.5, 18)
        add_tone(track, ts, 0.14, 760 if ts < 26 else 610, 0.11, "sine", 0.5, 0.002, 0.11)
    for i in range(72):
        ts = 7.3 + i * 0.025
        add_tone(track, ts, 0.08, 220 + i * 10, 0.014 + i * 0.0005, "sine", i / 72, 0.002, 0.04)
    for i in range(60):
        ts = 24.5 + i * 0.025
        add_tone(track, ts, 0.08, 280 + i * 13, 0.012 + i * 0.00055, "sine", 1 - i / 60, 0.002, 0.04)
    add_noise(track, 27.84, 0.035, 0.34, 90210, 0.5, 90)
    add_tone(track, 28.02, 0.40, 880, 0.16, "sine", 0.5, 0.004, 0.32)
    add_tone(track, 28.05, 0.35, 1320, 0.08, "sine", 0.5, 0.004, 0.28)
    fade = int(0.48 * sample_rate)
    track[-fade:] *= np.linspace(1, 0, fade)[:, None]
    track = np.tanh(track * 1.55) * 0.86
    pcm = (np.clip(track, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    frames = DIST / ".frames"
    audio = DIST / "gem-incremental-released-trailer-audio.wav"
    video = DIST / "gem-incremental-released-trailer.mp4"
    poster = DIST / "gem-incremental-released-trailer-poster.jpg"
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    for index in range(FRAME_COUNT):
        render_frame(index / FPS).save(frames / f"frame-{index:04d}.jpg", quality=92, subsampling=0)
        if index % FPS == 0:
            print(f"rendered {index // FPS:02d}s / {DURATION:.1f}s", flush=True)
    build_audio(audio)
    cache = Path("/tmp/gem-released-trailer-swift-cache")
    cache.mkdir(parents=True, exist_ok=True)
    encoder = Path("/tmp/gem-released-trailer-encoder")
    environment = {**os.environ, "SWIFT_MODULE_CACHE_PATH": str(cache), "CLANG_MODULE_CACHE_PATH": str(cache)}
    subprocess.run([
        "/usr/bin/swiftc", "-parse-as-library", str(BASE / "encode_trailer.swift"), "-o", str(encoder)
    ], check=True, env=environment)
    subprocess.run([str(encoder), str(frames), str(audio), str(video), str(FPS), str(W), str(H)], check=True)
    render_frame(26.7).save(poster, quality=95, subsampling=0)
    shutil.rmtree(frames, ignore_errors=True)
    print(video)


if __name__ == "__main__":
    main()
