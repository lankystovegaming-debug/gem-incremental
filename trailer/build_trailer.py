#!/usr/bin/env python3
"""Render the Gem Incremental 25.5 second promotional trailer."""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TRAILER = ROOT / "trailer"
CAPTURES = TRAILER / "assets" / "captures"
DIST = TRAILER / "dist"
W, H = 1280, 720
FPS = 30
DURATION = 25.5
FRAMES = int(DURATION * FPS)

BG = (6, 9, 18)
PANEL = (15, 20, 38)
INK = (245, 247, 255)
MUTED = (176, 184, 210)
VIOLET = (135, 126, 255)
CYAN = (70, 223, 255)
MAGENTA = (255, 87, 208)
GREEN = (89, 255, 169)
GOLD = (255, 208, 94)

FONT_BOLD_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK_PATH = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_REGULAR_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_MONO_PATH = "/System/Library/Fonts/Menlo.ttc"


def font(size: int, kind: str = "bold") -> ImageFont.FreeTypeFont:
    path = {
        "black": FONT_BLACK_PATH,
        "bold": FONT_BOLD_PATH,
        "regular": FONT_REGULAR_PATH,
        "mono": FONT_MONO_PATH,
    }[kind]
    return ImageFont.truetype(path, size=size)


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def ease(value: float) -> float:
    value = clamp(value)
    return value * value * (3.0 - 2.0 * value)


def pulse(value: float, width: float = 0.12) -> float:
    return math.exp(-((value / width) ** 2))


def cover(im: Image.Image, width: int = W, height: int = H, zoom: float = 1.0,
          focus_y: float = 0.50) -> Image.Image:
    im = im.convert("RGB")
    scale = max(width / im.width, height / im.height) * zoom
    resized = im.resize((max(width, int(im.width * scale)), max(height, int(im.height * scale))), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = int((resized.height - height) * clamp(focus_y))
    return resized.crop((left, top, left + width, top + height))


def tinted_overlay(im: Image.Image, opacity: int = 90) -> Image.Image:
    out = im.convert("RGBA")
    shade = Image.new("RGBA", out.size, (3, 6, 15, opacity))
    return Image.alpha_composite(out, shade).convert("RGB")


def centered(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str,
             fnt: ImageFont.FreeTypeFont, fill=INK, stroke_width: int = 0,
             stroke_fill=BG, anchor: str = "mm") -> None:
    draw.text(xy, text, font=fnt, fill=fill, anchor=anchor,
              stroke_width=stroke_width, stroke_fill=stroke_fill)


def glow_text(base: Image.Image, xy: tuple[int, int], text: str,
              fnt: ImageFont.FreeTypeFont, color=INK, glow=VIOLET,
              radius: int = 18, anchor: str = "mm") -> None:
    glow_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    gd.text(xy, text, font=fnt, fill=(*glow, 210), anchor=anchor, stroke_width=2, stroke_fill=(*glow, 210))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius))
    base.alpha_composite(glow_layer)
    ImageDraw.Draw(base).text(xy, text, font=fnt, fill=color, anchor=anchor)


def vignette(im: Image.Image, strength: float = 0.72) -> Image.Image:
    yy, xx = np.ogrid[:H, :W]
    dx = (xx - W / 2) / (W / 2)
    dy = (yy - H / 2) / (H / 2)
    mask = np.clip((dx * dx + dy * dy - 0.2) / 1.2, 0, 1) * strength
    arr = np.asarray(im).astype(np.float32)
    arr *= (1.0 - mask[..., None])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def progress_bar(im: Image.Image, t: float) -> None:
    draw = ImageDraw.Draw(im)
    y = H - 5
    draw.rectangle((0, y, W, H), fill=(30, 34, 55))
    draw.rectangle((0, y, int(W * clamp(t / DURATION)), H), fill=VIOLET)


def label(draw: ImageDraw.ImageDraw, text: str, x: int = 56, y: int = 54,
          color=VIOLET) -> None:
    f = font(18, "bold")
    box = draw.textbbox((0, 0), text, font=f)
    tw = box[2] - box[0]
    draw.rounded_rectangle((x, y, x + tw + 30, y + 38), radius=19,
                           fill=(*color, 42), outline=(*color, 170), width=2)
    draw.text((x + 15, y + 19), text, font=f, fill=color, anchor="lm")


