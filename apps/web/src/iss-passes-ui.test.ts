/**
 * Failure-path tests for ISSPassesUI's worker handling (issue #146).
 *
 * WASM-free and DOM-free: `iss-passes-ui.ts` only type-imports the engine, and
 * `Worker` / `document` are stubbed with plain objects via `vi.stubGlobal`. The
 * real worker file (which imports WASM) is never loaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SkyEngine } from "./wasm/sky_engine";
import { ISSPassesUI } from "./iss-passes-ui";

const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86400000;
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

function msToJD(ms: number): number {
  return ms / MS_PER_DAY + JD_UNIX_EPOCH;
}

/** One pass record (PASS_RECORD_LEN = 7) starting `offsetHours` after NOW. */
function passBuffer(offsetHours = 3): Float64Array {
  const rise = msToJD(NOW + offsetHours * 3600_000);
  const max = rise + 3 / 1440;
  const set = rise + 6 / 1440;
  return new Float64Array([rise, 300, max, 60, 0, set, 120]);
}

/** Fake Worker capturing handlers, posted messages, and termination. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  posted: Array<{ requestId: number }> = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: { requestId: number }): void {
    this.posted.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Simulate the worker posting a message to the main thread. */
  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
  /** Simulate an asynchronous worker error (script load failure / runtime). */
  fail(): void {
    this.onerror?.(new Error("worker script failed to load"));
  }
}

interface FakeElement {
  style: Record<string, string>;
  innerHTML: string;
  listeners: Record<string, Record<string, () => void>>;
  querySelector(sel: string): { addEventListener(t: string, fn: () => void): void } | null;
  querySelectorAll(sel: string): never[];
}

function fakeContainer(): FakeElement {
  const el: FakeElement = {
    style: {},
    innerHTML: "",
    listeners: {},
    querySelector(sel: string) {
      // Only hand out elements whose class actually appears in the markup.
      const cls = sel.replace(/^\./, "");
      if (!el.innerHTML.includes(cls)) return null;
      return {
        addEventListener(type: string, fn: () => void) {
          (el.listeners[sel] ??= {})[type] = fn;
        }
      };
    },
    querySelectorAll() {
      return [];
    }
  };
  return el;
}

function mockEngine(findPasses: () => Float64Array): SkyEngine & { findPassesCalls: number } {
  const eng = {
    findPassesCalls: 0,
    satellite_ephemeris_range: () => [msToJD(NOW - MS_PER_DAY), msToJD(NOW + 10 * MS_PER_DAY)],
    observer_lat: () => 40,
    observer_lon: () => -74,
    find_passes: () => {
      eng.findPassesCalls++;
      return findPasses();
    }
  };
  return eng as unknown as SkyEngine & { findPassesCalls: number };
}

let container: FakeElement;

function setup(findPasses: () => Float64Array = () => passBuffer()) {
  const engine = mockEngine(findPasses);
  const ui = new ISSPassesUI({ containerId: "iss-passes" });
  const worker = FakeWorker.instances[0];
  ui.setEngine(engine);
  ui.setVisible(true);
  return { ui, engine, worker };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  FakeWorker.instances = [];
  container = fakeContainer();
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("document", { getElementById: () => container });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ISSPassesUI worker happy path", () => {
  it("renders worker results for the current request", () => {
    const { worker, engine } = setup();
    expect(container.innerHTML).toContain("Computing passes...");
    expect(worker.posted).toHaveLength(1);

    worker.emit({ type: "result", requestId: worker.posted[0].requestId, buffer: passBuffer() });
    expect(container.innerHTML).toContain("Next Visible Pass");
    expect(engine.findPassesCalls).toBe(0);
  });
});

