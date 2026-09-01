import { mountShell } from "../src/ui/shell.js";
import { loadActiveGlobalEvent } from "../src/backend/cloudGlobalEvents.js";

mountShell({ page: "mining-events", base: "../" });
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const duration = milliseconds => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}`;
};

async function load() {
  const { data:event,error } = await loadActiveGlobalEvent();
  if (error || !event?.id) {
    $("featureState").textContent = "QUIET";
    $("featureState").className = "state-pill";
    $("activeEvent").innerHTML = '<div class="expansion-empty">No global mining event is active. The next event time is intentionally hidden.</div>';
    return;
  }
  $("featureState").textContent = String(event.tier).toUpperCase();
  $("featureState").className = "state-pill on";
  const mass = event.massTarget ? `<small>Community Mass: ${Math.min(100,event.mass/event.massTarget*100).toFixed(1)}%</small>` : "";
  $("activeEvent").innerHTML = `<div class="expansion-item active-event-card"><div><strong>${escapeHtml(event.icon)} ${escapeHtml(event.name)}</strong><small>${escapeHtml(event.description)}</small>${mass}</div><span data-ends-at="${escapeHtml(event.endsAt)}"></span></div>`;
  const timer = $("activeEvent").querySelector("[data-ends-at]");
  const update = () => { timer.textContent = duration(new Date(event.endsAt).getTime()-Date.now()); };
  update();
  setTimeout(update,1000);
}

$("details").innerHTML = `<p><strong>Twenty-five server-authoritative global events run around the clock.</strong></p><p>Natural events never overlap, the previous five are excluded from selection, and the next event time remains hidden.</p><ul><li>8 Common · 60%</li><li>8 Uncommon · 30%</li><li>6 Rare · 9%</li><li>3 Legendary · 1%</li></ul>`;
load();
setInterval(load,15000);
