import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { escapeHtml } from "../src/ui/format.js";

mountShell({ page: "mutation-index", base: "../" });

const ids = ["list", "mutationCount", "discoveredCount", "totalDiscoveries", "rarestMutation", "mutationSearch", "mutationSort", "clearSearch", "catalogStatus"];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
let mutations = [];
let discoveries = new Map();

function exact(value, maximumFractionDigits = 8) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits })
    : "—";
}

function chanceBand(chance) {
  const number = Number(chance);
  return number >= 1e8 ? "Extreme" : number >= 1e6 ? "Ultra rare" : number >= 1e5 ? "Very rare" : number >= 1e4 ? "Rare" : "Uncommon";
}

function normalizeCatalog(payload) {
  let rows = payload;
  if (rows && !Array.isArray(rows) && typeof rows === "object") rows = rows.mutations ?? rows.rows ?? rows.data ?? rows.result ?? rows.catalog ?? rows.items ?? [];
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.flatMap((row) => {
    const id = String(row?.id ?? "").trim();
    const name = String(row?.name ?? "").trim();
    const chance = Number(row?.chance);
    const multiplier = Number(row?.multiplier);
    if (!id || !name || chance <= 0 || !Number.isFinite(chance) || !Number.isFinite(multiplier) || seen.has(id)) return [];
    seen.add(id);
    const color = String(row.color ?? "");
    return [{ id, name, chance, multiplier, description: String(row.description ?? "").trim(), credit: String(row.description_credit ?? row.descriptionCredit ?? "").trim(), icon: String(row.icon ?? "✦").trim() || "✦", color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#8b5cf6" }];
  });
}

async function loadCatalog() {
  const failures = [];
  for (const name of ["get_gem_index_mutation_catalog_v3", "get_public_mutation_catalog", "get_gem_index_mutation_catalog", "get_public_mutation_catalog_json", "get_public_mutation_catalog_all"]) {
    const { data, error } = await supabase.rpc(name);
    const rows = error ? [] : normalizeCatalog(data);
    if (rows.length) return rows;
    failures.push(error?.message ?? `${name} returned no rows`);
  }
  const { data, error } = await supabase.from("game_mutations").select("id,name,chance,multiplier,description,description_credit,icon,color").eq("enabled", true);
  const rows = error ? [] : normalizeCatalog(data);
  if (rows.length) return rows;
  throw new Error(error?.message ?? failures[0] ?? "Mutation catalog unavailable");
}

async function loadDiscoveries(playerId) {
  const pageSize = 1000;
  const totals = new Map();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("player_gem_mutation_combinations")
      .select("id,mutation_ids,total_found")
      .eq("player_id", playerId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const found = Math.max(0, Number(row.total_found ?? 0));
      for (const mutationId of new Set(row.mutation_ids ?? [])) {
        const id = String(mutationId).trim().toLowerCase();
        if (id) totals.set(id, (totals.get(id) ?? 0) + found);
      }
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  return totals;
}

function sortedRows(rows) {
  const mode = el.mutationSort?.value ?? "multiplier-asc";
  return [...rows].sort((a, b) => mode === "chance-desc" ? b.chance - a.chance || a.name.localeCompare(b.name) : mode === "chance-asc" ? a.chance - b.chance || a.name.localeCompare(b.name) : mode === "multiplier-desc" ? b.multiplier - a.multiplier || a.name.localeCompare(b.name) : mode === "name" ? a.name.localeCompare(b.name) : a.multiplier - b.multiplier || a.name.localeCompare(b.name));
}

function lockedCard(index) {
  return `<article class="mutation-index-card mutation-index-card--locked"><div class="mutation-index-card__top"><span class="mutation-index-card__icon" aria-hidden="true">?</span><div class="mutation-index-card__heading"><h2>Undiscovered mutation</h2><span>Entry ${index + 1}</span></div></div><p class="mutation-index-card__description">Roll this mutation to reveal its name, natural odds, multiplier, and description.</p><dl class="mutation-index-stats"><div><dt>Base chance</dt><dd>???</dd></div><div><dt>Value multiplier</dt><dd>???</dd></div></dl><p class="mutation-index-discoveries">Not discovered yet</p></article>`;
}

function revealedCard(mutation) {
  const count = discoveries.get(mutation.id) ?? 0;
  return `<article class="mutation-index-card" style="--mutation-color:${escapeHtml(mutation.color)}"><div class="mutation-index-card__top"><span class="mutation-index-card__icon" aria-hidden="true">${escapeHtml(mutation.icon)}</span><div class="mutation-index-card__heading"><h2>${escapeHtml(mutation.name)}</h2><span>${chanceBand(mutation.chance)}</span></div></div><p class="mutation-index-card__description">${escapeHtml(mutation.description || "No description has been added yet.")}</p><dl class="mutation-index-stats"><div><dt>Base chance</dt><dd>1 in ${exact(mutation.chance)}</dd></div><div><dt>Value multiplier</dt><dd>×${exact(mutation.multiplier)}</dd></div></dl><p class="mutation-index-discoveries">Discovered <strong>${exact(count)}</strong> ${count === 1 ? "time" : "times"}</p>${mutation.credit ? `<p class="mutation-index-credit">${escapeHtml(mutation.credit)}</p>` : ""}</article>`;
}

function render() {
  const query = el.mutationSearch?.value.trim().toLowerCase() ?? "";
  const filtered = mutations.filter((mutation) => {
    const found = discoveries.has(mutation.id);
    const searchable = found ? [mutation.name, mutation.description, mutation.credit, mutation.id, chanceBand(mutation.chance)] : ["undiscovered", "locked"];
    return !query || searchable.join(" ").toLowerCase().includes(query);
  });
  const rows = sortedRows(filtered);
  if (el.clearSearch) el.clearSearch.hidden = !query;
  if (el.catalogStatus) el.catalogStatus.textContent = query ? `Showing ${rows.length} of ${mutations.length} entries` : `${discoveries.size} of ${mutations.length} mutations discovered`;
  if (!el.list) return;
  el.list.setAttribute("aria-busy", "false");
  el.list.innerHTML = rows.length ? rows.map((mutation, index) => discoveries.has(mutation.id) ? revealedCard(mutation) : lockedCard(index)).join("") : `<div class="mutation-index-empty"><span aria-hidden="true">⌕</span><strong>No mutations found</strong><p>Try a different search.</p></div>`;
}

function renderSummary() {
  const discovered = mutations.filter((mutation) => discoveries.has(mutation.id));
  const rarest = [...discovered].sort((a, b) => b.chance - a.chance)[0];
  if (el.mutationCount) el.mutationCount.textContent = exact(mutations.length);
  if (el.discoveredCount) el.discoveredCount.textContent = `${exact(discovered.length)} / ${exact(mutations.length)}`;
  if (el.totalDiscoveries) el.totalDiscoveries.textContent = exact([...discoveries.values()].reduce((sum, value) => sum + value, 0));
  if (el.rarestMutation) el.rarestMutation.textContent = rarest ? `1 in ${exact(rarest.chance)}` : "—";
}

el.mutationSearch?.addEventListener("input", render);
el.mutationSort?.addEventListener("change", render);
el.clearSearch?.addEventListener("click", () => { el.mutationSearch.value = ""; el.mutationSearch.focus(); render(); });

try {
  const user = await ensurePlayerAuth();
  if (!user) throw new Error("Could not sign in to load discoveries");
  [mutations, discoveries] = await Promise.all([loadCatalog(), loadDiscoveries(user.id)]);
  renderSummary();
  render();
} catch (error) {
  console.error("Mutation Index failed:", error);
  if (el.catalogStatus) el.catalogStatus.textContent = "Catalog unavailable";
  if (el.list) {
    el.list.setAttribute("aria-busy", "false");
    el.list.innerHTML = `<div class="mutation-index-empty mutation-index-empty--error"><span aria-hidden="true">!</span><strong>Could not load the Mutation Index</strong><p>Please refresh the page and try again.</p><button type="button" id="retryCatalog">Retry</button></div>`;
    document.getElementById("retryCatalog")?.addEventListener("click", () => location.reload());
  }
}
