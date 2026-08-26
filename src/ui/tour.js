import { icons } from "./icons.js";

// =========================================================
// GUIDED TOUR (first-run spotlight walkthrough)
//
// A coach-mark tour that dims the screen and spotlights real UI — the
// roll button, wallet, nav links, auto-roll — with a tooltip explaining
// each. Runs once for new players (remembered per-device) and is
// reopenable any time from More -> How to play.
//
// Steps whose target isn't on the current page are skipped, so the same
// tour works on the Roll page (full) and elsewhere (shell parts only).
// =========================================================

const SEEN_KEY = "gemIncremental.seenTour";

// Each step points at a live element. `target` may be a CSS selector; the
// first VISIBLE match wins (nav vs. mobile tab-bar render the same links).
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

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
}

export function startTour(base = "./") {
  // Resolve targets now; drop steps whose element isn't present on this page.
  const steps = STEPS
    .map((step) => ({ ...step, el: pickVisible(step.target) }))
    .filter((step) => step.el);

  if (!steps.length) return;

  // Guard against a second overlay stacking on top of a running tour.
  if (document.querySelector(".tour-root")) return;

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
        <button class="tour-pop__skip" id="tourSkip" type="button">Skip</button>
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

  dotsEl.innerHTML = steps.map(() => '<span class="tour-dot"></span>').join("");
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
    // Prefer below the target, flip above if it won't fit, then hard-clamp into
    // the viewport on both axes so the tooltip is never cut off (matters most on
    // small screens and for top-bar targets).
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
    nextBtn.textContent = idx === steps.length - 1 ? "Finish" : "Next";

    // Only scroll when the target isn't already on screen. Elements in the
    // fixed top bar (wallet, Explore, More) are always visible, and calling
    // scrollIntoView on them would scroll the document and yank the spotlight
    // off-screen.
    // Instant (not smooth) scroll so we can measure the final position right
    // away — smooth scrolling left us measuring mid-animation. Only scroll when
    // the target isn't already on screen (top-bar items always are).
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
    markSeen();
  }

  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); end(); }
    else if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); nextBtn.click(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); if (!backBtn.disabled) show(idx - 1); }
  }

  nextBtn.addEventListener("click", () => {
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

// Wire the More-menu "How to play" action to the tour, and auto-start once
// for brand-new players (only on the Roll page, where every step resolves).
export function mountTour({ base = "./", page = "" } = {}) {
  const action = document.querySelector('[data-more-action="howto"]');
  if (action && !action.dataset.tourWired) {
    action.dataset.tourWired = "1";
    action.addEventListener("click", () => startTour(base));
  }

  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { seen = false; }
  if (!seen && page === "roll") {
    setTimeout(() => startTour(base), 700);
  }
}
