import fs from "node:fs/promises";
import * as ui from "../src/ui/expeditionConsole.js";
import * as format from "../src/ui/format.js";
import * as crystal from "../src/logic/crystalCaverns.js";

// Execute the real page renderers with an inert DOM and stub RPCs. No live account writes.
export async function consoleHarness(kind, overrides = {}) {
  const path = { mine: "expeditions/expeditions.js", volcanic: "volcanic-depths/volcanic-depths.js", crystal: "crystal-caverns/crystal-caverns.js" }[kind];
  let source = await fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");
  source = source.replace(/import\s*[^;]+?from\s*["'][^"']+["'];/g, "").replace(/\}\);refresh\(\);/, "});");
  const nodes = new Map(), listeners = {}, notices = [], dialogs = [];
  const document = { visibilityState: "visible", getElementById(id) { if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", addEventListener() {}, showModal() {} }); return nodes.get(id); }, addEventListener(type, cb) { listeners[type] = cb; } };
  const backend = await fs.readFile(new URL("../src/backend/cloudExpeditions.js", import.meta.url), "utf8");
  const rpc = Object.fromEntries([...backend.matchAll(/export const (\w+)=/g)].map(x => [x[1], async () => ({ data: {}, error: null })]));
  const bindings = { ...ui, ...format, ...crystal, ...rpc, document, mountShell: () => ({ setWallet() {} }), ensurePlayerAuth: async () => false, loadCloudPlayerState: async () => ({ money: 10000000 }), notify: { error: (...x) => notices.push(x), success: (...x) => notices.push(x) }, confirmDialog: async options => { dialogs.push(options); return "cancel"; }, setInterval() {}, alert: message => notices.push(message), ...overrides };
  const expose = kind === "mine" ? `return {render(input, hell = {}, finds = []){dashboard=input;hellDashboard=hell;hellFinds=finds;money=10000000;render();return consoleNode.innerHTML;},perform,refresh};` : `return {render(input){data=input;render();return $("console").innerHTML;},act,refresh${kind === "volcanic" ? ",activityMonitor" : ""}};`;
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const api = await new AsyncFunction(...Object.keys(bindings), `${source}\n${expose}`)(...Object.values(bindings));
  return { ...api, nodes, listeners, notices, dialogs };
}

export const mineRun = { id: 1, mode: "normal", status: "checkpoint_decision", depth: 6, overdepth: 0, progress: 450, target: 450, danger: 38, route_d4: "rich_vein", camps: [3], secured_cargo: [{ kind: "cargo", name: "Silver vein", value: 210000, depth: 3 }], unsecured_cargo: [{ kind: "cargo", name: "Emerald seam", value: 84000, depth: 6 }], protected_discoveries: [{ key: "miners-lamp", name: "Miner’s Lamp", duplicateValue: 125000, depth: 4 }, { key: "miners-lamp", name: "Miner’s Lamp", duplicateValue: 125000, depth: 6 }], incident_log: [{ severity: "minor", valueLost: 15000 }] };
export const mineDashboard = { run: mineRun, artifacts: [], lootCatalog: [], artifactCollections: [], fundingCosts: [100000,150000,250000,400000,650000,1000000,1600000,2500000,4000000,6500000], checkpointServices: { 6: { secureCost: 750000, resupplyCost: 1250000 } }, nextOverdepth: 1, projectedDanger: 85 };
export const hellRun = { ...mineRun, mode: "hell", depth: 10, overdepth: 6, status: "active", danger: undefined, dangerBand: "High", protected_discoveries: [], unsecured_cargo: [{ kind: "artifact", key: "doomstone", name: "Doomstone", depth: 10, overdepth: 6 }], hell_state: { phase: "cards", doom: 71, doomBreaks: ["faulty_warning"], lastDoomBreak: "faulty_warning", objective: { family: "rare_or_grind", target: 100000, progress: 65000, rolls: 280, fallback: 400 }, cards: [{ slot: 1 }, { slot: 2, kind: "curse", name: "Torn Records", key: "reveal_tax", tier: 2, revealed: true }, { slot: 3 }] } };
export const hellDashboard = { run: hellRun, config: { depthCosts: mineDashboard.fundingCosts, revealCosts: mineDashboard.fundingCosts, doomThreshold: 90 }, hellArtifacts: [] };
export const volcanicRun = { id: 2, status: "awaiting_funding", depth: 9, overdepth: 0, progress: 900, target: 900, danger: 32, activity: 123, activity_state: "critical", forecast_low: 129, forecast_high: 139, monitoring_tier: 3, cooling_tier: 3, suppression_used: false, shelter_used: false, lift_used_depths: [3,6], secured_cargo: 650000, unsecured_cargo: 2200000, event_log: [{ kind: "cargo", name: "Volcanic deposit", value: 1800000, depth: 9 }, { kind: "artifact", name: "Pyroclastic Crystal", artifactKey: "pyroclastic-crystal", duplicate: false, depth: 9 }, { kind: "artifact", name: "Melted Seismograph", value: 1250000, duplicate: true, depth: 9 }, { kind: "major", message: "Major incident" }] };
export const volcanicDashboard = { run: volcanicRun, money: 20000000, artifacts: [], funding: [150000,200000,300000,450000,700000,1000000,1500000,2300000,3500000,5500000] };
