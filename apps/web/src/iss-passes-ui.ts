/**
 * ISS Passes UI Component
 *
 * Displays upcoming visible ISS passes in a collapsible panel.
 */

import type { SkyEngine } from "./wasm/sky_engine";
import {
  ISSPass,
  EphemerisStatus,
  APPROXIMATE_FORECAST_DAYS,
  findISSPasses,
  getEphemerisStatus,
  getNextPassSummary,
  isApproximatePass,
  parsePassBuffer
} from "./iss-passes";

/** Sun altitude limit for dark sky (civil twilight). Mirrors iss-passes.ts default. */
const SUN_ALTITUDE_LIMIT = -6;

interface WorkerResultMessage {
  type: "result";
  requestId: number;
  buffer: Float64Array;
}
interface WorkerErrorMessage {
  type: "error";
  requestId: number;
  error: string;
}
interface WorkerReadyMessage {
  type: "ready";
}
type WorkerMessage = WorkerResultMessage | WorkerErrorMessage | WorkerReadyMessage;

export interface ISSPassesUIOptions {
  /** Container element ID */
  containerId: string;
  /** Callback when a pass is clicked (for jumping to that time) */
  onPassClick?: (pass: ISSPass) => void;
  /** Minimum altitude for passes (default: 10°) */
  minAltitude?: number;
  /** Maximum passes to display (default: 10) */
  maxPasses?: number;
}

export class ISSPassesUI {
  private container: HTMLElement | null;
  private engine: SkyEngine | null = null;
  private passes: ISSPass[] = [];
  private expanded = false;
  private onPassClick?: (pass: ISSPass) => void;
  private minAltitude: number;
  private maxPasses: number;
  private isComputing = false;
  private visible = false;
  private worker: Worker | null = null;
  private latestRequestId = 0;

  constructor(options: ISSPassesUIOptions) {
    this.container = document.getElementById(options.containerId);
    this.onPassClick = options.onPassClick;
    this.minAltitude = options.minAltitude ?? 10;
    this.maxPasses = options.maxPasses ?? 10;

    this.initWorker();

    if (this.container) {
      this.container.style.display = 'none';
      this.render();
    }
  }

  /**
   * Create the pass-computation Web Worker so the scan never blocks the main
   * thread. Falls back to the synchronous main-thread path if Workers are
   * unavailable (e.g. non-browser environments).
   */
  private initWorker(): void {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(
        new URL("./workers/iss-passes-worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) =>
        this.onWorkerMessage(event.data);
      this.worker.onerror = (e) => {
        console.error("ISS passes worker error:", e);
      };
    } catch (e) {
      console.warn("ISS passes worker unavailable; using main thread:", e);
      this.worker = null;
    }
  }

  /** Handle a message from the pass-computation worker. */
  private onWorkerMessage(msg: WorkerMessage): void {
    if (msg.type === "ready") return;
    // Ignore results from superseded requests (e.g. rapid location changes).
    if (msg.requestId !== this.latestRequestId) return;

    if (msg.type === "result") {
      this.passes = parsePassBuffer(msg.buffer);
    } else {
      console.error("Error computing ISS passes:", msg.error);
      this.passes = [];
    }
    this.isComputing = false;
    this.render();
  }

  /**
   * Set visibility of the passes panel.
   * Only show in topocentric view mode.
   * Only computes passes when first made visible (lazy computation).
   */
  setVisible(visible: boolean): void {
    const wasVisible = this.visible;
    this.visible = visible;
    if (this.container) {
      this.container.style.display = visible ? '' : 'none';
    }
    // Lazy compute: only compute passes when becoming visible for the first time
    if (visible && !wasVisible && this.engine && this.passes.length === 0 && !this.isComputing) {
      this.computePasses();
    }
  }

  /**
   * Initialize with an engine instance.
   * Call this after satellite ephemeris is loaded.
   * Note: passes are computed lazily when the UI becomes visible.
   */
  setEngine(engine: SkyEngine): void {
    this.engine = engine;
    // Only compute immediately if already visible (topocentric mode)
    if (this.visible) {
      this.computePasses();
    }
  }

  /**
   * Recompute passes (call when location changes).
   */
  refresh(): void {
    this.computePasses();
  }

  /**
   * Compute upcoming passes.
   */
  private computePasses(): void {
    if (!this.engine) return;

    // Check ephemeris coverage. If it is missing or no longer covers the
    // current time, there is nothing to scan — skip the worker entirely and let
    // render() surface the appropriate "not loaded" or "out of date" message.
    if (getEphemerisStatus(this.engine, 0).state !== "ok") {
      this.passes = [];
      this.render();
      return;
    }

    // Preferred path: run the scan in the Web Worker (never blocks the main
    // thread). A newer request supersedes any in-flight one via requestId.
    if (this.worker) {
      this.isComputing = true;
      this.render(); // Show loading state
      const requestId = ++this.latestRequestId;
      this.worker.postMessage({
        type: "compute",
        requestId,
        observerLat: this.engine.observer_lat(),
        observerLon: this.engine.observer_lon(),
        minAltitude: this.minAltitude,
        maxPasses: this.maxPasses,
        sunAltitudeLimit: SUN_ALTITUDE_LIMIT,
        nowMs: Date.now()
      });
      return;
    }

    // Fallback: no worker available. The WASM scan is a single fast call, but
    // defer via setTimeout so the current event (e.g. location change) yields first.
    if (this.isComputing) return;
    this.isComputing = true;
    this.render(); // Show loading state
    setTimeout(() => {
      try {
        this.passes = findISSPasses(this.engine!, {
          minAltitude: this.minAltitude,
          maxPasses: this.maxPasses
        });
      } catch (e) {
        console.error("Error computing ISS passes:", e);
        this.passes = [];
      }
      this.isComputing = false;
      this.render();
    }, 50);
  }

  /**
   * Toggle expanded/collapsed state.
   */
  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.render();
  }

