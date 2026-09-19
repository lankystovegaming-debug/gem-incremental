import { supabase } from "../src/backend/supabase.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";

const REFRESH_INTERVAL_MS = 15_000;
const GLOBAL_REFRESH_INTERVAL_MS = 3_000;
const DIGIT_ANIMATION_MS = 620;

const champion = document.getElementById("champion");
const championAvatar = document.getElementById("championAvatar");
const counterHeading = document.getElementById("counterHeading");
const rollCounter = document.getElementById("rollCounter");
const rollCounterAnnouncement = document.getElementById("rollCounterAnnouncement");
const refreshLabel = document.getElementById("refreshLabel");
const counterStatus = document.getElementById("counterStatus");
const globalRollCount = document.getElementById("globalRollCount");

let currentCount = null;
let currentGlobalCount = null;
let currentUsername = "";
let nextRefreshAt = 0;
let refreshTimer = null;
let countdownTimer = null;
let globalTimer = null;
let refreshInFlight = false;
let globalInFlight = false;

function formatCount(value) {
  return Math.max(0, Number(value) || 0).toLocaleString("en-US");
}

// Builds the flip-style digit readout into `target`, animating only the
// digits that changed between `previousCount` and `nextCount`. Shared by the
// top-roller counter and the global counter so both animate identically.
function renderFlipDigits(target, previousCount, nextCount, announcement) {
  const nextText = formatCount(nextCount);
  const nextDigitCount = nextText.replaceAll(",", "").length;
  const previousDigits = String(previousCount == null ? 0 : previousCount)
    .padStart(nextDigitCount, "0");
  const isDecreasing = previousCount != null && nextCount < previousCount;
  const fragment = document.createDocumentFragment();
  let digitIndex = 0;

  [...nextText].forEach((character, characterIndex) => {
    if (character === ",") {
      const separator = document.createElement("span");
      separator.className = "counter-separator";
      separator.textContent = character;
      fragment.append(separator);
      return;
    }

    const previousCharacter = previousDigits[digitIndex] ?? "0";
    const digit = document.createElement("span");
    const current = document.createElement("span");
    const next = document.createElement("span");

    digitIndex += 1;
    digit.className = "counter-digit";
    current.className = "counter-digit__number counter-digit__number--current";
    next.className = "counter-digit__number counter-digit__number--next";
    current.textContent = previousCharacter;
    next.textContent = character;
    digit.append(current, next);

    if (previousCharacter !== character || previousCount == null) {
      const delay = Math.max(0, nextText.length - characterIndex - 1) * 34;
      digit.classList.add("is-changing");
      current.style.animationDelay = `${delay}ms`;
      next.style.animationDelay = `${delay}ms`;

      if (isDecreasing) {
        digit.classList.add("is-decreasing");
      }
    } else {
      next.remove();
    }

    fragment.append(digit);
  });

  target.replaceChildren(fragment);

  if (announcement) {
    announcement.textContent = `${formatCount(nextCount)} total lifetime rolls`;
  }

  window.setTimeout(() => {
    for (const digit of target.querySelectorAll(".counter-digit")) {
      const finalNumber = digit.querySelector(".counter-digit__number--next");

      if (finalNumber) {
        finalNumber.className = "counter-digit__number counter-digit__number--current";
        finalNumber.style.animationDelay = "";
        digit.replaceChildren(finalNumber);
      }

      digit.classList.remove("is-changing", "is-decreasing");
    }
  }, DIGIT_ANIMATION_MS + 500);
}

function renderGlobalCount(value) {
  const total = Math.max(0, Number(value) || 0);

  if (total === currentGlobalCount) {
    return;
  }

  renderFlipDigits(globalRollCount, currentGlobalCount, total, null);
  currentGlobalCount = total;
}

async function refreshGlobalCount() {
  if (globalInFlight || document.hidden) {
    return;
  }

  globalInFlight = true;

  try {
    const { data, error } = await supabase.rpc("get_global_roll_count");

    if (error) {
      throw error;
    }

    renderGlobalCount(data);
  } catch (error) {
    console.error("Global roll count refresh failed:", error);

    if (currentGlobalCount == null) {
      globalRollCount.textContent = "—";
    }
  } finally {
    globalInFlight = false;
  }
}

