import { icons } from "./icons.js";

// =========================================================
// HOW TO PLAY
//
// A friendly first-run guide so a new player understands the
// core loop without having to poke every page. It shows itself
// once (remembered per-device) and can be reopened any time
// from the contribute dock.
// =========================================================

const SEEN_KEY = "gemIncremental.seenHowToPlay";

const STEPS = [
  { icon: icons.dice, title: "1 · Roll a gem", text: "Press the big button — or <kbd>R</kbd> / <kbd>Space</kbd> — to pull a gem from the deposit. Rarer gems are worth more." },
  { icon: icons.bag, title: "2 · Keep or sell", text: "Open your Inventory to sell gems for money. Lock the ones you want to keep so they’re never sold by accident." },
  { icon: icons.anvil, title: "3 · Craft & upgrade", text: "Spend gems and money on pickaxes, boots and bags. Better gear means more Luck, faster rolls and heavier gems." },
  { icon: icons.potion, title: "4 · Boost your luck", text: "Brew potions, choose Mining Cache rewards, and enchant your pickaxe with relics to dig up the rarest specimens faster." },
  { icon: icons.gavel, title: "5 · Compete & trade", text: "Climb the leaderboards, pin your best gems to your profile, and buy or sell at the Auction House." }
];

function buildModal(base) {
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay howto-overlay";

  overlay.innerHTML = `
    <div class="dialog howto" role="dialog" aria-modal="true" aria-labelledby="howtoTitle">
      <h2 class="dialog__title howto__title" id="howtoTitle">
        <span class="howto__spark">${icons.gem}</span>
        Welcome to Gem Incremental
      </h2>

      <p class="howto__lede">Dig gems, build a collection, and chase the rarest specimens. Here’s the loop:</p>

      <div class="howto__steps">
        ${STEPS.map((step) => `
          <div class="howto__step">
            <span class="howto__step-icon">${step.icon}</span>
            <div class="howto__step-body">
              <div class="howto__step-title">${step.title}</div>
              <div class="howto__step-text">${step.text}</div>
            </div>
          </div>
        `).join("")}
      </div>

      <p class="howto__tip">${icons.bolt} Tip: turn on <strong>Auto roll</strong> to keep digging hands-free.</p>

      <div class="dialog__actions">
        <a class="btn" href="${base}gem-index/">Browse the gems</a>
        <button class="btn btn--primary" data-action="close" type="button">Got it — let’s dig</button>
      </div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  };

  const onKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  };

  overlay.addEventListener("click", (event) => {
    // Closing, or following the "Browse the gems" link, both count as seen.
    if (
      event.target === overlay ||
      event.target.closest('[data-action="close"]') ||
      event.target.closest("a")
    ) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="close"]').focus();
}

export function mountHowToPlay(base = "./") {
  // The utility action is now part of the shell's top-bar More menu.
  const action = document.querySelector('[data-more-action="howto"]');
  if (action && !action.dataset.wired) {
    action.dataset.wired = "1";
    action.addEventListener("click", () => buildModal(base));
  }

  // Backward compatibility for older cached shell markup.
  const dock = document.querySelector(".contribute-dock");
  const target = dock?.querySelector(".more-menu");
  if (target && !target.querySelector(".howto-dock-link")) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "contribute-dock__link howto-dock-link";
    link.title = "How to play";
    link.innerHTML = `${icons.book}<span>How to play</span>`;
    link.addEventListener("click", () => buildModal(base));
    target.appendChild(link);
  }

  // First visit: show it automatically.
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { seen = false; }
  if (!seen) {
    // Let the shell finish painting first.
    setTimeout(() => buildModal(base), 350);
  }
}
