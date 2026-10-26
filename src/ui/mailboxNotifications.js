import { supabase } from "../backend/supabase.js";

export function mountMailboxNotifications(button) {
  let userId = null, name = "Guest", count = 0, request = 0;
  button.style.position = "relative";
  const badge = document.createElement("span");
  badge.dataset.mailboxBadge = "profile";
  badge.setAttribute("aria-hidden", "true");
  badge.style.cssText = "position:absolute;right:-5px;top:-6px;display:none;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#dc2626;color:white;font-size:11px;font-weight:800;align-items:center;justify-content:center;line-height:1;pointer-events:none";
  button.append(badge);
  function paint(root = document) {
    for (const element of new Set([badge,...root.querySelectorAll('[data-mailbox-badge]')])) {
      element.style.display = count > 0 ? "inline-flex" : "none";
      element.textContent = count > 99 ? "99+" : String(count);
      element.title = `${count} unread or unclaimed mail`;
    }
    button.setAttribute("aria-label", `Account: ${name}${count ? `, ${count} unread or unclaimed mail` : ""}`);
  }
  async function refresh() {
    if (!userId || document.hidden) return;
    const currentRequest = ++request, owner = userId;
    try {
      const {data,error} = await supabase.rpc("mailbox_pending_count");
      if (error || currentRequest !== request || owner !== userId) return;
      count = Math.max(0,Number(data) || 0); paint();
    } catch { /* Preserve the last confirmed count on a transient failure. */ }
  }
  function setAccount(user, label = name) {
    name = label;
    const next = user && !user.is_anonymous ? user.id : null;
    if (next !== userId) { userId = next; request++; count = 0; paint(); refresh(); }
    else paint();
  }
  supabase.auth.onAuthStateChange((event,session) => {
    if (event === "SIGNED_OUT") setAccount(null);
    else if (event === "SIGNED_IN" && session?.user?.id !== userId) setAccount(session?.user);
  });
  window.addEventListener("mailbox:changed", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  // Receive newly published mail without adding requests to the roll hot path.
  setInterval(refresh, 60000);
  paint();
  return {setAccount,refresh,paint};
}
