import { getConsumableById } from "../src/data/consumables.js";
import { ensurePlayerAuth } from "../src/backend/auth.js";
import { redeemCode } from "../src/backend/cloudCodes.js";
import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { formatMoney, formatCount, escapeHtml } from "../src/ui/format.js";
import { notify } from "../src/ui/toast.js";

const shell = mountShell({ page: "codes", base: "../" });
const form = document.getElementById("codeForm");
const input = document.getElementById("codeInput");
const button = document.getElementById("redeemButton");
const result = document.getElementById("codeResult");

document.getElementById("codesIcon").innerHTML = icons.sparkle;

const user = await ensurePlayerAuth();
if (user) await refreshWallet();

input.addEventListener("input", () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = input.value.trim();
  if (!code) return;

  button.disabled = true;
  button.textContent = "Redeeming…";
  result.hidden = true;

  const { data, error } = await redeemCode(code);

  button.disabled = false;
  button.textContent = "Redeem";

  if (error) {
    const messages = {
      invalid_code: "That code does not exist.",
      code_inactive: "That code is no longer active.",
      code_not_started: "That code is not active yet.",
      code_expired: "That code has expired.",
      code_limit_reached: "That code has reached its redemption limit.",
      code_already_redeemed: "You have already redeemed that code."
    };
    const key = Object.keys(messages).find((item) => error.message?.includes(item));
    notify.error("Code not redeemed", key ? messages[key] : error.message);
    return;
  }

  const rewards = [];
  if (Number(data.money) > 0) rewards.push(formatMoney(data.money));
  if (data.consumableId && Number(data.consumableQuantity) > 0) {
    const name = getConsumableById(data.consumableId)?.name ?? data.consumableId;
    rewards.push(`${formatCount(data.consumableQuantity)}× ${name}`);
  }

  result.innerHTML = `<strong>Code redeemed!</strong><span>${escapeHtml(rewards.join(" + "))}</span>`;
  result.hidden = false;
  input.value = "";
  notify.success("Rewards claimed", rewards.join(" + "));
  await refreshWallet();
});

async function refreshWallet() {
  const { data } = await supabase.from("players").select("money").eq("id", user.id).maybeSingle();
  shell.setWallet(data?.money ?? null);
}
