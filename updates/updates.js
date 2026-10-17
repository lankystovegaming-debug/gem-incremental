import { mountShell } from '../src/ui/shell.js';
import { loadUpdateHistory, renderUpdate } from '../src/ui/updateLog.js';
import { searchUpdates } from '../src/logic/updateHistory.js';

mountShell({ page: 'updates', base: '../' });
const list = document.getElementById('publishedUpdates');
const status = document.getElementById('updateStatus');
const search = document.getElementById('updateSearch');
const more = document.getElementById('moreUpdates');
let entries = [];
let count = 20;

function render() {
  const matches = searchUpdates(entries, search.value);
  list.innerHTML = matches.slice(0, count).map((entry) => renderUpdate(entry, entry === entries[0])).join('');
  status.textContent = matches.length ? `${Math.min(count, matches.length)} of ${matches.length} updates` : 'No updates found.';
  more.hidden = count >= matches.length;
}
search.addEventListener('input', () => { count = 20; render(); });
more.addEventListener('click', () => { count += 20; render(); });
loadUpdateHistory().then((history) => {
  entries = history.sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
  render();
}).catch(() => { status.textContent = 'Updates could not be loaded. Refresh to try again.'; });
