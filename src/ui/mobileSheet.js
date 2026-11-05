// Shared responsive bottom-sheet behaviour. The sheet remains ordinary
// in-flow content above the breakpoint and becomes modal on small screens.

import { containFocus, focusableElements } from './focus.js';

export function mountMobileSheet({
  sheet,
  trigger,
  closeButton,
  backdrop,
  breakpoint = "(max-width: 720px)",
  modalOnly = false,
  canDismiss = () => true
}) {
  if (!sheet || !trigger || !backdrop) return null;

  const media = window.matchMedia(breakpoint);
  let open = false;
  let releaseFocus = null;
  if (modalOnly) sheet.hidden = true;

  function syncBodyLock() {
    document.body.classList.toggle(
      "mobile-sheet-open",
      Boolean(document.querySelector(".mobile-sheet.is-open"))
    );
  }

  function setOpen(nextOpen, { restoreFocus = true } = {}) {
    const wasOpen = open;
    open = Boolean(nextOpen && media.matches);
    if (wasOpen === open) return;
    sheet.classList.toggle("is-open", open);
    if (modalOnly) sheet.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    syncBodyLock();

    if (open) {
      document.dispatchEvent(new CustomEvent("mobile-sheet:opening", {
        detail: { sheet }
      }));
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      releaseFocus = containFocus(sheet, {
        returnTo: trigger,
        onEscape: () => { if (canDismiss()) setOpen(false); }
      });
      (closeButton ?? focusableElements(sheet)[0] ?? sheet).focus({ preventScroll: true });
    } else {
      sheet.removeAttribute("role");
      sheet.removeAttribute("aria-modal");
      releaseFocus?.({ restoreFocus: restoreFocus && media.matches });
      releaseFocus = null;
    }
  }

  function onOtherSheetOpening(event) {
    if (open && event.detail?.sheet !== sheet) {
      setOpen(false, { restoreFocus: false });
    }
  }

  trigger.addEventListener("click", () => setOpen(true));
  closeButton?.addEventListener("click", () => { if (canDismiss()) setOpen(false); });
  backdrop.addEventListener("click", () => { if (canDismiss()) setOpen(false); });
  document.addEventListener("mobile-sheet:opening", onOtherSheetOpening);
  const onBreakpointChange = () => {
    if (!media.matches && open) setOpen(false, { restoreFocus: false });
  };
  if (media.addEventListener) media.addEventListener("change", onBreakpointChange);
  else media.addListener(onBreakpointChange);

  return {
    close: () => setOpen(false),
    open: () => setOpen(true),
    isOpen: () => open
  };
}
