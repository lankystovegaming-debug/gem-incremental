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
  const missing = (node.prerequisites || []).filter((id) => !bought.has(id) && !planned.has(id));
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

function treeMap(nodes, bought, profile) {
  const root = (state.nodes || []).find((node) => node.id === "research-fundamentals");
  const byStage = [root ? [root] : [], ...[1, 2, 3, 4].map((stage) => nodes.filter((node) => node.stage === stage))];
  return `<div class="research-map__viewport"><section class="research-map" aria-label="${esc(labels[active])} two-dimensional research tree"><svg id="researchMapLines" class="research-map__lines" aria-hidden="true"></svg><div class="research-map__columns">${byStage.map((stageNodes, index) => `<section class="research-map__column" data-stage="${index}"><header><span>${index ? `STAGE ${["", "I", "II", "III", "IV"][index]}` : "ROOT"}</span>${index ? `<small>${index === 1 ? "Open" : `${index === 2 ? 100 : index === 3 ? 400 : 1000} AP`}</small>` : ""}</header><div class="research-map__nodes">${stageNodes.map((node) => mapNode(node, bought, profile)).join("")}</div></section>`).join("")}</div></section></div>`;
}

function mapNode(node, bought, profile) {
  const status = nodeState(node, bought, profile);
  const classes = ["research-map__node", status.owned ? "owned" : "", status.locked ? "locked" : "", status.selected ? "planned" : ""].filter(Boolean).join(" ");
  const isRoot = node.id === "research-fundamentals";
  const action = planning && !status.owned ? (status.apLocked ? "" : `data-map-plan="${esc(node.id)}"`) : (!status.owned && !status.locked && !status.poor ? `data-map-node="${esc(node.id)}"` : "");
  const disabled = !action ? "disabled" : "";
  const detail = status.owned ? "Researched" : status.locked ? "Prerequisite required" : status.poor ? `Need ${node.cost} RP` : planning ? (status.selected ? "Remove from plan" : "Add to plan") : `Research for ${node.cost} RP`;
  return `<button id="research-map-node-${esc(node.id)}" class="${classes}" type="button" ${action} ${disabled} title="${esc(node.name)} — ${esc(detail)}" aria-label="${esc(node.name)}. ${esc(detail)}"><span>${isRoot ? "START" : status.owned ? "✓" : `${node.cost} RP`}</span><strong>${esc(node.name)}</strong></button>`;
}

function queueMapLines() {
  cancelAnimationFrame(mapFrame);
  mapFrame = requestAnimationFrame(drawMapLines);
}

function drawMapLines() {
  const map = document.querySelector(".research-map");
  const svg = $("researchMapLines");
  if (!map || !svg || !state) return;
  const bounds = map.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  svg.setAttribute("width", bounds.width);
  svg.setAttribute("height", bounds.height);
  const bought = new Set(state.purchases || []);
  svg.innerHTML = (state.nodes || [])
    .filter((node) => node.branch === active)
    .flatMap((node) => (node.prerequisites || []).map((parentId) => ({ node, parentId })))
    .map(({ node, parentId }) => {
      const from = document.getElementById(`research-map-node-${parentId}`);
      const to = document.getElementById(`research-map-node-${node.id}`);
      if (!from || !to) return "";
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.right - bounds.left;
      const y1 = a.top + a.height / 2 - bounds.top;
      const x2 = b.left - bounds.left;
      const y2 = b.top + b.height / 2 - bounds.top;
      const bend = Math.max(38, (x2 - x1) * .44);
      const activeLine = bought.has(parentId) && bought.has(node.id) ? " owned" : planned.has(node.id) ? " planned" : "";
      return `<path class="research-map__line${activeLine}" d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" />`;
    }).join("");
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
  $("confirmText").textContent = `Spend ${pendingNode.cost} Research Points? This takes effect immediately.`;
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
load();
