/**
 * Rise / Set Times UI Component
 *
 * A collapsible panel (shown only in topocentric mode) with tonight's sun,
 * moon, and planet observing times for the selected date and observer location:
 *
 * - Sun: rise, set, transit, and civil / nautical / astronomical twilight.
 * - Moon: rise, transit, set, with graceful always-up / never-up / absent-event
 *   states.
 * - Planets: the naked-eye planets' dark-sky visibility window, or "not visible
 *   tonight".
 *
 * Follows the `ISSPassesUI` pattern (visibility gating, lazy compute, render on
 * demand). All math is a handful of cheap synchronous WASM calls — no worker is
 * needed (unlike the 29-day ISS scan). Recompute happens only on observer /
 * date / mode change, never per frame.
 */

import type { SkyEngine } from "./wasm/sky_engine";
import {
  BodyEvent,
  JDInterval,
  RiseSetResult,
  ScanWindow,
  BODY_SUN,
  BODY_MOON,
  NAKED_EYE_PLANETS,
  H0_SUN,
  H0_MOON,
  TWILIGHT_CIVIL,
  TWILIGHT_NAUTICAL,
  TWILIGHT_ASTRONOMICAL,
  computeBodyRiseSet,
  computePlanetVisibility,
  scanWindowForDate,
  civilDateKey,
  jdToDate,
} from "./rise-set";

interface TwilightPair {
  label: string;
  /** Morning (sun rising through the threshold): dawn. */
  dawn: BodyEvent | null;
  /** Evening (sun setting through the threshold): dusk. */
  dusk: BodyEvent | null;
  /** No crossings and sun above the threshold all day (never gets dark). */
  alwaysLight: boolean;
  /** No crossings and sun below the threshold all day (dark all day). */
  alwaysDark: boolean;
}

interface PlanetRow {
  name: string;
  windows: JDInterval[];
}

interface RiseSetData {
  sun: RiseSetResult;
  twilights: TwilightPair[];
  moon: RiseSetResult;
  planets: PlanetRow[];
}

export interface RiseSetUIOptions {
  /** Container element ID. */
  containerId: string;
  /** Callback when a time is clicked (jump the app to that instant). */
  onTimeClick?: (time: Date) => void;
}

export class RiseSetUI {
  private container: HTMLElement | null;
  private engine: SkyEngine | null = null;
  private currentDate: Date = new Date();
  private data: RiseSetData | null = null;
  private expanded = false;
  private visible = false;
  private onTimeClick?: (time: Date) => void;
  /** Civil-date key the current `data` was computed for (recompute guard). */
  private computedKey: string | null = null;

  constructor(options: RiseSetUIOptions) {
    this.container = document.getElementById(options.containerId);
    this.onTimeClick = options.onTimeClick;
    if (this.container) {
      this.container.style.display = "none";
      this.render();
    }
  }

  /** Attach the engine; compute immediately if already visible. */
  setEngine(engine: SkyEngine): void {
    this.engine = engine;
    if (this.visible) {
      this.recompute();
    }
  }

  /**
   * Update the selected date. Only recomputes when the *civil date* changes, so
   * dragging the time slider within a day does no work (render-on-demand).
   */
  setDate(date: Date): void {
    this.currentDate = date;
    if (this.visible && civilDateKey(date) !== this.computedKey) {
      this.recompute();
    }
  }

  /** Show/hide the panel (topocentric only). Computes lazily on first show. */
  setVisible(visible: boolean): void {
    const wasVisible = this.visible;
    this.visible = visible;
    if (this.container) {
      this.container.style.display = visible ? "" : "none";
    }
    if (visible && !wasVisible && this.engine) {
      // Recompute if the date changed while hidden (or never computed).
      if (civilDateKey(this.currentDate) !== this.computedKey) {
        this.recompute();
      } else {
        this.render();
      }
    }
  }

  /** Force a recompute (e.g. observer location changed). */
  refresh(): void {
    if (this.visible && this.engine) {
      this.recompute();
    }
  }

