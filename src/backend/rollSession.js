import { supabase } from "./supabase.js";

const HEARTBEAT_MS = 20_000;
const LEASE_SECONDS = 45;

const sessionId =
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;

let active = false;
let started = false;
let timer = null;
let inFlight = false;

const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    try {
      listener(active);
    } catch (error) {
      console.error("Roll session listener failed:", error);
    }
  }
}

export function getRollSessionId() {
  return sessionId;
}

export function isRollSessionActive() {
  return active;
}

export function onRollSessionChange(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

async function heartbeat() {
  if (inFlight) {
    return active;
  }

  inFlight = true;

  try {
    const { data, error } = await supabase.rpc(
      "heartbeat_roll_session",
      {
        p_session_id: sessionId,
        p_lease_seconds: LEASE_SECONDS
      }
    );

    if (error) {
      console.error("Roll session heartbeat failed:", error);
      active = false;
      emit();
      return false;
    }

    const nextActive = Boolean(data?.active);

    if (nextActive !== active) {
      active = nextActive;
      emit();
    } else {
      active = nextActive;
    }

    return active;
  } catch (error) {
    console.error("Roll session heartbeat failed:", error);
    active = false;
    emit();
    return false;
  } finally {
    inFlight = false;
  }
}

export async function startRollSession() {
  if (started) {
    return active;
  }

  started = true;

  const result = await heartbeat();

  timer = window.setInterval(() => {
    heartbeat();
  }, HEARTBEAT_MS);

  return result;
}

export async function refreshRollSession() {
  return heartbeat();
}

export function stopRollSession() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  started = false;
  active = false;
  emit();
}
