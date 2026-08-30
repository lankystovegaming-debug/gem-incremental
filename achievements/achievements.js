import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";

mountShell({ page: "achievements", base: "../" });

const CATEGORIES = ["all", "rolling", "discovery", "mutations", "wealth", "equipment", "museum", "social", "special", "hidden"];
const CATEGORY_META = {
  all: ["All", "✦"], rolling: ["Rolling", "◌"], discovery: ["Discovery", "⌕"], mutations: ["Mutations", "✧"], wealth: ["Wealth", "◆"], equipment: ["Equipment", "⚒"], museum: ["Museum", "▣"], social: ["Social", "◉"], special: ["Special", "✹"], hidden: ["Hidden", "?" ]
};
const E = {
  summary: document.querySelector("#summary"), milestones: document.querySelector("#milestones"), tabs: document.querySelector("#categoryTabs"),
  filter: document.querySelector("#stateFilter"), search: document.querySelector("#achievementSearch"), status: document.querySelector("#status"), cards: document.querySelector("#cards"), toast: document.querySelector("#toast")
};
const S = { category: "all", filter: "all", search: "", definitions: [], progress: new Map(), summary: {}, milestones: [] };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const fmt = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const target = (definition) => Number(definition.metadata?.target ?? definition.requirements?.amount ?? 1);

function rewards(items = []) {
  return items.map((item) => item.type === "money" ? `$${fmt(item.amount)}` : item.type === "capacity" ? `+${fmt(item.amount)} inventory capacity` : item.type === "cache-credit" ? `${fmt(item.amount)} Cache Credit${Number(item.amount) === 1 ? "" : "s"}` : item.type === "potion" ? `${fmt(item.amount)} ${item.name || item.consumableId}` : item.type === "cosmetic" ? `${item.cosmeticType || "cosmetic"}: ${item.name || item.id}` : item.name || item.id || item.type).join(" · ") || "Achievement Points";
}

function toast(message, bad = false) {
  E.toast.textContent = message;
  E.toast.classList.toggle("is-error", bad);
  E.toast.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => E.toast.classList.remove("is-visible"), 3500);
}

function status(definition, progress) {
  if (definition.metadata?.hidden === true && !(progress?.metadata?.revealed || progress?.completed)) return "hidden";
  if (definition.metadata?.locked === true) return "locked";
  if (progress?.completed && !progress?.reward_granted) return "ready";
  if (progress?.reward_granted) return "completed";
  return "progress";
}

