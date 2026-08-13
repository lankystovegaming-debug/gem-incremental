// =========================================================
// THEME
//
// Two independent choices:
//   mode   — system | light | dark
//   accent — the highlight colour used across the UI
//
// Both live in localStorage and are applied to <html>. Each
// page also runs a tiny inline copy of applyStored() in its
// <head> so the correct theme paints on the first frame.
// =========================================================


export const MODE_KEY = "gemIncremental.theme.mode";
export const ACCENT_KEY = "gemIncremental.theme.accent";


export const MODES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "neon", label: "Neon" }
];


export const ACCENTS = [
  { id: "indigo", label: "Indigo", swatch: "#7c8cf8" },
  { id: "emerald", label: "Emerald", swatch: "#34d399" },
  { id: "amber", label: "Amber", swatch: "#f5b23f" },
  { id: "rose", label: "Rose", swatch: "#f472a0" },
  { id: "cyan", label: "Cyan", swatch: "#38bdf8" }
];


const DEFAULT_MODE = "system";
const DEFAULT_ACCENT = "indigo";


function read(key, fallback, allowed) {
  try {
    const value = localStorage.getItem(key);

    return allowed.includes(value) ? value : fallback;
  } catch {
    // Private browsing can throw on access.
    return fallback;
  }
}


export function getMode() {
  return read(
    MODE_KEY,
    DEFAULT_MODE,
    MODES.map((mode) => mode.id)
  );
}


export function getAccent() {
  return read(
    ACCENT_KEY,
    DEFAULT_ACCENT,
    ACCENTS.map((accent) => accent.id)
  );
}


export function applyTheme() {
  const root = document.documentElement;
  const mode = getMode();

  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }

  root.setAttribute("data-accent", getAccent());
}


export function setMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Non-persistent is still better than not applying it.
  }

  applyTheme();

  notify();
}


export function setAccent(accent) {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    // Ignore — see setMode().
  }

  applyTheme();

  notify();
}


// ---------------------------------------------------------
// CHANGE NOTIFICATIONS
// ---------------------------------------------------------

const listeners = new Set();


export function onThemeChange(callback) {
  listeners.add(callback);

  return () => listeners.delete(callback);
}


function notify() {
  for (const listener of listeners) {
    listener({ mode: getMode(), accent: getAccent() });
  }
}


// Keep other tabs in sync.
window.addEventListener("storage", (event) => {
  if (event.key === MODE_KEY || event.key === ACCENT_KEY) {
    applyTheme();

    notify();
  }
});


applyTheme();
