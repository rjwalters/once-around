/**
 * Info modals for stars, constellations, DSOs, comets, and dwarf planets.
 */

import { STAR_DATA } from "./starData";
import { CONSTELLATION_DATA } from "./constellationData";
import { DSO_DATA, type DSOType } from "./dsoData";
import { COMET_INFO } from "./comet-info";
import { DWARF_PLANET_INFO } from "./dwarf-planet-info";
import { PLANET_INFO } from "./planet-info";
import { formatRAForDSO, formatDecForDSO } from "./coordinate-utils";
import { setupModalClose, showModal, setupDelegatedModalTrigger } from "./modal-utils";

// Body names must match the order used in the engine (from renderer/constants.ts)
const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

// Comet names must match the order used in the engine
const COMET_NAMES = [
  "1P/Halley",
  "2P/Encke",
  "67P/C-G",
  "46P/Wirtanen",
  "C/2020 F3 NEOWISE",
  "C/2023 A3 T-ATLAS",
  "C/1995 O1 Hale-Bopp",
];

// Minor body names must match the order used in the engine (from renderer/constants.ts)
const MINOR_BODY_NAMES = [
  "Pluto", "Ceres", "Eris", "Makemake", "Haumea",
  "Sedna", "Quaoar", "Gonggong", "Orcus", "Varuna",
  "Vesta", "Pallas", "Hygiea", "Apophis", "Bennu",
];

/**
 * Format DSO type for display.
 */
function formatDSOType(type: DSOType): string {
  const typeLabels: Record<DSOType, string> = {
    galaxy: "Galaxy",
    emission_nebula: "Emission Nebula",
    planetary_nebula: "Planetary Nebula",
    reflection_nebula: "Reflection Nebula",
    dark_nebula: "Dark Nebula",
    globular_cluster: "Globular Cluster",
    open_cluster: "Open Cluster",
  };
  return typeLabels[type] || type;
}

/**
 * Set up the star info modal.
 */
function setupStarModal(): void {
  const modal = document.getElementById("star-modal");
  const modalClose = document.getElementById("star-modal-close");
  const modalName = document.getElementById("star-modal-name");
  const modalDesignation = document.getElementById("star-modal-designation");
  const modalConstellation = document.getElementById("star-modal-constellation");
  const modalMagnitude = document.getElementById("star-modal-magnitude");
  const modalDistance = document.getElementById("star-modal-distance");
  const modalType = document.getElementById("star-modal-type");
  const modalDescription = document.getElementById("star-modal-description");

  function showStarInfo(hr: number): void {
    const info = STAR_DATA[hr];
    if (!info || !modal) return;

    if (modalName) modalName.textContent = info.name;
    if (modalDesignation) modalDesignation.textContent = info.designation;
    if (modalConstellation) modalConstellation.textContent = info.constellation;
    if (modalMagnitude) modalMagnitude.textContent = info.magnitude.toFixed(2);
    if (modalDistance) modalDistance.textContent = info.distance;
    if (modalType) modalType.textContent = info.type;
    if (modalDescription) modalDescription.textContent = info.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "star-label",
    "hr",
    (value) => { const n = parseInt(value, 10); return isNaN(n) ? null : n; },
    showStarInfo
  );
}

/**
 * Set up the constellation info modal.
 */
