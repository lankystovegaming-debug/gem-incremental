import { icons } from "./icons.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { isGuest, onAccountChange } from "../backend/account.js";

// =========================================================
// GUIDED TOUR (first-run spotlight walkthrough)
//
// A coach-mark tour that dims the screen and spotlights real UI — the
// roll button, wallet, nav links, auto-roll — with a tooltip explaining
// each. Runs once for new players (remembered per-device) and is
// reopenable any time from More -> How to play.
//
// First-run order for a brand-new guest: we first nudge them to create an
// account (so their save can never be lost), and only once they have one do
// we walk them through every function. A player who already signed in skips
// straight to the function walkthrough.
//
// Steps whose target isn't on the current page are skipped, so the same
// tour works on the Roll page (full) and elsewhere (shell parts only).
// =========================================================

const SEEN_KEY = "gemIncremental.seenTour";
const ACCOUNT_PROMPT_KEY = "gemIncremental.seenAccountPrompt";

// The function walkthrough. Each step points at a live element. `target` may
// be a CSS selector; the first VISIBLE match wins (nav vs. mobile tab-bar
// render the same links).
const STEPS = [
  {
    target: "#rollButton",
    title: "Roll for gems",
    text: "This is the heart of the game. Tap to pull a gem from the deposit — or press <kbd>R</kbd> / <kbd>Space</kbd>. Rarer gems are worth far more.",
    icon: icons.dice
  },
  {
    target: "#autoRollToggle",
    title: "Auto-roll",
    text: "Flip this on to keep digging hands-free while you plan your next upgrade.",
    icon: icons.bolt || icons.sparkle
  },
  {
    target: "#shellWallet",
    title: "Your money",
    text: "Earn it by selling gems, and spend it on gear and boosts. It updates live as the economy moves.",
    icon: icons.coins
  },
  {
    target: '[aria-label="Inventory"]',
    title: "Your inventory",
    text: "Sell gems here for money, and <strong>lock</strong> the ones you want to keep so they’re never sold by accident.",
    icon: icons.bag
  },
  {
    target: '[aria-label="Crafting"]',
    title: "Craft & upgrade",
    text: "Build better pickaxes, bags and boots — more Luck, faster rolls and heavier (pricier) gems.",
    icon: icons.anvil
  },
  {
    target: '[aria-label="Shop"]',
    title: "Shop & potions",
    text: "Brew luck potions and buy boosts to dig up the rarest specimens faster.",
    icon: icons.potion
  },
  {
    target: "#shellExploreButton",
    title: "Explore everything else",
    text: "Leaderboards, the Gem Index, the Exchange, guilds and more all live in here.",
    icon: icons.compass || icons.sparkle
  },
  {
    target: "#shellMoreButton",
    title: "That’s the loop!",
    text: "You can replay this tour any time from <strong>More → How to play</strong>. Now go dig up something rare. 💎",
    icon: icons.book
  }
];

// The single coach-mark shown first to a brand-new guest.
function accountStep(base) {
  return {
    target: "#shellAccountButton",
    title: "First, create an account",
    text: "You’re playing as a guest, so your gems only live in this browser. Make a free account first so your progress is saved and can’t be lost — then we’ll show you around.",
    icon: icons.user || icons.shield,
    primaryLabel: "Create account",
    primaryHref: `${base}account/`
  };
}

function pickVisible(selector) {
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    if (r.width > 1 && r.height > 1 && getComputedStyle(node).visibility !== "hidden") {
      return node;
    }
  }
  return null;
}

function isInViewport(el) {
  const r = el.getBoundingClientRect();
  return r.top >= -2 && r.left >= -2 &&
         r.bottom <= window.innerHeight + 2 && r.right <= window.innerWidth + 2;
}

function mark(key) {
  try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
}