describe("ISSPassesUI worker failure recovery", () => {
  it("asynchronous worker error terminates the worker, exits loading, and falls back to the main thread", () => {
    const { worker, engine } = setup();
    expect(container.innerHTML).toContain("Computing passes...");

    worker.fail();
    expect(worker.terminated).toBe(true);

    vi.advanceTimersByTime(100);
    expect(engine.findPassesCalls).toBe(1);
    expect(container.innerHTML).not.toContain("Computing passes...");
    expect(container.innerHTML).toContain("Next Visible Pass");
  });

  it("shows a retryable error (not 'no passes') when the fallback also fails, and Retry recovers", () => {
    let shouldThrow = true;
    const { worker, engine } = setup(() => {
      if (shouldThrow) throw new Error("scan failed");
      return passBuffer();
    });

    worker.fail();
    vi.advanceTimersByTime(100);

    expect(container.innerHTML).not.toContain("Computing passes...");
    expect(container.innerHTML).not.toContain("No visible passes");
    expect(container.innerHTML).toContain("Could not compute ISS passes");
    expect(container.innerHTML).toContain("Retry");

    // Click Retry.
    shouldThrow = false;
    const click = container.listeners[".iss-passes-retry-btn"]?.click;
    expect(click).toBeTypeOf("function");
    click!();
    expect(container.innerHTML).toContain("Computing passes...");
    vi.advanceTimersByTime(100);

    expect(engine.findPassesCalls).toBe(2);
    expect(container.innerHTML).toContain("Next Visible Pass");
    expect(container.innerHTML).not.toContain("Could not compute");
  });

  it("worker {type:'error'} is not rendered as 'no visible passes'; it falls back to the main thread", () => {
    const { worker, engine } = setup();
    worker.emit({ type: "error", requestId: worker.posted[0].requestId, error: "Failed to load ISS ephemeris: 503" });

    expect(worker.terminated).toBe(true);
    expect(container.innerHTML).not.toContain("No visible passes");

    vi.advanceTimersByTime(100);
    expect(engine.findPassesCalls).toBe(1);
    expect(container.innerHTML).toContain("Next Visible Pass");
  });

  it("a worker that fails while idle is discarded and later requests use the main thread", () => {
    const engine = mockEngine(() => passBuffer());
    const ui = new ISSPassesUI({ containerId: "iss-passes" });
    const worker = FakeWorker.instances[0];
    worker.fail(); // e.g. script 404 before any request
    expect(worker.terminated).toBe(true);

    ui.setEngine(engine);
    ui.setVisible(true);
    expect(worker.posted).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(engine.findPassesCalls).toBe(1);
    expect(container.innerHTML).toContain("Next Visible Pass");
  });

  it("late messages from a discarded worker cannot overwrite newer results", () => {
    const { worker } = setup();
    const staleId = worker.posted[0].requestId;
    worker.fail();
    vi.advanceTimersByTime(100);
    const rendered = container.innerHTML;
    expect(rendered).toContain("Next Visible Pass");

    // Dead worker replies anyway (with an error and with "no passes").
    worker.emit({ type: "result", requestId: staleId, buffer: new Float64Array(0) });
    worker.emit({ type: "error", requestId: staleId, error: "late" });
    worker.fail();
    expect(container.innerHTML).toBe(rendered);
  });

  it("superseded worker responses are ignored", () => {
    const { ui, worker } = setup();
    const firstId = worker.posted[0].requestId;
    ui.refresh(); // e.g. location change
    const secondId = worker.posted[1].requestId;
    expect(secondId).toBeGreaterThan(firstId);

    worker.emit({ type: "result", requestId: firstId, buffer: new Float64Array(0) });
    expect(container.innerHTML).toContain("Computing passes...");

    worker.emit({ type: "result", requestId: secondId, buffer: passBuffer() });
    expect(container.innerHTML).toContain("Next Visible Pass");
  });

  it("superseded main-thread computations do not run or render", () => {
    const { ui, worker, engine } = setup();
    worker.fail(); // now on the main-thread path, request A queued
    ui.refresh(); // request B supersedes A before its timer fires
    vi.advanceTimersByTime(100);
    expect(engine.findPassesCalls).toBe(1);
    expect(container.innerHTML).toContain("Next Visible Pass");
  });

  it("a postMessage failure falls back to the main thread", () => {
    const engine = mockEngine(() => passBuffer());
    const ui = new ISSPassesUI({ containerId: "iss-passes" });
    const worker = FakeWorker.instances[0];
    worker.postMessage = () => {
      throw new Error("DataCloneError");
    };
    ui.setEngine(engine);
    ui.setVisible(true);
    expect(worker.terminated).toBe(true);
    vi.advanceTimersByTime(100);
    expect(engine.findPassesCalls).toBe(1);
    expect(container.innerHTML).toContain("Next Visible Pass");
  });
});
