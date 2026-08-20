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

  return {
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
    font: FALLBACK_FONTS[Math.floor(hash / 7) % FALLBACK_FONTS.length],
    weight: 600,
    spacing: "0.01em",
    glow: "rgba(255,255,255,0.35)"
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

function iconShapeForName(name) {
  const hash = hashString(String(name ?? ""));

  return [
    "diamond",
    "crystal",
    "hex",
    "shard",
    "star",
    "prism"
  ][hash % 6];
}

export function gemIconHtml(name, extraClass = "", mutationIds = []) {
  const safeName = String(name ?? "Gem");
  const style = getGemStyle(safeName);
  const colours = gradientColours(style);
  const shape = iconShapeForName(safeName);

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
      style="
        --gem-color:${style.color};
        --gem-color-a:${colours.first};
        --gem-color-b:${colours.second};
        --gem-glow:${style.glow ?? "transparent"};
      "
      data-gem-icon="${escapeAttribute(safeName)}"
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

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
