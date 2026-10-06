// Pace read-only requests across the allotted window. A fixed number of
// workers prevents a large target from creating an unbounded promise queue.
export async function runRequestStress(total, send, {
  durationMs = 60_000,
  concurrency = 32,
  controller = new AbortController(),
  now = () => performance.now()
} = {}) {
  if (!Number.isSafeInteger(total) || total < 1) {
    throw new RangeError("Request count must be a positive safe integer.");
  }

  const started = now();
  // Leave a little of the minute for the last responses to finish.
  const sendWindowMs = durationMs * 0.9;
  const result = { sent: 0, succeeded: 0, failed: 0, elapsedMs: 0, timedOut: false };
  const signal = controller.signal;
  const deadline = setTimeout(() => {
    result.timedOut = true;
    controller.abort();
  }, durationMs);

  function wait(ms) {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(done, ms);

      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }

      signal.addEventListener("abort", done, { once: true });
    });
  }

  async function worker() {
    let completed = 0;

    while (!signal.aborted && result.sent < total) {
      const elapsed = now() - started;

      if (elapsed >= durationMs) {
        result.timedOut = true;
        controller.abort();
        break;
      }

      const due = Math.min(total, 1 + Math.floor(elapsed * total / sendWindowMs));

      if (result.sent >= due) {
        const nextAt = started + result.sent * sendWindowMs / total;
        await wait(Math.max(1, nextAt - now()));
        continue;
      }

      result.sent += 1;

      try {
        const response = await send(signal);

        if (!signal.aborted) {
          if (response?.error) result.failed += 1;
          else result.succeeded += 1;
        }
      } catch {
        if (!signal.aborted) result.failed += 1;
      }

      completed += 1;
      if (completed % 64 === 0) await wait(0);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(total, concurrency) }, worker));
  } finally {
    clearTimeout(deadline);
    result.elapsedMs = now() - started;
  }

  return result;
}