  /** Compute all sun/moon/planet times for the current date + observer. */
  private recompute(): void {
    if (!this.engine) return;
    const win: ScanWindow = scanWindowForDate(this.currentDate);
    const engine = this.engine;

    const sun = computeBodyRiseSet(engine, BODY_SUN, win, H0_SUN);
    const moon = computeBodyRiseSet(engine, BODY_MOON, win, H0_MOON);

    const twilights: TwilightPair[] = [
      { threshold: TWILIGHT_CIVIL, label: "Civil" },
      { threshold: TWILIGHT_NAUTICAL, label: "Nautical" },
      { threshold: TWILIGHT_ASTRONOMICAL, label: "Astronomical" },
    ].map(({ threshold, label }) => {
      // Sun rising through the threshold = morning dawn; setting = evening dusk.
      const r = computeBodyRiseSet(engine, BODY_SUN, win, threshold);
      return {
        label,
        dawn: r.rise,
        dusk: r.set,
        // No crossings: "alwaysUp" means sun stays above the threshold (never
        // that dark); "neverUp" means sun stays below it (that dark all day).
        alwaysLight: r.alwaysUp,
        alwaysDark: r.neverUp,
      };
    });

    const planets: PlanetRow[] = NAKED_EYE_PLANETS.map(({ index, name }) => ({
      name,
      windows: computePlanetVisibility(engine, index, win),
    }));

    this.data = { sun, twilights, moon, planets };
    this.computedKey = civilDateKey(this.currentDate);
    this.render();
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.render();
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  /** A clickable time chip (jumps the app to that instant). */
  private timeChip(event: BodyEvent | null, absent = "—"): string {
    if (!event) return `<span class="rise-set-time rise-set-time--absent">${absent}</span>`;
    return `<button class="rise-set-time" data-jd="${event.jd}">${this.formatTime(event.time)}</button>`;
  }

  /** One "Label: value" row. */
  private row(label: string, valueHtml: string): string {
    return `
      <div class="rise-set-row">
        <span class="rise-set-label">${label}</span>
        <span class="rise-set-value">${valueHtml}</span>
      </div>`;
  }

  private renderSun(sun: RiseSetResult, twilights: TwilightPair[]): string {
    let inner = "";
    if (sun.alwaysUp) {
      inner += this.row("Sun", `<span class="rise-set-state">Up all day</span>`);
    } else if (sun.neverUp) {
      inner += this.row("Sun", `<span class="rise-set-state">Below horizon all day</span>`);
    } else {
      inner += this.row(
        "Sun",
        `${this.timeChip(sun.rise)} <span class="rise-set-sep">rise</span> ` +
          `${this.timeChip(sun.set)} <span class="rise-set-sep">set</span>`
      );
    }
    if (this.expanded) {
      inner += this.row("Transit", this.timeChip(sun.transit));
      for (const tw of twilights) {
        let val: string;
        if (tw.alwaysLight) {
          val = `<span class="rise-set-state">never reached</span>`;
        } else if (tw.alwaysDark) {
          val = `<span class="rise-set-state">all day</span>`;
        } else {
          val =
            `${this.timeChip(tw.dawn)} <span class="rise-set-sep">dawn</span> ` +
            `${this.timeChip(tw.dusk)} <span class="rise-set-sep">dusk</span>`;
        }
        inner += this.row(`${tw.label} twilight`, val);
      }
    }
    return `<div class="rise-set-group"><div class="rise-set-group-title">Sun</div>${inner}</div>`;
  }

  private renderMoon(moon: RiseSetResult): string {
    let inner: string;
    if (moon.alwaysUp) {
      inner = this.row("Moon", `<span class="rise-set-state">Up all night</span>`);
    } else if (moon.neverUp) {
      inner = this.row("Moon", `<span class="rise-set-state">Not up tonight</span>`);
    } else {
      inner =
        this.row(
          "Rise / Set",
          `${this.timeChip(moon.rise)} <span class="rise-set-sep">/</span> ${this.timeChip(moon.set)}`
        ) + this.row("Transit", this.timeChip(moon.transit));
    }
    return `<div class="rise-set-group"><div class="rise-set-group-title">Moon</div>${inner}</div>`;
  }

  private renderPlanets(planets: PlanetRow[]): string {
    const rows = planets
      .map((p) => {
        if (p.windows.length === 0) {
          return this.row(p.name, `<span class="rise-set-state">not visible tonight</span>`);
        }
        // Render each dark-sky window as "start–end".
        const spans = p.windows
          .map((w) => {
            const start = this.formatTime(jdToDate(w.startJD));
            const end = this.formatTime(jdToDate(w.endJD));
            return `<button class="rise-set-time" data-jd="${w.startJD}">${start}–${end}</button>`;
          })
          .join(" ");
        return this.row(p.name, spans);
      })
      .join("");
    return `<div class="rise-set-group"><div class="rise-set-group-title">Planets (dark-sky window)</div>${rows}</div>`;
  }

  private render(): void {
    if (!this.container) return;

    if (!this.engine || !this.data) {
      // Nothing computed yet (engine not attached, or panel never shown).
      this.container.innerHTML = `
        <div class="rise-set-header" role="button" tabindex="0">
          <span class="rise-set-title">Rise &amp; Set Times</span>
          <span class="rise-set-toggle">${this.expanded ? "▼" : "▶"}</span>
        </div>`;
      this.wireHeader();
      return;
    }

    const { sun, twilights, moon, planets } = this.data;
    const html = `
      <div class="rise-set-header" role="button" tabindex="0">
        <span class="rise-set-title">Rise &amp; Set Times</span>
        <span class="rise-set-toggle">${this.expanded ? "▼" : "▶"}</span>
      </div>
      <div class="rise-set-body">
        ${this.renderSun(sun, twilights)}
        ${this.renderMoon(moon)}
        ${this.expanded ? this.renderPlanets(planets) : ""}
      </div>`;
    this.container.innerHTML = html;
    this.wireHeader();
    this.wireTimeChips();
  }

  private wireHeader(): void {
    const header = this.container?.querySelector(".rise-set-header");
    if (!header) return;
    header.addEventListener("click", () => this.toggleExpanded());
    header.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        this.toggleExpanded();
      }
    });
  }

  private wireTimeChips(): void {
    if (!this.container || !this.onTimeClick) return;
    const chips = this.container.querySelectorAll<HTMLButtonElement>(".rise-set-time[data-jd]");
    chips.forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const jd = parseFloat(chip.dataset.jd || "");
        if (Number.isFinite(jd) && this.onTimeClick) {
          this.onTimeClick(jdToDate(jd));
        }
      });
    });
  }
}