  /**
   * Format a date for display.
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Format a time for display.
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Format duration in minutes and seconds.
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Build the "data out of date" panel shown when the loaded ephemeris no
   * longer covers the current time. Satellite positions and pass predictions
   * are unavailable in this state, so tell the user plainly rather than
   * showing an empty or misleading "no passes" panel.
   */
  private renderStale(status: Extract<EphemerisStatus, { state: "stale" | "future" }>): string {
    const detail =
      status.state === "stale"
        ? `Satellite ephemeris data expired on ${this.formatDate(status.coverageEnd)}. ISS positions and pass predictions are unavailable until the bundled data is refreshed.`
        : `Satellite ephemeris data does not begin until ${this.formatDate(status.coverageStart)}. Check that your device clock is set correctly.`;
    return `
      <div class="iss-passes-header">
        <span class="iss-passes-title">ISS Pass Predictions</span>
      </div>
      <div class="iss-passes-stale" role="status">
        <span class="iss-passes-stale-icon" aria-hidden="true">⚠</span>
        <span class="iss-passes-stale-text">${detail}</span>
      </div>
    `;
  }

  /**
   * Inline "≈" marker for a pass whose start time is far enough into the
   * forecast that its timing is approximate (see `APPROXIMATE_FORECAST_DAYS`).
   *
   * Deliberately understated — this is an accuracy caveat on data we *do*
   * have, not the "expired data" warning from `renderStale()`, which means we
   * have nothing to show at all. Returns an empty string for near-term passes.
   */
  private approximateMarker(pass: ISSPass, nowMs: number): string {
    if (!isApproximatePass(pass, nowMs)) return '';
    return `<span class="iss-pass-approx" title="More than ${APPROXIMATE_FORECAST_DAYS} days out — predicted timing may shift by a few seconds" aria-label="approximate">≈</span>`;
  }

  /** Footnote explaining the "≈" marker. Only rendered when one is shown. */
  private renderApproximateNote(): string {
    return `
      <div class="iss-passes-approx-note" role="note">
        <span class="iss-pass-approx" aria-hidden="true">≈</span>
        Passes more than ${APPROXIMATE_FORECAST_DAYS} days out are approximate — the bundled orbit forecast drifts with range, so these times may shift by a few seconds once the data refreshes.
      </div>
    `;
  }

