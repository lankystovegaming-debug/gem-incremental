import { supabase } from "../backend/supabase.js";
import { ensurePlayerAuth } from "../backend/auth.js";

/*
 * Lightweight presence heartbeat used by the admin analytics dashboard.
 *
 * The database records the last-seen timestamp server-side, so changing the
 * browser clock or spoofing a client timestamp cannot make a player appear
 * online indefinitely.
 */
const HEARTBEAT_MS = 60_000;
let timer = null;
let started = false;

async function heartbeat() {
  try {
    const user = await ensurePlayerAuth();
    if (!user) return;
    await supabase.rpc("record_player_presence");
  } catch (error) {
    // Presence is observability only. Never let an analytics outage affect
    // normal gameplay or page navigation.
    console.debug("[PRESENCE] heartbeat unavailable", error);
  }
}

export function startActivityHeartbeat() {
  if (started) return;
  started = true;

  heartbeat();
  timer = window.setInterval(heartbeat, HEARTBEAT_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) heartbeat();
  });

  window.addEventListener("beforeunload", () => {
    if (timer) window.clearInterval(timer);
  }, { once: true });
}
