/** Wall-clock updates for a live observing session, independent of the renderer. */
export const AR_CLOCK_INTERVAL_MS = 5000;

export function createARClock(onTick: (date: Date) => void) {
  let active = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  function pause(): void {
    if (interval !== null) clearInterval(interval);
    interval = null;
  }

  function resume(): void {
    pause();
    if (!active || document.hidden) return;
    // Read the actual instant each time; never accumulate elapsed timer ticks.
    onTick(new Date());
    interval = setInterval(() => onTick(new Date()), AR_CLOCK_INTERVAL_MS);
  }

  function start(): void {
    if (active) return;
    active = true;
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", pause);
    resume();
  }

  function stop(): void {
    active = false;
    pause();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("pagehide", pause);
  }

  return { start, stop, isActive: () => active };
}
