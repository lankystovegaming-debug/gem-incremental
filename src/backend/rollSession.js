// Legacy compatibility shim.
// Server-side cooldown enforcement now uses players.next_roll_at directly.
let active = false;
const listeners = new Set();

export function onRollSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function startRollSession() {
  return active;
}

export async function refreshRollSession() {
  return active;
}

export function stopRollSession() {
  active = false;
  for (const listener of listeners) {
    try {
      listener(active);
    } catch {
      // Listener errors must not affect rolling.
    }
  }
}
