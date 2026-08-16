import { invokeFunction } from "./invoke.js";


// =========================================================
// SINGLE ACTIVE ROLL TAB
//
// The server owns the lease. Each browser tab gets its own
// sessionStorage UUID, so opening another tab creates a different
// session ID. The client heartbeat is only a keep-alive request;
// the roll Edge Function independently verifies the same lease
// immediately before generating a roll.
//
// Heartbeat: every 25 seconds.
// Server lease: 45 seconds.
// =========================================================

const HEARTBEAT_MS = 25_000;

function getSessionId() {
  const key = "gem_roll_session_id";

  let id = sessionStorage.getItem(key);

  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }

  return id;
}

export function createRollSession({ onActive, onInactive } = {}) {
  const sessionId = getSessionId();

  let timer = null;
  let stopped = false;
  let active = false;
  let requestInFlight = false;

  function setActive(next) {
    if (active === next) {
      return;
    }

    active = next;

    if (active) {
      onActive?.();
    } else {
      onInactive?.();
    }
  }

  async function heartbeat() {
    if (stopped || requestInFlight) {
      return active;
    }

    requestInFlight = true;

    try {
      const { data, error } = await invokeFunction(
        "roll-session",
        { sessionId }
      );

      if (error) {
        // A server-side lease conflict is authoritative. Network errors
        // are not treated as a loss of ownership because the current
        // lease remains valid for a while.
        if (error.code === "roll_session_active") {
          setActive(false);
        }

        return active;
      }

      if (data?.active === true) {
        setActive(true);
      } else {
        setActive(false);
      }

      return active;
    } catch (error) {
      console.error("Roll session heartbeat failed:", error);
      return active;
    } finally {
      requestInFlight = false;
    }
  }

  async function start() {
    if (stopped) {
      return false;
    }

    await heartbeat();

    timer = window.setInterval(() => {
      heartbeat();
    }, HEARTBEAT_MS);

    return active;
  }

  function stop() {
    stopped = true;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function isActive() {
    return active;
  }

  async function refreshNow() {
    return heartbeat();
  }

  return {
    sessionId,
    start,
    stop,
    refreshNow,
    isActive
  };
}
