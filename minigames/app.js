import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { gemIconHtml } from "../src/ui/gemStyle.js";
import { catalog, tileNames, bagTable, strikeConfig } from "./catalog.js";
import {
  setText,
  setHtml,
  patchCells,
  createArcadeRenderer,
  createBladeTrail,
} from "./rendering.js";
import { getSettings } from "../src/ui/settings.js";
import { pieceCells } from "./stack.js";
const hubPath = new URL("./", import.meta.url).pathname;
const gamePath = (id) => `${hubPath}${id}/`;
mountShell({
  page: "minigames",
  base: new URL("../", import.meta.url).pathname,
});
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const iconCache = new Map();
function icon(name) {
  const key = `${getSettings().gemRealism}:${name}`;
  if (!iconCache.has(key)) {
    if (iconCache.size >= 256) iconCache.clear();
    iconCache.set(key, gemIconHtml(name));
  }
  return iconCache.get(key);
}
// Minesweeper cell face: colour the adjacent-deposit counts the classic way
// (1 blue, 2 green, 3 red…) so the board reads at a glance.
function mineText(v) {
  return typeof v === "number" && v > 0
    ? `<span class="mg-mine-n mg-mine-n-${Math.min(8, v)}">${v}</span>`
    : (v ?? "");
}

let frameTimer = 0,
  arcadeRenderer = null,
  arcadeArena = null,
  bladeTrail = null,
  // Perfect Strike: where to hold the marker after a strike, and until when.
  strikeFreeze = null;

// The marker position that corresponds to a strike pressed `elapsed` ms into
// the current sweep — used to freeze the needle exactly where you stopped it.
function strikeNeedleX(strikeIndex, elapsed) {
  const period = strikeConfig(strikeIndex).period;
  return Math.abs(((elapsed / period) % 2) - 1);
}
const animatedGames = new Set(["gem-catcher", "ore-slicer", "perfect-strike"]);
const timedGames = new Set(["mine-sweeper", "price-is-right", "gem-stack"]);
function stopFrames() {
  cancelAnimationFrame(raf);
  clearTimeout(frameTimer);
  raf = 0;
  frameTimer = 0;
}
function scheduleFrame() {
  stopFrames();
  if (!run || run.state.done) return;
  if (run.game === "mine-sweeper" && !run.state.first) return;
  if (run.game === "price-is-right" && run.state.awaitingNext) return;
  if (animatedGames.has(run.game) && !document.hidden)
    raf = requestAnimationFrame(frame);
  else if (animatedGames.has(run.game) || timedGames.has(run.game))
    frameTimer = setTimeout(frame, document.hidden ? 250 : 100);
}
let flagMode = false,
  lastDraw = 0;
let authGeneration = 0,
  game = null,
  run = null,
  busy = false,
  generation = 0,
  offset = 0,
  active = [],
  wallet = null,
  raf = 0,
  inputs = [],
  swipe = 0,
  drag = false,
  cursor = 0.5,
  lastSample = 0,
  lastFlush = 0,
  keys = new Set();
const rules = {
  "gem-catcher":
    "90 seconds · 3 lives. Move with A/D, arrows, or drag. Catch gems for 10–350 points. Rocks cost a life and reset your combo. Missing gems is harmless. Combos: 10 ×1.25, 25 ×1.5, 50 ×2, 100 ×3.",
  "ore-slicer":
    "60 seconds · 3 lives. Drag or swipe through gems. Stone is harmless; TNT costs a life and cancels the whole swipe. Multi-gem swipes earn ×1.25 / ×1.5 / ×2 / ×3 for 2 / 3 / 4 / 5+ gems. Accuracy modifies the final score.",
  "gem-2048":
    "Arrow keys or swipe to merge equal tiles. New tiles: 90% Quartz, 10% Malachite. Keep going as high as you can. Highest tile wins; score breaks ties.",
  "mine-sweeper":
    "Numbers count original MT deposits in the surrounding eight cells. Your first reveal and its neighbors are safe. Revealing MT loses that token, but play continues. Reveal every non-MT tile to finish. Flags are only deduction aids. Easy is practice only.",
  "gem-stack":
    "Arrows move, Up rotates, Down soft-drops, Space hard-drops, C holds. Seven-bag pieces, next three, one Hold per piece. Every ten lines increases level. Single 100, Double 300, Triple 500, Quad 800 × level; consecutive clears add combo points.",
  prospector:
    "Twenty digs, six deposits. HOT: within 1 tile, WARM: 2, FAINT: 3, NOTHING: 4+. Clues remember the still-hidden deposits when dug. Finds refund one dig. Unused digs add 100 points each.",
  "explosive-mining":
    "Choose five blast centers. Each bomb hits a 3×3 area. Reinforced rock takes two hits. Crates chain their own blasts. Extract as much of the visible gem budget as possible.",
  "gem-tower":
    "Each dangerous floor has three safe doors and one collapse: 75% survival. Every fifth floor is guaranteed safe. Floor x adds x MT. Collect after a safe floor, or risk everything to continue. Closing does not collect.",
  "crystal-bags":
    "Five rounds, three distinct bags each round. Every possible payout and probability is shown. Previous winnings cannot be lost. A ticket covers all five rounds. No rerolls.",
  "price-is-right":
    "Ten fictional specimens, fifteen seconds each. Guess the final value using only the gem, weight, and mutations. Accuracy² × 1,000 points per question. No inventory gems are used.",
  "perfect-strike":
    "Ten strikes. Stop the marker in the center. MISS 0 · WEAK 100 · GOOD 300 · GREAT 600 · PERFECT 1,000. Consecutive Perfects add 100, 200, 300… Strike ten doubles base points. No randomness or boosts.",
};

