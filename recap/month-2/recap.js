import { supabase } from "../../src/backend/supabase.js";
import { playMonthTwoAnniversary } from "../../src/ui/monthTwoAnniversary.js";
import { globalRecap, personalRecap, shareSummary, summarySvg } from "./render.js";

const content = document.getElementById("recap-content");
const status = document.getElementById("recap-status");
const errorMessage = document.getElementById("recap-error");
const retry = document.getElementById("retry");
const replay = document.getElementById("replay-intro");
let data = null;
let view = location.hash === "#you" ? "personal" : "global";
let timer;
let loading = false;
let authGeneration = 0;
let disposed = false;

function upcomingMarkup(response) {
  const opens = new Date(response.period.publishesAt).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
  return `<section class="recap-upcoming"><p class="eyebrow">THE SECOND MONTH IS STILL BEING WRITTEN</p>
    <strong>8 OCTOBER</strong><p>The Month Two recap opens ${opens} SGT.</p></section>`;
}

function render() {
  document.getElementById("global-tab").setAttribute("aria-pressed", String(view === "global"));
  document.getElementById("personal-tab").setAttribute("aria-pressed", String(view === "personal"));
  if (!data) return;
  if (data.status === "upcoming") {
    content.innerHTML = upcomingMarkup(data);
    return;
  }
  content.innerHTML = view === "global" ? globalRecap(data) : personalRecap(data);
  document.getElementById("share-summary")?.addEventListener("click", share);
  document.getElementById("copy-summary")?.addEventListener("click", copy);
  document.getElementById("download-summary")?.addEventListener("click", download);
}

async function refresh() {
  if (loading || disposed) return;
  clearTimeout(timer);
  loading = true;
  const generation = authGeneration;
  try {
    const response = await supabase.rpc("get_recap_period", { p_period: "month-2" });
    if (generation !== authGeneration || disposed) return;
    if (response.error) throw response.error;
    if (!response.data?.period || !["upcoming", "finalizing", "final"].includes(response.data.status)) {
      throw new Error("Invalid Month Two recap response");
    }
    data = response.data;
    errorMessage.hidden = true;
    retry.hidden = true;
    replay.hidden = data.status === "upcoming";
    if (data.status === "upcoming") status.textContent = "MONTH TWO • OPENS 8 OCTOBER 2026";
    else if (data.status === "final") status.textContent = "MONTH TWO • FINAL • Frozen 9 October 2026, 12:00 AM SGT";
    else status.textContent = "MONTH TWO • FINALIZING • Statistics closed 8 October 2026, 12:00 AM SGT";
    render();
  } catch (error) {
    if (generation !== authGeneration || disposed) return;
    errorMessage.textContent = data
      ? "Could not refresh. Showing the last successful Month Two recap."
      : "Month Two is unavailable right now. Please try again shortly.";
    errorMessage.hidden = false;
    retry.hidden = false;
  } finally {
    loading = false;
    content.setAttribute("aria-busy", "false");
    if (!disposed && generation !== authGeneration) timer = setTimeout(refresh, 0);
    else if (!disposed && data?.status === "finalizing" && !document.hidden) timer = setTimeout(refresh, 45_000);
  }
}

function shareStatus(message) {
  const element = document.getElementById("share-status");
  if (element) element.textContent = message;
}
async function copy() {
  try {
    await navigator.clipboard.writeText(`${shareSummary(data)}\n${location.origin}/recap/month2/`);
    shareStatus("Summary copied.");
  } catch {
    shareStatus("Copy is unavailable here. You can select the summary text or save the card.");
  }
}
async function share() {
  if (!navigator.share) return copy();
  try {
    await navigator.share({ title: "My Month Two · Gem RNG", text: shareSummary(data), url: `${location.origin}/recap/month2/` });
    shareStatus("Summary shared.");
  } catch (error) {
    if (error.name !== "AbortError") shareStatus("Sharing is unavailable. Try copying the summary.");
  }
}
function download() {
  const blob = new Blob([summarySvg(data)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gem-rng-month-two.svg";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  shareStatus("Your Month Two card was saved.");
}

for (const selectedView of ["global", "personal"]) {
  document.getElementById(`${selectedView}-tab`).addEventListener("click", () => {
    view = selectedView;
    history.replaceState(null, "", selectedView === "personal" ? "#you" : "#global");
    render();
  });
}
replay.addEventListener("click", () => playMonthTwoAnniversary({ base: "../../", replay: true }));
retry.addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(timer);
  else if (data?.status === "finalizing") refresh();
});
const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  if (!["SIGNED_IN", "SIGNED_OUT", "INITIAL_SESSION"].includes(event)) return;
  authGeneration += 1;
  data = null;
  content.replaceChildren();
  clearTimeout(timer);
  timer = setTimeout(refresh, 0);
});
window.addEventListener("pagehide", (event) => {
  disposed = true;
  clearTimeout(timer);
  if (!event.persisted) authListener.subscription.unsubscribe();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  disposed = false;
  refresh();
});
render();
refresh();
