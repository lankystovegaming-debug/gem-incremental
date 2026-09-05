import { escapeHtml, formatMoney } from "./format.js";

// Presentation only: never calculate retention, award rewards, or infer a hidden threshold.
export const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const title = value => String(value || "").replaceAll(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
export const location = item => number(item.overdepth) > 0 ? `OD${number(item.overdepth)}` : number(item.depth) > 0 ? `D${number(item.depth)}` : "This run";
export const valueOf = items => (items || []).reduce((sum, item) => sum + number(item.value), 0);

export function progressMeter(value, target, label = "Expedition Progress") {
  const maximum = Math.max(0, number(target)), current = Math.min(maximum, Math.max(0, number(value)));
  return `<div class="exp-progress"><div><span>${escapeHtml(label)}</span><strong>${Math.floor(current).toLocaleString()} / ${maximum.toLocaleString()}</strong></div><div class="exp-progress__track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${maximum || 1}" aria-valuenow="${current}"><i style="width:${maximum ? current / maximum * 100 : 0}%"></i></div></div>`;
}

export function stat(label, value, note = "", tone = "") {
  return `<div class="exp-stat ${tone ? `exp-stat--${tone}` : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
}

export function findSection(heading, items, empty = "No finds yet.", note = "") {
  return `<section class="exp-panel"><div class="exp-panel__head"><h3>${escapeHtml(heading)}</h3><span>${items.length}</span></div>${note ? `<p class="exp-note">${escapeHtml(note)}</p>` : ""}${items.length ? `<ul class="exp-finds">${[...items].reverse().map(item => `<li class="${item.artifact ? "exp-find--artifact" : ""}"><div><small>${escapeHtml(location(item))}${item.status ? ` · ${escapeHtml(item.status)}` : ""}</small><strong>${escapeHtml(item.name || "Expedition find")}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div>${item.value > 0 ? `<b>${formatMoney(item.value)}</b>` : ""}</li>`).join("")}</ul>` : `<p class="exp-empty">${escapeHtml(empty)}</p>`}</section>`;
}

export function rewardText(item) {
  if (!item) return "";
  if (item.type === "jackpot") return `Mythic Potion ×${number(item.mythicPotions)} + Ancient Relic ×${number(item.ancientRelics)}`;
  const name = item.reward === "fragment" || item.type === "curse_fragments" ? "Curse Fragments" : title(item.id || item.reward || item.type);
  return `${name}${item.quantity || item.qty ? ` ×${number(item.quantity || item.qty)}` : ""}`;
}

export function mineFinds(run, registered = [], history = []) {
  const cargo = [], artifacts = [], owned = new Set(registered.map(x => x.artifact_key || x.key));
  for (const [items, status] of [[run.secured_cargo || [], "Secured"], [run.unsecured_cargo || [], "Unsecured"]]) {
    for (const item of items) {
      if (item.kind === "artifact") artifacts.push({ ...item, artifact: true, status: `${status} · Museum discovery`, detail: status === "Unsecured" ? "At risk until voluntary extraction" : "Protected for extraction" });
      else cargo.push({ ...item, status });
    }
  }
  const seen = new Set(owned);
  for (const item of run.protected_discoveries || []) {
    const duplicate = seen.has(item.key); seen.add(item.key);
    artifacts.push({ ...item, artifact: true, status: duplicate ? "Duplicate · Protected" : "New Museum discovery · Protected", detail: duplicate ? `Duplicate reward on settlement: ${formatMoney(number(item.duplicateValue))}` : "Registered when the expedition is settled" });
  }
  for (const item of history.filter(x => x.duplicate)) artifacts.push({ ...item, artifact: true, status: "Duplicate · Already awarded", detail: rewardText(item) });
  return { cargo, artifacts };
}

export function volcanicFinds(run) {
  const cargo = [], artifacts = [];
  for (const entry of run.event_log || []) {
    if (entry.kind === "cargo") cargo.push({ ...entry, name: entry.name || "Volcanic deposit", status: "Found", detail: "Original find value; current secured / unsecured totals include any losses" });
    if (entry.kind === "artifact") {
      const duplicate = entry.duplicate ?? (number(entry.value) > 0);
      const legacyName = String(entry.message || "Artifact").replace(/^Duplicate /, "").replace(/ added as unsecured cargo$/, "").replace(/^Museum discovery protected: /, "");
      artifacts.push({ ...entry, artifact: true, name: entry.name || legacyName, status: duplicate ? "Duplicate · Unsecured when found" : "New Museum discovery · Registered", detail: duplicate ? "Included in cargo totals; subject to losses until extraction" : "Protected in the Museum", value: duplicate ? number(entry.value) : 0 });
    }
  }
  return { cargo, artifacts };
}

export function outcome(run, before = {}) {
  const reason = run.extraction_reason || before.extraction_reason || before.pending?.cause;
  const labels = { voluntary: "Voluntary Extraction", critical_incident: "Critical Incident", second_od_critical: "Critical Incident · Emergency Shelter exhausted", overwhelming_eruption: "Overwhelming Eruption", forced: "Forced Extraction", doom_break: "Doom Break · Forced Extraction" };
  if (reason) return labels[reason] || title(reason);
  const log = run.event_log || [];
  if (log.some(x => x.kind === "overwhelming")) return "Overwhelming Eruption";
  if (log.some(x => /Second OD Critical forced extraction/.test(x.message || ""))) return labels.second_od_critical;
  if (log.some(x => x.kind === "critical" && x.message === "Critical incident")) return "Critical Incident";
  return before.status === "forced_extraction" ? "Forced Extraction" : "Voluntary Extraction";
}

// Settlement fields are the receipt's source of truth, never the wallet delta or pre-loss cargo.
export function completionSummary(destination, result, before = {}, artifactHistory = null) {
  if (result?.error) return null;
  const payload = result?.data || result || {}, run = payload.run;
  if (!run || run.status !== "settled" || !(payload.settlement || run.settlement)) return null;
  const settlement = payload.settlement || run.settlement;
  const volcanic = destination === "Volcanic Depths", hell = destination === "Abandoned Mine" && run.mode === "hell";
  const cargo = number(settlement.cargoValue), duplicates = number(settlement.duplicateArtifactSales ?? settlement.duplicateValue);
  const registered = volcanic ? volcanicFinds(run).artifacts.filter(x => !x.value) : settlement.registeredArtifacts || [];
  const history = artifactHistory || (Array.isArray(run.secured_cargo) ? run.secured_cargo.filter(x => x.kind === "artifact") : []);
  const found = volcanic ? volcanicFinds(run).artifacts : hell ? history : destination === "Crystal Caverns" ? run.artifact_find_log || run.secured_artifacts || [] : run.protected_discoveries || [];
  const recovered = hell ? (run.secured_cargo || []).filter(x => x.kind === "artifact") : destination === "Crystal Caverns" ? run.secured_artifacts || [] : run.protected_discoveries || [];
  const countKeys = items => { const counts = new Map(); for (const item of items) counts.set(item.key, (counts.get(item.key) || 0) + 1); return counts; };
  const remaining = countKeys(recovered), newKeys = countKeys(registered);
  const annotated = found.map(item => {
    if (volcanic) return item;
    if (hell && item.duplicate) return { ...item, status: "Duplicate · Already awarded" };
    if (!(remaining.get(item.key) > 0)) return { ...item, status: "Not recovered" };
    remaining.set(item.key, remaining.get(item.key) - 1);
    if (newKeys.get(item.key) > 0) { newKeys.set(item.key, newKeys.get(item.key) - 1); return { ...item, status: "New Museum discovery · Registered" }; }
    return { ...item, status: hell ? "Recovered · Already registered" : "Duplicate · Reward included below" };
  });
  const rewards = hell && run.hell_state?.hellCache ? [run.hell_state.hellCache.highEnd, ...(run.hell_state.hellCache.minor || [])].map(rewardText).filter(Boolean) : [];
  if (hell && run.hell_state?.weeklyMythicAwarded) rewards.push("Weekly Mythic Potion ×1");
  const duplicateRewards = hell ? history.filter(x => x.duplicate).map(x => `${x.name}: ${rewardText(x)} (already awarded)`) : [];
  return { destination, mode: run.mode || "normal", outcome: outcome(run, before), depth: number(run.depth), overdepth: number(run.overdepth), cargo, duplicates, total: cargo + duplicates, registered, found: annotated, rewards, duplicateRewards, volcanic, incompleteHistory: hell && artifactHistory === null, doomBreaks: hell ? run.hell_state?.doomBreaks || [] : [] };
}

export function completionMarkup(summary) {
  const list = (heading, rows) => rows.length ? `<section class="exp-receipt__section"><h3>${heading}</h3><ul>${rows.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : "";
  return `<p class="exp-eyebrow">${escapeHtml(summary.destination)} · ${summary.mode === "hell" ? "Hell" : "Normal"}</p><h2 id="exp-complete-title">Expedition Complete</h2><p class="exp-receipt__outcome">${escapeHtml(summary.outcome)}</p><div class="exp-stats">${stat("Deepest depth reached", `D${summary.depth}${summary.overdepth ? ` · OD${summary.overdepth}` : ""}`)}${summary.cargo > 0 ? stat(summary.volcanic ? "Cargo extracted (includes retained duplicates)" : "Cargo extracted", formatMoney(summary.cargo)) : ""}${summary.duplicates > 0 ? stat("Duplicate artifact rewards", formatMoney(summary.duplicates)) : ""}</div>${list("New Museum discoveries", summary.registered.map(x => x.name || x.artifact_name))}${list("Artifact finds", summary.found.map(x => `${x.name || x.artifact_name}${x.status ? ` · ${x.status}` : x.duplicate ? " · Duplicate" : ""}${summary.volcanic && x.value > 0 ? ` · Original find ${formatMoney(x.value)}` : ""}`))}${summary.volcanic && summary.found.some(x => x.value > 0) ? '<p class="exp-note">Duplicate find values are included in the cargo recovered above, after losses—not added again.</p>' : ""}${summary.incompleteHistory ? '<p class="exp-note">Full Hell artifact history is unavailable. Extracted totals are confirmed; deploy the expedition metadata migration to include the complete find history.</p>' : ""}${list("Duplicate rewards", summary.duplicateRewards)}${list("Rewards already awarded during this run", summary.rewards)}${list("Doom Breaks endured", summary.doomBreaks.map(title))}${summary.total > 0 ? `<div class="exp-receipt__total"><span>Total cash rewards</span><strong>${formatMoney(summary.total)}</strong></div>` : '<p class="exp-empty">No cash cargo recovered.</p>'}<div class="exp-receipt__actions"><button class="btn btn--primary" type="button" data-close-expedition>Close</button></div>`;
}

export function showExpeditionComplete(summary) {
  if (!summary) return;
  const previous = document.activeElement, dialog = document.createElement("dialog");
  dialog.className = "exp-receipt";
  dialog.setAttribute("aria-labelledby", "exp-complete-title");
  dialog.innerHTML = completionMarkup(summary);
  dialog.querySelector("[data-close-expedition]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { dialog.remove(); if (previous?.isConnected) previous.focus(); }, { once: true });
  document.body.append(dialog); dialog.showModal(); dialog.querySelector("button").focus();
}
