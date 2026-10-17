import { escapeHtml } from './format.js';

let historyPromise;
export function loadUpdateHistory() {
  historyPromise ??= fetch(new URL('../../updates/history.json', import.meta.url), { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('Update history unavailable');
      return response.json();
    }).catch((error) => { historyPromise = null; throw error; });
  return historyPromise;
}

export function formatUpdateDate(value) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

export function renderUpdateSections(entry) {
  return entry.sections.map((section) => `<section class="update-section">
    <h3>${escapeHtml(section.heading)}</h3>
    <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
  </section>`).join('');
}

export function renderUpdate(entry, latest = false) {
  return `<article class="update-card${latest ? ' update-card--latest' : ''}" id="pr-${Number(entry.pr)}">
    <header class="update-card__header"><div class="update-card__meta">
      ${latest ? '<span class="update-card__badge">Latest</span>' : ''}
      ${entry.weekly ? '<span class="update-card__badge">Weekly update</span>' : ''}
      <time datetime="${escapeHtml(entry.published_on)}">${escapeHtml(formatUpdateDate(entry.published_on))}</time>
    </div><h2>${escapeHtml(entry.title)}</h2></header>
    ${renderUpdateSections(entry)}
  </article>`;
}
