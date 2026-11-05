import { containFocus } from './focus.js';
import { escapeHtml } from "./format.js";


// =========================================================
// DIALOGS
//
// Replaces window.confirm() so destructive actions read in
// the game's own voice, keep focus trapped, and can be
// dismissed with Escape.
// =========================================================


let dialogSequence = 0;

export function confirmDialog({
  title,
  body = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  extraLabel = null,
  defaultAction = tone === "danger" ? "cancel" : "confirm",
  preventEnter = false,
  size = "default",
  dismissible = true
}) {
  return new Promise((resolve) => {
    document.dispatchEvent(new CustomEvent("dialog:opening"));
    const previouslyFocused = document.activeElement;
    const id = `dialogTitle${++dialogSequence}`;

    const overlay = document.createElement("div");

    overlay.className = "dialog-overlay";

    overlay.innerHTML = `
      <div
        class="dialog ${size === "wide" ? "dialog--wide" : ""}"
        role="dialog"
        aria-modal="true"
        aria-labelledby="${id}"
      >
        <h2 class="dialog__title" id="${id}">
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

    const buttons = [...overlay.querySelectorAll('.dialog__actions [data-action]')];
    let settled = false;
    const releaseFocus = containFocus(overlay.querySelector('.dialog'), {
      returnTo: previouslyFocused,
      onEscape: () => { if (dismissible) close('cancel'); }
    });
    (overlay.querySelector(`.dialog__actions [data-action="${defaultAction}"]`) ?? buttons[0]).focus();

    function close(result) {
      if (settled) return;
      settled = true;
      overlay.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      releaseFocus();
      resolve(result);
    }
    function onKeyDown(event) {
      if (preventEnter && event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
      }
    }
    overlay.addEventListener('keydown', onKeyDown, true);

    let backdropPress = false;
    overlay.addEventListener('pointerdown', event => { backdropPress = event.target === overlay; });
    overlay.addEventListener("click", (event) => {
      if (dismissible && backdropPress && event.target === overlay) {
        close("cancel");
      }
    });

    for (const button of buttons) {
      button.addEventListener("click", () => close(button.dataset.action));
    }
  });
}
