import { escapeHtml } from "./format.js";


// =========================================================
// DIALOGS
//
// Replaces window.confirm() so destructive actions read in
// the game's own voice, keep focus trapped, and can be
// dismissed with Escape.
// =========================================================


export function confirmDialog({
  title,
  body = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  extraLabel = null,
  defaultAction = "confirm",
  preventEnter = false
}) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;

    const overlay = document.createElement("div");

    overlay.className = "dialog-overlay";

    overlay.innerHTML = `
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogTitle"
      >
        <h2 class="dialog__title" id="dialogTitle">
          ${escapeHtml(title)}
        </h2>

        <div class="dialog__body">${body}</div>

        <div class="dialog__actions">
          <button class="btn" data-action="cancel" type="button">
            ${escapeHtml(cancelLabel)}
          </button>

          ${
            extraLabel
              ? `<button class="btn" data-action="extra" type="button">
                   ${escapeHtml(extraLabel)}
                 </button>`
              : ""
          }

          <button
            class="btn ${tone === "danger" ? "btn--danger" : "btn--primary"}"
            data-action="confirm"
            type="button"
          >
            ${escapeHtml(confirmLabel)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const buttons = [...overlay.querySelectorAll("button")];

    (overlay.querySelector(`[data-action="${defaultAction}"]`) ?? overlay.querySelector('[data-action="cancel"]')).focus();

    function close(result) {
      document.removeEventListener("keydown", onKeyDown, true);

      overlay.remove();

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }

      resolve(result);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();

        close("cancel");

        return;
      }

      if (preventEnter && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // Keep focus inside the dialog.
      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();

        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();

        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close("cancel");
      }
    });

    for (const button of buttons) {
      button.addEventListener("click", () => close(button.dataset.action));
    }
  });
}
