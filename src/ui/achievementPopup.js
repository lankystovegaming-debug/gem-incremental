import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { escapeHtml } from "./format.js";


// =========================================================
// ACHIEVEMENT UNLOCK POPUP (client-side watcher)
//
// The server awards achievements as a side effect of rolls and other
// actions, but the roll response does not report which ones just
// completed. Rather than change the central roll Edge Function, this
// module diffs the player's completed-achievement set against a locally
// stored snapshot and shows a Minecraft-style popup for anything new.
//
// Cadence is deliberately light: one check when a page mounts, plus a
// debounced check after roll bursts (auto-roll fires many events, so
// they collapse into a single fetch). State is namespaced per account
// so a shared browser never replays another player's unlocks, and the
// first run for an account only records a baseline — it never
// retroactively pops everything already earned.
// =========================================================


const SNAPSHOT_PREFIX = "gemIncremental.achievements.completed.";
const MIN_FETCH_INTERVAL_MS = 8000;
const ROLL_DEBOUNCE_MS = 5000;
const POPUP_LIFETIME_MS = 5000;
const POPUP_GAP_MS = 350;

let mounted = false;
let region = null;
let checking = false;
let recheckQueued = false;
let debounceTimer = null;
let lastFetchAt = 0;
const popupQueue = [];
let showingPopup = false;


export function mountAchievementPopups() {
  if (mounted || typeof window === "undefined") {
    return;
  }
  mounted = true;

  ensureStylesheet();

  // Catch anything completed while this page was closed (and set the
  // baseline on an account's first ever visit). A short delay lets the
  // shared auth bootstrap settle before the first request.
  setTimeout(() => scheduleCheck(400), 1500);

  // Rolls are the main driver of achievement progress. Collapse bursts
  // (auto-roll) into one trailing check.
  window.addEventListener("gem:roll-complete", () => scheduleCheck(ROLL_DEBOUNCE_MS));

  // Returning to the tab may reveal unlocks earned in another tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleCheck(1200);
    }
  });
}


function scheduleCheck(delay = ROLL_DEBOUNCE_MS) {
  clearTimeout(debounceTimer);
  const sinceLast = Date.now() - lastFetchAt;
  const wait = Math.max(delay, MIN_FETCH_INTERVAL_MS - sinceLast);
  debounceTimer = setTimeout(runCheck, Math.max(0, wait));
}


async function runCheck() {
  if (checking) {
    recheckQueued = true;
    return;
  }
  checking = true;

  try {
    const user = await ensurePlayerAuth();
    if (!user) {
      return;
    }

    lastFetchAt = Date.now();
    const snapshot = await fetchCompletedAchievements();
    if (!snapshot) {
      return;
    }

    const key = SNAPSHOT_PREFIX + user.id;
    const previous = readSnapshot(key);
    writeSnapshot(key, snapshot.completedIds);

    // First run for this account: record the baseline silently.
    if (previous === null) {
      return;
    }

    const newlyCompleted = snapshot.completedIds.filter((id) => !previous.has(id));
    for (const id of newlyCompleted) {
      const definition = snapshot.definitions.get(id);
      if (definition) {
        enqueuePopup(definition);
      }
    }
  } catch (error) {
    console.error("[ACHIEVEMENTS] Unlock check failed:", error);
  } finally {
    checking = false;
    if (recheckQueued) {
      recheckQueued = false;
      scheduleCheck(0);
    }
  }
}


async function fetchCompletedAchievements() {
  const { data, error } = await supabase.functions.invoke("features", {
    body: { action: "achievements" }
  });
  if (error || data?.error) {
    return null;
  }

  const definitions = new Map((data.definitions || []).map((definition) => [definition.id, definition]));
  const completedIds = (data.progress || [])
    .filter((entry) => entry.completed)
    .map((entry) => entry.feature_id);

  return { definitions, completedIds };
}


function readSnapshot(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return null;
  }
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}


function writeSnapshot(key, completedIds) {
  try {
    localStorage.setItem(key, JSON.stringify(completedIds));
  } catch {
    // Storage may be unavailable (private mode); popups simply won't
    // dedupe across reloads, which is acceptable.
  }
}


// =========================================================
// POPUP RENDERING
// =========================================================


function ensureStylesheet() {
  if (document.querySelector('link[data-achievement-popup]')) {
    return;
  }
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.dataset.achievementPopup = "true";
  stylesheet.href = new URL("../styles/achievement-popup.css", import.meta.url).href;
  document.head.appendChild(stylesheet);
}


function ensureRegion() {
  if (region?.isConnected) {
    return region;
  }
  region = document.createElement("div");
  region.className = "mc-achv-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}


function enqueuePopup(definition) {
  popupQueue.push(definition);
  if (!showingPopup) {
    showNextPopup();
  }
}


function showNextPopup() {
  const definition = popupQueue.shift();
  if (!definition) {
    showingPopup = false;
    return;
  }
  showingPopup = true;

  const host = ensureRegion();
  const card = renderPopup(definition);
  host.appendChild(card);

  requestAnimationFrame(() => card.classList.add("is-in"));

  const life = setTimeout(() => dismissPopup(card), POPUP_LIFETIME_MS);
  card.addEventListener("click", () => {
    clearTimeout(life);
    dismissPopup(card);
  });
}


function dismissPopup(card) {
  if (!card.isConnected) {
    return;
  }
  card.classList.remove("is-in");
  card.classList.add("is-out");

  const remove = () => {
    card.remove();
    setTimeout(showNextPopup, POPUP_GAP_MS);
  };
  card.addEventListener("animationend", remove, { once: true });
  // Fallback for reduced-motion where the animation is ~0ms.
  setTimeout(remove, 600);
}


function renderPopup(definition) {
  const icon = definition.icon || "◆";
  const name = definition.name || "Achievement";
  const ap = Number(definition.metadata?.ap || 0);

  const card = document.createElement("div");
  card.className = "mc-achv";
  card.innerHTML = `
    <div class="mc-achv__icon">${escapeHtml(icon)}</div>
    <div class="mc-achv__body">
      <div class="mc-achv__head">Achievement Unlocked!</div>
      <div class="mc-achv__name">${escapeHtml(name)}</div>
    </div>
    ${ap > 0 ? `<span class="mc-achv__ap">+${ap} AP</span>` : ""}
  `;
  return card;
}
