import { groups, events } from './content.js';
import { escapeHtml as escape } from '../src/ui/format.js';

export const normalizeSearch = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function matchesSearch(text, query) {
  const haystack = normalizeSearch(text);
  return normalizeSearch(query).split(' ').every(word => haystack.includes(word));
}
const entries = new Map(groups.flatMap(group => group.articles.map(entry => [entry.id, entry])));
const paragraphs = lines => lines.map(line => `<p>${escape(line)}</p>`).join('');
const permalink = (id, title) => `<a class="info-permalink" href="#${id}" aria-label="Link to ${escape(title)}">Link <span aria-hidden="true">↗</span></a>`;

function renderEvents() {
  return `<div class="info-events">${['common', 'uncommon', 'rare', 'legendary'].map(tier => `
    <section class="info-event-tier" data-tier="${tier}" aria-labelledby="tier-${tier}">
      <h4 id="tier-${tier}">${tier[0].toUpperCase() + tier.slice(1)}</h4>
      <div class="info-event-grid">${events.filter(event => event.tier === tier).map(event => `
        <article class="info-event" id="${event.id}" tabindex="-1">
          <h5>${escape(event.title)}</h5><p>${escape(event.description)}</p>${permalink(event.id, event.title)}
        </article>`).join('')}</div>
    </section>`).join('')}</div>`;
}

export function renderManual() {
  return groups.map(group => `
    <details class="info-group" id="${group.id}">
      <summary><span><h2>${escape(group.title)}</h2><span class="info-definition">${escape(group.description)}</span></span><span class="info-count">${group.articles.length} topics</span></summary>
      <div class="info-group-body">${group.articles.map(entry => `
        <details class="info-article" id="${entry.id}">
          <summary><span><h3>${escape(entry.title)}</h3><span class="info-definition">${escape(entry.definition)}</span></span></summary>
          <div class="info-article-body">
            ${paragraphs(entry.paragraphs)}
            ${entry.callout ? `<p class="info-callout">${escape(entry.callout)}</p>` : ''}
            ${entry.advanced ? `<details class="info-advanced"><summary>Advanced details</summary>${paragraphs(entry.advanced)}</details>` : ''}
            ${entry.events ? renderEvents() : ''}
            <nav class="info-related" aria-label="${escape(entry.title)} links">
              ${permalink(entry.id, entry.title)}
              ${(entry.related ?? []).map(id => `<a href="#${id}">${escape(entries.get(id).title)}</a>`).join('')}
              ${(entry.links ?? []).map(([href, title]) => `<a href="${escape(href)}">${escape(title)} ↗</a>`).join('')}
            </nav>
          </div>
        </details>`).join('')}</div>
    </details>`).join('');
}

export function initManual(root = document) {
  const list = root.getElementById('infoGroups');
  const search = root.getElementById('infoSearch');
  const status = root.getElementById('infoStatus');
  const clear = root.getElementById('infoClear');
  const empty = root.getElementById('infoEmpty');
  list.innerHTML = renderManual();
  let savedOpen = null;
  const allDetails = () => [...list.querySelectorAll('details')];
  const searchableText = entry => [entry.title, entry.definition, ...entry.paragraphs, entry.callout, ...(entry.advanced ?? []), ...(entry.aliases ?? [])].filter(Boolean).join(' ');

  function filter() {
    const query = search.value.trim();
    if (query && !savedOpen) savedOpen = new Set(allDetails().filter(el => el.open));
    let count = 0;
    for (const group of groups) {
      const groupElement = root.getElementById(group.id);
      let visible = 0;
      for (const entry of group.articles) {
        const element = root.getElementById(entry.id);
        const ownMatch = matchesSearch(`${group.title} ${searchableText(entry)}`, query);
        const eventMatches = entry.events ? events.filter(event => matchesSearch(`${event.tier} ${event.title} ${event.description}`, query)) : [];
        element.hidden = Boolean(query) && !ownMatch && !eventMatches.length;
        if (!element.hidden) visible++;
        if (query) element.open = !element.hidden;
        if (entry.events) {
          for (const event of events) root.getElementById(event.id).hidden = Boolean(query) && !ownMatch && !eventMatches.includes(event);
          list.querySelectorAll('.info-event-tier').forEach(tier => { tier.hidden = [...tier.querySelectorAll('.info-event')].every(el => el.hidden); });
        }
        element.querySelectorAll('.info-advanced').forEach(el => {
          if (query) el.open = matchesSearch((entry.advanced ?? []).join(' '), query);
        });
      }
      count += visible;
      groupElement.hidden = !visible;
      if (query) groupElement.open = visible > 0;
    }
    if (!query && savedOpen) {
      allDetails().forEach(el => { el.open = savedOpen.has(el); });
      savedOpen = null;
    }
    clear.hidden = !query;
    empty.hidden = count > 0;
    status.textContent = query ? `${count} matching ${count === 1 ? 'topic' : 'topics'}` : '6 groups · Open a group or search for a mechanic.';
  }

  function openHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = root.getElementById(id);
    if (!target || !list.contains(target)) return;
    search.value = '';
    filter();
    let node = target;
    while (node && node !== list) {
      if (node.tagName === 'DETAILS') node.open = true;
      node = node.parentElement;
    }
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      (target.querySelector('summary') ?? target).focus({ preventScroll: true });
    });
  }

  search.addEventListener('input', filter);
  clear.addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  root.getElementById('infoCollapse').addEventListener('click', () => {
    search.value = ''; filter(); allDetails().forEach(el => { el.open = false; });
  });
  // Clicking an already-current hash must reopen a manually collapsed target too.
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.hash === location.hash) { event.preventDefault(); openHash(); }
  });
  window.addEventListener('hashchange', openHash);
  filter();
  openHash();
}