captures = {p.stem: Image.open(p).convert("RGB") for p in CAPTURES.glob("*.jpg")}
gems_dir = ROOT / "src" / "assets" / "photoreal" / "specimens2"
gems = {p.stem: Image.open(p).convert("RGBA") for p in gems_dir.glob("*.webp")}


def ui_frame(name: str, local: float, darken: int = 45, zoom_from: float = 1.0,
             zoom_to: float = 1.045) -> Image.Image:
    z = zoom_from + (zoom_to - zoom_from) * ease(local)
    # Crop away announcement bars while keeping the app header and main view.
    src = captures[name].crop((0, 58, captures[name].width, captures[name].height))
    im = cover(src, zoom=z, focus_y=0.40)
    if darken:
        im = Image.alpha_composite(im.convert("RGBA"), Image.new("RGBA", im.size, (2, 5, 14, darken))).convert("RGB")
    return vignette(im)


def scene_intro(t: float) -> Image.Image:
    local = t / 3.0
    im = ui_frame("home", local, darken=72, zoom_from=1.02, zoom_to=1.11).convert("RGBA")
    draw = ImageDraw.Draw(im)
    label(draw, "THE ODDS START HERE")
    alpha = int(255 * ease(min(local / 0.22, (1 - local) / 0.13)))
    title_layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    glow_text(title_layer, (W // 2, 300), "ROLL A GEM.", font(80, "black"), color=(*INK, alpha), glow=VIOLET)
    td = ImageDraw.Draw(title_layer)
    td.text((W // 2, 380), "One click. Any rarity.", font=font(26, "regular"), fill=(*MUTED, alpha), anchor="mm")
    im.alpha_composite(title_layer)
    if t > 2.35:
        p = (t - 2.35) / 0.65
        r = int(26 + 140 * ease(p))
        a = int(220 * (1 - ease(p)))
        draw.ellipse((W // 2 - r, 500 - r, W // 2 + r, 500 + r), outline=(*VIOLET, a), width=5)
    return im.convert("RGB")


def gem_card(gem_name: str, title: str, rarity: str, color: tuple[int, int, int], phase: float) -> Image.Image:
    im = Image.new("RGBA", (W, H), (*BG, 255))
    # Layered radial glow.
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for r in range(420, 20, -18):
        a = int(2 + 14 * (1 - r / 420))
        gd.ellipse((W // 2 - r, H // 2 - r, W // 2 + r, H // 2 + r), fill=(*color, a))
    im.alpha_composite(gl)
    stone = gems[gem_name].copy()
    stone.thumbnail((410, 410), Image.Resampling.LANCZOS)
    scale = 0.87 + 0.08 * ease(phase)
    stone = stone.resize((int(stone.width * scale), int(stone.height * scale)), Image.Resampling.LANCZOS)
    stone = ImageEnhance.Contrast(stone).enhance(1.08)
    x, y = (W - stone.width) // 2, 82 + int(8 * math.sin(phase * math.pi))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((x + 45, y + stone.height - 28, x + stone.width - 45, y + stone.height + 34), fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    im.alpha_composite(shadow)
    im.alpha_composite(stone, (x, y))
    draw = ImageDraw.Draw(im)
    draw.text((W // 2, 500), title.upper(), font=font(25, "bold"), fill=color, anchor="mm")
    draw.text((W // 2, 550), rarity, font=font(66, "black"), fill=INK, anchor="mm")
    draw.text((W // 2, 615), "THE NUMBERS KEEP CLIMBING", font=font(18, "bold"), fill=MUTED, anchor="mm")
    return im.convert("RGB")


def scene_rarity(t: float) -> Image.Image:
    local = t - 3.0
    sequence = [
        ("feldspar", "COMMON", "1 IN 2", (188, 196, 215)),
        ("amethyst", "EPIC", "1 IN 10,000", (182, 106, 255)),
        ("diamond", "MYTHIC", "1 IN 10,000,000", (80, 223, 255)),
        ("green-prismatic", "???", "1 IN 8,741,293,004", (89, 255, 169)),
    ]
    idx = min(3, int(local))
    phase = local - idx
    gem_name, title, rarity, color = sequence[idx]
    im = gem_card(gem_name, title, rarity, color, phase).convert("RGBA")
    # Flash the cut without obscuring legibility.
    a = int(155 * pulse(phase, 0.06))
    im.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, a)))
    return im.convert("RGB")


def scene_progression(t: float) -> Image.Image:
    local = t - 7.0
    names = ["inventory", "crafting", "enchanting", "inventory"]
    idx = min(3, int(local))
    phase = local - idx
    im = ui_frame(names[idx], phase, darken=30, zoom_from=1.01, zoom_to=1.07).convert("RGBA")
    draw = ImageDraw.Draw(im)
    label(draw, ["INVENTORY", "CRAFTING", "ENCHANTING", "EQUIPMENT"][idx], color=CYAN)
    # Strong bottom title treatment keeps real UI readable above it.
    shade = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for y in range(410, H):
        a = int(210 * ((y - 410) / (H - 410)) ** 1.5)
        sd.line((0, y, W, y), fill=(4, 7, 17, a))
    im.alpha_composite(shade)
    words = ["BUILD", "UPGRADE", "OPTIMISE"]
    colors = [CYAN, VIOLET, MAGENTA]
    for i, (word, color) in enumerate(zip(words, colors)):
        x = 250 + i * 390
        a = int(255 * ease(clamp((local - i * 0.38) / 0.35)))
        ImageDraw.Draw(im).text((x, 610), word, font=font(43, "black"), fill=(*color, a), anchor="mm")
        if i < 2:
            ImageDraw.Draw(im).ellipse((x + 190, 604, x + 200, 614), fill=(*INK, a))
    return im.convert("RGB")


def scene_secret(t: float) -> Image.Image:
    local = (t - 11.0) / 4.0
    base = ui_frame("roll-final", local, darken=135, zoom_from=1.08, zoom_to=1.16).filter(ImageFilter.GaussianBlur(4)).convert("RGBA")
    # Animated aurora bands.
    aur = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ad = ImageDraw.Draw(aur)
    for i, color in enumerate([GREEN, CYAN, MAGENTA, VIOLET]):
        x = int((i * 360 + local * 520) % (W + 400) - 200)
        ad.ellipse((x - 230, -100, x + 230, H + 100), fill=(*color, 35))
    aur = aur.filter(ImageFilter.GaussianBlur(95))
    base.alpha_composite(aur)

    panel = Image.new("RGBA", (760, 570), (12, 17, 31, 236))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle((2, 2, 757, 567), radius=36, fill=(12, 17, 31, 236), outline=(*GREEN, 190), width=3)
    stone = gems["green-prismatic"].copy()
    stone.thumbnail((300, 270), Image.Resampling.LANCZOS)
    bob = int(6 * math.sin(local * math.pi * 4))
    panel.alpha_composite(stone, ((760 - stone.width) // 2, 55 + bob))
    pd = ImageDraw.Draw(panel)
    pd.text((380, 34), "SECRET", font=font(19, "bold"), fill=GREEN, anchor="mm")
    pd.text((380, 330), "REALITY SHARD", font=font(43, "black"), fill=INK, anchor="mm")
    rarity = int(2 + ease(clamp(local / 0.68)) * 8_741_293_002)
    pd.text((380, 382), f"1 IN {rarity:,}", font=font(29, "mono"), fill=CYAN, anchor="mm")
    weight = ease(clamp((local - 0.1) / 0.58)) * 98_742.61
    pd.text((380, 433), f"WEIGHT  {weight:,.2f} kg", font=font(22, "bold"), fill=GOLD, anchor="mm")
    pd.rounded_rectangle((92, 470, 668, 530), radius=17, fill=(22, 31, 50), outline=(70, 90, 130), width=2)
    pd.text((380, 500), "IRRADIATED  •  PRISMATIC", font=font(21, "bold"), fill=MAGENTA, anchor="mm")
    sc = 0.88 + 0.12 * ease(clamp(local / 0.18))
    panel = panel.resize((int(panel.width * sc), int(panel.height * sc)), Image.Resampling.LANCZOS)
    base.alpha_composite(panel, ((W - panel.width) // 2, (H - panel.height) // 2))

    if local > 0.74:
        a = int(255 * ease((local - 0.74) / 0.12) * (1 - ease(clamp((local - 0.95) / 0.05))))
        banner = Image.new("RGBA", base.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(banner)
        bd.rounded_rectangle((385, 303, 895, 417), radius=28, fill=(4, 6, 14, min(235, a)), outline=(*MAGENTA, a), width=3)
        bd.text((W // 2, 360), "WAIT… WHAT?", font=font(52, "black"), fill=(*INK, a), anchor="mm")
        base.alpha_composite(banner)
    return base.convert("RGB")


def scene_world(t: float) -> Image.Image:
    local = t - 15.0
    entries = [
        ("merchant", "MERCHANT"),
        ("events", "GLOBAL EVENTS"),
        ("market", "MARKET"),
        ("bundles", "BUNDLES"),
        ("leaderboards", "LEADERBOARDS"),
    ]
    slot = 4.0 / len(entries)
    idx = min(len(entries) - 1, int(local / slot))
    phase = (local - idx * slot) / slot
    name, title = entries[idx]
    im = ui_frame(name, phase, darken=28, zoom_from=1.01, zoom_to=1.075).convert("RGBA")
    draw = ImageDraw.Draw(im)
    label(draw, title, color=GOLD)
    strip = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(strip)
    sd.rounded_rectangle((212, 574, 1068, 674), radius=28, fill=(4, 7, 16, 224), outline=(*GOLD, 155), width=2)
    sd.text((W // 2, 624), "YOUR ROLLS ACTUALLY MATTER.", font=font(38, "black"), fill=INK, anchor="mm")
    im.alpha_composite(strip)
    flash = int(110 * pulse(phase, 0.07))
    im.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, flash)))
    return im.convert("RGB")


def scene_minigames(t: float) -> Image.Image:
    local = t - 19.0
    entries = [
        ("gem2048", "GEM 2048"),
        ("explosive", "EXPLOSIVE MINING"),
        ("catcher", "GEM CATCHER"),
        ("gemdle", "GEMDLE"),
    ]
    slot = 3.0 / 4.0
    idx = min(3, int(local / slot))
    phase = (local - idx * slot) / slot
    name, title = entries[idx]
    im = ui_frame(name, phase, darken=20, zoom_from=1.01, zoom_to=1.095).convert("RGBA")
    draw = ImageDraw.Draw(im)
    label(draw, "MINIGAME 0" + str(idx + 1), color=MAGENTA)
    card = Image.new("RGBA", im.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((310, 545, 970, 660), radius=24, fill=(5, 8, 18, 226), outline=(*MAGENTA, 180), width=2)
    cd.text((W // 2, 590), title, font=font(39, "black"), fill=INK, anchor="mm")
    cd.text((W // 2, 631), "WHEN ONE GAME ISN'T ENOUGH", font=font(17, "bold"), fill=MUTED, anchor="mm")
    im.alpha_composite(card)
    im.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, int(105 * pulse(phase, 0.07)))))
    return im.convert("RGB")


def scene_end(t: float) -> Image.Image:
    local = t - 22.0
    im = Image.new("RGBA", (W, H), (*BG, 255))
    # Moving mineral collage in the background.
    names = ["amethyst", "diamond", "emerald", "ruby", "opal", "sapphire"]
    for i, name in enumerate(names):
        stone = gems[name].copy()
        stone.thumbnail((280, 240), Image.Resampling.LANCZOS)
        x = int((i * 235 + local * (22 if i % 2 else -18)) % (W + 340) - 170)
        y = 65 + (i % 3) * 230
        stone.putalpha(stone.getchannel("A").point(lambda a: int(a * 0.23)))
        im.alpha_composite(stone, (x, y))
    shade = Image.new("RGBA", im.size, (4, 7, 16, 130))
    im.alpha_composite(shade)

    if local < 2.15:
        a = int(255 * ease(clamp(local / 0.35)))
        layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
        glow_text(layer, (W // 2, 275), "GEM INCREMENTAL", font(72, "black"), color=(*INK, a), glow=VIOLET, radius=23)
        ld = ImageDraw.Draw(layer)
        ld.text((W // 2, 363), "How lucky are you?", font=font(34, "regular"), fill=(*MUTED, a), anchor="mm")
        ld.rounded_rectangle((505, 450, 775, 530), radius=22, fill=(*VIOLET, a), outline=(*INK, min(180, a)), width=2)
        ld.text((W // 2, 490), "ROLL", font=font(29, "black"), fill=(*BG, a), anchor="mm")
        im.alpha_composite(layer)
    else:
        p = clamp((local - 2.15) / 0.35)
        card = Image.new("RGBA", (620, 355), (13, 18, 33, int(245 * ease(p))))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle((2, 2, 617, 352), radius=32, fill=(13, 18, 33, int(245 * ease(p))), outline=(*VIOLET, int(210 * ease(p))), width=3)
        stone = gems["feldspar"].copy()
        stone.thumbnail((195, 170), Image.Resampling.LANCZOS)
        stone.putalpha(stone.getchannel("A").point(lambda a: int(a * ease(p))))
        card.alpha_composite(stone, ((620 - stone.width) // 2, 30))
        cd = ImageDraw.Draw(card)
        cd.text((310, 205), "FELDSPAR", font=font(38, "black"), fill=(*INK, int(255 * ease(p))), anchor="mm")
        cd.text((310, 262), "1 IN 2", font=font(44, "mono"), fill=(*CYAN, int(255 * ease(p))), anchor="mm")
        cd.text((310, 315), "…of course.", font=font(21, "regular"), fill=(*MUTED, int(255 * ease(p))), anchor="mm")
        im.alpha_composite(card, ((W - 620) // 2, 175))
    return im.convert("RGB")


def render_frame(t: float) -> Image.Image:
    if t < 3:
        im = scene_intro(t)
    elif t < 7:
        im = scene_rarity(t)
    elif t < 11:
        im = scene_progression(t)
    elif t < 15:
        im = scene_secret(t)
    elif t < 19:
        im = scene_world(t)
    elif t < 22:
        im = scene_minigames(t)
    else:
        im = scene_end(t)
    progress_bar(im, t)
    return im


def add_tone(track: np.ndarray, start: float, length: float, freq: float,
             amp: float, wave_type: str = "sine", pan: float = 0.5,
             attack: float = 0.005, release: float = 0.08) -> None:
    sr = 48_000
    i0 = max(0, int(start * sr))
    n = min(int(length * sr), len(track) - i0)
    if n <= 0:
        return
    tt = np.arange(n) / sr
    phase = 2 * np.pi * freq * tt
    if wave_type == "square":
        sig = np.tanh(2.2 * np.sin(phase))
    elif wave_type == "saw":
        sig = 2 * ((freq * tt) % 1.0) - 1
    else:
        sig = np.sin(phase)
    env = np.minimum(1, tt / max(attack, 1e-4)) * np.minimum(1, (length - tt) / max(release, 1e-4))
    env = np.clip(env, 0, 1)
    sig = sig * env * amp
    track[i0:i0 + n, 0] += sig * math.cos(pan * math.pi / 2)
    track[i0:i0 + n, 1] += sig * math.sin(pan * math.pi / 2)


def add_noise(track: np.ndarray, start: float, length: float, amp: float,
              seed: int, pan: float = 0.5, decay: float = 12.0) -> None:
    sr = 48_000
    i0 = int(start * sr)
    n = min(int(length * sr), len(track) - i0)
    if n <= 0:
        return
    rng = np.random.default_rng(seed)
    tt = np.arange(n) / sr
    sig = rng.normal(0, 1, n) * np.exp(-decay * tt) * amp
    track[i0:i0 + n, 0] += sig * math.cos(pan * math.pi / 2)
    track[i0:i0 + n, 1] += sig * math.sin(pan * math.pi / 2)


def build_audio(path: Path) -> None:
    sr = 48_000
    track = np.zeros((int(DURATION * sr), 2), dtype=np.float64)
    bpm = 128
    beat = 60 / bpm
    # Pulsing synth bed and bass progression.
    chords = [[110.0, 164.81, 220.0], [98.0, 146.83, 196.0], [130.81, 196.0, 261.63], [123.47, 185.0, 246.94]]
    for bar_start in np.arange(0, DURATION, beat * 4):
        chord = chords[int(bar_start / (beat * 4)) % len(chords)]
        for note in chord:
            add_tone(track, bar_start, beat * 3.8, note, 0.028, "saw", pan=(note % 100) / 100, attack=0.12, release=0.3)
        add_tone(track, bar_start, beat * 3.6, chord[0] / 2, 0.12, "sine", 0.5, 0.025, 0.2)
    # Kick, clap, and hats.
    for i, ts in enumerate(np.arange(0.25, DURATION, beat)):
        add_tone(track, ts, 0.17, 54, 0.42, "sine", 0.5, 0.002, 0.13)
        if i % 2 == 1:
            add_noise(track, ts, 0.14, 0.16, 700 + i, 0.5, 28)
        add_noise(track, ts + beat / 2, 0.045, 0.055, 1700 + i, 0.25 if i % 2 else 0.75, 45)
    # Scene cut impacts.
    for i, ts in enumerate([2.35, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 15.8, 16.6, 17.4, 18.2, 19, 19.75, 20.5, 21.25, 22, 24.15]):
        add_noise(track, ts, 0.22, 0.20 if ts in (3, 7, 11, 15, 19, 22) else 0.10, 3000 + i, 0.5, 18)
        add_tone(track, ts, 0.13, 820 if ts < 22 else 620, 0.10, "sine", 0.5, 0.002, 0.1)
    # Riser into the Secret reveal.
    for i in range(60):
        ts = 9.5 + i * 0.025
        add_tone(track, ts, 0.09, 260 + i * 11, 0.018 + i * 0.0006, "sine", i / 60, 0.002, 0.04)
    # Brief dramatic dip before WAIT... WHAT?
    dip0, dip1 = int(13.72 * sr), int(14.15 * sr)
    track[dip0:dip1] *= np.linspace(0.3, 0.05, dip1 - dip0)[:, None]
    add_tone(track, 14.15, 0.55, 48, 0.5, "sine", 0.5, 0.002, 0.5)
    add_noise(track, 14.15, 0.35, 0.22, 9991, 0.5, 9)
    # Final button click and tiny comic plink.
    add_noise(track, 24.15, 0.035, 0.3, 90210, 0.5, 80)
    add_tone(track, 24.42, 0.42, 880, 0.16, "sine", 0.5, 0.005, 0.32)
    add_tone(track, 24.45, 0.35, 1320, 0.08, "sine", 0.5, 0.005, 0.28)

    # Gentle limiter and fade-out.
    fade = int(0.55 * sr)
    track[-fade:] *= np.linspace(1, 0, fade)[:, None]
    track = np.tanh(track * 1.5) * 0.86
    pcm = (np.clip(track, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    frames_dir = DIST / ".frames"
    audio = DIST / "gem-incremental-trailer-audio.wav"
    final = DIST / "gem-incremental-trailer.mp4"
    poster = DIST / "gem-incremental-trailer-poster.jpg"
    shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True)
    for i in range(FRAMES):
        frame = render_frame(i / FPS)
        frame.save(frames_dir / f"frame-{i:04d}.jpg", quality=93, subsampling=0)
        if i % FPS == 0:
            print(f"rendered {i // FPS:02d}s / {DURATION:.1f}s", flush=True)
    build_audio(audio)
    cache_dir = Path("/tmp/gem-incremental-trailer-swift-cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    encoder = Path("/tmp/gem-incremental-trailer-encoder")
    compile_env = {
        **dict(os.environ),
        "SWIFT_MODULE_CACHE_PATH": str(cache_dir),
        "CLANG_MODULE_CACHE_PATH": str(cache_dir),
    }
    subprocess.run([
        "/usr/bin/swiftc", "-parse-as-library", str(TRAILER / "encode_trailer.swift"),
        "-o", str(encoder),
    ], check=True, env=compile_env)
    subprocess.run([
        str(encoder), str(frames_dir), str(audio), str(final),
        str(FPS), str(W), str(H),
    ], check=True)
    render_frame(22.8).save(poster, quality=94, subsampling=0)
    shutil.rmtree(frames_dir, ignore_errors=True)
    print(final)


if __name__ == "__main__":
    main()
