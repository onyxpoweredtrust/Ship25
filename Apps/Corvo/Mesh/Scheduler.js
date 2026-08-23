// Corvo
/**
 * A generic recurring-task runner — used both for a satellite node's sync
 * loop and the primary's GC sweep, so the "run now, then every interval,
 * one bad run doesn't kill the loop" logic exists in exactly one place.
 */
export function createScheduler({ task, intervalMs, onError = (err) => console.error("[scheduler]", err) }) {
  let timer = null;
  let running = false;

  async function runOnce() {
    if (running) return; // a slow run overlapping the next tick just skips that tick, rather than piling up concurrent runs
    running = true;
    try {
      await task();
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return; // idempotent — calling start() twice doesn't double the interval
      void runOnce();
      timer = setInterval(runOnce, intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    /** Exposed for tests — triggers one run immediately, outside the interval, and waits for it to finish. */
    runOnce,
  };
}
