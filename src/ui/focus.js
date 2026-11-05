export function focusableElements(root) {
  return [...root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
}
// A confirmation over a sheet owns focus until it returns to that sheet.
// Authored cinematics retain their existing window-level Skip/Escape priority.
const stack = [];
export function containFocus(surface, { onEscape, returnTo = document.activeElement } = {}) {
  const entry = { surface };
  stack.push(entry);
  document.body.classList.add('ui-modal-open');
  surface.tabIndex = -1;
  function keydown(event) {
    if (stack.at(-1) !== entry || event.defaultPrevented || document.documentElement.classList.contains('is-cinematic-active')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); onEscape?.();
    } else if (event.key === 'Tab') {
      const items = focusableElements(surface);
      const first = items[0] || surface;
      const last = items.at(-1) || surface;
      if (!surface.contains(document.activeElement) || !items.length || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }
  }
  function focusin(event) {
    if (stack.at(-1) === entry && !document.documentElement.classList.contains('is-cinematic-active') && !surface.contains(event.target)) (focusableElements(surface)[0] || surface).focus({ preventScroll: true });
  }
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('focusin', focusin);
  return ({ restoreFocus = true } = {}) => {
    const index = stack.indexOf(entry);
    if (index < 0) return;
    stack.splice(index, 1);
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('focusin', focusin);
    if (!stack.length) document.body.classList.remove('ui-modal-open');
    if (restoreFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
  };
}