function setupConstellationModal(): void {
  const modal = document.getElementById("constellation-modal");
  const modalClose = document.getElementById("constellation-modal-close");
  const modalName = document.getElementById("constellation-modal-name");
  const modalAbbr = document.getElementById("constellation-modal-abbr");
  const modalMeaning = document.getElementById("constellation-modal-meaning");
  const modalStar = document.getElementById("constellation-modal-star");
  const modalArea = document.getElementById("constellation-modal-area");
  const modalViewing = document.getElementById("constellation-modal-viewing");
  const modalQuadrant = document.getElementById("constellation-modal-quadrant");
  const modalObjectsContainer = document.getElementById("constellation-modal-objects-container");
  const modalObjects = document.getElementById("constellation-modal-objects");
  const modalDescription = document.getElementById("constellation-modal-description");

  function showConstellationInfo(name: string): void {
    const info = CONSTELLATION_DATA[name];
    if (!info || !modal) return;

    if (modalName) modalName.textContent = info.name;
    if (modalAbbr) modalAbbr.textContent = info.abbreviation;
    if (modalMeaning) modalMeaning.textContent = info.meaning;
    if (modalStar) modalStar.textContent = info.brightestStar;
    if (modalArea) modalArea.textContent = `${info.areaSqDeg} sq°`;
    if (modalViewing) modalViewing.textContent = info.bestViewing;
    if (modalQuadrant) modalQuadrant.textContent = info.quadrant;

    if (modalObjectsContainer && modalObjects) {
      if (info.notableObjects.length > 0) {
        modalObjects.textContent = info.notableObjects.join(", ");
        modalObjectsContainer.style.display = "block";
      } else {
        modalObjectsContainer.style.display = "none";
      }
    }

    if (modalDescription) modalDescription.textContent = info.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "constellation-label",
    "constellation",
    (value) => value,
    showConstellationInfo
  );
}

/**
 * Set up the DSO info modal.
 */
function setupDSOModal(): void {
  const modal = document.getElementById("dso-modal");
  const modalClose = document.getElementById("dso-modal-close");
  const modalName = document.getElementById("dso-modal-name");
  const modalCommonName = document.getElementById("dso-modal-common-name");
  const modalTypeBadge = document.getElementById("dso-modal-type-badge");
  const modalMagnitude = document.getElementById("dso-modal-magnitude");
  const modalSize = document.getElementById("dso-modal-size");
  const modalDistance = document.getElementById("dso-modal-distance");
  const modalCoords = document.getElementById("dso-modal-coords");
  const modalDescription = document.getElementById("dso-modal-description");

  function showDSOInfo(dsoId: string): void {
    const dso = DSO_DATA.find(d => d.id === dsoId);
    if (!dso || !modal) return;

    if (modalName) modalName.textContent = dso.id;
    if (modalCommonName) modalCommonName.textContent = dso.name;
    if (modalTypeBadge) modalTypeBadge.textContent = formatDSOType(dso.type);
    if (modalMagnitude) modalMagnitude.textContent = dso.magnitude < 90 ? dso.magnitude.toFixed(1) : "N/A";
    if (modalSize) modalSize.textContent = `${dso.sizeArcmin[0]}' × ${dso.sizeArcmin[1]}'`;
    if (modalDistance) modalDistance.textContent = dso.distance;
    if (modalCoords) modalCoords.textContent = `RA ${formatRAForDSO(dso.ra)}, Dec ${formatDecForDSO(dso.dec)}`;
    if (modalDescription) modalDescription.textContent = dso.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "dso-label",
    "dsoId",
    (value) => value,
    showDSOInfo
  );
}

/**
 * Set up the comet info modal.
 */
function setupCometModal(): void {
  const modal = document.getElementById("comet-modal");
  const modalClose = document.getElementById("comet-modal-close");
  const modalName = document.getElementById("comet-modal-name");
  const modalCommonName = document.getElementById("comet-modal-common-name");
  const modalTypeBadge = document.getElementById("comet-modal-type-badge");
  const modalPeriod = document.getElementById("comet-modal-period");
  const modalPerihelion = document.getElementById("comet-modal-perihelion");
  const modalLastVisit = document.getElementById("comet-modal-last-visit");
  const modalNextReturn = document.getElementById("comet-modal-next-return");
  const modalDescription = document.getElementById("comet-modal-description");

  function showCometInfo(cometIndex: number): void {
    const cometName = COMET_NAMES[cometIndex];
    const info = COMET_INFO[cometName];
    if (!info || !modal) return;

    if (modalName) modalName.textContent = info.name;
    if (modalCommonName) modalCommonName.textContent = info.commonName;
    if (modalTypeBadge) modalTypeBadge.textContent = info.type;
    if (modalPeriod) modalPeriod.textContent = info.period;
    if (modalPerihelion) modalPerihelion.textContent = info.perihelion;
    if (modalLastVisit) modalLastVisit.textContent = info.lastVisit;
    if (modalNextReturn) modalNextReturn.textContent = info.nextReturn;
    if (modalDescription) modalDescription.textContent = info.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "comet-label",
    "comet",
    (value) => { const n = parseInt(value, 10); return isNaN(n) ? null : n; },
    showCometInfo
  );
}