// Step-by-step "How to Play" for each game. Rendered as a collapsible panel
// on the game page; `rules` above stays as the one-line fallback.
const howTo = {
  "gem-catcher": {
    goal: "Catch falling gems for points before your three lives run out.",
    meta: "90 seconds · 3 lives",
    steps: [
      "Move the cart with A/D, the arrow keys, or by dragging it.",
      "Catch gems to score 10–350 points each. Missing a gem is harmless.",
      "Avoid rocks — each one costs a life and resets your combo.",
      "Chain catches to build a combo: ×1.25 at 10, ×1.5 at 25, ×2 at 50, ×3 at 100.",
    ],
  },
  "ore-slicer": {
    goal: "Swipe through gems to slice them, keeping clear of the TNT.",
    meta: "60 seconds · 3 lives",
    steps: [
      "Drag or swipe across the arena to cut through gems.",
      "Stone is harmless, but TNT costs a life and cancels that whole swipe.",
      "Slice several gems in one swipe for a multiplier: ×1.25 / ×1.5 / ×2 / ×3 for 2 / 3 / 4 / 5+ gems.",
      "Your accuracy adjusts the final score.",
    ],
  },
  "gem-2048": {
    goal: "Merge matching gems to climb from Quartz to the Glitched Gem.",
    steps: [
      "Use the arrow keys or swipe to slide every tile one direction.",
      "Two equal gems that collide merge into the next gem up.",
      "After each move a new tile appears: 90% Quartz, 10% Malachite.",
      "Keep merging as high as you can — it ends when no move is left. Highest tile wins; score breaks ties.",
    ],
  },
  "mine-sweeper": {
    goal: "Reveal every safe tile without disturbing the hidden MT deposits.",
    meta: "9×9 to 20×20 by difficulty · Easy is practice only",
    steps: [
      "A number counts the MT deposits in the eight surrounding cells.",
      "Your first reveal and its neighbours are always safe.",
      "Revealing an MT deposit loses that token, but play continues.",
      "Clear every non-MT tile to finish. Flags are only deduction aids.",
    ],
  },
  "gem-stack": {
    goal: "Stack the seven shapes, clear lines, and climb the levels.",
    steps: [
      "Arrows move, Up rotates, Down soft-drops, Space hard-drops, C holds a piece.",
      "Pieces come from a shuffled seven-bag; the next three and one Hold are shown.",
      "Every ten lines raises the level and your score multiplier.",
      "Single 100, Double 300, Triple 500, Quad 800 × level; back-to-back clears add combo points.",
    ],
  },
  prospector: {
    goal: "Find all six buried deposits within twenty digs using temperature clues.",
    meta: "20 digs · 6 deposits",
    steps: [
      "Dig a cell to get a clue about the nearest still-hidden deposit.",
      "HOT = within 1 tile, WARM = 2, FAINT = 3, NOTHING = 4 or more.",
      "Each find refunds one dig.",
      "Every unused dig is worth 100 points, so finish efficiently.",
    ],
  },
  "explosive-mining": {
    goal: "Detonate five bombs to extract as much of the visible gem value as you can.",
    meta: "12×12 field · 5 bombs",
    steps: [
      "Click a cell to drop a bomb there — it blasts the 3×3 area around it.",
      "Gems caught in a blast are extracted and added to your score.",
      "Plain rock ▪ clears in one hit; reinforced rock ▣ takes two (▧ means one hit left).",
      "Crates 🧨 caught in a blast detonate too, chaining their own 3×3 blast — line crates up for big chains.",
      "Spend all five bombs to hit gem clusters and set off crate chains. Extraction % breaks ties on the leaderboard.",
    ],
  },
  "gem-tower": {
    goal: "Climb as high as you can, banking MT before the tower collapses.",
    steps: [
      "Each dangerous floor has three safe doors and one collapse — a 75% chance to survive.",
      "Every fifth floor is guaranteed safe.",
      "Clearing floor X adds X MT to your pending pile.",
      "Collect after any safe floor to bank the MT, or push on and risk it all. Closing the page does not collect.",
    ],
  },
  "crystal-bags": {
    goal: "Open one bag per round for five rounds; every outcome and its odds are shown up front.",
    meta: "5 rounds · one ticket covers all five · no rerolls",
    steps: [
      "Each round offers three distinct bags with fully transparent payouts and probabilities.",
      "Pick the bag whose risk profile you prefer.",
      "Winnings you have already banked can never be lost.",
      "This game tracks lifetime statistics rather than a high-score leaderboard.",
    ],
  },
  "price-is-right": {
    goal: "Guess the value of ten fictional specimens as closely as you can.",
    meta: "10 specimens · 15 seconds each",
    steps: [
      "You are shown a gem, its weight, and its mutations — no inventory gems are used.",
      "Type your best estimate of its final value and submit before time runs out.",
      "Each question scores accuracy² × 1,000 points; answering time breaks ties.",
    ],
  },
  "perfect-strike": {
    goal: "Stop the moving marker in the centre, ten strikes in a row.",
    meta: "10 strikes",
    steps: [
      "Press Strike to stop the marker; the closer to the centre, the better.",
      "MISS 0 · WEAK 100 · GOOD 300 · GREAT 600 · PERFECT 1,000.",
      "Consecutive Perfects add a growing bonus: 100, 200, 300…",
      "The tenth strike doubles its base points. No randomness or boosts.",
    ],
  },
};

