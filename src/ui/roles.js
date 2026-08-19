// =========================================================
// SPECIAL ACCOUNT TAGS
//
// A handful of accounts carry a rank tag ([DEV], [OWNER],
// [SWEAT]) shown next to their name in chat and on the
// leaderboard. Chat knows the user id; the leaderboard only
// has the username, so both keys are kept here in sync.
// =========================================================

export const ROLE_BY_ID = Object.freeze({
  "316c668e-1ab3-4e5f-bad0-8cd964a41440": "DEV",
  "38d5e8ce-18af-46d3-aa9e-6e601e75dd78": "DEV",
  "004d883f-edbc-4610-b5e3-9068a0de0ca2": "OWNER",
  "d7e10dc0-b0e2-43f7-995d-c2fbae0add91": "SWEAT"
});

export const ROLE_BY_USERNAME = Object.freeze({
  sixseven67: "DEV",
  "1248lychee1632": "DEV",
  lankystovegaming: "OWNER",
  cat: "SWEAT"
});

export function roleForId(userId) {
  return ROLE_BY_ID[String(userId ?? "").toLowerCase()] ?? null;
}

export function roleForUsername(username) {
  return ROLE_BY_USERNAME[String(username ?? "")] ?? null;
}

// Renders the tag markup for a role (or "" for none). Styling lives
// in the shared `.role-badge` rules in app.css.
export function roleBadgeHtml(role) {
  if (!role) return "";
  const key = String(role).toLowerCase();
  return `<span class="role-badge role-badge--${key}">[${role}]</span>`;
}
