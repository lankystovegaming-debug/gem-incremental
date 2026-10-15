import { ensurePlayerAuth } from '../backend/auth.js';
import { onAccountChange } from '../backend/account.js';
import { newestWeeklyUpdate, updateSeenKey } from '../logic/updateHistory.js';
import { loadUpdateHistory, renderUpdateSections, formatUpdateDate } from './updateLog.js';
import { escapeHtml } from './format.js';

const seenThisSession = new Set();
let mounted = false;

export async function mountWeeklyUpdate(base = './') {
  if (mounted) return;
  mounted = true;
  try {
    const user = await ensurePlayerAuth();
    if (!user?.id) { mounted = false; return; }
    const entry = newestWeeklyUpdate(await loadUpdateHistory());
    if (!entry) return;
    const key = updateSeenKey(user.id, entry.pr);
    const alreadySeen = () => {
      try { return seenThisSession.has(key) || localStorage.getItem(key) === 'seen'; }
      catch { return seenThisSession.has(key); }
    };
    if (alreadySeen()) return;
    let previousFocus;
    let cancelled = false;
    let interrupted = false;
    let attempts = 0;
    let timer;
    const dialog = document.createElement('dialog');
    dialog.className = 'weekly-update';
    dialog.setAttribute('aria-labelledby', 'weeklyUpdateTitle');
    dialog.innerHTML = `<div class="weekly-update__body">
      <p class="weekly-update__eyebrow">This week's update · ${escapeHtml(formatUpdateDate(entry.published_on))}</p>
      <h2 id="weeklyUpdateTitle">${escapeHtml(entry.title)}</h2>
      ${renderUpdateSections(entry)}
      <div class="weekly-update__actions">
        <a class="btn" href="${base}updates/">All updates</a>
        <button class="btn btn--primary" type="button" autofocus>Let's play</button>
      </div></div>`;
    const acknowledge = () => {
      seenThisSession.add(key);
      try { localStorage.setItem(key, 'seen'); } catch { /* Session-only when storage is unavailable. */ }
    };
    const cleanup = () => {
      clearTimeout(timer);
      observer.disconnect();
      unsubscribe();
      dialog.remove();
      document.documentElement.classList.remove('weekly-update-open');
    };
    let unsubscribe = () => {};
    // Cinematics keep priority even if automatic rolling starts one after the notes open.
    const observer = new MutationObserver(() => {
      if (dialog.open && document.documentElement.classList.contains('is-cinematic-active')) {
        interrupted = true;
        dialog.close();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.querySelector('a').addEventListener('click', acknowledge);
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('weekly-update-open');
      if (cancelled) return;
      if (interrupted) {
        interrupted = false;
        timer = setTimeout(tryOpen, 500);
        return;
      }
      acknowledge();
      cleanup();
      if (previousFocus?.isConnected) previousFocus.focus();
    });
    // Let daily rewards, tours, maintenance screens and cinematics finish first.
    const tryOpen = () => {
      if (cancelled || alreadySeen() || ++attempts > 240) { cleanup(); return; }
      const busy = document.hidden || document.documentElement.classList.contains('is-cinematic-active') ||
        [...document.querySelectorAll('dialog[open], .dialog-overlay, .tour-root, #ultra-cutscene-overlay, .maintenance-overlay, [role="dialog"][aria-modal="true"]')]
          .some((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      if (busy) { timer = setTimeout(tryOpen, 500); return; }
      previousFocus ??= document.activeElement;
      if (!dialog.isConnected) document.body.appendChild(dialog);
      dialog.showModal();
      document.documentElement.classList.add('weekly-update-open');
    };
    unsubscribe = onAccountChange((_event, nextUser) => {
      if (nextUser?.id === user.id) return;
      cancelled = true;
      if (dialog.open) dialog.close();
      cleanup();
      mounted = false;
    });
    timer = setTimeout(tryOpen, 2500);
  } catch { /* Update notes must never prevent entering the game. */ }
}
