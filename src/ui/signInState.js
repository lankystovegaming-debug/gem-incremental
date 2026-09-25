import { icons } from "./icons.js";
import { SIGN_IN_REQUIRED_MESSAGE } from "../backend/auth.js";

// =========================================================
// SIGNED-OUT EMPTY STATE
//
// Pages that need a player save show this in place of their
// list/grid when the visitor is signed out, instead of leaving
// loading skeletons on screen or reporting a sign-in "error".
// =========================================================

export function signInEmptyStateHtml({
  base = "../",
  title = "Log in to see this",
  body = SIGN_IN_REQUIRED_MESSAGE
} = {}) {
  return `
    <div class="empty empty--signin">
      ${icons.user ?? ""}
      <p class="empty__title">${escapeText(title)}</p>
      <p>${escapeText(body)}</p>
      <a class="btn btn--primary" href="${base}account/">
        Log in or sign up
      </a>
    </div>
  `;
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
