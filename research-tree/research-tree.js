import { mountShell } from "../src/ui/shell.js";
import { invokeFunction } from "../src/backend/invoke.js";

mountShell({ page: "research-tree", base: "../" });

const $ = (id) => document.getElementById(id);
const branches = ["mining", "specimen", "engineering", "exploration"];
const labels = { mining: "Mining Science", specimen: "Specimen Studies", engineering: "Engineering", exploration: "Exploration" };
let state = null;
let active = "mining";
let pendingNode = null;
let planning = false;
let mapFrame = 0;
const planned = new Set();
const RESEARCH_CACHE_KEY = "gemIncremental.researchTree.v014";

const money = (value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function call(action, body = {}) {
  const { data, error } = await invokeFunction("features", { action, ...body }, { retries: 0 });
  if (error) throw new Error(error.message);
  return data;
}

async function load() {
  const cached = readCache();
  if (cached) { state = cached; render(); }
  try {
    state = await call("research");
    writeCache(state);
    render();
    // Reconcile historical discovery sources after the tree is already on
    // screen. This keeps the interactive map fast even for veteran players.
    void refreshSources();
  } catch (error) {
    if (!cached) $("tree").innerHTML = `<div class="research-empty">${esc(error.message)}</div>`;
  }
}

function readCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(RESEARCH_CACHE_KEY) || "null");
    return cached?.nodes && cached?.profile ? cached : null;
  } catch { return null; }
}

