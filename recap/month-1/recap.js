import { supabase } from '../../src/backend/supabase.js';
import { globalRecap, personalRecap, shareSummary, summarySvg } from './render.js';

const content = document.getElementById('recap-content');
const status = document.getElementById('recap-status');
const errorMessage = document.getElementById('recap-error');
const retry = document.getElementById('retry');
let data = null;
let view = location.hash === '#you' ? 'personal' : 'global';
let timer;
let loading = false;
let authGeneration = 0;
let disposed = false;

function render() {
  document.getElementById('global-tab').setAttribute('aria-pressed', String(view === 'global'));
  document.getElementById('personal-tab').setAttribute('aria-pressed', String(view === 'personal'));
  if (!data) return;
  content.innerHTML = view === 'global' ? globalRecap(data) : personalRecap(data);
  document.getElementById('share-summary')?.addEventListener('click', share);
  document.getElementById('copy-summary')?.addEventListener('click', copy);
  document.getElementById('download-summary')?.addEventListener('click', download);
}

async function refresh() {
  if (loading || disposed) return;
  clearTimeout(timer);
  loading = true;
  const generation = authGeneration;
  try {
    const response = await supabase.rpc('get_month_one_recap');
    if (generation !== authGeneration || disposed) return;
    if (response.error) throw response.error;
    if (!response.data?.global || !['live', 'final'].includes(response.data.status)) throw new Error('Invalid recap response');
    data = response.data;
    errorMessage.hidden = true;
    retry.hidden = true;
    const asOf = new Date(data.asOf).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' });
    status.textContent = data.status === 'final'
      ? 'FINAL • Month One statistics are permanently frozen'
      : `LIVE • Updated ${asOf} SGT • Updates until Sep 8, 12:00 AM SGT`;
    render();
  } catch (error) {
    if (generation !== authGeneration || disposed) return;
    errorMessage.textContent = data
      ? 'Could not refresh. Showing the last successful recap; its status may be out of date.'
      : 'Month One is unavailable right now. Please try again shortly.';
    errorMessage.hidden = false;
    retry.hidden = false;
    if (!data) status.textContent = 'Waiting for Month One data';
  } finally {
    loading = false;
    content.setAttribute('aria-busy', 'false');
    if (!disposed && generation !== authGeneration) {
      clearTimeout(timer);
      timer = setTimeout(refresh, 0);
    } else if (!disposed && data?.status !== 'final' && !document.hidden) {
      // The server alone decides whether we're live. A bad local clock cannot freeze the recap.
      timer = setTimeout(refresh, 45_000);
    }
  }
}

function shareStatus(message) {
  const element = document.getElementById('share-status');
  if (element) element.textContent = message;
}
async function copy() {
  try {
    await navigator.clipboard.writeText(`${shareSummary(data)}\n${location.origin}/recap/month-1/`);
    shareStatus('Summary copied.');
  } catch {
    shareStatus('Copy is unavailable here. You can select the summary text or save the card.');
  }
}
async function share() {
  if (!navigator.share) return copy();
  try {
    await navigator.share({ title: 'My Month One · Gem RNG', text: shareSummary(data), url: `${location.origin}/recap/month-1/` });
    shareStatus('Summary shared.');
  } catch (error) {
    if (error.name !== 'AbortError') shareStatus('Sharing is unavailable. Try copying the summary or saving the card.');
  }
}
function download() {
  const blob = new Blob([summarySvg(data)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'gem-rng-month-one.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  shareStatus('Your Month One card was saved.');
}
for (const selectedView of ['global', 'personal']) {
  document.getElementById(`${selectedView}-tab`).addEventListener('click', () => {
    view = selectedView;
    history.replaceState(null, '', selectedView === 'personal' ? '#you' : '#global');
    render();
  });
}
retry.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else if (data?.status !== 'final') refresh();
});
const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  if (!['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION'].includes(event)) return;
  authGeneration += 1;
  data = null;
  content.replaceChildren();
  // Never await a Supabase call inside its auth callback (auth-lock deadlock).
  clearTimeout(timer);
  timer = setTimeout(refresh, 0);
});
window.addEventListener('pagehide', (event) => {
  disposed = true;
  clearTimeout(timer);
  if (!event.persisted) authListener.subscription.unsubscribe();
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  disposed = false;
  refresh();
});
render();
refresh();