function render() {
  const summary = S.summary;
  const completion = Math.max(0, Math.min(100, Number(summary.completionPercent || 0)));
  const ready = Number(summary.unclaimed || 0);
  E.tabs.innerHTML = CATEGORIES.map((category) => {
    const [label, icon] = CATEGORY_META[category];
    return `<button type="button" class="tab ${S.category === category ? "is-active" : ""}" data-category="${category}" role="tab" aria-selected="${S.category === category}"><span>${icon}</span>${label}</button>`;
  }).join("");
  E.summary.innerHTML = `
    <div class="summary-primary"><span>YOUR ACHIEVEMENT POINTS</span><strong>${fmt(summary.ap)}</strong><div class="summary-meter" aria-label="${fmt(completion)}% achievement completion"><i style="width:${completion}%"></i></div><small>${fmt(summary.visibleCompleted)} of ${fmt(summary.visibleTotal)} visible achievements complete</small></div>
    <div class="summary-stat"><strong>${fmt(completion)}%</strong><span>Collection complete</span></div>
    <div class="summary-stat"><strong>${summary.rank ? `#${fmt(summary.rank)}` : "—"}</strong><span>AP leaderboard</span></div>
    <div class="summary-stat ${ready ? "is-ready" : ""}"><strong>${fmt(ready)}</strong><span>Rewards ready</span></div>
  `;
  E.milestones.innerHTML = S.milestones.map((milestone) => `<article class="milestone ${milestone.claimed ? "is-claimed" : milestone.unlocked ? "is-ready" : ""}"><div class="milestone__top"><strong>${fmt(milestone.ap)} AP</strong><span>${milestone.claimed ? "✓" : milestone.unlocked ? "!" : "○"}</span></div><p>${esc(rewards(milestone.rewards))}</p>${milestone.unlocked && !milestone.claimed ? `<button data-milestone="${milestone.ap}">Claim reward</button>` : `<small>${milestone.claimed ? "Reward claimed" : "Keep collecting AP"}</small>`}</article>`).join("");
  renderCards();
}

function renderCards() {
  const query = S.search.trim().toLocaleLowerCase();
  const rows = S.definitions.map((definition) => ({ definition, progress: S.progress.get(definition.id) }))
    .filter(({ definition }) => S.category === "all" || (definition.metadata?.category || "special") === S.category)
    .filter(({ definition, progress }) => S.filter === "all" || status(definition, progress) === S.filter)
    .filter(({ definition }) => !query || `${definition.name} ${definition.description} ${definition.metadata?.category || ""}`.toLocaleLowerCase().includes(query));
  const priority = { ready: 0, progress: 1, locked: 2, hidden: 3, completed: 4 };
  rows.sort((left, right) => priority[status(left.definition, left.progress)] - priority[status(right.definition, right.progress)] || (Number(right.progress?.current_value || 0) / target(right.definition) - Number(left.progress?.current_value || 0) / target(left.definition)) || left.definition.sort_order - right.definition.sort_order);
  const ready = rows.filter(({ definition, progress }) => status(definition, progress) === "ready").length;
  E.status.innerHTML = `<strong>${rows.length}</strong> achievement${rows.length === 1 ? "" : "s"}${ready ? `<span>${ready} ready to claim</span>` : ""}`;
  E.cards.innerHTML = rows.map(({ definition, progress }) => card(definition, progress)).join("") || `<div class="achievement-empty"><strong>No matches found</strong><span>Try another category, state, or search.</span></div>`;
}

function card(definition, progress) {
  const state = status(definition, progress);
  const hidden = state === "hidden";
  const total = target(definition);
  const current = Math.min(total, Number(progress?.current_value || 0));
  const percent = Math.min(100, total ? current / total * 100 : 0);
  const category = definition.metadata?.category || "special";
  const stateLabel = state === "ready" ? "Reward ready" : state === "completed" ? "Claimed" : state === "locked" ? "Locked" : state === "hidden" ? "Undiscovered" : "In progress";
  return `<article class="achievement-card state-${state}"><header><span class="achievement-icon">${esc(hidden ? "?" : definition.icon || "◆")}</span><div><small>${esc(category)}</small><h3>${esc(hidden ? "Hidden achievement" : definition.name)}</h3></div><span class="ap-pill">${fmt(definition.metadata?.ap)} AP</span></header><p>${esc(hidden ? (definition.metadata?.hint || "Keep exploring. Its condition remains concealed.") : definition.description)}</p>${hidden ? "" : `<div class="progress"><i style="width:${percent}%"></i></div><div class="progress-copy"><span>${fmt(current)} / ${fmt(total)}</span><span>${Math.floor(percent)}%</span></div>`}<footer><span class="reward-copy"><small>REWARD</small>${esc(rewards(definition.rewards))}</span>${state === "ready" ? `<button data-claim="${definition.id}">Claim reward</button>` : `<b>${stateLabel}${state === "completed" && progress?.reward_granted_at ? `<small>${new Date(progress.reward_granted_at).toLocaleDateString()}</small>` : ""}</b>`}</footer></article>`;
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke("features", { body });
  if (error || data?.error) throw Error(data?.message || data?.details || error?.message || "Request failed");
  return data;
}

async function load() {
  try {
    const data = await invoke({ action: "achievements" });
    S.definitions = data.definitions || [];
    S.progress = new Map((data.progress || []).map((item) => [item.feature_id, item]));
    S.summary = data.summary || {};
    S.milestones = data.milestones || [];
    render();
  } catch (error) {
    E.status.textContent = error.message;
    E.cards.innerHTML = "";
  }
}

E.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  S.category = button.dataset.category;
  render();
});
E.filter.addEventListener("change", () => { S.filter = E.filter.value; renderCards(); });
E.search.addEventListener("input", () => { S.search = E.search.value; renderCards(); });
document.addEventListener("click", async (event) => {
  const claim = event.target.closest("[data-claim]");
  const milestone = event.target.closest("[data-milestone]");
  if (!claim && !milestone) return;
  const button = claim || milestone;
  button.disabled = true;
  try {
    const data = await invoke(claim ? { action: "achievement-claim", featureId: claim.dataset.claim } : { action: "achievement-milestone-claim", ap: Number(milestone.dataset.milestone) });
    toast(data.message || "Reward claimed");
    await load();
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
  }
});
window.addEventListener("achievement:completed", (event) => toast(`${event.detail?.name || "Achievement"} completed — claim its reward on the Achievements page.`));
load();
