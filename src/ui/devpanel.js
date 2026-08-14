import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";
import { notify } from "./toast.js";
import { formatMoney, formatCount } from "./format.js";


// =========================================================
// MAINTENANCE PANEL
//
// Internal utility for testing and player giveaways. Reached
// with a fixed key sequence rather than a visible control, so
// it stays out of the way during normal play.
//
// Only touches columns the player already owns on their own
// row; every gameplay action still goes through the server.
// =========================================================


const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowLeft",
  "ArrowRight",
  "ArrowRight"
];


let progress = 0;
let panel = null;


export function initDevPanel() {
  document.addEventListener("keydown", onKeyDown, true);
}


function onKeyDown(event) {
  // Never intercept typing.
  const target = event.target;

  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  ) {
    progress = 0;

    return;
  }

  if (event.key === SEQUENCE[progress]) {
    progress += 1;

    if (progress === SEQUENCE.length) {
      progress = 0;

      toggle();
    }

    return;
  }

  // Allow a wrong key to be the first key of a fresh attempt.
  progress = event.key === SEQUENCE[0] ? 1 : 0;
}


function toggle() {
  if (panel) {
    close();

    return;
  }

  open();
}


function close() {
  panel?.remove();

  panel = null;
}


async function open() {
  const user = await ensurePlayerAuth();

  if (!user) {
    notify.error("Unavailable", "No active session.");

    return;
  }

  const state = await loadState(user.id);

  panel = document.createElement("div");

  panel.className = "devpanel";

  panel.innerHTML = `
    <div class="devpanel__bar">
      <span class="devpanel__title">Maintenance</span>
      <button class="devpanel__close" type="button" aria-label="Close">×</button>
    </div>

    <div class="devpanel__body">
      <label class="devpanel__field">
        <span>Money</span>
        <input type="number" id="devMoney" value="${state.money}" min="0" step="100">
      </label>

      <label class="devpanel__field">
        <span>Capacity</span>
        <input type="number" id="devCapacity" value="${state.capacity}" min="1" max="9999">
      </label>

      <div class="devpanel__actions">
        <button class="btn btn--sm" data-action="add" type="button">+1M money</button>
        <button class="btn btn--sm" data-action="cooldown" type="button">Clear cooldown</button>
      </div>

      <button class="btn btn--primary btn--block btn--sm" data-action="apply" type="button">
        Apply
      </button>

      <p class="devpanel__note" id="devStatus"></p>
    </div>
  `;

  document.body.appendChild(panel);

  const moneyInput = panel.querySelector("#devMoney");
  const capacityInput = panel.querySelector("#devCapacity");
  const status = panel.querySelector("#devStatus");

  panel.querySelector(".devpanel__close").addEventListener("click", close);

  panel.querySelector('[data-action="add"]').addEventListener("click", () => {
    moneyInput.value = String(Number(moneyInput.value || 0) + 1_000_000);
  });

  panel
    .querySelector('[data-action="cooldown"]')
    .addEventListener("click", async () => {
      const ok = await patch(user.id, { next_roll_at: null });

      status.textContent = ok ? "Cooldown cleared." : "Failed.";

      if (ok) {
        notify.success("Cooldown cleared");
      }
    });

  panel
    .querySelector('[data-action="apply"]')
    .addEventListener("click", async () => {
      const patchBody = {
        money: Math.max(0, Number(moneyInput.value || 0)),
        inventory_capacity: Math.max(1, Number(capacityInput.value || 1))
      };

      const ok = await patch(user.id, patchBody);

      if (!ok) {
        status.textContent = "Failed.";

        return;
      }

      status.textContent =
        `Set money ${formatMoney(patchBody.money)}, ` +
        `capacity ${formatCount(patchBody.inventory_capacity)}.`;

      notify.success("Applied");
    });

  document.addEventListener("keydown", onEscape, true);
}


function onEscape(event) {
  if (event.key === "Escape" && panel) {
    close();

    document.removeEventListener("keydown", onEscape, true);
  }
}


async function loadState(userId) {
  const { data } = await supabase
    .from("players")
    .select("money, inventory_capacity")
    .eq("id", userId)
    .maybeSingle();

  return {
    money: Number(data?.money ?? 0),
    capacity: Number(data?.inventory_capacity ?? 15)
  };
}


async function patch(userId, body) {
  const { error } = await supabase
    .from("players")
    .update(body)
    .eq("id", userId);

  if (error) {
    console.error("Maintenance update failed:", error);

    return false;
  }

  return true;
}
