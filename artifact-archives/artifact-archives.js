import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";

mountShell({ page: "artifact-archives", base: "../" });
const $ = (id) => document.getElementById(id);

const details = {
  "artifact-archives": ["Artifacts are collectible equipment objects.", "Configure rarity, slots, stats, sockets, sets, acquisition and salvage rewards."],
  "gem-fusion": ["Fusion recipes consume configurable gem inputs.", "Configure success weights, catalysts, outputs, failure refunds and bonus rolls."],
  "enchanting-lab": ["Enchantments can target any configured equipment type.", "Configure gem costs, stat effects, level scaling, failure rules and caps."],
  "collection-hall": ["Collections track long-term sets and milestones.", "Configure unique-gem counts, rarity targets, mutation targets, rewards and permanent bonuses."],
  "mining-events": ["Events temporarily modify mining and roll conditions.", "Configure schedules, phases, spawn weights, boosts, event loot and stacking rules."],
  "merchant-caravan": ["Merchants rotate stock on a configurable schedule.", "Configure currencies, prices, stock, purchase limits, refresh rules and special offers."],
  "research-tree": ["Research nodes form a permanent progression graph.", "Configure prerequisites, costs, stat effects, caps, refund rules and unlock IDs."]
};
const [intro,config] = details["artifact-archives"];
$("details").innerHTML = `<p><strong>${intro}</strong></p><p>${config}</p><ul><li>All content is server-controlled.</li><li>The page remains unavailable until the Upcoming Features switch is ON.</li><li>Admin configuration never requires editing this page.</li></ul>`;

async function load() {
  try {
    const { data, error } = await supabase.functions.invoke("expansion-features", { body: { action: "list" } });
    if (error || data?.error) throw new Error(data?.message || data?.error || error?.message || "Feature unavailable");
    const section = (data.sections || []).find(s => s.id === "artifact-archives");
    const enabled = section?.enabled === true;
    $("featureState").textContent = enabled ? "LIVE" : "OFF";
    $("featureState").className = `state-pill ${enabled ? "on" : "off"}`;
    const defs = data.definitions?.filter(d => d.feature_type === "artifact-archives") || [];
    $("definitions").innerHTML = defs.map(d => `<div class="expansion-item">
      <div><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.description || "No description.")}</small></div>
      <span>${d.permanent ? "Permanent" : "Timed"}</span>
    </div>`).join("") || `<div class="expansion-empty">${enabled ? "No live definitions configured." : "Enable this feature from Upcoming Features."}</div>`;
  } catch (error) {
    $("featureState").textContent = "OFF";
    $("featureState").className = "state-pill off";
    $("definitions").innerHTML = `<div class="expansion-empty">${escapeHtml(error.message)}</div>`;
  }
}
function escapeHtml(v) { return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
load();
