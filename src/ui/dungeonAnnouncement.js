import { ensurePlayerAuth } from '../backend/auth.js';
import { onAccountChange } from '../backend/account.js';
import { isDungeonAnnouncementReleased, dungeonAnnouncementSeenKey } from '../logic/dungeonAnnouncement.js';
import { escapeHtml } from './format.js';

const seenThisSession = new Set();
let mounted = false;

export async function mountDungeonAnnouncement(base = './') {
  if (mounted) return;
  mounted = true;
  try {
    const user = await ensurePlayerAuth();
    if (!user?.id) { mounted = false; return; }
    const response = await fetch(new URL('../../updates/dungeons-announcement.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) return;
    const entry = await response.json();
    if (!isDungeonAnnouncementReleased(entry)) return;
    if (!document.querySelector('link[data-dungeon-announcement]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = new URL('./dungeonAnnouncement.css', import.meta.url).href;
      stylesheet.dataset.dungeonAnnouncement = '';
      document.head.appendChild(stylesheet);
    }
    const key = dungeonAnnouncementSeenKey(user.id, entry.release_pr);
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
    dialog.className = 'dungeon-announcement';
    dialog.setAttribute('aria-labelledby', 'dungeonAnnouncementTitle');
    dialog.innerHTML = `<div class="dungeon-announcement__body">
      <p class="dungeon-announcement__eyebrow">New adventure</p>
      <h2 id="dungeonAnnouncementTitle">${escapeHtml(entry.title)}</h2>
      ${entry.sections.map((section) => `<section class="dungeon-announcement__section"><h3>${escapeHtml(section.heading)}</h3><ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul></section>`).join('')}
      <div class="dungeon-announcement__actions">
        <a class="btn" href="${base}dungeons/">Explore Dungeons</a>
        <button class="btn btn--primary" type="button" autofocus>Close</button>
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
      document.documentElement.classList.remove('dungeon-announcement-open');
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
      document.documentElement.classList.remove('dungeon-announcement-open');
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
      document.documentElement.classList.add('dungeon-announcement-open');
    };
    unsubscribe = onAccountChange((_event, nextUser) => {
      if (nextUser?.id === user.id) return;
      cancelled = true;
      if (dialog.open) dialog.close();
      cleanup();
      mounted = false;
    });
    timer = setTimeout(tryOpen, 2500);
  } catch { /* An announcement must never prevent entering the game. */ }
}