function setStatus(message, isError = false) {
  counterStatus.textContent = message;
  counterStatus.classList.toggle("error", isError);
}

function renderCounter(nextCount) {
  renderFlipDigits(rollCounter, currentCount, nextCount, rollCounterAnnouncement);
  currentCount = nextCount;
}

function setChampion(username, avatarUrl, profileId) {
  const safeUsername = String(username || "Unknown miner");
  const changed = currentUsername && currentUsername !== safeUsername;

  counterHeading.textContent = safeUsername;
  championAvatar.replaceChildren();
  champion.href = profileId
    ? `/user/${encodeURIComponent(profileId)}/`
    : "../leaderboards/";
  champion.setAttribute("aria-label", profileId
    ? `View ${safeUsername}'s profile`
    : "View the full leaderboards");

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    championAvatar.append(image);
  } else {
    const initial = document.createElement("span");
    initial.textContent = safeUsername.trim().charAt(0).toUpperCase() || "?";
    championAvatar.append(initial);
  }

  if (changed) {
    champion.classList.remove("champion--changed");
    window.requestAnimationFrame(() => champion.classList.add("champion--changed"));
  }

  currentUsername = safeUsername;
}

async function loadChampionDetails(username) {
  const [avatarResult, profileResult] = await Promise.all([
    supabase.rpc("get_leaderboard_avatars", { p_usernames: [username] }),
    supabase.rpc("get_profile_ids_for_usernames", { p_usernames: [username] })
  ]);

  return {
    avatarUrl: avatarResult.error ? "" : avatarResult.data?.[username] ?? "",
    profileId: profileResult.error ? "" : profileResult.data?.[username] ?? ""
  };
}

function updateRefreshLabel() {
  if (!nextRefreshAt) {
    refreshLabel.textContent = "Connecting…";
    return;
  }

  const seconds = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  refreshLabel.textContent = seconds > 0 ? `Next check in ${seconds}s` : "Checking now…";
}

async function refreshCounter() {
  if (refreshInFlight || document.hidden) {
    return;
  }

  refreshInFlight = true;
  setStatus("");
  refreshLabel.textContent = currentCount == null ? "Connecting…" : "Checking now…";

  try {
    const { data, error } = await supabase.functions.invoke("leaderboards");

    if (error) {
      throw error;
    }

    const leader = Array.isArray(data?.totalRolls) ? data.totalRolls[0] : null;

    if (!leader) {
      setStatus("No ranked players yet. The first roller will appear here.");
      return;
    }

    const username = String(leader.username || "Unknown miner");
    const totalRolls = Number(leader.total_rolls ?? leader.totalRolls ?? 0);
    if (username !== currentUsername) {
      const details = await loadChampionDetails(username);
      setChampion(username, details.avatarUrl, details.profileId);
    }

    if (totalRolls !== currentCount) {
      renderCounter(totalRolls);
    }
  } catch (error) {
    console.error("Roll counter refresh failed:", error);
    setStatus(
      currentCount == null
        ? "Could not load the live roll count. Refresh to try again."
        : "The latest check failed. Keeping the last verified count on screen.",
      true
    );
  } finally {
    refreshInFlight = false;
    nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
    updateRefreshLabel();
  }
}

function scheduleRefreshes() {
  window.clearInterval(refreshTimer);
  window.clearInterval(countdownTimer);
  window.clearInterval(globalTimer);
  refreshTimer = window.setInterval(refreshCounter, REFRESH_INTERVAL_MS);
  countdownTimer = window.setInterval(updateRefreshLabel, 1_000);
  globalTimer = window.setInterval(refreshGlobalCount, GLOBAL_REFRESH_INTERVAL_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshCounter();
    refreshGlobalCount();
  }
});

async function startRollCounter() {
  const user = await ensurePlayerAuth();

  if (!user) {
    setStatus("Sign in to connect to the live roll counter.", true);
    refreshLabel.textContent = "Waiting for sign-in";
    return;
  }

  await refreshCounter();
  refreshGlobalCount();
  scheduleRefreshes();
}

startRollCounter();
