import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { gemIconHtml } from "../src/ui/gemStyle.js";
import { catalog, tileNames, bagTable, strikeConfig } from "./catalog.js";
import { pieceCells } from "./stack.js";
mountShell({ page: "minigames", base: "../" });
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
    $("wallet").innerHTML =
      `<span>${esc(wallet.mt)} MT</span><span>${wallet.tickets}/5 tickets</span><span>${wallet.tickets === 5 ? "Tickets full" : `Next ticket ${new Date(Date.parse(wallet.regen_at) + 3600000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</span>`;
}
function route() {
  cancelAnimationFrame(raf);
  inputs = [];
  run = null;
  const id = new URLSearchParams(location.search).get("game");
  game = catalog.find((g) => g.id === id && !g.daily);
  if (!game) {
    $("content").innerHTML =
      `<div class="mg-grid">${catalog.map((g, i) => `<a class="mg-card" href="${g.daily ? "../gemdle/" : `?game=${g.id}`}"><div class="mg-art">${gemIconHtml(tileNames[i])}</div><h2>${g.name}</h2><p>${g.description}</p><div class="mg-tags"><span class="mg-tag ${g.daily ? "mg-tag--daily" : g.mt ? "mg-tag--mt" : ""}">${g.daily ? "Daily" : g.mt ? "MT ON · 1 ticket rewarded" : "MT OFF · Unlimited"}</span><span class="mg-tag">Available</span></div><small>${g.leaderboard}</small></a>`).join("")}</div>`;
    return;
  }
  $("content").innerHTML =
    `<p><a href="./">← All minigames</a></p><div class="mg-layout"><section class="mg-panel"><h2>${game.name}</h2><p class="mg-rules">${rules[game.id]}</p><div id="start" class="mg-controls">${game.id === "mine-sweeper" ? '<label>Difficulty <select id="difficulty"><option value="easy">Easy · 9×9 · 5 MT · Practice</option><option value="medium" selected>Medium · 12×12 · 12 MT</option><option value="hard">Hard · 16×16 · 25 MT</option><option value="expert">Expert · 20×20 · 40 MT</option></select></label>' : ""}<button class="btn btn--primary" data-start="practice">${game.mt ? "Play Practice · 0 MT" : "Play"}</button>${game.mt ? '<button class="btn" data-start="rewarded">Play Rewarded · 1 ticket</button>' : ""}<button class="btn" id="resume">Check saved runs</button></div><div id="play"></div></section><aside class="mg-panel"><h2>${game.id === "crystal-bags" ? "Your statistics" : "Leaderboard"}</h2><small>${game.leaderboard}</small><div id="board">Loading…</div></aside></div>`;
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
    $("board").innerHTML =
      `<p>${d.stats?.games || 0} completed games</p><p>Largest outcome: ${d.stats?.largest || 0} MT</p><p>Lifetime rewarded MT: ${esc(d.stats?.lifetime_mt || 0)}</p>`;
    return;
  }
  $("board").innerHTML =
    `<p>${d.board?.own_rank ? `Your rank: #${d.board.own_rank}` : "Finish a run to set your record."}</p>` +
    (d.board?.entries || [])
      .map(
        (e) =>
          `<div class="mg-board-entry"><span>#${e.rank} ${esc(e.username)}${e.is_you ? " (you)" : ""}</span><strong>${game.id === "mine-sweeper" ? `${(-e.score / 1000).toFixed(3)}s` : Number(e.score).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></div>`,
      )
      .join("");
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
        `<a class="btn" href="?game=${esc(d.run.game)}">Resume ${esc(d.run.game)}</a>`;
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
function render() {
  if (!run) return;
  const s = run.state;
  $("start").hidden = !s.done;
  let html = `<div class="mg-tags"><span class="mg-tag">${run.mode === "practice" ? "Practice · 0 MT" : "Rewarded · ticket used"}</span></div><p class="mg-stat">${game.id === "gem-tower" ? `Floor ${s.floor} · Pending ${s.pending} MT` : game.id === "crystal-bags" ? `Round ${Math.min(5, s.round + 1)}/5 · ${s.pending} MT` : `Score ${Math.round(s.score).toLocaleString()}`}</p>`;
  if (s.done) {
    html += `<div class="mg-result"><h3>${s.abandoned ? "Run ended" : s.collapsed ? "The tower collapsed" : "Run complete"}</h3><p>${s.mode === "rewarded" ? `${s.pending || 0} MT credited.` : "Practice awards 0 MT."}</p>${s.extraction != null ? `<p>Extraction ${(s.extraction * 100).toFixed(1)}% · ${s.gems} gems · Largest chain ${s.largest}</p>` : ""}${s.accuracy != null ? `<p>Accuracy ${(s.accuracy * 100).toFixed(1)}%</p>` : ""}${s.elapsedMs != null ? `<p>${(s.elapsedMs / 1000).toFixed(3)} seconds · ${s.pending}/${s.mines} MT preserved</p>` : ""}${s.game === "gem-tower" ? `<p>Highest floor cleared: ${s.floor}</p>` : ""}</div>`;
  }
  if (s.game === "mine-sweeper") {
    html +=
      `<p id="mine-timer"></p><p>${s.mines - s.lost}/${s.mines} MT preserved · ${s.flags.length} flags</p><label><input id="flag-mode" type="checkbox" ${flagMode ? "checked" : ""}> Flag mode (or right-click)</label>` +
      grid(
        s.n,
        s.cells.map((v, i) => ({
          text: s.flags.includes(i) ? "⚑" : (v ?? ""),
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
            ? `${gemIconHtml(tileNames[Math.min(19, Math.log2(v) - 1)])}${v}<small>${esc(tileNames[Math.log2(v) - 1] || `Glitched Gem +${Math.log2(v) - 20}`)}</small>`
            : "",
          open: !!v,
        })),
        "mg-2048",
      ) +
      `<div class="mg-controls">${["left", "up", "down", "right"].map((d) => button({ left: "←", up: "↑", down: "↓", right: "→" }[d], "move", `data-direction="${d}"`)).join("")}</div>`;
  if (s.game === "prospector") {
    html +=
      `<p>${s.digs} digs left · ${s.found.length}/6 deposits</p><div class="mg-tags">${s.discoveries.map((d) => `<span class="mg-tag">${gemIconHtml(d.name)} ${d.name} · ${d.value}</span>`).join("")}</div>` +
      grid(
        10,
        Array.from({ length: 100 }, (_, i) => {
          let d = s.discoveries.find((d) => d.position === i);
          return {
            text: d ? gemIconHtml(d.name) : (s.clues[i] ?? ""),
            open: !!d || i in s.clues,
          };
        }),
      );
  }
  if (s.game === "explosive-mining")
    html +=
      `<p>${s.bombs} bombs · ${s.score}/${s.total} extracted · Largest chain ${s.largest}</p>` +
      grid(
        12,
        s.board.map((c) => ({
          text:
            c.type === "gem"
              ? gemIconHtml(c.name)
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
      html += `<h3>Question ${s.question + 1}/10</h3><div class="mg-tower">${gemIconHtml(s.specimen.name)}</div><h3>${esc(s.specimen.name)}</h3><p>${s.specimen.weight.toLocaleString()} g · ${esc(s.specimen.mutations.join(" + ") || "No Mutation")}</p><p id="question-time"></p><form id="guess-form" class="mg-controls"><label>Your guess $ <input id="guess" type="number" min="0" step="any" required inputmode="decimal"></label><button class="btn btn--primary">Submit guess</button></form>`;
  }
  if (s.game === "gem-stack") {
    let board = [...s.board];
    if (!s.done)
      for (let [x, y] of pieceCells(s.piece))
        if (x >= 0 && x < 10 && y >= 0 && y < 20)
          board[y * 10 + x] = s.piece.type + 1;
    html += `<p>Level ${1 + Math.floor(s.lines / 10)} · ${s.lines} lines · Hold ${s.hold === null ? "—" : ["I", "O", "T", "S", "Z", "J", "L"][s.hold]} · Next ${s.queue.map((i) => ["I", "O", "T", "S", "Z", "J", "L"][i]).join(" ")}</p><div class="mg-board mg-stack" style="grid-template-columns:repeat(10,1fr)">${board.map((v) => `<div class="mg-cell ${v ? "filled" : ""}" style="--tile:${v}">${v ? gemIconHtml(tileNames[Math.min(19, Math.floor(s.lines / 10))]) : ""}</div>`).join("")}</div><div class="mg-controls">${[
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
  bind();
  cancelAnimationFrame(raf);
  if (!s.done) raf = requestAnimationFrame(frame);
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
        if (input.type === "strike")
          input.elapsed = Date.now() + offset - run.state.ready;
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
      if (game.id === "ore-slicer" && drag)
        inputs.push({
          t: Math.min(
            run.state.duration,
            Date.now() + offset - run.state.started,
          ),
          x: cursor,
          y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
          swipe,
        });
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
  if (!run || run.state.done) return;
  let s = run.state,
    now = Date.now() + offset;
  if (s.game === "mine-sweeper" && $("mine-timer"))
    $("mine-timer").textContent = s.first
      ? `${((now - s.first) / 1000).toFixed(1)} seconds`
      : "Timer starts on your first reveal";
  if (s.game === "perfect-strike" && $("needle")) {
    const strikeButton = document.querySelector('[data-action="strike"]');
    strikeButton.disabled = now < s.ready + 200;
    strikeButton.textContent =
      now < s.ready
        ? `Get ready · ${Math.ceil((s.ready - now) / 1000)}`
        : "Strike!";
    let c = strikeConfig(s.strike),
      x = Math.abs((((now - s.ready) / c.period) % 2) - 1);
    $("needle").style.left = `${x * 100}%`;
    let w = c.width * 100;
    $("strike-bar").style.background =
      `linear-gradient(90deg,#55333a 12%,#895b33 12% ${50 - w * 4}%,#497a70 ${50 - w * 4}% ${50 - w * 2}%,#56ad91 ${50 - w * 2}% ${50 - w}%,#ffe6a2 ${50 - w}% ${50 + w}%,#56ad91 ${50 + w}% ${50 + w * 2}%,#497a70 ${50 + w * 2}% ${50 + w * 4}%,#895b33 ${50 + w * 4}% 88%,#55333a 88%)`;
  }
  if (s.game === "price-is-right" && $("question-time")) {
    let left = Math.max(0, 15000 - (now - s.ready));
    $("question-time").textContent = `${Math.ceil(left / 1000)} seconds`;
    if (!left && !busy) act({ type: "guess", value: 0 });
  }
  if (s.game === "gem-stack" && now - s.last > 500 && !busy)
    act({ type: "tick" });
  if (["gem-catcher", "ore-slicer"].includes(s.game) && $("arena")) {
    if ($("arcade-lives"))
      $("arcade-lives").textContent =
        `${s.lives} lives · ${s.game === "gem-catcher" ? `Combo ${s.combo}` : `${s.sliced} gems sliced`}`;
    let t = Math.min(s.duration, now - s.started);
    $("arcade-time").textContent =
      `${Math.ceil((s.duration - t) / 1000)} seconds ${t > s.duration - (s.game === "ore-slicer" ? 5000 : 15000) ? (s.game === "ore-slicer" ? "· ORE RUSH" : "· CHAOS") : ""}`;
    const arena = $("arena");
    if (now - lastDraw > 32) {
      lastDraw = now;
      arena.querySelectorAll(".mg-object").forEach((e) => e.remove());
      for (let e of s.events) {
        let y = (t - e.t) / e.fall;
        if (y < 0 || y > 1 || s.hit.includes(e.id)) continue;
        const el = document.createElement("div");
        el.className = "mg-object";
        el.style.left = `${e.x * 100}%`;
        el.style.top = `${y * (s.game === "ore-slicer" ? 100 : 92)}%`;
        el.innerHTML =
          e.kind === "hazard"
            ? s.game === "ore-slicer"
              ? "🧨"
              : "🪨"
            : e.kind === "stone"
              ? "🪨"
              : gemIconHtml(e.name);
        arena.append(el);
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
    if (!busy && Date.now() - lastFlush > 700) flush();
  }
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
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
  if (game.id === "perfect-strike" && e.code === "Space")
    act({ type: "strike", elapsed: Date.now() + offset - run.state.ready });
});
window.addEventListener("keyup", (e) => keys.delete(e.key));
supabase.auth.onAuthStateChange((event) => {
  if (["SIGNED_OUT", "SIGNED_IN"].includes(event)) {
    authGeneration++;
    generation++;
    run = null;
    wallet = null;
    active = [];
    $("wallet").textContent = "Sign in to load tickets and MT.";
    if ($("play")) $("play").replaceChildren();
    if ($("start")) $("start").hidden = false;
    cancelAnimationFrame(raf);
    setTimeout(load, 0);
  }
});
route();
if (!game) load();
