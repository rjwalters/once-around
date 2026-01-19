/**
 * Tour UI - list generation and playback controls.
 */

import { getTourById, PREDEFINED_TOURS } from "./tourData";
import type { TourEngine } from "./tour";

export interface TourUIOptions {
  tourEngine: TourEngine;
  onNextEclipse: () => void;
  stopTimePlayback: () => void;
  disableARMode?: () => void;
}

/**
 * Get tour icon based on tour id.
 */
function getTourIcon(tourId: string): string {
  if (tourId.includes('eclipse')) return '☀';
  if (tourId.includes('jupiter') || tourId.includes('saturn')) return '♃';
  if (tourId.includes('halley') || tourId.includes('neowise') || tourId.includes('hale-bopp') || tourId.includes('comet')) return '☄';
  return '✦';
}

/**
 * Close mobile menu if open.
 */
function closeMobileMenu(): void {
  const controlsPanel = document.getElementById('controls');
  const panelToggleCollapsed = document.getElementById('panel-toggle-collapsed');
  if (controlsPanel && window.innerWidth <= 600) {
    controlsPanel.classList.remove('expanded');
    if (panelToggleCollapsed) {
      panelToggleCollapsed.textContent = '☰';
    }
  }
}

/**
 * Set up tour UI - list generation and playback controls.
 */
export function setupTourUI(options: TourUIOptions): void {
  const { tourEngine, onNextEclipse, stopTimePlayback, disableARMode } = options;

  // Generate tour list
  const tourList = document.getElementById('tour-list');
  const tourCount = document.getElementById('tour-count');

  if (tourList) {
    // Add "Next Eclipse" special item first
    const nextEclipseItem = document.createElement('button');
    nextEclipseItem.className = 'tour-item';
    nextEclipseItem.id = 'next-eclipse';
    nextEclipseItem.title = 'Jump to next total solar eclipse (E)';
    nextEclipseItem.innerHTML = `
      <span class="tour-item-icon">☀</span>
      <div class="tour-item-content">
        <span class="tour-item-name">Next Total Eclipse <span class="shortcut">(E)</span></span>
        <span class="tour-item-desc">Jump to upcoming eclipse</span>
      </div>
    `;
    nextEclipseItem.addEventListener('click', () => {
      closeMobileMenu();
      onNextEclipse();
    });
    tourList.appendChild(nextEclipseItem);

    // Add predefined tours
    PREDEFINED_TOURS.forEach(tour => {
      const item = document.createElement('button');
      item.className = 'tour-item';
      item.dataset.tour = tour.id;
      item.title = tour.description;
      item.innerHTML = `
        <span class="tour-item-icon">${getTourIcon(tour.id)}</span>
        <div class="tour-item-content">
          <span class="tour-item-name">${tour.name}</span>
          <span class="tour-item-desc">${tour.description}</span>
        </div>
      `;
      tourList.appendChild(item);
    });

    // Update tour count
    if (tourCount) {
      tourCount.textContent = `${PREDEFINED_TOURS.length + 1} tours`;
    }
  }

  // Tour selection buttons (handles dynamically generated buttons)
  document.querySelectorAll("[data-tour]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tourId = (btn as HTMLElement).dataset.tour;
      if (tourId) {
        const tour = getTourById(tourId);
        if (tour) {
          closeMobileMenu();
          stopTimePlayback();
          disableARMode?.();
          tourEngine.play(tour);
        }
      }
    });
  });

  // Tour playback controls
  const tourPlayPauseBtn = document.getElementById("tour-play-pause");
  const tourStopBtn = document.getElementById("tour-stop");
  const tourPrevBtn = document.getElementById("tour-prev");
  const tourNextBtn = document.getElementById("tour-next");

  tourPlayPauseBtn?.addEventListener("click", () => {
    const state = tourEngine.getState();
    if (state.status === "playing") {
      tourEngine.pause();
    } else if (state.status === "paused") {
      tourEngine.resume();
    }
  });

  tourStopBtn?.addEventListener("click", () => {
    tourEngine.stop();
  });

  tourPrevBtn?.addEventListener("click", () => {
    tourEngine.previous();
  });

  tourNextBtn?.addEventListener("click", () => {
    tourEngine.next();
  });

  // Escape key to stop tour
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && tourEngine.isActive()) {
      tourEngine.stop();
    }
  });
}
