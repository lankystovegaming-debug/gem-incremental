// =========================================================
// FACETED GEM CUTS
//
// Inline-SVG drawings for every gem silhouette used by
// gemIconHtml(). Each cut is a set of flat-shaded facets lit
// from the top-left, the way a cut stone reads under a single
// studio light. Facets only carry a shade class (c-tb, c-hi,
// c-lt, c-md, c-dk, c-dp); the actual colours come from CSS
// custom properties on the .gem-icon element, so the same
// geometry serves every gem, realism level and mutation.
//
// No gradients or ids are used, so the markup can be cached,
// cloned and inserted any number of times on one page.
// =========================================================

const LIGHT_X = -0.55;
const LIGHT_Y = -0.83;

const SHADE_STEPS = [
  "c-hi",
  "c-lt",
  "c-md",
  "c-dk",
  "c-dp"
];


function roundPoint(value) {
  return Math.round(value * 10) / 10;
}

function pointsAttr(points) {
  return points
    .map(([x, y]) => `${roundPoint(x)},${roundPoint(y)}`)
    .join(" ");
}

function centroidOf(points) {
  const total = points.reduce(
    (sum, [x, y]) => [sum[0] + x, sum[1] + y],
    [0, 0]
  );

  return [total[0] / points.length, total[1] / points.length];
}

// Brightness of a facet whose outward direction is (dx, dy).
function brightnessFor(dx, dy) {
  const length = Math.hypot(dx, dy) || 1;
  return (dx / length) * LIGHT_X + (dy / length) * LIGHT_Y;
}

function shadeIndexFor(brightness) {
  if (brightness > 0.62) return 0;
  if (brightness > 0.22) return 1;
  if (brightness > -0.2) return 2;
  if (brightness > -0.62) return 3;
  return 4;
}

function shadeFor(brightness, offset = 0) {
  const index = Math.min(
    SHADE_STEPS.length - 1,
    Math.max(0, shadeIndexFor(brightness) + offset)
  );

  return SHADE_STEPS[index];
}