  /**
   * Render the UI.
   */
  private render(): void {
    if (!this.container) return;

    // If no engine or ephemeris, show placeholder
    if (!this.engine) {
      this.container.innerHTML = '';
      return;
    }

    const status = getEphemerisStatus(this.engine, 0);

    // No ephemeris loaded at all (e.g. failed to fetch) — render nothing.
    if (status.state === "missing") {
      this.container.innerHTML = '';
      return;
    }

    // Ephemeris no longer covers the current time. The engine silently returns
    // no satellite position in this case, so make the staleness explicit
    // instead of implying "there just aren't any passes".
    if (status.state === "stale" || status.state === "future") {
      this.container.innerHTML = this.renderStale(status);
      return;
    }

    // Loading state
    if (this.isComputing) {
      this.container.innerHTML = `
        <div class="iss-passes-header">
          <span class="iss-passes-title">ISS Pass Predictions</span>
        </div>
        <div class="iss-passes-loading">Computing passes...</div>
      `;
      return;
    }

    // No passes found
    if (this.passes.length === 0) {
      this.container.innerHTML = `
        <div class="iss-passes-header">
          <span class="iss-passes-title">ISS Pass Predictions</span>
        </div>
        <div class="iss-passes-empty">No visible passes found in the loaded forecast window</div>
      `;
      return;
    }

    const nextPass = this.passes[0];
    const timeUntil = getNextPassSummary(nextPass);

    // Grade the rendered passes by forecast horizon. This is additive to the
    // `ok` coverage state above: we have data, but its far end is a longer-range
    // prediction and drifts. Track whether any rendered pass is marked so the
    // explanatory footnote is only shown when it applies.
    const nowMs = Date.now();
    let anyApproximate = isApproximatePass(nextPass, nowMs);

    // Build HTML
    let html = `
      <div class="iss-passes-header" role="button" tabindex="0">
        <span class="iss-passes-title">ISS Pass Predictions</span>
        <span class="iss-passes-toggle">${this.expanded ? '▼' : '▶'}</span>
      </div>

      <div class="iss-next-pass">
        <div class="iss-next-pass-label">Next Visible Pass</div>
        <div class="iss-next-pass-time">${this.formatTime(nextPass.riseTime)}</div>
        <div class="iss-next-pass-date">${this.formatDate(nextPass.riseTime)}</div>
        <div class="iss-next-pass-countdown">${timeUntil}${this.approximateMarker(nextPass, nowMs)}</div>
        <div class="iss-next-pass-details">
          <span class="iss-detail">
            <span class="iss-detail-label">Max</span>
            <span class="iss-detail-value">${Math.round(nextPass.maxAltitude)}°</span>
          </span>
          <span class="iss-detail">
            <span class="iss-detail-label">Duration</span>
            <span class="iss-detail-value">${this.formatDuration(nextPass.duration)}</span>
          </span>
          <span class="iss-detail">
            <span class="iss-detail-label">Direction</span>
            <span class="iss-detail-value">${nextPass.riseDirection} → ${nextPass.setDirection}</span>
          </span>
        </div>
        <button class="iss-goto-pass-btn" data-pass-index="0">Jump to Pass</button>
      </div>
    `;

    // Expanded list of upcoming passes
    if (this.expanded && this.passes.length > 1) {
      html += '<div class="iss-passes-list">';
      html += '<div class="iss-passes-list-header">Upcoming Passes</div>';

      for (let i = 1; i < this.passes.length; i++) {
        const pass = this.passes[i];
        const marker = this.approximateMarker(pass, nowMs);
        if (marker) anyApproximate = true;
        html += `
          <div class="iss-pass-item" data-pass-index="${i}">
            <div class="iss-pass-item-date">${this.formatDate(pass.riseTime)}</div>
            <div class="iss-pass-item-time">${this.formatTime(pass.riseTime)}${marker}</div>
            <div class="iss-pass-item-details">
              <span>${Math.round(pass.maxAltitude)}° max</span>
              <span>${this.formatDuration(pass.duration)}</span>
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    if (anyApproximate) {
      html += this.renderApproximateNote();
    }

    this.container.innerHTML = html;

    // Add event listeners
    const header = this.container.querySelector('.iss-passes-header');
    if (header) {
      header.addEventListener('click', () => this.toggleExpanded());
      header.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          this.toggleExpanded();
        }
      });
    }

    // Pass click handlers
    const gotoBtn = this.container.querySelector('.iss-goto-pass-btn');
    if (gotoBtn && this.onPassClick) {
      gotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt((e.target as HTMLElement).dataset.passIndex || '0');
        if (this.passes[index] && this.onPassClick) {
          this.onPassClick(this.passes[index]);
        }
      });
    }

    // Click handlers for pass items
    const passItems = this.container.querySelectorAll('.iss-pass-item');
    passItems.forEach((item) => {
      item.addEventListener('click', () => {
        const index = parseInt((item as HTMLElement).dataset.passIndex || '0');
        if (this.passes[index] && this.onPassClick) {
          this.onPassClick(this.passes[index]);
        }
      });
    });
  }
}