function seen(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

// Generic coach-mark engine shared by the account prompt and the function
// walkthrough. `opts.seenKey` is stamped when the run ends; `opts.skipLabel`
// and `opts.finishLabel` customise the buttons.
function runCoachmarks(rawSteps, opts = {}) {
  const {
    seenKey = SEEN_KEY,
    skipLabel = "Skip",
    finishLabel = "Finish"
  } = opts;

  // Resolve targets now; drop steps whose element isn't present on this page.
  const steps = rawSteps
    .map((step) => ({ ...step, el: pickVisible(step.target) }))
    .filter((step) => step.el);

  if (!steps.length) return;

  // Guard against a second overlay stacking on top of a running tour.
  if (document.querySelector(".tour-root")) return;

  const single = steps.length === 1;

  const root = document.createElement("div");
  root.className = "tour-root";
  root.innerHTML = `
    <div class="tour-block"></div>
    <div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-pop__head">
        <span class="tour-pop__icon" id="tourIcon"></span>
        <span class="tour-pop__count" id="tourCount"></span>
      </div>
      <h3 class="tour-pop__title" id="tourTitle"></h3>
      <p class="tour-pop__text" id="tourText"></p>
      <div class="tour-pop__dots" id="tourDots"></div>
      <div class="tour-pop__actions">
        <button class="tour-pop__skip" id="tourSkip" type="button">${skipLabel}</button>
        <div class="tour-pop__nav">
          <button class="btn btn--ghost tour-pop__back" id="tourBack" type="button">Back</button>
          <button class="btn btn--primary tour-pop__next" id="tourNext" type="button">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const hole = root.querySelector(".tour-hole");
  const pop = root.querySelector(".tour-pop");
  const iconEl = root.querySelector("#tourIcon");
  const countEl = root.querySelector("#tourCount");
  const titleEl = root.querySelector("#tourTitle");
  const textEl = root.querySelector("#tourText");
  const dotsEl = root.querySelector("#tourDots");
  const backBtn = root.querySelector("#tourBack");
  const nextBtn = root.querySelector("#tourNext");
  const skipBtn = root.querySelector("#tourSkip");

  // A single-step prompt (the account nudge) doesn't need a stepper or Back.
  if (single) {
    countEl.style.display = "none";
    dotsEl.style.display = "none";
    backBtn.style.display = "none";
  } else {
    dotsEl.innerHTML = steps.map(() => '<span class="tour-dot"></span>').join("");
  }
  const dots = [...dotsEl.querySelectorAll(".tour-dot")];

  let idx = 0;

  function place() {
    const el = steps[idx].el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    hole.style.left = `${r.left - pad}px`;
    hole.style.top = `${r.top - pad}px`;
    hole.style.width = `${r.width + pad * 2}px`;
    hole.style.height = `${r.height + pad * 2}px`;

    // Tooltip: prefer below the target, flip above if it won't fit, then clamp
    // into the viewport on both axes.
    const popW = pop.offsetWidth;
    const popH = pop.offsetHeight;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = (r.bottom + gap + popH <= vh - 8) ? r.bottom + gap : r.top - gap - popH;
    top = Math.max(8, Math.min(top, vh - popH - 8));
    let left = Math.max(8, Math.min(vw - popW - 8, r.left + r.width / 2 - popW / 2));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  function show(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    const step = steps[idx];
    iconEl.innerHTML = step.icon || "";
    countEl.textContent = `Step ${idx + 1} of ${steps.length}`;
    titleEl.textContent = step.title;
    textEl.innerHTML = step.text;
    dots.forEach((d, n) => d.classList.toggle("is-active", n === idx));
    backBtn.disabled = idx === 0;
    nextBtn.textContent =
      step.primaryLabel || (idx === steps.length - 1 ? finishLabel : "Next");

    // Only scroll when the target isn't already on screen. Elements in the
    // fixed top bar (wallet, Explore, More, account) are always visible.
    if (!isInViewport(step.el)) step.el.scrollIntoView({ block: "center", behavior: "auto" });
    place();
    requestAnimationFrame(place);
    // Safety re-place: nav links can shift as async sections load, and the
    // tooltip height changes with each step's text.
    setTimeout(place, 80);
    setTimeout(place, 360);
  }

  function end() {
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    mark(seenKey);
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); end(); }
    else if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); nextBtn.click(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); if (!backBtn.disabled) show(idx - 1); }
  }

  nextBtn.addEventListener("click", () => {
    const step = steps[idx];
    // A step with a link acts as a call to action: end the run and navigate.
    if (step.primaryHref) { end(); window.location.href = step.primaryHref; return; }
    if (idx === steps.length - 1) end();
    else show(idx + 1);
  });
  backBtn.addEventListener("click", () => show(idx - 1));
  skipBtn.addEventListener("click", end);

  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey, true);

  show(0);
  nextBtn.focus();
}

// The function walkthrough (also reopened from More -> How to play).
export function startTour(base = "./") {
  runCoachmarks(STEPS, { seenKey: SEEN_KEY, skipLabel: "Skip", finishLabel: "Finish" });
}

// The first-run nudge for guests: make an account before touring the game.
export function startAccountPrompt(base = "./") {
  runCoachmarks([accountStep(base)], {
    seenKey: ACCOUNT_PROMPT_KEY,
    skipLabel: "Maybe later"
  });
}

// Wire the More-menu "How to play" action to the function tour, and drive the
// first-run experience on the Roll page: account prompt for guests, then the
// full walkthrough once they have an account.
export function mountTour({ base = "./", page = "" } = {}) {
  const action = document.querySelector('[data-more-action="howto"]');
  if (action && !action.dataset.tourWired) {
    action.dataset.tourWired = "1";
    action.addEventListener("click", () => startTour(base));
  }

  // Auto-onboarding only runs on the Roll page (where every step resolves)
  // and only until the player has finished the walkthrough once.
  if (page !== "roll" || seen(SEEN_KEY)) return;

  ensurePlayerAuth().then((user) => {
    if (seen(SEEN_KEY)) return;

    // Already has a real account — walk them through the functions.
    if (user && !isGuest(user)) {
      setTimeout(() => startTour(base), 700);
      return;
    }

    // Brand-new guest — nudge them to create an account first (once).
    if (!seen(ACCOUNT_PROMPT_KEY)) {
      setTimeout(() => startAccountPrompt(base), 700);
    }

    // If they link an account without leaving the page (e.g. Google sign-in),
    // roll straight into the function walkthrough.
    onAccountChange((event, changedUser) => {
      if (changedUser && !isGuest(changedUser) && !seen(SEEN_KEY)) {
        document.querySelector(".tour-root")?.remove();
        setTimeout(() => startTour(base), 400);
      }
    });
  });
}
