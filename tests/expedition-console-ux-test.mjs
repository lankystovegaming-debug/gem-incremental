import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { completionSummary, completionMarkup, volcanicFinds, mineFinds, progressMeter, rewardText, outcome } from "../src/ui/expeditionConsole.js";
import { consoleHarness, mineRun, mineDashboard, hellRun, hellDashboard, volcanicRun, volcanicDashboard } from "./expedition-console-harness.mjs";

assert.equal(completionSummary("Abandoned Mine", { run: mineRun }), null);
assert.equal(completionSummary("Abandoned Mine", { error: { message: "failed" }, data: { run: {status:"settled",settlement:{cargoValue:10}} } }), null);
const lostCrystal = completionSummary("Crystal Caverns", { run: {status:"settled",depth:4,artifact_find_log:[{key:"lost",name:"Lost crystal"}],secured_artifacts:[],settlement:{cargoValue:0,registeredArtifacts:[]}} });
assert.equal(lostCrystal.found[0].status, "Not recovered");
for (const destination of ["Abandoned Mine", "Crystal Caverns", "Volcanic Depths"]) {
  for (const mode of destination === "Volcanic Depths" ? ["normal"] : ["normal", "hell"]) {
    const result = { data: { run: { id: 1, status: "settled", mode, depth: 10, overdepth: 7, secured_cargo: [], extraction_reason: "critical_incident" }, settlement: { cargoValue: 123, duplicateValue: destination === "Volcanic Depths" ? 0 : 25, registeredArtifacts: [{ name: "Test artifact" }], money: 99999999 } } };
    const summary = completionSummary(destination, result, { unsecured_cargo: 9999999 });
    assert.equal(summary.total, destination === "Volcanic Depths" ? 123 : 148, "uses settlement, not wallet or pre-loss cargo");
    assert.equal(summary.outcome, "Critical Incident");
    assert.match(completionMarkup(summary), /Expedition Complete/);
    assert.match(completionMarkup(summary), /D10 · OD7/);
    assert.doesNotMatch(completionMarkup(summary), /99,999,999/);
  }
}
const zero = completionSummary("Crystal Caverns", { run: { status: "settled", depth: 1, settlement: { cargoValue: 0 } } });
assert.doesNotMatch(completionMarkup(zero), /Duplicate artifact rewards|New Museum discoveries|\$0/);
assert.match(completionMarkup(zero), /No cash cargo recovered/);
assert.equal(outcome({ extraction_reason: "overwhelming_eruption" }), "Overwhelming Eruption");
assert.equal(outcome({ extraction_reason: "voluntary", hell_state: { lastDoomBreak: "failed_recovery" } }), "Voluntary Extraction");
const volcano = completionSummary("Volcanic Depths", { run: { ...volcanicRun, status: "settled", settlement: { cargoValue: 850000 } } });
assert.equal(volcano.total, 850000, "duplicate find value must not be added to retained cargo");
assert.equal(volcano.registered.length, 1);
const vFinds = volcanicFinds(volcanicRun);
assert.equal(vFinds.cargo.length, 1); assert.equal(vFinds.artifacts.length, 2);
const legacy = volcanicFinds({ event_log: [{ kind: "artifact", message: "Duplicate Melted Seismograph added as unsecured cargo", value: 1250000 }] });
assert.equal(legacy.artifacts[0].name, "Melted Seismograph");
const mFinds = mineFinds(mineRun);
assert.equal(mFinds.cargo.length, 2); assert.equal(mFinds.artifacts.length, 2);
assert.match(mFinds.artifacts[1].status, /Duplicate/);
assert.match(progressMeter(-20, 0), /aria-valuenow="0"/);
assert.doesNotMatch(progressMeter(Infinity, 100), /NaN|Infinity/);
assert.equal(rewardText({ type: "jackpot", mythicPotions: 3, ancientRelics: 5 }), "Mythic Potion ×3 + Ancient Relic ×5");
const hellSummary = completionSummary("Abandoned Mine", { run: { ...hellRun, status: "settled", settlement: { cargoValue: 100 }, hell_state: { ...hellRun.hell_state, weeklyMythicAwarded: true, hellCache: { highEnd: { type: "consumable", id: "mythic-potion", quantity: 1 }, minor: [{ type: "curse_fragments", quantity: 3 }] } } } }, {}, [{ name: "Doomstone", duplicate: true, reward: "legendary-potion", qty: 2 }]);
assert.equal(hellSummary.total, 100); assert.equal(hellSummary.rewards.length, 3); assert.equal(hellSummary.duplicateRewards.length, 1);
assert.doesNotMatch(completionMarkup(hellSummary), /\{"type"/);

const mine = await consoleHarness("mine");
for (const status of ["active", "checkpoint_decision", "awaiting_route", "awaiting_funding", "ready_to_extract", "forced_extraction", "extracted"]) {
  const html = mine.render({ ...mineDashboard, run: { ...mineRun, status } }, { ...hellDashboard, run: null });
  assert.match(html, /Normal Cargo Finds/); assert.match(html, /Artifact Finds/);
  assert.doesNotMatch(html, /undefined|NaN/);
}
for (const phase of ["objective", "cards", "event", "cleared"]) {
  const html = mine.render(mineDashboard, { ...hellDashboard, run: { ...hellRun, hell_state: { ...hellRun.hell_state, phase } } });
  assert.match(html, /High/); assert.doesNotMatch(html, /undefined%|NaN/);
  if (phase === "cards") assert.equal((html.match(/Face-down card/g) || []).length, 2);
}
mine.render(mineDashboard, { ...hellDashboard, run: { ...hellRun, status: "ready_to_extract" } });
await mine.perform("hell-overdepth");
const confirmation = mine.dialogs.at(-1);
assert.match(confirmation.body, /ENTIRE unsecured cargo/); assert.match(confirmation.body, /available again after clearing/);
assert.equal(confirmation.confirmLabel, "Descend"); assert.equal(confirmation.cancelLabel, "Cancel"); assert.equal(confirmation.defaultAction, "cancel");
assert.doesNotMatch(confirmation.body, /forfeit/);

const volcanic = await consoleHarness("volcanic");
for (const state of ["stable", "heating", "unstable", "critical", "eruption", "unknown"]) {
  const html = volcanic.render({ ...volcanicDashboard, run: { ...volcanicRun, activity_state: state } });
  assert.match(html, new RegExp(`volcanic-monitor--${state}`));
  assert.match(html, /volcanic-forecast-band/); assert.match(html, /129–139 Activity/);
  assert.doesNotMatch(html.split('<details class="volcanic-log">')[1], /Melted Seismograph|Pyroclastic Crystal/);
  assert.doesNotMatch(html, /NaN|undefined/);
}
const unknown = volcanic.render({ ...volcanicDashboard, run: { ...volcanicRun, forecast_low: null, forecast_high: null } });
assert.doesNotMatch(unknown, /class="volcanic-forecast-band"/); assert.match(unknown, /Unknown/);
const injected = volcanic.render({ ...volcanicDashboard, run: { ...volcanicRun, event_log: [{ kind: "artifact", name: '<img src=x onerror="alert(1)">', duplicate: false }] } });
assert.doesNotMatch(injected, /<img src=x/); assert.match(injected, /&lt;img/);

// Prove the migration's roll function is mechanically identical after removing metadata helper calls.
const original = await fs.readFile(new URL("../supabase/migrations/20260902063117_volcanic_depths_normal_v1.sql", import.meta.url), "utf8");
const migration = await fs.readFile(new URL("../supabase/migrations/20260904120000_expedition_console_metadata.sql", import.meta.url), "utf8");
const functionBody = (text, name) => text.slice(text.indexOf(`create or replace function public.${name}(`), text.indexOf("end $$;", text.indexOf(`create or replace function public.${name}(`)) + 7);
const restored = functionBody(migration, "record_volcanic_depth_roll").replace("r:=public.volcanic_award_cargo(r,public.volcanic_cargo_value(10,r.overdepth));", "r.unsecured_cargo:=r.unsecured_cargo+public.volcanic_cargo_value(10,r.overdepth);").replace("r:=public.volcanic_award_cargo(r,public.volcanic_cargo_value(r.depth));", "r.unsecured_cargo:=r.unsecured_cargo+public.volcanic_cargo_value(r.depth);");
assert.equal(restored, functionBody(original, "record_volcanic_depth_roll"));
assert.match(migration, /t.player_id=auth.uid\(\)/); assert.match(migration, /old.pending->>'cause'/);
assert.doesNotMatch(migration, /update public.players|create or replace function public.record_abandoned_mine_roll/);
assert.match(migration,/except all/);assert.match(migration,/is not distinct from old.unsecured_artifacts/);
console.log("Expedition console UX: all five modes, receipts, find separation, confirmations, state rendering, XSS escaping and metadata-only migration checks passed.");