function howToHtml(id) {
  const h = howTo[id];
  if (!h) return `<p class="mg-rules">${rules[id] || ""}</p>`;
  return (
    `<details class="mg-howto" open><summary>How to Play</summary>` +
    `<p class="mg-howto__goal">${h.goal}</p>` +
    (h.meta ? `<p class="mg-howto__meta">${h.meta}</p>` : "") +
    `<ol class="mg-howto__steps">${h.steps.map((s) => `<li>${s}</li>`).join("")}</ol>` +
    `</details>`
  );
}
async function api(action, extra = {}) {
  const account = authGeneration;
  const { data, error } = await supabase.functions.invoke("minigames", {
    body: { action, ...extra },
  });
  if (account !== authGeneration)
    throw new Error("Account changed. Reload your run.");
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context)
      try {
        message = (await error.context.json()).error;
      } catch {}
    throw new Error(
      message ||
        "Minigames could not load. Your saved run will resume when the connection returns.",
    );
  }
  offset = data.server_now - Date.now();
  wallet = data.wallet;
  renderWallet();
  return data;
}
function renderWallet() {
  if (wallet)
    setHtml(
      $("wallet"),
      `<span>${esc(wallet.mt)} MT</span><span>${wallet.tickets}/5 tickets</span><span>${wallet.tickets === 5 ? "Tickets full" : `Next ticket ${new Date(Date.parse(wallet.regen_at) + 3600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>`,
    );
}
function route() {
  arcadeRenderer?.destroy();
  bladeTrail?.destroy();
  arcadeRenderer = null;
  arcadeArena = null;
  bladeTrail = null;
  strikeFreeze = null;
  stopFrames();
  inputs = [];
  run = null;
  const pathId = location.pathname.startsWith(hubPath)
    ? location.pathname.slice(hubPath.length).split("/")[0]
    : null;
  const id =
    (pathId === "index.html" ? null : pathId) ||
    new URLSearchParams(location.search).get("game");
  game = catalog.find((g) => g.id === id && !g.daily);
  if (!game) {
    $("content").innerHTML =
      `<div class="mg-grid">${catalog.map((g, i) => `<a class="mg-card" href="${gamePath(g.id)}"><div class="mg-art">${icon(tileNames[i])}</div><h2>${g.name}</h2><p>${g.description}</p><div class="mg-tags"><span class="mg-tag ${g.daily ? "mg-tag--daily" : g.mt ? "mg-tag--mt" : ""}">${g.daily ? "Daily" : g.mt ? "MT ON · 1 ticket rewarded" : "MT OFF · Unlimited"}</span><span class="mg-tag">Available</span></div><small>${g.leaderboard}</small></a>`).join("")}</div>`;
    return;
  }
  document.title = `${game.name} · Minigames · Gem Incremental`;
  $("content").innerHTML =
    `<p><a href="${hubPath}">← All minigames</a></p><div class="mg-layout"><section class="mg-panel"><h2>${game.name}</h2>${howToHtml(game.id)}<div id="start" class="mg-controls">${game.id === "mine-sweeper" ? '<label>Difficulty <select id="difficulty"><option value="easy">Easy · 9×9 · 5 MT · Practice</option><option value="medium" selected>Medium · 12×12 · 12 MT</option><option value="hard">Hard · 16×16 · 25 MT</option><option value="expert">Expert · 20×20 · 40 MT</option></select></label>' : ""}<button class="btn btn--primary" data-start="practice">${game.mt ? "Play Practice · 0 MT" : "Play"}</button>${game.mt ? '<button class="btn" data-start="rewarded">Play Rewarded · 1 ticket</button>' : ""}<button class="btn" id="resume">Check saved runs</button></div><div id="play"></div></section><aside class="mg-panel"><h2>${game.id === "crystal-bags" ? "Your statistics" : "Leaderboard"}</h2><small>${game.leaderboard}</small><div id="board">Loading…</div></aside></div>`;
  $("start")
    .querySelectorAll("[data-start]")
    .forEach((b) => (b.onclick = () => start(b.dataset.start)));
  $("resume").onclick = load;
  load();
}
async function load() {
  let g = ++generation;
  try {
    const d = await api("state");
    if (g !== generation) return;
    active = d.runs;
    run =
      active.find((r) => r.game === game?.id && r.mode === "rewarded") ||
      active.find((r) => r.game === game?.id) ||
      null;
    if (run) {
      swipe = run.state.swipeSerial || 0;
      render();
    }
    if (game) {
      const b = await api("board", { game: game.id });
      if (g === generation) board(b);
    }
  } catch (e) {
    status(e.message);
  }
}
function status(message) {
  $("status").textContent = message;
}
function board(d) {
  if (!$("board")) return;
  if (game.id === "crystal-bags") {
    const html = `<p>${d.stats?.games || 0} completed games</p><p>Largest outcome: ${d.stats?.largest || 0} MT</p><p>Lifetime rewarded MT: ${esc(d.stats?.lifetime_mt || 0)}</p>`;
    setHtml($("board"), html);
    return;
  }
  const html =
    `<p>${d.board?.own_rank ? `Your rank: #${d.board.own_rank}` : "Finish a run to set your record."}</p>` +
    (d.board?.entries || [])
      .map(
        (e) =>
          `<div class="mg-board-entry"><span>#${e.rank} ${esc(e.username)}${e.is_you ? " (you)" : ""}</span><strong>${game.id === "mine-sweeper" ? `${(-e.score / 1000).toFixed(3)}s` : Number(e.score).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></div>`,
      )
      .join("");
  setHtml($("board"), html);
}
async function start(mode) {
  if (busy) return;
  busy = true;
  status("Starting…");
  try {
    const d = await api("start", {
      game: game.id,
      mode,
      options: { difficulty: $("difficulty")?.value },
    });
    if (d.run.game !== game.id) {
      status("Resume your active rewarded run before starting another.");
      $("play").innerHTML =
        `<a class="btn" href="${gamePath(d.run.game)}">Resume ${esc(d.run.game)}</a>`;
      return;
    }
    inputs = [];
    swipe = 0;
    run = d.run;
    render();
    status("");
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
  }
}
async function act(input) {
  if (busy || !run || run.state.done) return;
  busy = true;
  const old = run;
  try {
    const d = await api("act", {
      game: game.id,
      run_id: run.id,
      version: run.version,
      input,
    });
    if (old.id !== run?.id) return;
    run = d.run;
    board(d);
    if (["gem-catcher", "ore-slicer"].includes(game.id) && !run.state.done) {
      document.querySelector(".mg-stat").textContent =
        `Score ${Math.round(run.state.score).toLocaleString()}`;
    } else render();
    status("");
  } catch (e) {
    status(e.message);
  } finally {
    busy = false;
  }
}
const button = (text, type, extra = "") =>
  `<button class="btn" data-action="${type}" ${extra}>${text}</button>`;
function updateBoard(s) {
  const boardNode = $("play")?.querySelector(".mg-board");
  if (!boardNode || boardNode.dataset.run !== run.id) return false;
  let cells, summary;
  if (s.game === "mine-sweeper") {
    const flags = new Set(s.flags);
    cells = s.cells.map((v, i) => ({
      text: flags.has(i) ? "⚑" : mineText(v),
      open: v !== null,
    }));
    summary = `${s.mines - s.lost}/${s.mines} MT preserved · ${s.flags.length} flags`;
  } else if (s.game === "gem-2048") {
    cells = s.board.map((v) => ({
      text: v
        ? `${icon(tileNames[Math.min(19, Math.log2(v) - 1)])}${v}<small>${esc(tileNames[Math.log2(v) - 1] || `Glitched Gem +${Math.log2(v) - 20}`)}</small>`
        : "",
      open: !!v,
    }));
  } else if (s.game === "prospector") {
    const found = new Map(
      s.discoveries
        .filter((d) => d.position !== null)
        .map((d) => [d.position, d]),
    );
    cells = Array.from({ length: 100 }, (_, i) => ({
      text: found.has(i) ? icon(found.get(i).name) : (s.clues[i] ?? ""),
      open: found.has(i) || i in s.clues,
    }));
    summary = `${s.digs} digs left · ${s.found.length}/6 deposits`;
  } else if (s.game === "explosive-mining") {
    cells = s.board.map((c) => ({
      text:
        c.type === "gem"
          ? icon(c.name)
          : c.type === "reinforced"
            ? c.hp === 2
              ? "▣"
              : "▧"
            : c.type === "crate"
              ? "🧨"
              : c.type === "rock"
                ? "▪"
                : "",
      open: c.type === "empty",
    }));
    summary = `${s.bombs} bombs · ${s.score}/${s.total} extracted · Largest chain ${s.largest}`;
  } else if (s.game === "gem-stack") {
    const values = [...s.board];
    for (const [x, y] of pieceCells(s.piece))
      if (x >= 0 && x < 10 && y >= 0 && y < 20)
        values[y * 10 + x] = s.piece.type + 1;
    const art = icon(tileNames[Math.min(19, Math.floor(s.lines / 10))]);
    cells = values.map((v) => ({ text: v ? art : "", tile: v }));
    summary = `Level ${1 + Math.floor(s.lines / 10)} · ${s.lines} lines · Hold ${s.hold === null ? "—" : ["I", "O", "T", "S", "Z", "J", "L"][s.hold]} · Next ${s.queue.map((i) => ["I", "O", "T", "S", "Z", "J", "L"][i]).join(" ")}`;
  } else return false;
  patchCells(boardNode, cells);
  setText(
    $("play").querySelector(".mg-stat"),
    `Score ${Math.round(s.score).toLocaleString()}`,
  );
  if (summary)
    setText($("play").querySelector("[data-board-summary]"), summary);
  if (!raf && !frameTimer) scheduleFrame();
  return true;
}

function render() {
  if (!run) return;
  const s = run.state;
  if (s.done) {
    arcadeRenderer?.destroy();
    bladeTrail?.destroy();
    arcadeRenderer = null;
    arcadeArena = null;
    bladeTrail = null;
  }
  if (!s.done && updateBoard(s)) return;
  $("start").hidden = !s.done;
  let html = `<div class="mg-tags"><span class="mg-tag">${run.mode === "practice" ? "Practice · 0 MT" : "Rewarded · ticket used"}</span></div><p class="mg-stat">${game.id === "gem-tower" ? `Floor ${s.floor} · Pending ${s.pending} MT` : game.id === "crystal-bags" ? `Round ${Math.min(5, s.round + 1)}/5 · ${s.pending} MT` : `Score ${Math.round(s.score).toLocaleString()}`}</p>`;
  if (s.done) {
    html += `<div class="mg-result"><h3>${s.abandoned ? "Run ended" : s.collapsed ? "The tower collapsed" : "Run complete"}</h3><p>${s.mode === "rewarded" ? `${s.pending || 0} MT credited.` : "Practice awards 0 MT."}</p>${s.extraction != null ? `<p>Extraction ${(s.extraction * 100).toFixed(1)}% · ${s.gems} gems · Largest chain ${s.largest}</p>` : ""}${s.accuracy != null ? `<p>Accuracy ${(s.accuracy * 100).toFixed(1)}%</p>` : ""}${s.elapsedMs != null ? `<p>${(s.elapsedMs / 1000).toFixed(3)} seconds · ${s.pending}/${s.mines} MT preserved</p>` : ""}${s.game === "gem-tower" ? `<p>Highest floor cleared: ${s.floor}</p>` : ""}</div>`;
  }
  if (s.game === "mine-sweeper") {
    html +=
      `<p id="mine-timer"></p><p data-board-summary>${s.mines - s.lost}/${s.mines} MT preserved · ${s.flags.length} flags</p><label><input id="flag-mode" type="checkbox" ${flagMode ? "checked" : ""}> Flag mode (or right-click)</label>` +
      grid(
        s.n,
        s.cells.map((v, i) => ({
          text: s.flags.includes(i) ? "⚑" : mineText(v),
          open: v !== null,
        })),
      );
  }
  if (s.game === "gem-2048")
    html +=
      grid(
        4,
        s.board.map((v) => ({
          text: v
            ? `${icon(tileNames[Math.min(19, Math.log2(v) - 1)])}${v}<small>${esc(tileNames[Math.log2(v) - 1] || `Glitched Gem +${Math.log2(v) - 20}`)}</small>`
            : "",
          open: !!v,
        })),
        "mg-2048",
      ) +
      `<div class="mg-controls">${["left", "up", "down", "right"].map((d) => button({ left: "←", up: "↑", down: "↓", right: "→" }[d], "move", `data-direction="${d}"`)).join("")}</div>`;
  if (s.game === "prospector") {
    html +=
      `<p data-board-summary>${s.digs} digs left · ${s.found.length}/6 deposits</p><div class="mg-tags">${s.discoveries.map((d) => `<span class="mg-tag">${icon(d.name)} ${d.name} · ${d.value}</span>`).join("")}</div>` +
      grid(
        10,
        Array.from({ length: 100 }, (_, i) => {
          let d = s.discoveries.find((d) => d.position === i);
          return {
            text: d ? icon(d.name) : (s.clues[i] ?? ""),
            open: !!d || i in s.clues,
          };
        }),
      );
  }
  if (s.game === "explosive-mining")
    html +=
      `<p data-board-summary>${s.bombs} bombs · ${s.score}/${s.total} extracted · Largest chain ${s.largest}</p>` +
      grid(
        12,
        s.board.map((c) => ({
          text:
            c.type === "gem"
              ? icon(c.name)
              : c.type === "reinforced"
                ? c.hp === 2
                  ? "▣"
                  : "▧"
                : c.type === "crate"
                  ? "🧨"
                  : c.type === "rock"
                    ? "▪"
                    : "",
          open: c.type === "empty",
        })),
      );
  if (s.game === "gem-tower" && !s.done) {
    let next = s.floor + 1;
    html += `<div class="mg-tower">${next % 5 === 0 ? "✦" : "♜"}</div><p>Next: Floor ${next} · +${next} MT · ${next % 5 === 0 ? "Guaranteed safe" : "75% safe"}</p><div class="mg-controls">${next % 5 === 0 ? button("Clear safe floor", "door") : [0, 1, 2, 3].map((i) => button(`Door ${i + 1}`, "door", `data-door="${i}"`)).join("")}${s.floor ? button(`Collect ${s.pending} MT & Leave`, "collect") : ""}</div>`;
  }
  if (s.game === "crystal-bags") {
    html += `<p>${s.choices.map((c) => `R${c.round}: ${esc(c.bag)} +${c.outcome}`).join(" · ")}</p>`;
    if (!s.done)
      html += `<div class="mg-bags">${s.offers
        .map(
          (name) =>
            `<button class="mg-bag" data-action="bag" data-bag="${name}"><strong>${name}</strong>${bagTable(
              name,
              s.round,
            )
              .map(([p, v]) => `<span>${p}% → ${v} MT</span>`)
              .join("")}</button>`,
        )
        .join("")}</div>`;
  }
  if (s.game === "perfect-strike" && !s.done)
    html += `<p>Strike ${s.strike + 1}/10 ${s.strike === 9 ? "· FINAL STRIKE · ×2" : ""} · Perfect streak ${s.streak}</p><p>${s.rating || "Find the center"}</p><div class="mg-strike" id="strike-bar"><div class="mg-needle" id="needle"></div></div><div class="mg-controls">${button("Strike!", "strike")}</div><small>MISS · WEAK · GOOD · GREAT · PERFECT · GREAT · GOOD · WEAK · MISS</small>`;
  if (s.game === "price-is-right") {
    let previous = s.answers.at(-1);
    if (previous)
      html += `<p>Actual final value: $${previous.actual.toLocaleString(undefined, { maximumFractionDigits: 2 })} · Accuracy ${(previous.accuracy * 100).toFixed(1)}%</p>`;
    if (!s.done && s.awaitingNext)
      html += `<div class="mg-controls">${button("Next question", "next")}</div>`;
    if (!s.done && !s.awaitingNext)
      html += `<h3>Question ${s.question + 1}/10</h3><div class="mg-tower">${icon(s.specimen.name)}</div><h3>${esc(s.specimen.name)}</h3><p>${s.specimen.weight.toLocaleString()} g · ${esc(s.specimen.mutations.join(" + ") || "No Mutation")}</p><p id="question-time"></p><form id="guess-form" class="mg-controls"><label>Your guess $ <input id="guess" type="number" min="0" step="any" required inputmode="decimal"></label><button class="btn btn--primary">Submit guess</button></form>`;
  }
  if (s.game === "gem-stack") {
    let board = [...s.board];
    if (!s.done)
      for (let [x, y] of pieceCells(s.piece))
        if (x >= 0 && x < 10 && y >= 0 && y < 20)
          board[y * 10 + x] = s.piece.type + 1;
    html += `<p data-board-summary>Level ${1 + Math.floor(s.lines / 10)} · ${s.lines} lines · Hold ${s.hold === null ? "—" : ["I", "O", "T", "S", "Z", "J", "L"][s.hold]} · Next ${s.queue.map((i) => ["I", "O", "T", "S", "Z", "J", "L"][i]).join(" ")}</p><div class="mg-board mg-stack" style="grid-template-columns:repeat(10,1fr)">${board.map((v) => `<div class="mg-cell ${v ? "filled" : ""}" style="--tile:${v}">${v ? icon(tileNames[Math.min(19, Math.floor(s.lines / 10))]) : ""}</div>`).join("")}</div><div class="mg-controls">${[
      ["←", "left"],
      ["↻", "rotate"],
      ["→", "right"],
      ["↓", "soft"],
      ["Drop", "hard"],
      ["Hold", "hold"],
    ]
      .map(([t, a]) => button(t, a))
      .join("")}</div>`;
  }
  if (["gem-catcher", "ore-slicer"].includes(s.game) && !s.done) {
    html += `<p id="arcade-time"></p><p id="arcade-lives">${s.lives} lives · ${s.game === "gem-catcher" ? `Combo ${s.combo}` : `${s.sliced} gems sliced`}</p><div id="arena" class="mg-arena" tabindex="0" aria-label="${game.name} play area">${s.game === "gem-catcher" ? '<div id="cart" class="mg-cart"></div>' : ""}</div>`;
  }
  if (!s.done)
    html += `<details class="mg-note"><summary>End this run</summary><p>Ending a rewarded run forfeits pending MT. Closing this page keeps it available to resume.</p>${button("Abandon run", "abandon")}</details>`;
  const oldArena = $("arena");
  $("play").innerHTML = html;
  if (oldArena && $("arena")) $("arena").replaceWith(oldArena);
  const boardNode = $("play").querySelector(".mg-board");
  if (boardNode) {
    boardNode.dataset.run = run.id;
    for (const cell of boardNode.children) cell._minigameHtml = cell.innerHTML;
  }
  bind();
  if (s.game === "perfect-strike" && !s.done) {
    const w = strikeConfig(s.strike).width * 100;
    $("strike-bar").style.background =
      `linear-gradient(90deg,#55333a 12%,#895b33 12% ${50 - w * 4}%,#497a70 ${50 - w * 4}% ${50 - w * 2}%,#56ad91 ${50 - w * 2}% ${50 - w}%,#ffe6a2 ${50 - w}% ${50 + w}%,#56ad91 ${50 + w}% ${50 + w * 2}%,#497a70 ${50 + w * 2}% ${50 + w * 4}%,#895b33 ${50 + w * 4}% 88%,#55333a 88%)`;
  }
  scheduleFrame();
}
function grid(n, cells, cls = "") {
  return `<div class="mg-board ${cls}" style="grid-template-columns:repeat(${n},1fr)">${cells.map((c, i) => `<button class="mg-cell" data-cell="${i}" data-open="${c.open}" aria-label="Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${c.text ? " revealed" : ""}">${c.text}</button>`).join("")}</div>`;
}
function bind() {
  if ($("flag-mode"))
    $("flag-mode").onchange = (e) => (flagMode = e.target.checked);
  document.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        let input = { type: b.dataset.action };
        for (let k of ["direction", "bag"])
          if (b.dataset[k]) input[k] = b.dataset[k];
        if (b.dataset.door) input.door = Number(b.dataset.door);
        if (input.type === "strike") {
          input.elapsed = Date.now() + offset - run.state.ready;
          strikeFreeze = {
            x: strikeNeedleX(run.state.strike, input.elapsed),
            until: Date.now() + offset + 800,
          };
        }
        act(input);
      }),
  );
  document.querySelectorAll("[data-cell]").forEach((b) => {
    let click = (flag) => {
      if (run.state.done) return;
      let n =
          run.state.n ||
          (game.id === "explosive-mining"
            ? 12
            : game.id === "gem-2048"
              ? 4
              : 10),
        i = Number(b.dataset.cell);
      if (game.id === "gem-2048") return;
      act({
        type:
          game.id === "mine-sweeper"
            ? flag || $("flag-mode")?.checked
              ? "flag"
              : "reveal"
            : game.id === "prospector"
              ? "dig"
              : "bomb",
        x: i % n,
        y: Math.floor(i / n),
      });
    };
    b.onclick = () => click(false);
    b.oncontextmenu = (e) => {
      e.preventDefault();
      if (game.id === "mine-sweeper") click(true);
    };
  });
  if ($("guess-form"))
    $("guess-form").onsubmit = (e) => {
      e.preventDefault();
      act({ type: "guess", value: Number($("guess").value) });
    };
  const arena = $("arena");
  if (arena) {
    const sample = (e) => {
      const r = arena.getBoundingClientRect();
      cursor = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      if (game.id === "ore-slicer" && drag) {
        const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        inputs.push({
          t: Math.min(
            run.state.duration,
            Date.now() + offset - run.state.started,
          ),
          x: cursor,
          y,
          swipe,
        });
        // Feed the blade trail so it traces the swipe.
        bladeTrail?.add(cursor, y);
      }
    };
    arena.onpointerdown = (e) => {
      arena.setPointerCapture(e.pointerId);
      drag = true;
      swipe++;
      sample(e);
    };
    arena.onpointermove = sample;
    arena.onpointerup = (e) => {
      sample(e);
      drag = false;
      if (game.id === "ore-slicer") flush();
    };
    arena.onpointercancel = () => {
      drag = false;
      flush();
    };
  }
  const b = document.querySelector(".mg-2048");
  if (b) {
    let p = null;
    b.onpointerdown = (e) => (p = [e.clientX, e.clientY]);
    b.onpointerup = (e) => {
      if (!p) return;
      let dx = e.clientX - p[0],
        dy = e.clientY - p[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 20)
        act({
          type: "move",
          direction:
            Math.abs(dx) > Math.abs(dy)
              ? dx > 0
                ? "right"
                : "left"
              : dy > 0
                ? "down"
                : "up",
        });
      p = null;
    };
  }
}
function flush() {
  if (busy || !run || run.state.done) return;
  const batch = inputs.splice(0, 120);
  lastFlush = Date.now();
  act({ type: "inputs", inputs: batch, end: !drag && inputs.length === 0 });
}
function frame() {
  raf = 0;
  frameTimer = 0;
  if (!run || run.state.done) return;
  let s = run.state,
    now = Date.now() + offset;
  if (s.game === "mine-sweeper" && $("mine-timer"))
    setText(
      $("mine-timer"),
      s.first
        ? `${((now - s.first) / 1000).toFixed(1)} seconds`
        : "Timer starts on your first reveal",
    );
  if (!document.hidden && s.game === "perfect-strike" && $("needle")) {
    const strikeButton = document.querySelector('[data-action="strike"]');
    strikeButton.disabled = now < s.ready + 200;
    setText(
      strikeButton,
      now < s.ready
        ? `Get ready · ${Math.ceil((s.ready - now) / 1000)}`
        : "Strike!",
    );
    // The marker only sweeps while a strike is live. Once you strike (or during
    // the between-strikes "get ready"), it holds still at the spot you stopped
    // it — that's the whole point of the game.
    let x;
    if (strikeFreeze && (now < strikeFreeze.until || now < s.ready)) {
      x = strikeFreeze.x;
    } else {
      strikeFreeze = null;
      let c = strikeConfig(s.strike);
      x = Math.abs((((now - s.ready) / c.period) % 2) - 1);
    }
    $("needle").style.left = `${x * 100}%`;
  }
  if (s.game === "price-is-right" && $("question-time")) {
    let left = Math.max(0, 15000 - (now - s.ready));
    setText($("question-time"), `${Math.ceil(left / 1000)} seconds`);
    if (!left && !busy) act({ type: "guess", value: 0 });
  }
  if (s.game === "gem-stack" && now - s.last > 500 && !busy)
    act({ type: "tick" });
  if (["gem-catcher", "ore-slicer"].includes(s.game) && $("arena")) {
    if ($("arcade-lives"))
      setText(
        $("arcade-lives"),
        `${s.lives} lives · ${s.game === "gem-catcher" ? `Combo ${s.combo}` : `${s.sliced} gems sliced`}`,
      );
    let t = Math.min(s.duration, now - s.started);
    setText(
      $("arcade-time"),
      `${Math.ceil((s.duration - t) / 1000)} seconds ${t > s.duration - (s.game === "ore-slicer" ? 5000 : 15000) ? (s.game === "ore-slicer" ? "· ORE RUSH" : "· CHAOS") : ""}`,
    );
    const arena = $("arena");
    // Draw the arena every animation frame (~60fps). The loop already runs on
    // requestAnimationFrame for these games; the old 32ms gate halved it and
    // made the falling gems and blade trail look choppy.
    if (now - lastDraw > 15) {
      lastDraw = now;
      if (arcadeArena !== arena) {
        arcadeRenderer?.destroy();
        bladeTrail?.destroy();
        arcadeArena = arena;
        arcadeRenderer = createArcadeRenderer(arena, icon);
        bladeTrail =
          s.game === "ore-slicer" ? createBladeTrail(arena) : null;
      }
      if (!document.hidden) {
        arcadeRenderer(s, t);
        bladeTrail?.draw();
      }
    }

    if (s.game === "gem-catcher") {
      if (keys.has("ArrowLeft") || keys.has("a"))
        cursor = Math.max(0, cursor - 0.012);
      if (keys.has("ArrowRight") || keys.has("d"))
        cursor = Math.min(1, cursor + 0.012);
      $("cart").style.left = `${cursor * 100}%`;
      if (now - lastSample > 50) {
        inputs.push({ t, x: cursor });
        lastSample = now;
      }
    }
    // Sliced/caught gems only vanish once the server confirms the hit, so the
    // flush cadence is the feedback latency. Flush quickly while actively
    // slicing, moderately while catching (there are always cart inputs), and
    // slowly when idle — an empty flush there just lets the run finalize.
    const flushDue = drag ? 150 : inputs.length ? 250 : 600;
    if (!busy && Date.now() - lastFlush > flushDue) flush();
  }
  scheduleFrame();
}
window.addEventListener("keydown", (e) => {
  if (
    !game ||
    !run ||
    run.state.done ||
    e.target.matches("input,select,textarea")
  )
    return;
  keys.add(e.key);
  let dir = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  }[e.key];
  if (dir || e.code === "Space") e.preventDefault();
  if (game.id === "gem-2048" && dir) act({ type: "move", direction: dir });
  if (game.id === "gem-stack") {
    let type = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "rotate",
      ArrowDown: "soft",
      " ": "hard",
      c: "hold",
    }[e.key];
    if (type) act({ type });
  }
  if (game.id === "perfect-strike" && e.code === "Space") {
    const elapsed = Date.now() + offset - run.state.ready;
    strikeFreeze = {
      x: strikeNeedleX(run.state.strike, elapsed),
      until: Date.now() + offset + 800,
    };
    act({ type: "strike", elapsed });
  }
});
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  keys.clear();
  scheduleFrame();
});
window.addEventListener("pagehide", () => {
  stopFrames();
  arcadeRenderer?.destroy();
  bladeTrail?.destroy();
  arcadeRenderer = null;
  arcadeArena = null;
  bladeTrail = null;
});
window.addEventListener("pageshow", scheduleFrame);
window.addEventListener("keyup", (e) => keys.delete(e.key));
supabase.auth.onAuthStateChange((event) => {
  if (["SIGNED_OUT", "SIGNED_IN"].includes(event)) {
    authGeneration++;
    generation++;
    run = null;
    wallet = null;
    active = [];
    delete $("wallet")._minigameHtml;
    $("wallet").textContent = "Sign in to load tickets and MT.";
    arcadeRenderer?.destroy();
    bladeTrail?.destroy();
    arcadeRenderer = null;
    arcadeArena = null;
    bladeTrail = null;
    if ($("play")) $("play").replaceChildren();
    if ($("start")) $("start").hidden = false;
    stopFrames();
    setTimeout(load, 0);
  }
});
route();
if (!game) load();
