/**
 * ISS Passes UI Component
 *
 * Displays upcoming visible ISS passes in a collapsible panel.
 */

import type { SkyEngine } from "./wasm/sky_engine";
import { ISSPass, findISSPasses, getNextPassSummary } from "./iss-passes";

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

  constructor(options: ISSPassesUIOptions) {
    this.container = document.getElementById(options.containerId);
    this.onPassClick = options.onPassClick;
    this.minAltitude = options.minAltitude ?? 10;
    this.maxPasses = options.maxPasses ?? 10;

    if (this.container) {
      this.container.style.display = 'none';
      this.render();
    }
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
    if (!this.engine || this.isComputing) return;

    // Check if ephemeris is loaded
    const range = this.engine.satellite_ephemeris_range(0);
    if (!range || range.length < 2) {
      this.passes = [];
      this.render();
      return;
    }

    this.isComputing = true;
    this.render(); // Show loading state

    // Use setTimeout to avoid blocking the UI
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
   * Render the UI.
   */
  private render(): void {
    if (!this.container) return;

    // If no engine or ephemeris, show placeholder
    if (!this.engine) {
      this.container.innerHTML = '';
      return;
    }

    const range = this.engine.satellite_ephemeris_range(0);
    if (!range || range.length < 2) {
      this.container.innerHTML = '';
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
        <div class="iss-passes-empty">No visible passes found in the next 30 days</div>
      `;
      return;
    }

    const nextPass = this.passes[0];
    const timeUntil = getNextPassSummary(nextPass);

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
        <div class="iss-next-pass-countdown">${timeUntil}</div>
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
        html += `
          <div class="iss-pass-item" data-pass-index="${i}">
            <div class="iss-pass-item-date">${this.formatDate(pass.riseTime)}</div>
            <div class="iss-pass-item-time">${this.formatTime(pass.riseTime)}</div>
            <div class="iss-pass-item-details">
              <span>${Math.round(pass.maxAltitude)}° max</span>
              <span>${this.formatDuration(pass.duration)}</span>
            </div>
          </div>
        `;
      }

      html += '</div>';
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
