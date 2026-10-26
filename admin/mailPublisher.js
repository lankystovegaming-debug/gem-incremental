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
  field("mailPotion").innerHTML += consumables.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
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
        .select("id,source,subject,sender,audience,recipient,recipient_count,created_at")
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      history.innerHTML = data.length ? data.map(row => `<article class="admin-event"><strong>${escapeHtml(row.subject)}</strong><p>${escapeHtml(row.source === "system" ? "System" : "Owner")} · ${escapeHtml(row.sender)} · ${escapeHtml(row.audience === "all" ? "All current players" : row.recipient)} · ${escapeHtml(row.recipient_count)} delivered</p><small>${escapeHtml(new Date(row.created_at).toLocaleString())}</small></article>`).join("") : "<p>No mail published yet.</p>";
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
    if (field("mailPotion").value) {
      const amount = Number(field("mailPotionQuantity").value);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2147483647) { status.textContent = "Enter a valid potion quantity."; return; }
      rewards.push({ type: "potion", amount, consumableId: field("mailPotion").value });
    }
    const subject = field("mailSubject").value.trim(), body = field("mailBody").value;
    const sender = field("mailSender").value.trim(), audience = field("mailAudience").value;
    const recipient = audience === "player" ? field("mailRecipient").value.trim() : null;
    if (!subject || !body.trim() || !sender || (audience === "player" && !recipient)) { status.textContent = "Complete the recipient, sender, subject and message."; return; }
    // Keep this request ID through ambiguous failures; editing creates a new publication.
    pending ||= {p_request_id: crypto.randomUUID(),p_subject: subject,p_body: body,p_sender: sender,p_audience: audience,p_recipient: recipient,p_rewards: rewards};
    const labels = rewards.map(r => r.type === "money" ? formatMoney(r.amount,{exact:true}) + " cash" : r.type === "coins" ? r.amount + " coins" : r.amount + " × " + (consumables.find(c=>c.id===r.consumableId)?.name || r.consumableId));
    preview.innerHTML = `<h3>Review before publishing</h3><p><strong>To:</strong> ${escapeHtml(audience === "all" ? "All current players" : recipient)}</p><p><strong>From:</strong> ${escapeHtml(sender)}</p><h4>${escapeHtml(subject)}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(body)}</p><p><strong>Rewards per player:</strong> ${escapeHtml(labels.join(" · ") || "None")}</p><p>Publishing delivers mail immediately. Rewards remain unclaimed until each player claims them.</p><button type="button" class="btn btn--primary" data-publish>${audience === "all" ? "Publish to all current players" : "Publish mail"}</button> <button type="button" class="btn" data-cancel>Back to editing</button>`;
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
        form.reset(); field("mailAudience").onchange();
        loadHistory();
      } catch (error) {
        const known = {
          mail_publisher_owner_only: "Only the owner can publish mail.",
          mail_recipient_not_found_or_ambiguous: "No unique player was found. Check the username or Player ID.",
          invalid_mail_consumable: "That potion is unavailable. Choose another potion.",
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
