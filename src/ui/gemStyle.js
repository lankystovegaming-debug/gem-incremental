import { getSettings } from "./settings.js";
// =========================================================
// GEM STYLE
//
// Every gem gets its own hand-picked font pairing and colour
// (solid or gradient) so the name itself hints at what the
// specimen looks like. Only generic/system font stacks are
// used (plus the two fonts the game already self-hosts) so
// nothing here adds a network font dependency.
// =========================================================

const FALLBACK_FONT = "'Segoe UI', system-ui, sans-serif";

const GEM_STYLES = {
  "Quartz": {
    color: "#e9edf3",
    font: "Georgia, 'Times New Roman', serif",
    weight: 500,
    spacing: "0.01em",
    glow: "rgba(233,237,243,0.45)"
  },
  "Calcite": {
    color: "#f4efe2",
    font: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    weight: 500,
    spacing: "0.01em",
    glow: "rgba(244,239,226,0.4)"
  },
  "Feldspar": {
    color: "#d9c8c2",
    font: "Cambria, Georgia, serif",
    weight: 500,
    spacing: "0.01em",
    glow: "rgba(217,200,194,0.4)"
  },
  "Fluorite": {
    color: "#8fe0c2",
    gradient: "linear-gradient(90deg, #9b5de5, #4dd0a7)",
    font: "'Trebuchet MS', sans-serif",
    weight: 600,
    style: "italic",
    spacing: "0.01em",
    glow: "rgba(155,93,229,0.4)"
  },
  "Hematite": {
    color: "#a4776b",
    font: "Rockwell, 'Courier New', monospace",
    weight: 700,
    spacing: "0.02em",
    glow: "rgba(164,119,107,0.35)"
  },
  "Obsidian": {
    color: "#2a2a2e",
    font: "Didot, 'Bodoni MT', 'Times New Roman', serif",
    weight: 700,
    style: "italic",
    spacing: "0.02em",
    glow: "rgba(255,255,255,0.25)"
  },
  "Agate": {
    color: "#c98bd6",
    gradient: "linear-gradient(90deg, #e0b0ff, #7fd8be, #e0b0ff)",
    font: "Verdana, Geneva, sans-serif",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(201,139,214,0.35)"
  },
  "Jasper": {
    color: "#b5651d",
    font: "Rockwell, Georgia, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(181,101,29,0.35)"
  },
  "Amethyst": {
    color: "#a469c9",
    font: "'Brush Script MT', 'Segoe Script', cursive",
    weight: 500,
    style: "italic",
    spacing: "0.01em",
    glow: "rgba(164,105,201,0.5)"
  },
  "Garnet": {
    color: "#8b1a2b",
    font: "Garamond, Baskerville, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(139,26,43,0.45)"
  },
  "Peridot": {
    color: "#a3d94a",
    font: "'Century Gothic', 'Trebuchet MS', sans-serif",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(163,217,74,0.4)"
  },
  "Topaz": {
    color: "#ffb703",
    gradient: "linear-gradient(90deg, #ffd166, #ff9f1c)",
    font: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif",
    weight: 700,
    spacing: "0.02em",
    glow: "rgba(255,183,3,0.45)"
  },
  "Aquamarine": {
    color: "#7fdbda",
    font: "Optima, 'Segoe UI', sans-serif",
    weight: 500,
    spacing: "0.02em",
    glow: "rgba(127,219,218,0.45)"
  },
  "Tourmaline": {
    color: "#ff8fd1",
    gradient: "linear-gradient(90deg, #ff8fd1, #7fd8be, #8fb2ff)",
    font: "Verdana, sans-serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(255,143,209,0.4)"
  },
  "Opal": {
    color: "#e6d8ff",
    gradient:
      "linear-gradient(90deg, #ff9aa2, #ffd6a5, #caffbf, #9bf6ff, #bdb2ff)",
    font: "'Segoe Print', 'Comic Sans MS', cursive",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(255,255,255,0.5)"
  },
  "Zircon": {
    color: "#dbe7f5",
    font: "Consolas, 'Lucida Console', monospace",
    weight: 600,
    spacing: "0.06em",
    glow: "rgba(219,231,245,0.55)"
  },
  "Spinel": {
    color: "#e0115f",
    font: "Baskerville, Garamond, serif",
    weight: 600,
    style: "italic",
    spacing: "0.01em",
    glow: "rgba(224,17,95,0.4)"
  },
  "Sapphire": {
    color: "#2e6fdb",
    font: "'Times New Roman', Georgia, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(46,111,219,0.45)"
  },
  "Ruby": {
    color: "#e0115f",
    font: "Georgia, 'Times New Roman', serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(224,17,95,0.5)"
  },
  "Emerald": {
    color: "#50c878",
    font: "Garamond, Georgia, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(80,200,120,0.45)"
  },
  "Diamond": {
    color: "#eaf6ff",
    gradient: "linear-gradient(90deg, #ffffff, #bfe3ff, #ffffff)",
    font: "'Segoe UI', 'Helvetica Neue', sans-serif",
    weight: 700,
    spacing: "0.05em",
    glow: "rgba(191,227,255,0.7)"
  },
  "Tanzanite": {
    color: "#5b2a86",
    font: "Papyrus, fantasy",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(91,42,134,0.45)"
  },
  "Alexandrite": {
    color: "#3aa66b",
    gradient: "linear-gradient(90deg, #3aa66b, #b03a5b)",
    font: "Copperplate, 'Copperplate Gothic Light', fantasy",
    weight: 600,
    spacing: "0.02em",
    glow: "rgba(176,58,91,0.4)"
  },
  "Benitoite": {
    color: "#1e90ff",
    font: "Impact, Haettenschweiler, sans-serif",
    weight: 400,
    spacing: "0.01em",
    glow: "rgba(30,144,255,0.5)"
  },
  "Red Beryl": {
    color: "#a4133c",
    font: "Rockwell, Georgia, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(164,19,60,0.4)"
  },
  "Black Opal": {
    color: "#c9a8ff",
    gradient:
      "linear-gradient(90deg, #6a4c93, #1a1a2e, #6a9fb5, #1a1a2e)",
    font: "'Segoe Print', 'Brush Script MT', cursive",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(106,76,147,0.5)"
  },
  "Grandidierite": {
    color: "#2a9d8f",
    font: "Optima, 'Trebuchet MS', sans-serif",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(42,157,143,0.45)"
  },
  "Taaffeite": {
    color: "#b19cd9",
    font: "'Lucida Handwriting', 'Segoe Script', cursive",
    weight: 500,
    style: "italic",
    spacing: "0.01em",
    glow: "rgba(177,156,217,0.5)"
  },
  "Musgravite": {
    color: "#7a9482",
    font: "Rockwell, Georgia, serif",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(122,148,130,0.35)"
  },
  "Painite": {
    color: "#9a4b3c",
    font: "Georgia, Cambria, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(154,75,60,0.4)"
  },
  "Dark Matter": {
    color: "#c8a4ff",
    gradient: "linear-gradient(90deg, #0a0014, #6a2fb5, #0a0014)",
    font: "'Courier New', Consolas, monospace",
    weight: 700,
    style: "italic",
    caps: true,
    spacing: "0.08em",
    glow: "rgba(138,63,220,0.75)"
  },
  "Citrine": {
    color: "#e9c46a",
    font: "Garamond, Georgia, serif",
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(233,196,106,0.45)"
  },
  "Moonstone": {
    color: "#d6dff0",
    font: "'Segoe UI Light', 'Segoe UI', sans-serif",
    weight: 300,
    spacing: "0.04em",
    glow: "rgba(214,223,240,0.55)"
  },
  "Demantoid": {
    color: "#2ecc71",
    font: "'Century Gothic', 'Trebuchet MS', sans-serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(46,204,113,0.5)"
  },
  "Jeremejevite": {
    color: "#a8dadc",
    font: "Optima, 'Segoe UI', sans-serif",
    weight: 500,
    spacing: "0.02em",
    glow: "rgba(168,218,220,0.5)"
  },
  "Poudretteite": {
    color: "#d896ff",
    font: "'Brush Script MT', 'Segoe Script', cursive",
    weight: 500,
    style: "italic",
    spacing: "0.01em",
    glow: "rgba(216,150,255,0.45)"
  },
  "Serendibite": {
    color: "#22314f",
    font: "Didot, 'Bodoni MT', serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(90,120,180,0.5)"
  },
  "Blue Garnet": {
    color: "#3a7ca5",
    gradient: "linear-gradient(90deg, #3a7ca5, #2a9d8f)",
    font: "Garamond, Georgia, serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(58,124,165,0.45)"
  },
  "Kyawthuite": {
    color: "#d9480f",
    font: "Rockwell, 'Trebuchet MS', sans-serif",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(217,72,15,0.45)"
  },
  "Aether Quartz": {
    color: "#c9fbff",
    gradient: "linear-gradient(90deg, #c9fbff, #8fd9ff, #c9fbff)",
    font: "'Orbitron', 'Segoe UI', sans-serif",
    weight: 600,
    spacing: "0.05em",
    glow: "rgba(143,217,255,0.65)"
  },
  "Void Opal": {
    color: "#caa4ff",
    gradient: "linear-gradient(90deg, #10001a, #6a2fb5, #ff5fbf, #10001a)",
    font: "'Orbitron', 'Segoe UI', sans-serif",
    weight: 600,
    caps: true,
    spacing: "0.04em",
    glow: "rgba(255,95,191,0.6)"
  },
  "Chronite": {
    color: "#c9b37a",
    gradient: "linear-gradient(90deg, #2ec4c6, #c9b37a)",
    font: "'Exo 2', 'Segoe UI', sans-serif",
    weight: 600,
    style: "italic",
    spacing: "0.03em",
    glow: "rgba(46,196,198,0.55)"
  },
  "Neutron Crystal": {
    color: "#dfe7fd",
    font: "'Exo 2', 'Segoe UI', sans-serif",
    weight: 800,
    caps: true,
    spacing: "0.08em",
    glow: "rgba(223,231,253,0.7)"
  },
  "Antimatter Crystal": {
    color: "#ff5b5b",
    gradient: "linear-gradient(90deg, #ff5b5b, #10001a, #ff5b5b)",
    font: "'Orbitron', 'Segoe UI', sans-serif",
    weight: 700,
    caps: true,
    spacing: "0.05em",
    glow: "rgba(255,91,91,0.7)"
  },
  "Singularity Shard": {
    color: "#f4f4ff",
    gradient: "linear-gradient(90deg, #000000, #6a2fb5, #f4f4ff, #6a2fb5, #000000)",
    font: "'Orbitron', 'Segoe UI', sans-serif",
    weight: 800,
    caps: true,
    spacing: "0.12em",
    glow: "rgba(244,244,255,0.8)"
  },
  "Pezzottaite": { color: "#ef6aa8", font: "Garamond, Georgia, serif", weight: 700, glow: "rgba(239,106,168,.55)" },
  "Clinohumite": { color: "#ff8a3d", font: "Rockwell, Georgia, serif", weight: 700, glow: "rgba(255,138,61,.55)" },
  "Tsavorite": { color: "#43d675", font: "Garamond, Georgia, serif", weight: 700, glow: "rgba(67,214,117,.55)" },
  "Paraíba Tourmaline": { color: "#49f5e7", gradient: "linear-gradient(90deg,#21d4c2,#55c8ff,#21d4c2)", font: "Optima, sans-serif", weight: 700, glow: "rgba(73,245,231,.65)" },
  "Red Diamond": { color: "#ff315f", gradient: "linear-gradient(90deg,#8b001c,#ff315f,#ffd4dd)", font: "Didot, Georgia, serif", weight: 800, glow: "rgba(255,49,95,.65)" },
  "Natural Moissanite": { color: "#eafcff", gradient: "linear-gradient(90deg,#aef6ff,#fff,#d7c4ff)", font: "'Segoe UI', sans-serif", weight: 700, glow: "rgba(220,250,255,.7)" },
  "Black Diamond": { color: "#bbb7c8", gradient: "linear-gradient(90deg,#17151d,#918aa3,#17151d)", font: "Didot, Georgia, serif", weight: 800, glow: "rgba(180,170,200,.45)" },
  "Tugtupite": { color: "#ff5c98", gradient: "linear-gradient(90deg,#ff5c98,#ffb1cb,#ff5c98)", font: "Optima, sans-serif", weight: 700, glow: "rgba(255,92,152,.6)" },
  "Meteorite Peridot": { color: "#b8e95a", gradient: "linear-gradient(90deg,#565c2c,#d9ff75,#89845b)", font: "Rockwell, serif", weight: 700, glow: "rgba(184,233,90,.6)" },
  "Ringwoodite": { color: "#5a83e8", gradient: "linear-gradient(90deg,#263b88,#7c9cff,#263b88)", font: "'Exo 2', sans-serif", weight: 800, glow: "rgba(90,131,232,.65)" },
  "Pallasite Crystal": { color: "#d3e87a", gradient: "linear-gradient(90deg,#7e7655,#dfff88,#b19563)", font: "'Exo 2', sans-serif", weight: 800, glow: "rgba(211,232,122,.65)" },
  "Lunar Diamond": { color: "#f4f6ff", gradient: "linear-gradient(90deg,#a9b1ca,#fff,#d6dcf2)", font: "'Orbitron', sans-serif", weight: 800, glow: "rgba(244,246,255,.8)" },
  "Martian Opal": { color: "#ff8067", gradient: "linear-gradient(90deg,#9f2d20,#ff8067,#e7c19c)", font: "'Orbitron', sans-serif", weight: 800, glow: "rgba(255,128,103,.7)" },
  "Ja-ore": { color: "#ffcf45", gradient: "linear-gradient(90deg,#ff3b30,#ffcf45,#36c5f0)", font: "'Comic Sans MS', cursive", weight: 800, glow: "rgba(255,207,69,.7)" },
  "Presolar Moissanite": { color: "#ffe9a8", gradient: "linear-gradient(90deg,#ff7b54,#ffe9a8,#8ed8ff)", font: "'Orbitron', sans-serif", weight: 800, glow: "rgba(255,233,168,.8)" },
  "Lanky Gem": {
    color: "#ff6ec7",
    font: "'Comic Sans MS', 'Comic Sans', cursive",
    weight: 700,
    spacing: "0.01em",
    glow: "rgba(255,110,199,0.5)"
  },
  "Carmeltazite": {
    color: "#fff1fb",
    gradient: "linear-gradient(90deg,#ffffff,#ff9de2,#9ee9ff,#d7adff,#ffffff)",
    font: "'Orbitron', 'Exo 2', sans-serif",
    weight: 900,
    caps: true,
    spacing: "0.1em",
    glow: "rgba(255,210,249,.95)"
  }
};

