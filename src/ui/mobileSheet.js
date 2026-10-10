// Shared responsive bottom-sheet behaviour. The sheet remains ordinary
// in-flow content above the breakpoint and becomes modal on small screens.

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function mountMobileSheet({
  sheet,
  trigger,
  closeButton,
  backdrop,
  breakpoint = "(max-width: 720px)"
}) {
  if (!sheet || !trigger || !backdrop) return null;

  const media = window.matchMedia(breakpoint);
  let open = false;

  function focusableElements() {
    return [...sheet.querySelectorAll(FOCUSABLE)].filter((element) => {
      return !element.hidden && element.getAttribute("aria-hidden") !== "true";
    });
  }

  function setOpen(nextOpen, { restoreFocus = true } = {}) {
    open = Boolean(nextOpen && media.matches);
    sheet.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
    document.body.classList.toggle("mobile-sheet-open", open);

    if (open) {
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      (closeButton ?? focusableElements()[0])?.focus({ preventScroll: true });
    } else {
      sheet.removeAttribute("role");
      sheet.removeAttribute("aria-modal");
      if (restoreFocus && media.matches) trigger.focus({ preventScroll: true });
    }
  }

  function onKeyDown(event) {
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = focusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  trigger.addEventListener("click", () => setOpen(true));
  closeButton?.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", onKeyDown);
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