/**
 * Set up the planet info modal (Sun, Moon, major planets).
 */
function setupPlanetModal(): void {
  const modal = document.getElementById("planet-modal");
  const modalClose = document.getElementById("planet-modal-close");
  const modalName = document.getElementById("planet-modal-name");
  const modalTypeBadge = document.getElementById("planet-modal-type-badge");
  const modalDiameter = document.getElementById("planet-modal-diameter");
  const modalDistance = document.getElementById("planet-modal-distance");
  const modalPeriod = document.getElementById("planet-modal-period");
  const modalRotation = document.getElementById("planet-modal-rotation");
  const modalMoons = document.getElementById("planet-modal-moons");
  const modalDescription = document.getElementById("planet-modal-description");

  function showPlanetInfo(bodyIndex: number): void {
    const bodyName = BODY_NAMES[bodyIndex];
    const info = PLANET_INFO[bodyName];
    if (!info || !modal) return;

    if (modalName) modalName.textContent = info.name;
    if (modalTypeBadge) modalTypeBadge.textContent = info.type;
    if (modalDiameter) modalDiameter.textContent = info.diameter;
    if (modalDistance) modalDistance.textContent = info.distance;
    if (modalPeriod) modalPeriod.textContent = info.orbitalPeriod;
    if (modalRotation) modalRotation.textContent = info.rotationPeriod;
    if (modalMoons) modalMoons.textContent = info.moons;
    if (modalDescription) modalDescription.textContent = info.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "planet-label",
    "body",
    (value) => { const n = parseInt(value, 10); return isNaN(n) ? null : n; },
    showPlanetInfo
  );
}

/**
 * Set up the dwarf planet info modal.
 */
function setupDwarfPlanetModal(): void {
  const modal = document.getElementById("dwarf-planet-modal");
  const modalClose = document.getElementById("dwarf-planet-modal-close");
  const modalName = document.getElementById("dwarf-planet-modal-name");
  const modalDesignation = document.getElementById("dwarf-planet-modal-designation");
  const modalTypeBadge = document.getElementById("dwarf-planet-modal-type-badge");
  const modalDiameter = document.getElementById("dwarf-planet-modal-diameter");
  const modalPeriod = document.getElementById("dwarf-planet-modal-period");
  const modalDistance = document.getElementById("dwarf-planet-modal-distance");
  const modalMoons = document.getElementById("dwarf-planet-modal-moons");
  const modalDiscovered = document.getElementById("dwarf-planet-modal-discovered");
  const modalDescription = document.getElementById("dwarf-planet-modal-description");

  function showDwarfPlanetInfo(minorBodyIndex: number): void {
    const bodyName = MINOR_BODY_NAMES[minorBodyIndex];
    const info = DWARF_PLANET_INFO[bodyName];
    if (!info || !modal) return;

    if (modalName) modalName.textContent = info.name;
    if (modalDesignation) modalDesignation.textContent = info.designation;
    if (modalTypeBadge) modalTypeBadge.textContent = info.type.split(" ")[0]; // Just "Dwarf" or "Trans-Neptunian"
    if (modalDiameter) modalDiameter.textContent = info.diameter;
    if (modalPeriod) modalPeriod.textContent = info.orbitalPeriod;
    if (modalDistance) modalDistance.textContent = info.distance;
    if (modalMoons) modalMoons.textContent = info.moons;
    if (modalDiscovered) modalDiscovered.textContent = info.discoveredYear;
    if (modalDescription) modalDescription.textContent = info.description;

    showModal(modal);
  }

  setupModalClose(modal, modalClose);
  setupDelegatedModalTrigger(
    "minor-body-label",
    "minorBody",
    (value) => { const n = parseInt(value, 10); return isNaN(n) ? null : n; },
    showDwarfPlanetInfo
  );
}

/**
 * Set up all info modals.
 */
export function setupInfoModals(): void {
  setupStarModal();
  setupConstellationModal();
  setupDSOModal();
  setupCometModal();
  setupPlanetModal();
  setupDwarfPlanetModal();
}
