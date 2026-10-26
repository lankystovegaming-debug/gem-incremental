import { supabase } from "../src/backend/supabase.js";
import { escapeHtml, formatMoney } from "../src/ui/format.js";
import consumables from "../src/data/consumables.js";

export function mountMailPublisher() {
  const panel = document.getElementById("mailPublisherPanel");
  if (!panel || panel.dataset.mounted) return;
  panel.dataset.mounted = "true";
  panel.hidden = false;
  const form = document.getElementById("mailPublisherForm");
  const preview = document.getElementById("mailPreview");
  const status = document.getElementById("mailPublishStatus");
  const history = document.getElementById("mailPublicationHistory");
  const field = id => document.getElementById(id);
  let pending = null, publishing = false;
  const potionRows = field("mailPotionRows");
  function addPotionRow() {
    if (potionRows.children.length >= 20) { status.textContent = "A mail supports up to 20 attachments."; return; }
    const row = document.createElement("div");
    row.dataset.potionRow = "";
    const first = !potionRows.children.length;
    row.innerHTML = `<label class="field"><span>Potion</span><select ${first ? 'id="mailPotion"' : ""} data-potion-id class="select"><option value="">No potion</option>${consumables.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label><label class="field"><span>Quantity</span><input ${first ? 'id="mailPotionQuantity"' : ""} data-potion-quantity type="number" min="1" max="2147483647" step="1" value="1"></label><button class="btn" type="button" data-remove-potion>Remove potion</button>`;
    row.querySelector("[data-remove-potion]").onclick = () => { row.remove(); changed(); };
    potionRows.append(row);
  }
  addPotionRow();
  field("mailAddPotion").onclick = () => { changed(); addPotionRow(); };
  field("mailExpiry").onchange = () => {
    const custom = field("mailExpiry").value === "custom";
    field("mailExpiryCustomField").hidden = !custom;
    field("mailExpiryCustom").required = custom;
  };
  field("mailAudience").onchange = () => {
    const individual = field("mailAudience").value === "player";
    field("mailRecipientField").hidden = !individual;
    field("mailRecipient").required = individual;
  };
  function changed() {
    if (publishing) return;
    pending = null; preview.hidden = true; preview.replaceChildren(); status.textContent = "";
  }
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);
  async function loadHistory() {
    history.textContent = "Loading publication history…";
    try {
      const { data, error } = await supabase.from("mail_publications")
        .select("id,source,subject,sender,audience,recipient,recipient_count,created_at,hard_expires_at")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      history.innerHTML = data.length ? data.map(row => `<article class="admin-event"><strong>${escapeHtml(row.subject)}</strong><p>${escapeHtml(row.source === "system" ? "System" : "Owner")} · ${escapeHtml(row.sender)} · ${escapeHtml(row.audience === "all" ? "All current players" : row.recipient)} · ${escapeHtml(row.recipient_count)} delivered</p><small>${escapeHtml(new Date(row.created_at).toLocaleString())}${row.hard_expires_at ? ` · Expires ${escapeHtml(new Date(row.hard_expires_at).toLocaleString())}` : ""}</small></article>`).join("") : "<p>No mail published yet.</p>";
    } catch { history.textContent = "Could not load publishing history. Please refresh history."; }
  }
  field("mailHistoryRefresh").onclick = loadHistory;
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (publishing || !form.reportValidity()) return;
    const rewards = [];
    for (const [id,type] of [["mailCash","money"],["mailCoins","coins"]]) {
      const amount = Number(field(id).value);
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1e15) { status.textContent = "Enter valid whole-number rewards."; return; }
      if (amount) rewards.push({ type, amount });
    }
    const potionTotals = new Map();
    for (const row of potionRows.children) {
      const id = row.querySelector("[data-potion-id]").value;
      if (!id) continue;
      const amount = Number(row.querySelector("[data-potion-quantity]").value);
      const total = (potionTotals.get(id) || 0) + amount;
      if (!Number.isSafeInteger(amount) || amount < 1 || total > 2147483647) { status.textContent = "Enter valid potion quantities (combined quantity per potion cannot exceed 2,147,483,647)."; return; }
      potionTotals.set(id,total);
    }
    for (const [consumableId,amount] of potionTotals) rewards.push({type:"potion",amount,consumableId});
    if (rewards.length > 20) { status.textContent = "A mail supports up to 20 attachments including cash and coins."; return; }
    const deadline = field("mailExpiry").value === "custom"
      ? new Date(field("mailExpiryCustom").value)
      : new Date(Date.now() + Number(field("mailExpiry").value)*1000);
    if (!pending && (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now())) { status.textContent = "Choose an expiry time in the future."; return; }
    const subject = field("mailSubject").value.trim(), body = field("mailBody").value;
    const sender = field("mailSender").value.trim(), audience = field("mailAudience").value;
    const recipient = audience === "player" ? field("mailRecipient").value.trim() : null;
    if (!subject || !body.trim() || !sender || (audience === "player" && !recipient)) { status.textContent = "Complete the recipient, sender, subject and message."; return; }
    // Keep this request ID through ambiguous failures; editing creates a new publication.
    pending ||= {p_request_id: crypto.randomUUID(),p_subject: subject,p_body: body,p_sender: sender,p_audience: audience,p_recipient: recipient,p_rewards: rewards,p_expires_at: deadline.toISOString()};
    const labels = rewards.map(r => r.type === "money" ? formatMoney(r.amount,{exact:true}) + " cash" : r.type === "coins" ? r.amount + " coins" : r.amount + " × " + (consumables.find(c=>c.id===r.consumableId)?.name || r.consumableId));
    preview.innerHTML = `<h3>Review before publishing</h3><p><strong>To:</strong> ${escapeHtml(audience === "all" ? "All current players" : recipient)}</p><p><strong>From:</strong> ${escapeHtml(sender)}</p><h4>${escapeHtml(subject)}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(body)}</p><p><strong>Rewards per player:</strong> ${escapeHtml(labels.join(" · ") || "None")}</p><p><strong>Expires:</strong> ${escapeHtml(new Date(pending.p_expires_at).toLocaleString())}, even if unread or unclaimed.</p><p>Publishing delivers mail immediately. Rewards remain unclaimed until each player claims them.</p><button type="button" class="btn btn--primary" data-publish>${audience === "all" ? "Publish to all current players" : "Publish mail"}</button> <button type="button" class="btn" data-cancel>Back to editing</button>`;
    preview.hidden = false;
    preview.querySelector("[data-cancel]").onclick = () => { preview.hidden = true; };
    const button = preview.querySelector("[data-publish]");
    button.onclick = async () => {
      if (publishing || !pending) return;
      publishing = true;
      const controls = [...form.elements, ...preview.querySelectorAll("button")];
      controls.forEach(control=>control.disabled=true);
      status.textContent = "Publishing mail…";
      try {
        const { data, error } = await supabase.rpc("publish_owner_mail",pending);
        if (error) throw error;
        status.textContent = `${data.alreadyPublished ? "Already published" : "Published"} to ${data.recipientCount} player${data.recipientCount === 1 ? "" : "s"}.`;
        pending = null; preview.hidden = true;
        form.reset(); potionRows.replaceChildren(); addPotionRow(); field("mailAudience").onchange(); field("mailExpiry").onchange();
        loadHistory();
      } catch (error) {
        const known = {
          mail_publisher_owner_only: "Only the owner can publish mail.",
          mail_recipient_not_found_or_ambiguous: "No unique player was found. Check the username or Player ID.",
          invalid_mail_consumable: "That potion is unavailable. Choose another potion.",
          invalid_mail_expiry: "Choose an expiry time in the future, then review again.",
          mail_request_conflict: "This request was already used for different mail. Edit the message and review again."
        };
        status.textContent = known[error?.message] || "Publishing could not be confirmed. Retry this same preview to safely check or complete the delivery.";
      } finally {
        publishing = false; controls.forEach(control=>control.disabled=false);
        if (!pending) preview.replaceChildren();
      }
    };
    button.focus();
  });
  loadHistory();
}
