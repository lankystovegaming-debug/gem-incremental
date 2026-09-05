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
export function patchCells(board, cells) {
  cells.forEach((cell, i) => {
    const node = board.children[i];
    setHtml(node, String(cell.text ?? ""));
    if (cell.open !== undefined && node.dataset.open !== String(cell.open))
      node.dataset.open = cell.open;
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
      if (y > 1 || hits.has(id)) {
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