function writeCache(value) {
  try { sessionStorage.setItem(RESEARCH_CACHE_KEY, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

async function refreshSources() {
  try {
    const refreshed = await call("research-sync");
    state = refreshed;
    writeCache(state);
    render();
  } catch {
    // The initial tree is valid. A later visit or purchase will retry source reconciliation.
  }
}

function nodeState(node, bought, profile) {
  const owned = bought.has(node.id);
  // Planned prerequisites only count as satisfied while actively planning a
  // build. Outside planning mode a merely-planned prerequisite must still read
  // as locked, otherwise a node looks researchable but the server rejects it.
  const missing = (node.prerequisites || []).filter((id) => !bought.has(id) && !(planning && planned.has(id)));
  const apLocked = Number(state.achievementPoints || 0) < Number(node.required_ap || 0);
  const poor = Number(profile.points_available || 0) < Number(node.cost || 0);
  return { owned, missing, apLocked, poor, locked: missing.length > 0 || apLocked, selected: planned.has(node.id) };
}

function render() {
  const bought = new Set(state.purchases || []);
  const profile = state.profile || {};
  const allNodes = state.nodes || [];
  const nodes = allNodes.filter((node) => node.branch === active);

  $("rpAvailable").textContent = `${Number(profile.points_available || 0).toLocaleString()} RP`;
  $("rpLifetime").textContent = `${Number(profile.points_earned || 0).toLocaleString()} earned`;
  $("rpSpent").textContent = `${Number(profile.points_spent || 0).toLocaleString()} RP`;
  $("apTotal").textContent = Number(state.achievementPoints || 0).toLocaleString();
  $("nodeCount").textContent = `${Math.max(0, bought.size - 1)} / ${Math.max(0, allNodes.length - 1)}`;
  $("planToggle").textContent = planning ? "Finish planning" : "Plan a build";
  renderPlanner(bought, profile);

  $("branchTabs").innerHTML = branches.map((branch) => `<button class="${active === branch ? "active" : ""}" data-branch="${branch}">${labels[branch]}</button>`).join("");
  $("treeMap").innerHTML = treeMap(nodes, bought, profile);
  $("tree").innerHTML = [1, 2, 3, 4].map((stage) => `
    <section class="research-stage">
      <header><span>STAGE ${["", "I", "II", "III", "IV"][stage]}</span><small>${stage === 1 ? "Open" : `${stage === 2 ? 100 : stage === 3 ? 400 : 1000} AP required`}</small></header>
      <div class="node-grid">${nodes.filter((node) => node.stage === stage).map((node) => nodeCard(node, bought, profile)).join("")}</div>
    </section>
  `).join("");
  queueMapLines();
}

function renderPlanner(bought, profile) {
  const panel = $("researchPlanner");
  panel.hidden = !planning;
  if (!planning) return;

  const plannedNodes = (state.nodes || []).filter((node) => planned.has(node.id) && !bought.has(node.id));
  const cost = plannedNodes.reduce((sum, node) => sum + Number(node.cost || 0), 0);
  const next = (state.nodes || [])
    .filter((node) => !bought.has(node.id) && !(node.prerequisites || []).some((id) => !bought.has(id)))
    .sort((a, b) => Number(a.cost) - Number(b.cost))[0];
  panel.innerHTML = `<div><span class="research-kicker">BUILD PLAN</span><h2>${plannedNodes.length ? `${plannedNodes.length} node${plannedNodes.length === 1 ? "" : "s"} · ${cost.toLocaleString()} RP` : "Choose nodes to preview a build"}</h2><p>${cost > Number(profile.points_available || 0) ? `You need ${(cost - Number(profile.points_available || 0)).toLocaleString()} more RP.` : `${Math.max(0, Number(profile.points_available || 0) - cost).toLocaleString()} RP would remain.`} ${next ? `Suggested next: <strong>${esc(next.name)}</strong> (${next.cost} RP).` : ""}</p></div><button id="clearPlan" class="secondary">Clear plan</button>`;
  $("clearPlan").addEventListener("click", () => { planned.clear(); render(); });
}

// Map geometry. NODE_HEIGHT/NODE_WIDTH must match the fixed size set on
// `.research-map__node` in the CSS so the JS-computed layout and the rendered
// cards line up exactly.
const NODE_HEIGHT = 116;
const NODE_WIDTH = 196;
const ROOT_WIDTH = 132;
const COL_GAP = 46;
const ROW_GAP = 22;
const ROW_PITCH = NODE_HEIGHT + ROW_GAP;
const MAP_PAD = 26;
const HEADER_BAND = 8;

// The layout for the branch currently on screen. drawMapLines routes connectors
// straight from this precomputed geometry (including invisible waypoints) rather
// than re-measuring the DOM, so lines and cards can never disagree.
let mapLayout = null;

function treeMap(nodes, bought, profile) {
  const root = (state.nodes || []).find((node) => node.id === "research-fundamentals");
  mapLayout = buildResearchLayout(nodes, root);
  const cards = mapLayout.nodes.map((node) => mapNode(node, bought, profile, mapLayout)).join("");
  return `<div class="research-map__viewport"><section class="research-map" style="width:${Math.round(mapLayout.width)}px;height:${Math.round(mapLayout.height)}px" aria-label="${esc(labels[active])} research dependency map — prerequisites flow left to right"><svg id="researchMapLines" class="research-map__lines" aria-hidden="true"></svg>${cards}</section></div>`;
}

// Longest path from the root over prerequisites. Columns are keyed on this
// dependency depth (not the AP "stage"), so every connector flows strictly
// left-to-right — no chain ever doubles back inside a column.
function nodeDepth(id, byId, cache) {
  if (cache.has(id)) return cache.get(id);
  cache.set(id, 0); // guard against accidental cycles in the catalogue
  const parents = (byId.get(id)?.prerequisites || []).filter((parentId) => byId.has(parentId));
  const depth = parents.length ? 1 + Math.max(...parents.map((parentId) => nodeDepth(parentId, byId, cache))) : 0;
  cache.set(id, depth);
  return depth;
}

// Full Sugiyama-style layered layout: assign columns by dependency depth, split
// long edges across invisible waypoints, order each column to reduce crossings,
// then solve absolute vertical positions. Single-parent chains come out as dead
// straight, crossing-free lines; the only residual crossings are the genuine
// multi-prerequisite merges, which are mathematically unavoidable in a layered
// tree and are routed as clean curves rather than tangled diagonals.
function buildResearchLayout(branchNodes, root) {
  const nodes = root ? [root, ...branchNodes] : branchNodes.slice();
  const byId = new Map((state.nodes || []).map((node) => [node.id, node]));
  const depthCache = new Map();
  const present = new Set(nodes.map((node) => node.id));
  const column = new Map(nodes.map((node) => [node.id, nodeDepth(node.id, byId, depthCache)]));
  const sortKey = new Map(nodes.map((node) => [node.id, Number(node.sort_order || 0)]));

  // Build the vertex set (real nodes + waypoints) and the routed edge chains.
  const routes = [];
  let waypointSeq = 0;
  nodes.forEach((node) => {
    (node.prerequisites || []).filter((parentId) => present.has(parentId)).forEach((parentId) => {
      const chain = [parentId];
      for (let col = column.get(parentId) + 1; col < column.get(node.id); col++) {
        const id = `__wp${waypointSeq++}`;
        column.set(id, col);
        sortKey.set(id, sortKey.get(parentId));
        chain.push(id);
      }
      chain.push(node.id);
      routes.push({ from: parentId, to: node.id, chain });
    });
  });

  const lastColumn = Math.max(0, ...column.values());
  const layers = Array.from({ length: lastColumn + 1 }, () => []);
  column.forEach((col, id) => layers[col].push(id));

  const parents = new Map([...column.keys()].map((id) => [id, []]));
  const children = new Map([...column.keys()].map((id) => [id, []]));
  routes.forEach(({ chain }) => {
    for (let i = 0; i < chain.length - 1; i++) { children.get(chain[i]).push(chain[i + 1]); parents.get(chain[i + 1]).push(chain[i]); }
  });

  orderedTreeLayers(layers, parents, children, sortKey);

  // Vertical coordinates: pull each vertex toward the mean height of its
  // neighbours, then remove overlaps with isotonic regression (see below).
  const top = new Map();
  layers.forEach((layer) => layer.forEach((id, position) => top.set(id, position * ROW_PITCH)));
  const meanTop = (ids) => ids.length ? ids.reduce((sum, id) => sum + top.get(id), 0) / ids.length : null;
  const relax = (layer, adjacency) => {
    const wants = layer.map((id) => meanTop(adjacency.get(id)) ?? top.get(id));
    resolveSeparation(wants, ROW_PITCH).forEach((value, position) => top.set(layer[position], value));
  };
  for (let pass = 0; pass < 16; pass++) {
    for (let col = 1; col < layers.length; col++) relax(layers[col], parents);
    for (let col = layers.length - 2; col >= 0; col--) relax(layers[col], children);
  }
  const values = [...top.values()];
  const min = values.length ? Math.min(...values) : 0;
  top.forEach((value, id) => top.set(id, value - min + MAP_PAD + HEADER_BAND));

  const columnX = (col) => MAP_PAD + (col === 0 ? 0 : ROOT_WIDTH + COL_GAP + (col - 1) * (NODE_WIDTH + COL_GAP));
  const columnW = (col) => col === 0 ? ROOT_WIDTH : NODE_WIDTH;
  const midY = (id) => top.get(id) + NODE_HEIGHT / 2;
  const width = columnX(lastColumn) + columnW(lastColumn) + MAP_PAD;
  const height = (values.length ? Math.max(...top.values()) : 0) + NODE_HEIGHT + MAP_PAD;

  return {
    nodes, column, top, width, height,
    left: (id) => columnX(column.get(id)),
    widthOf: (id) => columnW(column.get(id)),
    rightPoint: (id) => ({ x: columnX(column.get(id)) + columnW(column.get(id)), y: midY(id) }),
    leftPoint: (id) => ({ x: columnX(column.get(id)), y: midY(id) }),
    midPoint: (id) => ({ x: columnX(column.get(id)) + columnW(column.get(id)) / 2, y: midY(id) }),
    routes,
  };
}

// Iterative barycentre ordering (down-sweep to align with parents, up-sweep to
// align with children). Standard crossing-reduction heuristic; mutates `layers`.
function orderedTreeLayers(layers, parents, children, sortKey) {
  const index = new Map();
  const reindex = () => layers.forEach((layer) => layer.forEach((id, position) => index.set(id, position)));
  layers.forEach((layer) => layer.sort((left, right) => sortKey.get(left) - sortKey.get(right)));
  reindex();
  const barycentre = (ids) => ids.length ? ids.reduce((sum, id) => sum + index.get(id), 0) / ids.length : null;
  const orderBy = (layer, adjacency) => layer.sort((left, right) => {
    const key = (id) => barycentre(adjacency.get(id)) ?? index.get(id);
    return key(left) - key(right) || sortKey.get(left) - sortKey.get(right);
  });
  for (let pass = 0; pass < 12; pass++) {
    for (let col = 1; col < layers.length; col++) { orderBy(layers[col], parents); reindex(); }
    for (let col = layers.length - 2; col >= 0; col--) { orderBy(layers[col], children); reindex(); }
  }
  return layers;
}

// Isotonic regression via pool-adjacent-violators. Given desired positions in
// visual order, returns positions that keep that order, sit at least `pitch`
// apart, and minimise total squared displacement from the desired values.
function resolveSeparation(wants, pitch) {
  const shifted = wants.map((want, i) => want - i * pitch);
  const blocks = [];
  for (const value of shifted) {
    let block = { sum: value, count: 1, mean: value };
    while (blocks.length && blocks[blocks.length - 1].mean > block.mean) {
      const previous = blocks.pop();
      const sum = previous.sum + block.sum;
      const count = previous.count + block.count;
      block = { sum, count, mean: sum / count };
    }
    blocks.push(block);
  }
  const positions = [];
  blocks.forEach((block) => { for (let i = 0; i < block.count; i++) positions.push(block.mean); });
  return positions.map((value, i) => value + i * pitch);
}

function mapNode(node, bought, profile, layout) {
  const status = nodeState(node, bought, profile);
  const classes = ["research-map__node", status.owned ? "owned" : "", status.locked ? "locked" : "", status.selected ? "planned" : ""].filter(Boolean).join(" ");
  const isRoot = node.id === "research-fundamentals";
  const action = planning && !status.owned ? (status.apLocked ? "" : `data-map-plan="${esc(node.id)}"`) : (!status.owned && !status.locked && !status.poor ? `data-map-node="${esc(node.id)}"` : "");
  const disabled = !action ? "disabled" : "";
  const detail = status.owned ? "Researched" : status.apLocked ? `Requires ${node.required_ap} AP` : status.locked ? "Prerequisite required" : status.poor ? `Need ${node.cost} RP` : planning ? (status.selected ? "Remove from plan" : "Add to plan") : `Research for ${node.cost} RP`;
  const stageBadge = isRoot ? "" : `<em class="research-map__stage" title="${node.required_ap ? `Stage ${node.stage} — needs ${node.required_ap} AP` : `Stage ${node.stage}`}">S${node.stage}</em>`;
  const geometry = `left:${Math.round(layout.left(node.id))}px;top:${Math.round(layout.top.get(node.id))}px;width:${Math.round(layout.widthOf(node.id))}px`;
  return `<button id="research-map-node-${esc(node.id)}" class="${classes}" type="button" style="${geometry}" ${action} ${disabled} title="${esc(node.name)} — ${esc(node.description)} — ${esc(detail)}" aria-label="${esc(node.name)}. Effect: ${esc(node.description)}. ${esc(detail)}">${stageBadge}<span>${isRoot ? "START" : status.owned ? "✓" : `${node.cost} RP`}</span><strong>${esc(node.name)}</strong><small class="research-map__effect">${esc(node.description || "No effect specification available.")}</small></button>`;
}

function queueMapLines() {
  cancelAnimationFrame(mapFrame);
  mapFrame = requestAnimationFrame(drawMapLines);
}

function drawMapLines() {
  const svg = $("researchMapLines");
  if (!svg || !mapLayout || !state) return;
  const { width, height, routes } = mapLayout;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  const bought = new Set(state.purchases || []);
  svg.innerHTML = routes.map(({ from, to, chain }) => {
      const points = chain.map((id, i) => i === 0 ? mapLayout.rightPoint(id) : i === chain.length - 1 ? mapLayout.leftPoint(id) : mapLayout.midPoint(id));
      const activeLine = bought.has(from) && bought.has(to) ? " owned" : planned.has(to) ? " planned" : "";
      return `<path class="research-map__line${activeLine}" d="${routePath(points)}" />`;
    }).join("");
}

// Smooth cubic path through the routed waypoints. Each segment's control points
// sit a fixed fraction of the horizontal gap from its ends, so every edge leaves
// and enters on a horizontal tangent — an aligned chain reads as one straight
// line, and merges fan out and converge cleanly instead of kinking.
function routePath(points) {
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i].x, y1 = points[i].y, x2 = points[i + 1].x, y2 = points[i + 1].y;
    const curve = Math.max(24, (x2 - x1) * 0.5);
    const cx1 = x1 + curve, cx2 = x2 - curve;
    d += i === 0 ? `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}` : ` C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  }
  return d;
}

function nodeCard(node, bought, profile) {
  const status = nodeState(node, bought, profile);
  return `<article class="research-node ${status.owned ? "owned" : status.locked ? "locked" : ""}${status.selected ? " planned" : ""}"><div class="node-top"><span>${status.owned ? "RESEARCHED" : status.locked ? "LOCKED" : `${node.cost} RP`}</span><b>Stage ${node.stage}</b></div><h3>${esc(node.name)}</h3><p>${esc(node.description)}</p>${status.missing.length ? `<small>Requires: ${status.missing.map((id) => esc(nodeName(id))).join(", ")}</small>` : ""}${status.apLocked ? `<small>Requires ${node.required_ap} AP</small>` : ""}<button data-node="${node.id}" ${planning || status.owned || status.locked || status.poor ? "disabled" : ""}>${status.owned ? "Owned" : status.poor ? `Need ${node.cost} RP` : "Research"}</button>${planning && !status.owned ? `<button class="secondary" data-plan="${node.id}" ${status.apLocked ? "disabled" : ""}>${status.selected ? "Remove from plan" : "Add to plan"}</button>` : ""}</article>`;
}

function nodeName(id) { return state.nodes.find((node) => node.id === id)?.name || id; }

function openPurchase(nodeId) {
  pendingNode = state.nodes.find((node) => node.id === nodeId);
  if (!pendingNode) return;
  $("confirmTitle").textContent = pendingNode.name;
  $("confirmText").textContent = `Effect: ${pendingNode.description || "No effect specification available."} Spend ${pendingNode.cost} Research Points? This takes effect immediately.`;
  $("confirmDialog").showModal();
}

document.addEventListener("click", (event) => {
  const branch = event.target.closest("[data-branch]");
  if (branch) { active = branch.dataset.branch; render(); return; }
  const plan = event.target.closest("[data-plan]");
  if (plan) { planned.has(plan.dataset.plan) ? planned.delete(plan.dataset.plan) : planned.add(plan.dataset.plan); render(); return; }
  const mapPlan = event.target.closest("[data-map-plan]");
  if (mapPlan) { planned.has(mapPlan.dataset.mapPlan) ? planned.delete(mapPlan.dataset.mapPlan) : planned.add(mapPlan.dataset.mapPlan); render(); return; }
  const mapNode = event.target.closest("[data-map-node]");
  if (mapNode) { openPurchase(mapNode.dataset.mapNode); return; }
  const node = event.target.closest("[data-node]");
  if (node) openPurchase(node.dataset.node);
});

$("planToggle").addEventListener("click", () => { planning = !planning; render(); });
$("confirmAction").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!pendingNode) return;
  event.target.disabled = true;
  try {
    state = await call("research-purchase", { nodeId: pendingNode.id });
    planned.delete(pendingNode.id);
    writeCache(state);
    $("confirmDialog").close();
    render();
  } catch (error) { alert(error.message); } finally { event.target.disabled = false; }
});
$("resetOpen").addEventListener("click", () => {
  const reset = state.reset || {};
  const available = reset.availableAt && Date.parse(reset.availableAt) > Date.now() ? ` Available ${new Date(reset.availableAt).toLocaleString()}.` : "";
  const profile = state.profile || {};
  $("resetText").textContent = `This refunds ${Number(profile.points_spent || 0).toLocaleString()} spent RP, deactivates ${Math.max(0, (state.purchases || []).length - 1)} researched nodes, and leaves your lifetime RP intact. Cost: ${money(reset.cost)}.${available}`;
  $("resetConfirm").value = "";
  $("resetDialog").showModal();
});
$("resetAction").addEventListener("click", async (event) => {
  event.preventDefault();
  if ($("resetConfirm").value !== "RESET") { alert("Type RESET exactly."); return; }
  event.target.disabled = true;
  try {
    state = await call("research-reset");
    writeCache(state);
    $("resetDialog").close();
    render();
  } catch (error) { alert(error.message); } finally { event.target.disabled = false; }
});
window.addEventListener("resize", queueMapLines);
// The connector lines are measured from live node geometry, so they must be
// redrawn whenever that geometry changes after the first paint: the display
// font finishing loading (Orbitron reflows the node labels) and any later
// resize of the map host both shift node positions.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMapLines);
const mapHost = $("treeMap");
if (mapHost && "ResizeObserver" in window) new ResizeObserver(queueMapLines).observe(mapHost);
load();
