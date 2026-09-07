// Match the original 60 Hz movement speed, independent of display refresh rate.
export function catcherMovement(elapsedMs) {
  return Math.max(0, Math.min(50, elapsedMs)) * 0.00072;
}

// Presentation helpers only: authoritative state and hit detection remain on the server.
export function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}
export function setHtml(node, value) {
  if (node && node._minigameHtml !== value) {
    node.innerHTML = value;
    node._minigameHtml = value;
  }
}
const reduceMotion =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function patchCells(board, cells) {
  const animated = new Set();
  cells.forEach((cell, i) => {
    const node = board.children[i];
    const prevHtml = node._minigameHtml;
    const nextHtml = String(cell.text ?? "");
    const wasOpen = node.dataset.open;
    setHtml(node, nextHtml);
    if (cell.open !== undefined && node.dataset.open !== String(cell.open))
      node.dataset.open = cell.open;
    // Pop only genuine reveal/merge changes on the deduction/merge boards.
    // Stack cells carry `tile` (not `open`) and shift every frame, so they
    // are intentionally excluded to avoid a constant flicker.
    if (cell.open !== undefined && cell.open) {
      const justOpened = wasOpen !== "true";
      const contentChanged = prevHtml !== undefined && prevHtml !== nextHtml;
      if (justOpened || contentChanged) animated.add(node);
    }
    // Minesweeper flags: mark the cell and give a small pop when one is placed.
    const flagged = nextHtml === "⚑";
    if (node.classList.contains("mg-cell--flag") !== flagged) {
      node.classList.toggle("mg-cell--flag", flagged);
      if (flagged) animated.add(node);
    }
    if (cell.tile !== undefined && node.dataset.tile !== String(cell.tile)) {
      node.dataset.tile = cell.tile;
      node.classList.toggle("filled", !!cell.tile);
      node.style.setProperty("--tile", cell.tile);
    }
    if (node.hasAttribute("data-cell")) {
      const label =
        node.getAttribute("aria-label").replace(/ revealed$/, "") +
        (cell.text ? " revealed" : "");
      if (node.getAttribute("aria-label") !== label)
        node.setAttribute("aria-label", label);
    }
  });
  // Batch animation restarts: one layout read for the whole reveal, not each cell.
  if (!reduceMotion && animated.size) {
    for (const node of animated) node.classList.remove("mg-cell--pop");
    void board.offsetWidth;
    for (const node of animated) node.classList.add("mg-cell--pop");
  }
}
// Pop a caught sprite from wherever it currently sits (its inline transform
// holds the fall position, so we grow + fade from there) then drop it.
function collect(node) {
  if (reduceMotion) {
    node.remove();
    return;
  }
  const base = node.style.transform || "translate(-50%, -50%)";
  node.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";
  node.style.transform = `${base} scale(1.85)`;
  node.style.opacity = "0";
  setTimeout(() => node.remove(), 240);
}

// A Fruit-Ninja-style blade trail for Ore Slicer: a glowing, tapering streak
// that follows the swipe and fades. Drawn on a canvas layered above the gems,
// fed normalized (0..1) points from the arena's pointer handler.
export function createBladeTrail(arena) {
  if (reduceMotion) {
    return { add() {}, draw() {}, destroy() {} };
  }
  const canvas = document.createElement("canvas");
  canvas.className = "mg-trail";
  arena.append(canvas);
  const ctx = canvas.getContext("2d");
  const accent =
    getComputedStyle(arena).getPropertyValue("--accent").trim() || "#8ab4ff";
  let w = 0,
    h = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const fit = () => {
    w = arena.clientWidth;
    h = arena.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const resize = new ResizeObserver(fit);
  resize.observe(arena);

  const LIFE = 230; // ms a point stays visible
  let points = [];
  const add = (nx, ny) => {
    points.push({ x: nx * w, y: ny * h, t: performance.now() });
  };
  const draw = () => {
    const now = performance.now();
    while (points.length && now - points[0].t > LIFE) points.shift();
    ctx.clearRect(0, 0, w, h);
    if (points.length < 2) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = accent;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const life = Math.max(0, 1 - (now - b.t) / LIFE);
      ctx.globalAlpha = life;
      ctx.lineWidth = 2 + 14 * life; // thick near the tip, thin as it fades
      ctx.shadowBlur = 14 * life;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  };
  return {
    add,
    draw,
    destroy() {
      resize.disconnect();
      canvas.remove();
    },
  };
}

export function createArcadeRenderer(arena, icon) {
  let height = arena.clientHeight;
  const resize = new ResizeObserver(() => {
    height = arena.clientHeight;
  });
  resize.observe(arena);
  let next = 0,
    lastTime = -1,
    lastState,
    hits = new Set();
  const active = new Map();
  const draw = (state, time) => {
    if (time < lastTime) {
      for (const { node } of active.values()) node.remove();
      active.clear();
      next = 0;
    }
    lastTime = time;
    if (lastState !== state) {
      hits = new Set(state.hit);
      lastState = state;
    }
    while (next < state.events.length && state.events[next].t <= time) {
      const event = state.events[next++];
      if (hits.has(event.id) || time > event.t + event.fall) continue;
      const node = document.createElement("div");
      node.className = "mg-object";
      node.style.left = `${event.x * 100}%`;
      node.style.top = "0";
      node.innerHTML =
        event.kind === "hazard"
          ? state.game === "ore-slicer"
            ? "🧨"
            : "🪨"
          : event.kind === "stone"
            ? "🪨"
            : icon(event.name);
      arena.append(node);
      active.set(event.id, { node, event });
    }
    for (const [id, { node, event }] of active) {
      const y = (time - event.t) / event.fall;
      if (hits.has(id)) {
        // Caught / struck: a quick pop-and-fade from its current spot,
        // rather than blinking out of existence.
        collect(node);
        active.delete(id);
      } else if (y > 1) {
        node.remove();
        active.delete(id);
      } else
        node.style.transform = `translate(-50%, -50%) translateY(${y * height * (state.game === "ore-slicer" ? 1 : 0.92)}px)`;
    }
  };
  draw.destroy = () => {
    resize.disconnect();
    for (const { node } of active.values()) node.remove();
    active.clear();
  };
  return draw;
}