function superellipsePoints(count, centerX, centerY, radiusX, radiusY, exponent, startAngle = 0) {
  const points = [];

  for (let index = 0; index < count; index++) {
    const angle = startAngle + (index / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const power = 2 / exponent;

    points.push([
      centerX + Math.sign(cos) * Math.abs(cos) ** power * radiusX,
      centerY + Math.sign(sin) * Math.abs(sin) ** power * radiusY
    ]);
  }

  return points;
}

// Builds a top-down cut: an outer girdle ring and an inner table with
// the same number of points. Each ring segment is split into two
// triangles shaded one step apart, which gives the crisp "facet play"
// of a real brilliant/step cut instead of one flat bevel.
function ringCut(outer, table) {
  const center = centroidOf(outer);
  const facets = [];

  for (let index = 0; index < outer.length; index++) {
    const next = (index + 1) % outer.length;
    const outerA = outer[index];
    const outerB = outer[next];
    const tableA = table[index];
    const tableB = table[next];
    const middle = centroidOf([outerA, outerB, tableA, tableB]);
    const brightness = brightnessFor(middle[0] - center[0], middle[1] - center[1]);

    facets.push([[outerA, outerB, tableA], shadeFor(brightness)]);
    facets.push([[outerB, tableB, tableA], shadeFor(brightness, index % 2 === 0 ? 1 : -1)]);
  }

  facets.push([table, "c-tb"]);

  return facets;
}

function star(x, y, radius) {
  const inner = radius * 0.22;

  return [
    [x, y - radius],
    [x + inner, y - inner],
    [x + radius, y],
    [x + inner, y + inner],
    [x, y + radius],
    [x - inner, y + inner],
    [x - radius, y],
    [x - inner, y - inner]
  ];
}


// ---------- Hand-drawn cuts ----------

// Side view of a round brilliant: crown on top, pavilion to a point.
function brilliantCut() {
  const top = [
    [28, 14],
    [50, 14],
    [72, 14]
  ];
  const girdle = [
    [5, 37],
    [27, 37],
    [50, 37],
    [73, 37],
    [95, 37]
  ];
  const culet = [50, 94];

  return {
    outline: [top[0], top[2], girdle[4], culet, girdle[0]],
    facets: [
      [[girdle[0], top[0], girdle[1]], "c-lt"],
      [[top[0], girdle[2], girdle[1]], "c-hi"],
      [[top[0], top[1], girdle[2]], "c-tb"],
      [[top[1], top[2], girdle[2]], "c-lt"],
      [[top[2], girdle[3], girdle[2]], "c-md"],
      [[top[2], girdle[4], girdle[3]], "c-dk"],
      [[girdle[0], girdle[1], culet], "c-md"],
      [[girdle[1], girdle[2], culet], "c-lt"],
      [[girdle[2], girdle[3], culet], "c-dk"],
      [[girdle[3], girdle[4], culet], "c-dp"]
    ],
    glint: [
      [30, 19],
      [40, 19],
      [26, 33],
      [18, 33]
    ],
    spark: [76, 16, 9]
  };
}

// Top view of a step-cut (emerald cut) with two concentric steps.
function emeraldCut() {
  const outer = [
    [28, 8],
    [72, 8],
    [86, 22],
    [86, 78],
    [72, 92],
    [28, 92],
    [14, 78],
    [14, 22]
  ];
  const step = [
    [33, 19],
    [67, 19],
    [75, 27],
    [75, 73],
    [67, 81],
    [33, 81],
    [25, 73],
    [25, 27]
  ];
  const table = [
    [37, 29],
    [63, 29],
    [65, 31],
    [65, 69],
    [63, 71],
    [37, 71],
    [35, 69],
    [35, 31]
  ];

  const facets = [];
  const outerRing = ringCut(outer, step).filter(([, shade]) => shade !== "c-tb");
  const innerRing = ringCut(step, table);

  facets.push(...outerRing, ...innerRing);

  return {
    outline: outer,
    facets,
    glint: [
      [38, 32],
      [48, 32],
      [40, 52],
      [37, 52]
    ],
    spark: [80, 16, 8]
  };
}

function cushionCut() {
  const outer = superellipsePoints(16, 50, 50, 43, 43, 3.4, Math.PI / 16);
  const table = superellipsePoints(16, 50, 49, 21, 21, 2.6, Math.PI / 16);

  return {
    outline: outer,
    facets: ringCut(outer, table),
    glint: [
      [36, 34],
      [46, 31],
      [40, 44],
      [34, 44]
    ],
    spark: [80, 18, 8]
  };
}

function ovalCut() {
  const outer = superellipsePoints(16, 50, 50, 35, 45, 2, Math.PI / 16);
  const table = superellipsePoints(16, 50, 48, 16, 23, 2, Math.PI / 16);

  return {
    outline: outer,
    facets: ringCut(outer, table),
    glint: [
      [40, 31],
      [48, 28],
      [44, 42],
      [39, 43]
    ],
    spark: [74, 14, 8]
  };
}

function rhombusCut() {
  const outer = [
    [50, 4],
    [70, 27],
    [91, 50],
    [70, 73],
    [50, 96],
    [30, 73],
    [9, 50],
    [30, 27]
  ];
  const table = [
    [50, 30],
    [59, 40],
    [68, 50],
    [59, 60],
    [50, 70],
    [41, 60],
    [32, 50],
    [41, 40]
  ];

  return {
    outline: outer,
    facets: ringCut(outer, table),
    glint: [
      [42, 36],
      [48, 30],
      [44, 46],
      [38, 46]
    ],
    spark: [72, 22, 8]
  };
}

// Rough, uncut specimen. Shape is fixed; each gem gets its own
// rotation so a shelf of ores doesn't look stamped out.
function freeformCut() {
  const outer = [
    [22, 12],
    [52, 5],
    [80, 16],
    [95, 44],
    [86, 76],
    [58, 95],
    [26, 89],
    [7, 62],
    [9, 32]
  ];
  const table = outer.map(([x, y], index) => [
    44 + (x - 50) * 0.42 + (index % 2 === 0 ? 2 : -2),
    44 + (y - 50) * 0.4 + (index % 3 === 0 ? -2 : 1)
  ]);

  return {
    outline: outer,
    facets: ringCut(outer, table),
    glint: [
      [30, 22],
      [42, 18],
      [34, 32],
      [26, 32]
    ],
    spark: [82, 20, 7]
  };
}

// A hexagonal crystal column with a pointed termination, plus two
// smaller crystals behind it: a natural cluster.
function crystalCut() {
  const back = [
    [[15, 50], [23, 38], [31, 50], [31, 88], [15, 88]],
    [[69, 44], [79, 30], [88, 44], [88, 86], [69, 86]]
  ];
  const facets = [];

  for (const [baseLeft, tip, baseRight, bottomRight, bottomLeft] of back) {
    const ridgeTop = [tip[0], baseLeft[1] + 4];
    const ridgeBottom = [tip[0], bottomLeft[1]];

    facets.push([[baseLeft, tip, ridgeTop], "c-lt"]);
    facets.push([[tip, baseRight, ridgeTop], "c-md"]);
    facets.push([[baseLeft, ridgeTop, ridgeBottom, bottomLeft], "c-md"]);
    facets.push([[ridgeTop, baseRight, bottomRight, ridgeBottom], "c-dp"]);
  }

  const left = [30, 32];
  const tip = [50, 5];
  const right = [70, 32];
  const ridgeTop = [52, 41];
  const bottomLeft = [30, 92];
  const bottomRidge = [52, 97];
  const bottomRight = [70, 92];

  facets.push([[left, tip, ridgeTop], "c-hi"]);
  facets.push([[tip, right, ridgeTop], "c-tb"]);
  facets.push([[left, ridgeTop, bottomRidge, bottomLeft], "c-lt"]);
  facets.push([[ridgeTop, right, bottomRight, bottomRidge], "c-dk"]);

  return {
    outline: [left, tip, right, bottomRight, bottomRidge, bottomLeft],
    facets,
    glint: [
      [34, 42],
      [40, 45],
      [40, 80],
      [34, 77]
    ],
    spark: [62, 12, 8]
  };
}

// A leaning prism — same crystal habit, knocked over.
function prismCut() {
  const cut = crystalCut();
  cut.transform = "rotate(24 50 54) translate(0 -2) scale(0.94)";
  return cut;
}

// An octahedron (fluorite's classic habit) in three-quarter view.
function octahedronCut() {
  const top = [50, 4];
  const bottom = [50, 96];
  const left = [8, 47];
  const right = [92, 47];
  const front = [42, 58];

  return {
    outline: [top, right, bottom, left],
    facets: [
      [[top, left, front], "c-hi"],
      [[top, front, right], "c-md"],
      [[left, bottom, front], "c-dk"],
      [[front, bottom, right], "c-dp"],
      [[top, [60, 36], right], "c-lt"]
    ],
    glint: [
      [38, 22],
      [44, 18],
      [30, 44],
      [24, 44]
    ],
    spark: [76, 26, 8]
  };
}

// A jagged, sharp-edged shard.
function shardCut() {
  const outline = [
    [42, 3],
    [68, 28],
    [74, 60],
    [60, 97],
    [34, 88],
    [24, 52],
    [30, 26]
  ];
  const ridge = [48, 58];

  return {
    outline,
    facets: [
      [[outline[0], outline[6], ridge], "c-hi"],
      [[outline[0], ridge, outline[1]], "c-lt"],
      [[outline[1], ridge, outline[2]], "c-md"],
      [[outline[2], ridge, outline[3]], "c-dk"],
      [[outline[3], ridge, outline[4]], "c-dp"],
      [[outline[4], ridge, outline[5]], "c-dk"],
      [[outline[5], ridge, outline[6]], "c-lt"]
    ],
    glint: [
      [38, 18],
      [42, 14],
      [36, 40],
      [32, 40]
    ],
    spark: [70, 24, 8]
  };
}


// ---------- Cabochon (domed, uncut) ----------

function cabochonSvg() {
  return `
    <ellipse class="c-dp" cx="50" cy="52" rx="42" ry="38"></ellipse>
    <ellipse class="c-dk" cx="48" cy="50" rx="39" ry="35"></ellipse>
    <ellipse class="c-md" cx="46" cy="47" rx="33" ry="29"></ellipse>
    <ellipse class="c-lt" cx="42" cy="42" rx="22" ry="18" opacity="0.85"></ellipse>
    <ellipse class="c-hi" cx="40" cy="38" rx="12" ry="9" opacity="0.7"></ellipse>
    <g class="cut-fire">
      <polygon points="28,48 36,42 38,52"></polygon>
      <polygon points="56,30 66,34 60,40"></polygon>
      <polygon points="58,58 70,54 66,66"></polygon>
      <polygon points="40,64 50,60 48,72"></polygon>
      <polygon points="46,40 54,44 48,50"></polygon>
    </g>
    <ellipse class="cut-glint" cx="36" cy="30" rx="11" ry="5.5" transform="rotate(-24 36 30)"></ellipse>
    <ellipse class="cut-rim" cx="50" cy="52" rx="42" ry="38"></ellipse>
    <polygon class="cut-spark" points="${pointsAttr(star(78, 20, 8))}"></polygon>
  `;
}


const CUT_BUILDERS = {
  brilliant: brilliantCut,
  "emerald-cut": emeraldCut,
  cushion: cushionCut,
  oval: ovalCut,
  diamond: rhombusCut,
  freeform: freeformCut,
  crystal: crystalCut,
  prism: prismCut,
  hex: octahedronCut,
  shard: shardCut,
  star: rhombusCut
};

const svgBodyCache = new Map();

function cutBody(shape) {
  if (svgBodyCache.has(shape)) {
    return svgBodyCache.get(shape);
  }

  let body;

  if (shape === "cabochon") {
    body = cabochonSvg();
  } else {
    const build = CUT_BUILDERS[shape] ?? cushionCut;
    const cut = build();
    const facets = cut.facets
      .map(([points, shade]) => `<polygon class="cut-facet ${shade}" points="${pointsAttr(points)}"></polygon>`)
      .join("");
    const [sparkX, sparkY, sparkRadius] = cut.spark;
    const inner = `
      ${facets}
      <polygon class="cut-glint" points="${pointsAttr(cut.glint)}"></polygon>
      <polygon class="cut-rim" points="${pointsAttr(cut.outline)}"></polygon>
    `;
    const spark = `<polygon class="cut-spark" points="${pointsAttr(star(sparkX, sparkY, sparkRadius))}"></polygon>`;

    body = cut.transform
      ? `<g transform="${cut.transform}">${inner}</g>${spark}`
      : `${inner}${spark}`;
  }

  svgBodyCache.set(shape, body);
  return body;
}

// `seed` gives rough specimens a stable per-gem tilt.
export function gemCutSvg(shape, seed = 0) {
  const tilt = shape === "freeform" ? ((seed % 7) - 3) * 8 : 0;
  const body = cutBody(shape);
  const wrapped = tilt ? `<g transform="rotate(${tilt} 50 50)">${body}</g>` : body;

  return `<svg class="gem-icon__cut" viewBox="0 0 100 100" focusable="false" aria-hidden="true">${wrapped}</svg>`;
}
