import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";

let mounted = false;
let activeOverlay = null;

const wait = (milliseconds, state) => new Promise((resolve) => {
  const timeout = window.setTimeout(resolve, state.accelerated ? Math.min(90, milliseconds) : milliseconds);
  state.skip = () => {
    window.clearTimeout(timeout);
    resolve();
  };
});

function formatRolls(value) {
  return Math.round(Math.max(0, Number(value) || 0)).toLocaleString("en-US");
}

function countTo(element, from, to, state) {
  return new Promise((resolve) => {
    const started = performance.now();
    const duration = state.accelerated ? 180 : 1800;
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${formatRolls(from + (to - from) * eased)} ROLLS`;
      if (progress < 1 && !state.accelerated) requestAnimationFrame(frame);
      else {
        element.textContent = `${formatRolls(to)} ROLLS`;
        resolve();
      }
    };
    state.skip = () => {
      state.accelerated = true;
      element.textContent = `${formatRolls(to)} ROLLS`;
      resolve();
    };
    requestAnimationFrame(frame);
  });
}

function closeOverlay() {
  activeOverlay?.remove();
  activeOverlay = null;
  document.documentElement.classList.remove("anniversary-intro-open");
}

async function present(payload, base) {
  closeOverlay();
  const overlay = document.createElement("div");
  overlay.className = "anniversary-intro";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Gem RNG Month Two anniversary");
  overlay.innerHTML = `<div class="anniversary-intro__halves" aria-hidden="true"><i></i><i></i></div>
    <div class="anniversary-intro__content">
      <p class="anniversary-intro__line" data-anniversary-line aria-live="polite"></p>
      <p class="anniversary-intro__counter" data-anniversary-counter hidden></p>
      <div class="anniversary-intro__actions" data-anniversary-actions hidden>
        <a class="btn btn--primary" href="${base}recap/month2/">SEE WHAT CHANGED</a>
        <button class="btn btn--ghost" type="button" data-anniversary-dismiss>KEEP ROLLING</button>
      </div>
      <small class="anniversary-intro__hint">Tap or click to accelerate</small>
    </div>`;
  document.body.appendChild(overlay);
  document.documentElement.classList.add("anniversary-intro-open");
  activeOverlay = overlay;

  const state = {
    accelerated: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    skip: null
  };
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("a,button")) return;
    state.accelerated = true;
    state.skip?.();
  });
  overlay.querySelector("[data-anniversary-dismiss]").addEventListener("click", closeOverlay);

  const line = overlay.querySelector("[data-anniversary-line]");
  const counter = overlay.querySelector("[data-anniversary-counter]");
  const show = async (html, milliseconds) => {
    line.classList.remove("is-visible");
    await wait(180, state);
    line.innerHTML = html;
    line.classList.add("is-visible");
    await wait(milliseconds, state);
  };

  await show("It’s been two months.", 1200);
  await show("One month ago, we stopped at…", 1200);
  line.classList.remove("is-visible");
  counter.hidden = false;
  counter.textContent = `${formatRolls(payload.monthOneRolls)} ROLLS`;
  counter.classList.add("is-visible");
  await wait(900, state);
  await countTo(counter, Number(payload.monthOneRolls), Number(payload.communityRolls), state);
  await wait(650, state);
  counter.classList.remove("is-visible");
  counter.hidden = true;
  await show("…and apparently, we didn’t stop.", 1050);
  await show('<strong>HAPPY MONTH TWO.</strong><span>8 October 2026</span>', 1450);
  overlay.classList.add("anniversary-intro--split");
  await show("Something is different today.", 1050);
  line.classList.remove("is-visible");
  overlay.querySelector("[data-anniversary-actions]").hidden = false;
  overlay.querySelector("[data-anniversary-actions]").classList.add("is-visible");
  overlay.querySelector(".anniversary-intro__hint").hidden = true;
  overlay.querySelector("a")?.focus();
}

export async function playMonthTwoAnniversary({ base = "./", replay = false } = {}) {
  const user = await ensurePlayerAuth();
  if (!user) return false;
  const { data, error } = await supabase.rpc("get_month_two_anniversary_intro", { p_replay: replay });
  if (error || !data?.show) return false;
  await present(data, base);
  return true;
}

export function mountMonthTwoAnniversary({ base = "./" } = {}) {
  if (mounted) return;
  mounted = true;
  queueMicrotask(() => {
    playMonthTwoAnniversary({ base }).catch((error) => {
      console.warn("[MONTH TWO] Anniversary intro unavailable:", error);
    });
  });
}
