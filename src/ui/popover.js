// Reuses Phase 1 menu surfaces; portal them outside transformed ancestors.
import { focusableElements } from './focus.js';
let active = null;
let sequence = 0;
export function positionPopover(button, panel, { align = 'end' } = {}) {
  const viewport = window.visualViewport;
  const styles = getComputedStyle(document.documentElement);
  const safe = side => parseFloat(styles.getPropertyValue(`--safe-area-${side}`)) || 0;
  const x = (viewport?.offsetLeft || 0) + safe('left');
  const y = (viewport?.offsetTop || 0) + safe('top');
  const width = (viewport?.width || innerWidth) - safe('left') - safe('right');
  const height = (viewport?.height || innerHeight) - safe('top') - safe('bottom');
  const gap = 8, rect = button.getBoundingClientRect();
  Object.assign(panel.style, { position: 'fixed', right: 'auto', bottom: 'auto', minWidth: `${Math.min(rect.width, width - gap * 2)}px`, maxWidth: `${Math.max(0, width - gap * 2)}px` });
  const below = Math.max(0, y + height - rect.bottom - gap * 2);
  const above = Math.max(0, rect.top - y - gap * 2);
  const up = below < Math.min(panel.scrollHeight, 240) && above > below;
  panel.style.maxHeight = `${up ? above : below}px`;
  const size = panel.getBoundingClientRect();
  const left = align === 'start' ? rect.left : rect.right - size.width;
  panel.style.left = `${Math.max(x + gap, Math.min(left, x + width - size.width - gap))}px`;
  panel.style.top = `${up ? Math.max(y + gap, rect.top - size.height - gap) : Math.max(y + gap, rect.bottom + gap)}px`;
}
export function mountPopover({ button, panel, render, align = 'end' }) {
  let surface = panel, open = false;
  const id = panel?.id || `shellPopover${++sequence}`;
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-expanded', 'false');
  function position() {
    if (!open) return;
    if (!button.getClientRects().length) { close(); return; }
    positionPopover(button, surface, { align });
  }
  function close({ restoreFocus = false } = {}) {
    if (!open) return;
    open = false; surface.hidden = true;
    if (render) surface.remove();
    button.setAttribute('aria-expanded', 'false');
    if (active === controller) active = null;
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('focusin', outside);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.visualViewport?.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('scroll', position);
    if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
  }
  function prepare() {
    surface.id = id;
    surface.setAttribute('aria-label', button.getAttribute('aria-label') || button.textContent.trim());
    document.body.append(surface); surface.hidden = false; position();
  }
  function show() {
    if (open) return;
    active?.close();
    if (render) surface = render();
    open = true; active = controller; prepare();
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    focusableElements(surface)[0]?.focus({ preventScroll: true });
  }
  function outside(event) {
    if (!surface.contains(event.target) && !button.contains(event.target)) close();
  }
  function keydown(event) {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close({ restoreFocus: true });
    } else if (event.key === 'Tab' && surface.contains(event.target)) {
      const items = focusableElements(surface);
      if (event.shiftKey ? event.target === items[0] : event.target === items.at(-1)) {
        event.preventDefault(); close();
        const pageItems = focusableElements(document.body);
        (event.shiftKey ? button : pageItems[pageItems.indexOf(button) + 1] || button).focus({ preventScroll: true });
      }
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && surface.contains(event.target) && !event.target.matches('input, textarea, select, summary')) {
      const items = focusableElements(surface), current = items.indexOf(document.activeElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      event.preventDefault(); items[index]?.focus();
    }
  }
  const controller = {
    close, open: show, toggle: () => open ? close({ restoreFocus: true }) : show(),
    refresh() {
      if (!open || !render) return;
      const index = focusableElements(surface).indexOf(document.activeElement), scroll = surface.scrollTop;
      surface.remove(); surface = render(); prepare(); surface.scrollTop = scroll;
      (focusableElements(surface)[Math.max(0, index)] || button).focus({ preventScroll: true });
    }
  };
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); show();
      if (event.key === 'ArrowUp') focusableElements(surface).at(-1)?.focus();
    }
  });
  return controller;
}
document.addEventListener('mobile-sheet:opening', () => active?.close());
document.addEventListener('dialog:opening', () => active?.close({ restoreFocus: true }));
