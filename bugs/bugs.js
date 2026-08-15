import { ensurePlayerAuth } from "../src/backend/auth.js";
import { supabase } from "../src/backend/supabase.js";
import { mountShell } from "../src/ui/shell.js";
import { icons } from "../src/ui/icons.js";
import { notify } from "../src/ui/toast.js";


const shell = mountShell({ page: "bugs", base: "../" });


const form = document.getElementById("bugForm");
const category = document.getElementById("bugCategory");
const bodyInput = document.getElementById("bugBody");
const contactInput = document.getElementById("bugContact");
const submitButton = document.getElementById("bugSubmit");
const status = document.getElementById("bugStatus");

const formCard = document.getElementById("bugFormCard");
const successCard = document.getElementById("bugSuccess");
const anotherButton = document.getElementById("bugAnother");

document.getElementById("bugSuccessMark").innerHTML = icons.checkCircle;


// A session lets the report record who sent it (and the wallet
// pill in the header). Reports still work for guests.
ensurePlayerAuth().then(async (user) => {
  if (!user) {
    return;
  }

  const { data } = await supabase
    .from("players")
    .select("money")
    .eq("id", user.id)
    .maybeSingle();

  shell.setWallet(data?.money ?? null);
});


function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}


form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = bodyInput.value.trim();

  if (!text) {
    setStatus("Please describe the bug before sending.", true);
    bodyInput.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  setStatus("");

  const { error } = await supabase.rpc("submit_bug_report", {
    p_body: text,
    p_category: category.value,
    p_contact: contactInput.value.trim() || null,
    p_page: document.referrer || null
  });

  submitButton.disabled = false;
  submitButton.textContent = "Send report";

  if (error) {
    console.error("Bug report failed:", error);

    const rateLimited = /rate_limited/.test(error.message ?? "");

    const message = rateLimited
      ? "You've sent a few reports already — please try again in a few minutes."
      : "Could not send the report. Please try again, or text us instead.";

    setStatus(message, true);
    notify.error("Not sent", message);

    return;
  }

  formCard.classList.add("hidden");
  successCard.classList.remove("hidden");
  notify.success("Report sent", "Thanks for helping improve the game.");
});


anotherButton.addEventListener("click", () => {
  bodyInput.value = "";
  contactInput.value = "";
  category.value = "bug";
  setStatus("");

  successCard.classList.add("hidden");
  formCard.classList.remove("hidden");
  bodyInput.focus();
});
