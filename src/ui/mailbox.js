import { supabase } from "../backend/supabase.js";
import { escapeHtml, formatMoney } from "./format.js";

let activeMailbox = null;
const PAGE_SIZE = 25;
const rewardText = reward => {
  const amount = Number(reward.amount || 0).toLocaleString();
  if (reward.type === "money") return `${formatMoney(reward.amount, { exact: true })} cash`;
  if (reward.type === "coins") return `${amount} coins`;
  return `${amount} × ${reward.consumableId || reward.type}`;
};

function popup(title, parent = null) {
  const previous = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay mailbox-overlay";
  overlay.style.cssText = "place-items:center;padding:16px";
  const dialog = document.createElement("section");
  dialog.className = "dialog mailbox-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", title);
  dialog.style.cssText = "width:min(480px,calc(100vw - 32px));max-height:80dvh;overflow:auto;overflow-wrap:anywhere;border-radius:var(--radius-lg)";
  dialog.innerHTML = `<header style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h2 class="dialog__title">${escapeHtml(title)}</h2><button type="button" class="btn" aria-label="Close ${escapeHtml(title)}">✕</button></header><div data-content></div>`;
  overlay.append(dialog);
  if (parent) parent.inert = true;
  document.body.append(overlay);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener("keydown", keydown, true);
    if (parent) parent.inert = false;
    if (previous?.isConnected) previous.focus();
    else parent?.querySelector("button")?.focus();
  };
  const keydown = event => {
    if (overlay.inert) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    }
    if (event.key === "Tab") {
      const buttons = [...dialog.querySelectorAll('button:not(:disabled), a[href]')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener("keydown", keydown, true);
  dialog.querySelector("button").onclick = close;
  overlay.onclick = event => { if (event.target === overlay && !overlay.inert) close(); };
  dialog.querySelector("button").focus();
  return { overlay, content: dialog.querySelector("[data-content]"), close };
}

export function openMailbox({ userId = null, onClaim = () => {} } = {}) {
  if (activeMailbox) return;
  const inbox = popup("Mailbox");
  activeMailbox = inbox;
  let rows = [], more = false, loading = false, message = null, generation = 0, expiryTimer = null, selectedMail = null;
  const originalClose = inbox.close;
  // Also release singleton state when the popup's own close handler removes it.
  const observer = new MutationObserver(() => {
    if (!inbox.overlay.isConnected) cleanup();
  });
  observer.observe(document.body, { childList: true });
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") userId ||= session?.user?.id;
    if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && (!userId || session?.user?.id !== userId))) {
      message?.close(); originalClose(); cleanup();
    }
  });
  function cleanup() {
    generation++; clearTimeout(expiryTimer); message?.close(); rows = [];
    subscription?.data?.subscription?.unsubscribe(); observer.disconnect();
    if (activeMailbox === inbox) activeMailbox = null;
  }
  function render(error = "") {
    clearTimeout(expiryTimer);
    const expired = mail => mail.expires_at && Date.parse(mail.expires_at) <= Date.now();
    if (selectedMail && expired(selectedMail)) message?.close();
    const hadExpired = rows.some(expired);
    rows = rows.filter(mail => !expired(mail));
    if (hadExpired) window.dispatchEvent(new CustomEvent("mailbox:changed"));
    const visibleMail = message?.overlay.isConnected && selectedMail ? rows.concat(selectedMail) : rows;
    const nextExpiry = Math.min(...visibleMail.filter(mail => mail.expires_at).map(mail => Date.parse(mail.expires_at)));
    if (Number.isFinite(nextExpiry)) expiryTimer = setTimeout(() => render(), Math.max(1, nextExpiry - Date.now()));
    inbox.content.innerHTML = `<p style="color:var(--text-muted)">Messages and gifts from Gem Incremental.</p><p style="color:var(--text-muted)">Mail clears at its expiry time, even if unread or unclaimed. Read mail clears sooner: 30 minutes after any rewards are also claimed.</p>
      <p role="status">${escapeHtml(error || (loading ? "Loading mail…" : rows.length ? "" : "Your mailbox is empty."))}</p>
      <div data-mails style="display:grid;gap:8px"></div>
      <div class="dialog__actions"><button class="btn" data-refresh type="button" ${loading ? "disabled" : ""}>Refresh</button>
      ${more ? `<button class="btn" data-more type="button" ${loading ? "disabled" : ""}>Load older mail</button>` : ""}</div>`;
    for (const mail of rows) {
      const button = document.createElement("button");
      button.className = "btn mailbox-entry";
      button.style.cssText = "display:block;text-align:left;white-space:normal;width:100%;padding:12px";
      button.innerHTML = `<strong>${escapeHtml(mail.subject)}</strong><br><small>${escapeHtml(mail.sender)} · ${escapeHtml(new Date(mail.created_at).toLocaleDateString())}<br>${!mail.read_at ? "Unread · " : ""}${mail.rewards?.length ? mail.claimed_at ? "Reward claimed" : "🎁 Reward available" : "Message"}${mail.expires_at ? `<br>Expires ${escapeHtml(new Date(mail.expires_at).toLocaleString())}` : ""}</small>`;
      button.onclick = () => openMessage(mail);
      inbox.content.querySelector("[data-mails]").append(button);
    }
    inbox.content.querySelector("[data-refresh]").onclick = () => load(false);
    inbox.content.querySelector("[data-more]")?.addEventListener("click", () => load(true));
  }
  async function load(append = false) {
    if (loading) return;
    loading = true; const request = ++generation; render();
    try {
      let query = supabase.from("player_mail").select("*").order("id", { ascending: false }).limit(PAGE_SIZE + 1);
      if (append && rows.length) query = query.lt("id", rows.at(-1).id);
      const { data, error } = await query;
      if (request !== generation || !inbox.overlay.isConnected) return;
      if (error) throw error;
      more = data.length > PAGE_SIZE;
      rows = append ? rows.concat(data.slice(0, PAGE_SIZE)) : data.slice(0, PAGE_SIZE);
      loading = false; render();
    } catch {
      if (request !== generation || !inbox.overlay.isConnected) return;
      loading = false; render("Could not load your mail. Please try Refresh.");
    }
  }
  async function openMessage(mail) {
    if (message?.overlay.isConnected) return;
    selectedMail = mail;
    message = popup("Message", inbox.overlay);
    const view = message;
    view.content.innerHTML = '<p role="status">Opening message…</p>';
    const paint = (error = "") => {
      if (!view.overlay.isConnected) return;
      const hasReward = mail.rewards?.length > 0;
      view.content.innerHTML = `<h3>${escapeHtml(mail.subject)}</h3><p>${escapeHtml(mail.sender)} · ${escapeHtml(new Date(mail.created_at).toLocaleString())}</p>
        <p style="white-space:pre-wrap">${escapeHtml(mail.body)}</p>
        ${hasReward ? `<h4>Attached rewards</h4><ul>${mail.rewards.map(r => `<li>${escapeHtml(rewardText(r))}</li>`).join("")}</ul><p>${mail.claimed_at ? "Reward claimed." : "Claim your attached rewards below."}</p>
        <button class="btn btn--primary" data-claim type="button" ${mail.claimed_at ? "disabled" : ""}>${mail.claimed_at ? "Claimed" : "Claim reward"}</button>` : ""}
        <p>${mail.expires_at ? `Automatically clears at ${escapeHtml(new Date(mail.expires_at).toLocaleString())}.` : "Read mail clears 30 minutes after any rewards are claimed."}</p>
        <p role="status">${escapeHtml(error)}</p>`;
      view.content.querySelector("[data-claim]")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true; button.textContent = "Claiming…";
        try {
          const { data, error } = await supabase.rpc("claim_mail_reward", { p_mail_id: mail.id });
          if (error) throw error;
          if (!inbox.overlay.isConnected) return;
          mail.claimed_at = data.claimedAt; mail.read_at ||= data.claimedAt;
          mail.expires_at = data.expiresAt ?? null;
          paint(); render();
          window.dispatchEvent(new CustomEvent("mailbox:changed"));
          // A refresh failure must never turn a successful claim into an error.
          Promise.resolve().then(onClaim).catch(() => {});
        } catch {
          paint("Could not claim the reward. Please try again.");
        }
      });
    };
    try {
      const { data, error } = await supabase.rpc("read_mail", { p_mail_id: mail.id });
      if (error) throw error;
      if (!view.overlay.isConnected || !inbox.overlay.isConnected) return;
      Object.assign(mail, data); paint(); render();
      window.dispatchEvent(new CustomEvent("mailbox:changed"));
    } catch {
      if (!view.overlay.isConnected) return;
      view.content.innerHTML = '<p role="status">Could not open this message. Close it and try again.</p>';
    }
  }
  load();
}