// Deterministic fallback for any gem name that isn't in the
// curated table above (e.g. a future addition), so nothing
// ever falls back to plain unstyled text.
const FALLBACK_FONTS = [
  "Georgia, serif",
  "'Trebuchet MS', sans-serif",
  "Consolas, monospace",
  "'Century Gothic', sans-serif",
  "Garamond, serif",
  "Optima, sans-serif"
];

const FALLBACK_COLORS = [
  "#8fd9ff",
  "#ffb703",
  "#a3d94a",
  "#e0115f",
  "#c9a8ff",
  "#7fdbda"
];

function hashString(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function fallbackStyle(name) {
  const hash = hashString(name);

  const primary = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
  const secondary = FALLBACK_COLORS[Math.floor(hash / FALLBACK_COLORS.length) % FALLBACK_COLORS.length];

  return {
    color: primary,
    gradient: `linear-gradient(145deg, ${primary}, ${secondary})`,
    font: FALLBACK_FONTS[Math.floor(hash / 7) % FALLBACK_FONTS.length],
    weight: 600,
    spacing: "0.01em",
    glow: `${primary}88`
  };
}

export function getGemStyle(name) {
  const key = String(name ?? "");

  return GEM_STYLES[key] ?? fallbackStyle(key);
}

// Builds a safe inline `style="..."` value for a gem name.
// Values only ever come from the curated table above (or the
// deterministic fallback), never from user input.
export function gemStyleAttr(name) {
  const s = getGemStyle(name);

  const parts = [
    `font-family:${s.font}`,
    `font-weight:${s.weight}`,
    `font-style:${s.style ?? "normal"}`,
    `letter-spacing:${s.spacing ?? "0"}`,
    `--gem-color:${s.color}`,
    `--gem-glow:${s.glow ?? "transparent"}`
  ];

  if (s.gradient) {
    parts.push(
      `background:${s.gradient}`,
      "background-size:200% auto",
      "-webkit-background-clip:text",
      "background-clip:text",
      "-webkit-text-fill-color:transparent"
    );
  }

  if (s.glow) {
    parts.push(`text-shadow:0 0 10px ${s.glow}`);
  }

  if (s.caps) {
    parts.push("text-transform:uppercase");
  }

  return parts.join(";");
}

// Convenience wrapper: returns a ready-to-insert <span> for a
// gem name. `escapeHtml` is passed in so this module doesn't
// need to import a page-specific copy of it.
export function gemNameHtml(name, escapeHtml, extraClass = "") {
  const safeName = escapeHtml(name);
  const isGradient = Boolean(getGemStyle(name).gradient);

  const className = [
    "gem-styled",
    "gem-styled--animated",
    isGradient ? "gem-styled--gradient" : "",
    extraClass
  ]
    .filter(Boolean)
    .join(" ");

  return `<span class="${className}" style="${gemStyleAttr(name)}">${safeName}</span>`;
}


// =========================================================
// CSS GEM ICONS
//
// These are deliberately built from CSS only. No image files,
// sprite sheets, canvas, or remote assets are required.
//
// Each gem gets:
//   • a deterministic silhouette,
//   • a gem-specific surface gradient,
//   • a secondary highlight colour,
//   • a soft halo based on its curated gem style.
//
// The same helper is used by rolls, the Gem Index, leaderboards,
// and public profile showcases so a gem always looks like itself.
// =========================================================

function gradientColours(style) {
  const source = String(style?.gradient ?? style?.color ?? "");
  const matches = source.match(/#[0-9a-f]{3,8}/gi) ?? [];

  const first = matches[0] ?? style?.color ?? "#8fd9ff";
  const second =
    matches[matches.length > 1 ? matches.length - 1 : 0] ??
    style?.color ??
    "#8fd9ff";

  return { first, second };
}

const REAL_CUTS = {
  "Diamond": "brilliant",
  "Red Diamond": "brilliant",
  "Black Diamond": "brilliant",
  "Lunar Diamond": "brilliant",
  "Natural Moissanite": "brilliant",
  "Presolar Moissanite": "brilliant",
  "Zircon": "brilliant",
  "Benitoite": "brilliant",
  "Emerald": "emerald-cut",
  "Sapphire": "cushion",
  "Ruby": "oval",
  "Red Beryl": "oval",
  "Spinel": "oval",
  "Aquamarine": "emerald-cut",
  "Topaz": "emerald-cut",
  "Citrine": "cushion",
  "Amethyst": "cushion",
  "Garnet": "oval",
  "Peridot": "oval",
  "Tourmaline": "cushion",
  "Paraíba Tourmaline": "cushion",
  "Tanzanite": "cushion",
  "Alexandrite": "oval",
  "Demantoid": "brilliant",
  "Tsavorite": "brilliant",
  "Taaffeite": "cushion",
  "Musgravite": "oval",
  "Painite": "cushion",
  "Jeremejevite": "emerald-cut",
  "Poudretteite": "oval",
  "Pezzottaite": "oval",
  "Clinohumite": "oval",
  "Grandidierite": "emerald-cut",
  "Serendibite": "emerald-cut",
  "Blue Garnet": "oval",
  "Kyawthuite": "oval",
  "Tugtupite": "oval",
  "Ringwoodite": "brilliant",
  "Pallasite Crystal": "crystal",
  "Quartz": "crystal",
  "Aether Quartz": "crystal",
  "Feldspar": "crystal",
  "Fluorite": "hex",
  "Calcite": "crystal",
  "Opal": "cabochon",
  "Black Opal": "cabochon",
  "Void Opal": "cabochon",
  "Martian Opal": "cabochon",
  "Moonstone": "cabochon",
  "Agate": "cabochon",
  "Jasper": "cabochon",
  "Hematite": "freeform",
  "Obsidian": "freeform"
};

function iconShapeForName(name) {
  const key = String(name ?? "");
  if (REAL_CUTS[key]) return REAL_CUTS[key];
  const lower = key.toLowerCase();
  // Raw mineral/ore names are shown as irregular natural specimens rather
  // than being forced into a jewellery cut. This is especially useful for
  // admin-created names such as Uranium, Uraninite, Malachite or Pyrite.
  if (/(uranium|uraninite|betafite|torbernite|autunite|pyrite|malachite|ore|meteorite|pallasite)/.test(lower)) return "freeform";
  if (/(opal|moonstone|labradorite|sunstone)/.test(lower)) return "cabochon";
  if (/(diamond|moissanite|zircon)/.test(lower)) return "brilliant";

  const hash = hashString(key);
  return [
    "diamond",
    "crystal",
    "hex",
    "shard",
    "cushion",
    "prism"
  ][hash % 6];
}


// Real-material profiles used by the high-realism renderer. These are
// intentionally based on the optical appearance of the corresponding
// real-world minerals: body colour, transparency, dispersion, metallic
// reflection, inclusions and the characteristic type of internal light.
// Fictional gems receive a physically-inspired fantasy material instead.
const REAL_GEM_MATERIALS = {
  "Diamond": ["#f8fbff","#bfe8ff","#ffffff",.95,.98,.02,.9,.02,.95],
  "Red Diamond": ["#8b0018","#ff315f","#ffd8df",.94,.96,.03,.92,.01,.96],
  "Black Diamond": ["#0c0d11","#7d8290","#e7e9ef",.72,.88,.08,.75,.01,.92],
  "Lunar Diamond": ["#b8c4dc","#f7fbff","#dce6ff",.92,.97,.03,.88,.03,.94],
  "Natural Moissanite": ["#d9fbff","#ffffff","#c9b8ff",.98,.96,.02,1,.01,.92],
  "Presolar Moissanite": ["#ffb66f","#fff2bf","#91d8ff",.98,.94,.03,1,.01,.95],
  "Ruby": ["#6d0018","#e11d48","#ffb4c5",.82,.88,.06,.78,.06,.9],
  "Sapphire": ["#082c8a","#2864e8","#91c8ff",.82,.9,.05,.82,.03,.9],
  "Emerald": ["#063d28","#20a866","#9affca",.68,.82,.08,.62,.2,.82],
  "Aquamarine": ["#5bbec9","#a7f5ff","#e5ffff",.88,.88,.04,.85,.04,.88],
  "Topaz": ["#d58b16","#ffd86b","#fff3b0",.9,.9,.04,.86,.03,.88],
  "Citrine": ["#b56a09","#f5c94d","#fff0a3",.9,.9,.04,.86,.04,.88],
  "Amethyst": ["#42106e","#9b55d4","#e6baff",.88,.86,.05,.82,.08,.88],
  "Garnet": ["#420814","#9c1830","#ff9b92",.76,.84,.08,.72,.05,.86],
  "Peridot": ["#4d6910","#a8d83f","#efffa8",.9,.86,.04,.8,.03,.88],
  "Tourmaline": ["#183c31","#27b78c","#ff7fc9",.72,.8,.08,.72,.1,.86],
  "Paraíba Tourmaline": ["#007c7d","#38e9e0","#b7ffff",.84,.84,.04,.86,.04,.9],
  "Opal": ["#9a8f9b","#f8e8ff","#ffffff",.62,.72,.22,.55,.2,.8],
  "Black Opal": ["#090812","#5d4b85","#ff8bcf",.54,.78,.25,.52,.28,.86],
  "Martian Opal": ["#7c211b","#ff775f","#ffe3c8",.56,.7,.24,.52,.25,.82],
  "Void Opal": ["#07020d","#7b38c7","#ff67cb",.5,.7,.28,.55,.3,.88],
  "Moonstone": ["#6c7793","#dfe9ff","#ffffff",.5,.62,.16,.58,.12,.78],
  "Fluorite": ["#51378d","#8dddbb","#d6a9ff",.72,.8,.1,.72,.12,.86],
  "Zircon": ["#55769b","#b8ddff","#ffffff",.96,.94,.03,1,.02,.92],
  "Spinel": ["#72062d","#e51d68","#ffb8d4",.9,.9,.04,.88,.03,.88],
  "Tanzanite": ["#25145f","#5e4ad4","#c8c7ff",.88,.88,.05,.84,.04,.9],
  "Alexandrite": ["#176b4c","#4fcf91","#b8426d",.84,.84,.08,.8,.05,.9],
  "Benitoite": ["#063b8e","#348cff","#b9efff",.96,.9,.04,.95,.02,.9],
  "Red Beryl": ["#650b20","#d73553","#ffb0b7",.82,.86,.06,.8,.04,.88],
  "Grandidierite": ["#0a5960","#55b8aa","#c2ffff",.8,.78,.08,.74,.08,.86],
  "Taaffeite": ["#735b93","#c7a9e8","#f4e4ff",.9,.86,.06,.86,.04,.88],
  "Musgravite": ["#31483d","#7d9e8a","#d8ffe7",.82,.82,.07,.76,.05,.86],
  "Painite": ["#6b261b","#b95c3b","#ffb36c",.74,.82,.1,.7,.08,.86],
  "Demantoid": ["#07532e","#3bcf75","#d2ffbd",.92,.88,.05,.9,.03,.9],
  "Jeremejevite": ["#4b92aa","#a9e7f2","#f2ffff",.92,.88,.05,.88,.03,.88],
  "Poudretteite": ["#8c557b","#e5a6ce","#fff0fb",.78,.76,.08,.76,.05,.86],
  "Serendibite": ["#071d24","#31585d","#9cd4cf",.46,.72,.16,.58,.12,.8],
  "Blue Garnet": ["#103f58","#3e89b2","#b8f4ff",.78,.82,.08,.74,.06,.86],
  "Kyawthuite": ["#76200b","#d95b1c","#ffd08a",.86,.84,.06,.82,.04,.88],
  "Pezzottaite": ["#7e1949","#ef6aa8","#ffd0e8",.88,.82,.06,.84,.03,.86],
  "Clinohumite": ["#7a2f0a","#ff8a3d","#ffd19b",.84,.8,.07,.8,.04,.86],
  "Tsavorite": ["#075c2d","#43d675","#d5ffbf",.9,.86,.05,.86,.03,.9],
  "Tugtupite": ["#7d1749","#ff73a8","#ffe0ee",.72,.74,.1,.7,.08,.84],
  "Meteorite Peridot": ["#4d5221","#b8e95a","#efffa8",.66,.7,.12,.6,.18,.8],
  "Ringwoodite": ["#1d2f73","#5a83e8","#c5d8ff",.9,.84,.05,.84,.04,.88],
  "Pallasite Crystal": ["#6b6841","#d3e87a","#fff8b0",.72,.74,.08,.7,.12,.82],
  "Hematite": ["#292c32","#727883","#e6e9ef",.28,.35,.12,.18,.01,.98],
  "Obsidian": ["#050608","#222733","#e8f2ff",.04,.18,.04,.15,.02,.92],
  "Agate": ["#7f5a45","#c99a79","#f6dfbf",.18,.38,.2,.34,.5,.72],
  "Jasper": ["#6c2e1c","#b96d35","#f0bd75",.12,.28,.2,.25,.55,.68],
  "Quartz": ["#b9c1c8","#e9f0f5","#ffffff",.98,.82,.03,.9,.06,.84],
  "Calcite": ["#e5dfd0","#f5f1e8","#ffffff",.92,.62,.05,.76,.12,.78],
  "Feldspar": ["#9c7b74","#e2c8bf","#fff1e7",.68,.58,.1,.62,.15,.76],
  "Aether Quartz": ["#6fd8ff","#c9fbff","#ffffff",.98,.9,.02,1,.04,.92],
  "Chronite": ["#237e86","#c9b37a","#fff1ad",.84,.82,.08,.8,.08,.9],
  "Neutron Crystal": ["#8ea4d6","#dfe7fd","#ffffff",.96,.95,.02,1,.03,.95],
  "Antimatter Crystal": ["#7b071d","#ff5b5b","#d7a5ff",.9,.9,.08,.9,.03,.94],
  "Singularity Shard": ["#08050f","#6a2fb5","#f4f4ff",.98,.96,.02,1,.02,.98],
  "Ja-ore": ["#8d1f12","#ffcf45","#36c5f0",.8,.78,.1,.78,.2,.88],
  "Lanky Gem": ["#8b1e71","#ff6ec7","#ffd2f2",.65,.65,.12,.62,.16,.8],
  "Heart of Xy": ["#1d0938","#ff4fd8","#d5ffff",.98,.95,.03,1,.04,.98],
  "Carmeltazite": ["#6f174d","#ff9de2","#9ee9ff",.9,.86,.06,.86,.05,.9],
  "Dark Matter": ["#05010a","#5f27a8","#e4c8ff",.12,.55,.2,.45,.18,.96]
};

function materialProfileForGem(name, style) {
  const key = String(name ?? "");
  const profile = REAL_GEM_MATERIALS[key];
  if (profile) return profile;

  // Admin-created gems are not limited to the bundled catalogue. Infer a
  // physically-inspired material from the name so a custom “Uranium”,
  // “Uraninite”, “Emerald”, “Ruby”, etc. still gets a recognisable real-world
  // treatment at Photoreal rather than falling back to a generic gradient.
  const lower = key.toLowerCase();
  if (/(uranium|uraninite|betafite|torbernite|autunite)/.test(lower)) return ["#173b1a","#4fbf3f","#d8ff73",.46,.58,.16,.34,.72,.12];
  if (/(gold|pyrite|chalcopyrite|brass)/.test(lower)) return ["#6d4d08","#d8a52a","#fff0a0",.82,.5,.22,.72,.08,.96];
  if (/(silver|platinum|metal)/.test(lower)) return ["#4d535c","#cfd7df","#ffffff",.12,.28,.16,.18,.02,.99];
  if (/(emerald|beryl|malachite)/.test(lower)) return ["#063d28","#20a866","#b8ffd7",.64,.82,.08,.6,.3,.72];
  if (/(ruby|corundum|red beryl)/.test(lower)) return ["#5b0015","#e21b43","#ffd0d8",.84,.88,.06,.82,.08,.86];
  if (/(sapphire|iolite|kyanite)/.test(lower)) return ["#062d78","#2f71e8","#b8ddff",.84,.9,.05,.86,.06,.86];
  if (/(opal|labradorite|moonstone|sunstone)/.test(lower)) return ["#4f566f","#dfe9ff","#ffffff",.5,.62,.16,.54,.2,.76];
  if (/(quartz|amethyst|citrine|agate|jasper|chalcedony)/.test(lower)) return ["#6b6370","#d4dbe4","#ffffff",.9,.82,.07,.72,.14,.82];
  const colours = gradientColours(style);
  return [colours.first, colours.second, "#ffffff", .8, .72, .08, .72, .1, .86];
}

export function gemIconHtml(name, extraClass = "", mutationIds = []) {
  const safeName = String(name ?? "Gem");
  const style = getGemStyle(safeName);
  const colours = gradientColours(style);
  const material = materialProfileForGem(safeName, style);
  const shape = iconShapeForName(safeName);
  const realism = getSettings().gemRealism ?? "classic";
  const specimen = specimenForGem(safeName);

  // Mutation ids are part of the icon identity. Keep their order stable so
  // the same specimen renders identically on rolls, profiles, leaderboards,
  // showcases, the Gem Index, and Sandbox.
  const normalizedMutations = Array.from(
    new Set(
      Array.isArray(mutationIds)
        ? mutationIds
            .map(String)
            .map((id) => id.trim().toLowerCase())
            .filter(Boolean)
        : []
    )
  );
  const className = [
    "gem-icon",
    `gem-icon--${shape}`,
    ...normalizedMutations.map((id) => `gem-icon--mutation-${id}`),
    normalizedMutations.length ? "gem-icon--mutated" : "",
    extraClass
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <span
      class="${className}"
      data-gem-realism="${escapeAttribute(realism)}"
      style="
        --gem-color:${style.color};
        --gem-color-a:${colours.first};
        --gem-color-b:${colours.second};
        --gem-glow:${style.glow ?? "transparent"};
        --gem-real-a:${material[0]};
        --gem-real-b:${material[1]};
        --gem-real-c:${material[2]};
        --gem-transparency:${material[3]};
        --gem-refraction:${material[4]};
        --gem-roughness:${material[5]};
        --gem-dispersion:${material[6]};
        --gem-inclusion:${material[7]};
        --gem-metalness:${material[8]};
      "
      data-gem-icon="${escapeAttribute(safeName)}"
      data-gem-material="${escapeAttribute(materialMaterialClass(safeName))}"
      data-gem-specimen="${escapeAttribute(specimen)}"
      data-mutation-count="${normalizedMutations.length}"
      data-mutations="${escapeAttribute(normalizedMutations.join(","))}"
      aria-hidden="true"
    >
      <span class="gem-icon__facet gem-icon__facet--a"></span>
      <span class="gem-icon__facet gem-icon__facet--b"></span>
      <span class="gem-icon__core"></span>
      <span class="gem-icon__shine"></span>
      ${normalizedMutations.length ? `<span class="gem-icon__mutation-aura" aria-hidden="true"></span><span class="gem-icon__mutation-ring" aria-hidden="true"></span>` : ""}
    </span>
  `;
}


function specimenForGem(name) {
  const key = String(name ?? "").toLowerCase();
  const exact = {
    quartz: "quartz",
    calcite: "calcite",
    feldspar: "feldspar",
    fluorite: "green-prismatic",
    hematite: "hematite",
    jasper: "jasper",
    amethyst: "amethyst",
    opal: "opal",
    "black opal": "opal",
    "void opal": "opal",
    "martian opal": "opal",
    garnet: "ruby",
    "red beryl": "ruby",
    ruby: "ruby",
    "red diamond": "ruby",
    "black diamond": "obsidian",
    "lunar diamond": "diamond",
    diamond: "diamond",
    sapphire: "sapphire",
    "blue garnet": "sapphire",
    tourmaline: "tourmaline",
    "paraíba tourmaline": "tourmaline",
    peridot: "green-prismatic",
    "meteorite peridot": "green-prismatic",
    emerald: "emerald",
    tsavorite: "emerald",
    demantoid: "emerald",
    "natural moissanite": "diamond",
    "presolar moissanite": "diamond",
    zircon: "diamond",
    topaz: "citrine",
    citrine: "citrine",
    aquamarine: "aquamarine",
    spinel: "ruby",
    painite: "ruby",
    kyawthuite: "citrine",
    tanzanite: "sapphire",
    alexandrite: "emerald",
    benitoite: "sapphire",
    grandidierite: "aquamarine",
    taaffeite: "amethyst",
    musgravite: "hematite",
    demantoid: "emerald",
    jeremejevite: "aquamarine",
    poudretteite: "amethyst",
    serendibite: "hematite",
    pezzottaite: "tourmaline",
    clinohumite: "citrine",
    tugtupite: "tourmaline",
    ringwoodite: "sapphire",
    "pallasite crystal": "hematite",
    obsidian: "obsidian",
    moonstone: "moonstone",
    agate: "none"
  };
  if (exact[key]) return exact[key];
  if (/(uranium|uraninite|betafite|torbernite|autunite)/.test(key)) return "uranium-specimen";
  if (/(pyrite|gold|chalcopyrite)/.test(key)) return "pyrite";
  if (/(obsidian)/.test(key)) return "obsidian";
  if (/(opal)/.test(key)) return "opal";
  if (/(moonstone|labradorite|sunstone)/.test(key)) return "moonstone";
  if (/(ruby|corundum|spinel|painite)/.test(key)) return "ruby";
  if (/(sapphire|benitoite|tanzanite|iolite|kyanite)/.test(key)) return "sapphire";
  if (/(tourmaline|tugtupite|pezzottaite)/.test(key)) return "tourmaline";
  if (/(emerald|beryl|malachite|tsavorite|demantoid)/.test(key)) return "emerald";
  if (/(quartz|crystal|zircon|topaz|moissanite)/.test(key)) return "quartz";
  return "none";
}

function materialMaterialClass(name) {
  const lower = String(name ?? "").toLowerCase();
  if (/(uranium|uraninite|betafite|torbernite|autunite)/.test(lower)) return "radioactive-ore";
  if (/(gold|pyrite|chalcopyrite|brass|silver|platinum|metal)/.test(lower)) return "metallic";
  if (/(opal|labradorite|moonstone|sunstone)/.test(lower)) return "iridescent";
  if (/(hematite|obsidian|agate|jasper)/.test(lower)) return "opaque-mineral";
  return "crystalline";
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
