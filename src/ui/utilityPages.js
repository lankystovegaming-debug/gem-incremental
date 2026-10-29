// Presentation enhancements for utility pages. All actions use existing handlers.
const settingsPicker = document.getElementById('settingsCategory');
const settingsLinks = [...document.querySelectorAll('.settings-category-links a')];
function syncSettingsCategory() {
  const id = location.hash.slice(1) || settingsPicker?.value;
  if (!settingsLinks.some(link => link.hash === `#${id}`)) return;
  settingsPicker.value = id;
  for (const link of settingsLinks) {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
if (settingsPicker) {
  for (const link of settingsLinks) document.querySelector(link.hash)?.setAttribute('tabindex', '-1');
  settingsPicker.addEventListener('change', () => {
    location.hash = settingsPicker.value;
    const heading = document.getElementById(settingsPicker.value);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  });
  window.addEventListener('hashchange', syncSettingsCategory);
  syncSettingsCategory();
}

const craftingPicker = document.getElementById('craftingCategory');
const craftingTabs = document.querySelector('.crafting-tabs');
if (craftingPicker && craftingTabs) {
  const sync = () => {
    const tabs = [...craftingTabs.querySelectorAll('[role="tab"]')].filter(tab => !tab.hidden);
    const options = tabs.map(tab => new Option(tab.textContent.trim(), tab.dataset.craftingGroup));
    craftingPicker.replaceChildren(...options);
    craftingPicker.value = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.craftingGroup || '';
  };
  craftingPicker.addEventListener('change', () => {
    [...craftingTabs.querySelectorAll('[role="tab"]')]
      .find(tab => tab.dataset.craftingGroup === craftingPicker.value && !tab.hidden)?.click();
  });
  new MutationObserver(sync).observe(craftingTabs, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'hidden'] });
  sync();
}

// Complete the existing tabs' keyboard contract without replacing click handlers.
for (const list of document.querySelectorAll('main [role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  for (const [index, tab] of tabs.entries()) {
    tab.id ||= `utility-tab-${[...document.querySelectorAll('main [role="tablist"]')].indexOf(list)}-${index}`;
    const panelId = tab.getAttribute('aria-controls') || (list === craftingTabs || list.matches('.crafting-subtabs') ? 'recipeList' : null)
      || ({browseTab:'browseSection',sellTab:'sellSection',mineTab:'mineSection',browseAuctionMode:'browseList',browseBlackMarketMode:'browseList'})[tab.id];
    const panel = panelId && document.getElementById(panelId);
    if (panel) {
      tab.setAttribute('aria-controls', panelId);
      panel.setAttribute('role', 'tabpanel');
    }
  }
  const sync = () => {
    for (const tab of tabs) {
      if (tab.getAttribute('aria-selected') === 'true' && !list.hidden) {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        panel?.setAttribute('aria-labelledby', tab.id);
      }
    }
    for (const tab of tabs) tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
  };
  list.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const visible = tabs.filter(tab => !tab.disabled && tab.getClientRects().length);
    const index = visible.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
      : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + visible.length) % visible.length;
    visible[next].focus();
    visible[next].click();
  });
  new MutationObserver(sync).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  sync();
}

const equipmentList = document.getElementById('equipmentList');
const equipmentSearch = document.getElementById('equipmentSearch');
const equipmentStatus = document.getElementById('equipmentStatus');
if (equipmentList && equipmentSearch && equipmentStatus) {
  const filter = () => {
    const cards = [...equipmentList.querySelectorAll('[data-equipment-name]')];
    for (const card of cards) {
      card.hidden = !card.dataset.equipmentName.toLowerCase().includes(equipmentSearch.value.trim().toLowerCase())
        || (equipmentStatus.value !== 'all' && (card.dataset.equipped === 'true') !== (equipmentStatus.value === 'equipped'));
    }
    document.getElementById('equipmentResults').textContent = cards.length
      ? `${cards.filter(card => !card.hidden).length} of ${cards.length} items shown` : '';
  };
  equipmentSearch.addEventListener('input', filter);
  equipmentStatus.addEventListener('change', filter);
  new MutationObserver(filter).observe(equipmentList, {childList:true});
  filter();
}
