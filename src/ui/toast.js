import { icons } from "./icons.js";
import { escapeHtml } from "./format.js";


// =========================================================
// TOASTS
//
// Short, non-blocking feedback. Anything the player needs to
// act on belongs in a dialog instead.
// =========================================================


let region = null;


function ensureRegion() {
  if (region?.isConnected) {
    return region;
  }

  region = document.createElement("div");

  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");

  document.body.appendChild(region);

  return region;
}


const ICON_FOR = {
  success: icons.checkCircle,
  error: icons.alert,
  warning: icons.alert,
  info: icons.info
};


export function toast(title, { text = "", type = "info", duration } = {}) {
  const host = ensureRegion();

  const element = document.createElement("div");

  element.className = `toast toast--${type}`;

  element.innerHTML = `
    ${ICON_FOR[type] ?? ICON_FOR.info}

    <div class="toast__body">
      <div class="toast__title">${escapeHtml(title)}</div>
      ${text ? `<div class="toast__text">${escapeHtml(text)}</div>` : ""}
    </div>
  `;

  host.appendChild(element);

  // Errors linger; confirmations get out of the way.
  const life = duration ?? (type === "error" ? 6000 : 3600);

  const timer = setTimeout(() => dismiss(element), life);

  element.addEventListener("click", () => {
    clearTimeout(timer);

    dismiss(element);
  });

  return element;
}


function dismiss(element) {
  if (!element.isConnected) {
    return;
  }

  element.classList.add("toast--leaving");

  element.addEventListener("animationend", () => element.remove(), {
    once: true
  });

  // Fallback for reduced-motion, where the animation is ~0ms
  // and the event can be missed.
  setTimeout(() => element.remove(), 400);
}


export const notify = {
  success: (title, text) => toast(title, { text, type: "success" }),
  error: (title, text) => toast(title, { text, type: "error" }),
  warning: (title, text) => toast(title, { text, type: "warning" }),
  info: (title, text) => toast(title, { text, type: "info" })
};
