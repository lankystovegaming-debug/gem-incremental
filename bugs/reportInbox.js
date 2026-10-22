const PAGE_SIZE = 25;
const CATEGORIES = {
  bug: "Bug", visual: "Visual glitch", suggestion: "Suggestion / idea",
  account: "Account or save problem", other: "Other"
};

// The database's SELECT policy enforces owner membership independently of UI.
export function loadReportPage(client, { before = null, category = "" } = {}) {
  let query = client.from("bug_reports")
    .select("id,reporter,category,body,contact,page,status,created_at")
    .order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  if (before !== null) query = query.lt("id", before);
  if (category) query = query.eq("category", category);
  return query;
}

function reportCard(document, report) {
  const article = document.createElement("article");
  article.className = "report-entry";
  const heading = document.createElement("h3");
  heading.textContent = `#${report.id} · ${CATEGORIES[report.category] || report.category || "Uncategorized"}`;
  const date = document.createElement("time");
  const timestamp = new Date(report.created_at);
  if (!Number.isNaN(timestamp.valueOf())) {
    date.dateTime = timestamp.toISOString();
    date.textContent = timestamp.toLocaleString();
  }
  const body = document.createElement("p");
  body.className = "report-entry__body";
  body.textContent = report.body;
  const details = document.createElement("dl");
  for (const [label, value] of [
    ["Status", report.status || "open"],
    ["Reporter ID", report.reporter || "Unavailable / deleted account"],
    ["Reply contact", report.contact || "Not provided"],
    ["Referring page", report.page || "Not provided"]
  ]) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    // User-provided text and URLs must never become HTML or executable links.
    description.textContent = value;
    details.append(term, description);
  }
  article.append(heading, date, body, details);
  return article;
}

export function mountReportInbox({ client, root }) {
  const list = root.querySelector("#reportList");
  const status = root.querySelector("#reportInboxStatus");
  const more = root.querySelector("#reportMore");
  const refresh = root.querySelector("#reportRefresh");
  const category = root.querySelector("#reportCategory");
  let authorized = false;
  let generation = 0;
  let before = null;
  let displayed = 0;

  function clear() {
    generation += 1;
    authorized = false;
    root.hidden = true;
    list.replaceChildren();
    status.textContent = "";
    before = null;
    displayed = 0;
    more.hidden = true;
  }

  async function load(reset = false) {
    if (!authorized) return;
    const current = ++generation;
    if (reset) {
      list.replaceChildren();
      before = null;
      displayed = 0;
    }
    more.disabled = refresh.disabled = category.disabled = true;
    status.textContent = "Loading reports…";
    try {
      const { data, error } = await loadReportPage(client, { before, category: category.value });
      if (current !== generation || !authorized) return;
      if (error) throw error;
      const rows = data || [];
      const visible = rows.slice(0, PAGE_SIZE);
      list.append(...visible.map(report => reportCard(root.ownerDocument, report)));
      displayed += visible.length;
      if (visible.length) before = visible.at(-1).id;
      more.hidden = rows.length <= PAGE_SIZE;
      status.textContent = displayed ? `${displayed} report${displayed === 1 ? "" : "s"} shown.` : "No reports found in this category.";
    } catch {
      if (current !== generation || !authorized) return;
      status.textContent = "Could not load reports. Try Refresh reports. If access has not been configured, apply the bug-report inbox migration.";
    } finally {
      if (current === generation && authorized) more.disabled = refresh.disabled = category.disabled = false;
    }
  }

  async function verifyAccess() {
    clear();
    const current = generation;
    try {
      const { data, error } = await client.rpc("am_i_admin");
      if (current !== generation || error || data !== true) return;
      authorized = true;
      root.hidden = false;
      await load(true);
      if (root.ownerDocument.defaultView.location.hash === "#reportInbox" && authorized) {
        root.scrollIntoView({ block: "start" });
      }
    } catch { /* Ordinary players continue to see only the submission form. */ }
  }

  refresh.addEventListener("click", () => load(true));
  category.addEventListener("change", () => load(true));
  more.addEventListener("click", () => load());
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
      clear();
      // Leave the auth callback before making another Supabase request.
      if (event !== "SIGNED_OUT") setTimeout(verifyAccess, 0);
    }
  });
  verifyAccess();
}
