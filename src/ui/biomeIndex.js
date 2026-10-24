import { escapeHtml } from './format.js';

export function biomeStatusText(data, now = Date.now()) {
  const active = data?.active;
  const remaining = active ? Math.max(0, Date.parse(active.endsAt) - now) : 0;
  return remaining > 0 ? `${active.key} · ${Math.ceil(remaining / 1000)}s remaining` : 'Normal · no active biome';
}

export function biomeIndexHtml(data) {
  const entries = data?.entries ?? [];
  const found = entries.filter(e => e.discovered && !e.phenomenon).length;
  const card = entry => !entry.discovered
    ? `<article class="biome-card biome-card--unknown"><h3>Undiscovered biome</h3><p>Complete a genuine roll during an occurrence to discover it.</p></article>`
    : `<article class="biome-card"><h3>${escapeHtml(entry.key)}${entry.phenomenon ? ' · Phenomenon' : ''}</h3>
      <p>Lasts ${entry.durationMinutes} minutes · mean start interval ${entry.meanIntervalMinutes.toLocaleString()} minutes. Random timing, never a deadline.</p>
      <details><summary>Gem conditions</summary><ul>${(entry.gems ?? []).map(g => `<li>${escapeHtml(g.name)} · selection denominator 1 in ${Number(g.denominator).toLocaleString()}${g.exclusive ? ' · exclusive, optional prestige' : ''}</li>`).join('')}</ul></details></article>`;
  return `<p>${found} / 9 biomes discovered</p><p>Selection denominators affect sequential checks, not guaranteed final odds. Canonical rarity and independent time gates remain. Exclusive gems are optional prestige rewards.</p>
    <div class="biome-grid">${entries.filter(e => !e.phenomenon).map(card).join('')}</div>
    ${entries.some(e => e.phenomenon) ? `<h3>Phenomena</h3><div class="biome-grid">${entries.filter(e => e.phenomenon).map(card).join('')}</div>` : ''}`;
}

export function mountBiomeIndex(root, client, {compact = false} = {}) {
  if (!root) return () => {};
  let activeId;
  let initialized = false;
  let disposed = false;
  let pending = false;
  let latest;
  let offset = 0;
  let renderedSignature;
  let knownDiscoveries = new Set();
  let acceptedBatchPeriodMs = 0;
  root.innerHTML = `${compact ? '<a href="../gem-index/">Biome Index</a>' : '<h2>Biome Index</h2>'}<p aria-live="off" data-biome-status>Loading biomes…</p><div data-biome-entries></div>${compact ? '<p data-biome-batch-warning></p>' : ''}`;
  const status = root.querySelector('[data-biome-status]');
  const content = root.querySelector('[data-biome-entries]');
  const batchWarning = root.querySelector('[data-biome-batch-warning]');
  function paintBatchWarning() {
    if (!batchWarning) return;
    const duration = Date.parse(latest?.active?.endsAt) - Date.parse(latest?.active?.startsAt);
    batchWarning.textContent = duration > 0 && acceptedBatchPeriodMs > duration
      ? `Your last accepted batch period (${Math.ceil(acceptedBatchPeriodMs / 1000)}s) exceeds this occurrence's duration (${Math.round(duration / 1000)}s). Select batch 1 to sample more often.` : '';
  }
  const onBatchPeriod = event => { acceptedBatchPeriodMs = Number(event.detail?.periodMs) || 0; paintBatchWarning(); };
  root.addEventListener('biome-batch-period',onBatchPeriod);
  async function refresh() {
    if (disposed || pending || document.hidden) return;
    pending = true;
    try {
      const {data,error} = await client.rpc('get_biome_index');
      if (error) { status.textContent = 'Biome Index unavailable'; return; }
      latest = data;
      offset = Date.parse(data.serverTime) - Date.now();
      const signature = JSON.stringify(compact ? data.tournament : data.entries);
      if (signature !== renderedSignature) content.innerHTML = compact ? (data.tournament ? '<p>Biome-neutral Tournament Mode</p>' : '<p>Batch eligibility is fixed when accepted. Large batches can miss short occurrences; use batch 1 to sample more often.</p>') : biomeIndexHtml(data);
      renderedSignature = signature;
      status.textContent = biomeStatusText(data,Date.now()+offset);
      if (initialized && data.active?.id && data.active.id !== activeId) {
        root.dispatchEvent(new CustomEvent('biome-start',{detail:data.active}));
      }
      if (initialized && activeId && !data.active?.id) root.dispatchEvent(new CustomEvent('biome-end'));
      const discoveries = new Set((data.entries ?? []).filter(e => e.discovered).map(e => e.key));
      if (initialized) for (const key of discoveries) if (!knownDiscoveries.has(key)) root.dispatchEvent(new CustomEvent('biome-discovery',{detail:{key}}));
      knownDiscoveries = discoveries;
      root.dataset.biomeKey = data.active?.key ?? 'Normal';
      paintBatchWarning();
      activeId = data.active?.id;
      initialized = true;
    } catch { status.textContent = 'Biome Index unavailable'; } finally { pending = false; }
  }
  const poll = setInterval(refresh,15000);
  const countdown = setInterval(() => {
    if (latest && !document.hidden) status.textContent = biomeStatusText(latest,Date.now()+offset);
  },1000);
  document.addEventListener('visibilitychange',refresh);
  refresh();
  return () => {root.removeEventListener('biome-batch-period',onBatchPeriod);disposed=true;clearInterval(poll);clearInterval(countdown);document.removeEventListener('visibilitychange',refresh);};
}
