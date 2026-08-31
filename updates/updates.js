import { mountShell } from "../src/ui/shell.js";
import { supabase } from "../src/backend/supabase.js";
import { escapeHtml } from "../src/ui/format.js";

mountShell({ page: "updates", base: "../" });

function formatUpdateDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function renderUpdate(entry, latest) {
  const sections = (Array.isArray(entry.sections) ? entry.sections : []).map((section) => `
    <div class="update-section">
      <h3>${escapeHtml(section.heading)}</h3>
      <ul>${(Array.isArray(section.bullets) ? section.bullets : []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
    </div>
  `).join("");

  return `<article class="update-card${latest ? " update-card--latest" : ""}">
    <header class="update-card__header"><div><div class="update-card__meta">
      ${latest ? '<span class="update-card__badge">Latest</span>' : ""}
      <span class="update-card__badge update-card__badge--version">${escapeHtml(entry.version)}</span>
      <time datetime="${escapeHtml(entry.published_on)}">${escapeHtml(formatUpdateDate(entry.published_on))}</time>
    </div><h2>${escapeHtml(entry.title)}</h2></div></header>
    ${sections}
  </article>`;
}

async function loadPublishedUpdates() {
  const dynamicList = document.getElementById("publishedUpdates");
  if (!dynamicList) return;
  const { data, error } = await supabase
    .from("update_logs")
    .select("id,version,title,published_on,sections,published_at")
    .eq("published", true)
    .order("published_on", { ascending: false })
    .order("published_at", { ascending: false });

  if (error || !data?.length) return;
  dynamicList.innerHTML = data.map((entry, index) => renderUpdate(entry, index === 0)).join("");
  dynamicList.hidden = false;

  const firstStatic = document.querySelector("#staticUpdates .update-card--latest");
  firstStatic?.classList.remove("update-card--latest");
  firstStatic?.querySelector(".update-card__badge:not(.update-card__badge--version)")?.remove();
}

loadPublishedUpdates();
