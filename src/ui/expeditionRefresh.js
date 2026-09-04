// Poll even after an empty/error response so a stale snapshot cannot stop updates.
export function startExpeditionRefresh(refresh, isBusy = () => false, host = window) {
  let pending = false;
  const tick = async () => {
    if (pending || isBusy()) return;
    pending = true;
    try {
      await refresh();
    } catch (error) {
      console.warn("Expedition refresh failed; retrying on the next interval.", error);
    } finally {
      pending = false;
    }
  };
  const visible = () => {
    if (host.document.visibilityState === "visible") void tick();
  };
  const timer = host.setInterval(tick, 30_000);
  host.addEventListener("focus", tick);
  host.addEventListener("pageshow", tick);
  host.addEventListener("online", tick);
  host.document.addEventListener("visibilitychange", visible);
  return () => {
    host.clearInterval(timer);
    host.removeEventListener("focus", tick);
    host.removeEventListener("pageshow", tick);
    host.removeEventListener("online", tick);
    host.document.removeEventListener("visibilitychange", visible);
  };
}
