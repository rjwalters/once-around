import type { Settings, SettingsSaver } from "./settings";

export interface ToggleDependencies {
  renderer: {
    setConstellationsVisible: (visible: boolean) => void;
    setLabelsVisible: (visible: boolean) => void;
    setOrbitsVisible: (visible: boolean) => void;
    setDSOsVisible: (visible: boolean) => void;
    setDeepFieldsVisible: (visible: boolean) => void;
    setMeteorShowersVisible: (visible: boolean) => void;
    setISSVisible: (visible: boolean) => void;
    setGroundPlaneVisible: (visible: boolean) => void;
    setHubbleMode: (enabled: boolean) => void;
    updateDSOs: (fov: number, mag: number) => void;
    updateDeepFields: (fov: number) => void;
    updateMeteorShowers: (date: Date) => void;
    computeOrbits: (engine: unknown, date: Date) => Promise<void>;
  };
  videoMarkers: {
    setVisible: (visible: boolean) => void;
    setLabelsVisible: (visible: boolean) => void;
  };
  settings: Settings;
  settingsSaver: SettingsSaver;
  getViewMode: () => string;
  getCurrentFov: () => number;
  getCurrentMagnitude: () => number;
  getCurrentDate: () => Date;
  getEngine: () => unknown;
  onOrbitsToggle?: () => void;
}

export interface ToggleRefs {
  constellationCheckbox: HTMLInputElement | null;
  labelsCheckbox: HTMLInputElement | null;
  videosCheckbox: HTMLInputElement | null;
  orbitsCheckbox: HTMLInputElement | null;
  dsosCheckbox: HTMLInputElement | null;
  deepFieldsCheckbox: HTMLInputElement | null;
  meteorShowersCheckbox: HTMLInputElement | null;
  issCheckbox: HTMLInputElement | null;
  nightVisionCheckbox: HTMLInputElement | null;
  horizonCheckbox: HTMLInputElement | null;
}

export interface ToggleActions {
  setNightVision: (enabled: boolean) => void;
  isOrbitsVisible: () => boolean;
}

export function setupUIToggles(deps: ToggleDependencies): { refs: ToggleRefs; actions: ToggleActions } {
  const {
    renderer,
    videoMarkers,
    settings,
    settingsSaver,
    getViewMode,
    getCurrentFov,
    getCurrentMagnitude,
    getCurrentDate,
    getEngine,
    onOrbitsToggle,
  } = deps;

  // Constellation checkbox
  const constellationCheckbox = document.getElementById("constellations") as HTMLInputElement | null;
  if (constellationCheckbox) {
    constellationCheckbox.checked = settings.constellationsVisible;
    renderer.setConstellationsVisible(settings.constellationsVisible);

    constellationCheckbox.addEventListener("change", () => {
      renderer.setConstellationsVisible(constellationCheckbox.checked);
      settingsSaver.save({ constellationsVisible: constellationCheckbox.checked });
    });
  }

  // Labels checkbox
  const labelsCheckbox = document.getElementById("labels") as HTMLInputElement | null;
  if (labelsCheckbox) {
    labelsCheckbox.checked = settings.labelsVisible;
    renderer.setLabelsVisible(settings.labelsVisible);

    labelsCheckbox.addEventListener("change", () => {
      renderer.setLabelsVisible(labelsCheckbox.checked);
      settingsSaver.save({ labelsVisible: labelsCheckbox.checked });
    });
  }

  // Videos checkbox
  const videosCheckbox = document.getElementById("videos") as HTMLInputElement | null;
  if (videosCheckbox) {
    videosCheckbox.checked = settings.videosVisible;
    videoMarkers.setVisible(settings.videosVisible);
    videoMarkers.setLabelsVisible(settings.videosVisible);

    videosCheckbox.addEventListener("change", () => {
      videoMarkers.setVisible(videosCheckbox.checked);
      videoMarkers.setLabelsVisible(videosCheckbox.checked);
      settingsSaver.save({ videosVisible: videosCheckbox.checked });
    });
  }

  // Orbits checkbox
  const orbitsCheckbox = document.getElementById("orbits") as HTMLInputElement | null;
  if (orbitsCheckbox) {
    orbitsCheckbox.checked = settings.orbitsVisible;
    renderer.setOrbitsVisible(settings.orbitsVisible);

    // Compute initial orbits if visible
    if (settings.orbitsVisible) {
      void renderer.computeOrbits(getEngine(), getCurrentDate());
    }

    orbitsCheckbox.addEventListener("change", () => {
      renderer.setOrbitsVisible(orbitsCheckbox.checked);
      // Compute orbits when turning on
      if (orbitsCheckbox.checked) {
        void renderer.computeOrbits(getEngine(), getCurrentDate());
      }
      // Clear any focused orbit when toggling
      onOrbitsToggle?.();
      settingsSaver.save({ orbitsVisible: orbitsCheckbox.checked });
    });
  }

  // DSOs checkbox
  const dsosCheckbox = document.getElementById("dsos") as HTMLInputElement | null;
  if (dsosCheckbox) {
    dsosCheckbox.checked = settings.dsosVisible ?? false;
    renderer.setDSOsVisible(settings.dsosVisible ?? false);

    // Initialize DSO positions if restored as visible
    if (settings.dsosVisible) {
      renderer.updateDSOs(getCurrentFov(), getCurrentMagnitude());
    }

    dsosCheckbox.addEventListener("change", () => {
      renderer.setDSOsVisible(dsosCheckbox.checked);
      if (dsosCheckbox.checked) {
        renderer.updateDSOs(getCurrentFov(), getCurrentMagnitude());
      }
      settingsSaver.save({ dsosVisible: dsosCheckbox.checked });
    });
  }

  // Deep fields checkbox
  const deepFieldsCheckbox = document.getElementById("deep-fields") as HTMLInputElement | null;
  if (deepFieldsCheckbox) {
    deepFieldsCheckbox.checked = settings.deepFieldsVisible ?? false;
    renderer.setDeepFieldsVisible(settings.deepFieldsVisible ?? false);

    if (settings.deepFieldsVisible) {
      renderer.updateDeepFields(getCurrentFov());
    }

    deepFieldsCheckbox.addEventListener("change", () => {
      renderer.setDeepFieldsVisible(deepFieldsCheckbox.checked);
      if (deepFieldsCheckbox.checked) {
        renderer.updateDeepFields(getCurrentFov());
      }
      settingsSaver.save({ deepFieldsVisible: deepFieldsCheckbox.checked });
    });
  }

  // Meteor showers checkbox
  const meteorShowersCheckbox = document.getElementById("meteor-showers") as HTMLInputElement | null;
  if (meteorShowersCheckbox) {
    meteorShowersCheckbox.checked = settings.meteorShowersVisible ?? false;
    renderer.setMeteorShowersVisible(settings.meteorShowersVisible ?? false);

    if (settings.meteorShowersVisible) {
      renderer.updateMeteorShowers(getCurrentDate());
    }

    meteorShowersCheckbox.addEventListener("change", () => {
      renderer.setMeteorShowersVisible(meteorShowersCheckbox.checked);
      if (meteorShowersCheckbox.checked) {
        renderer.updateMeteorShowers(getCurrentDate());
      }
      settingsSaver.save({ meteorShowersVisible: meteorShowersCheckbox.checked });
    });
  }

  // ISS checkbox
  const issCheckbox = document.getElementById("iss") as HTMLInputElement | null;
  if (issCheckbox) {
    issCheckbox.checked = settings.issVisible ?? true;
    renderer.setISSVisible(settings.issVisible ?? true);

    issCheckbox.addEventListener("change", () => {
      renderer.setISSVisible(issCheckbox.checked);
      settingsSaver.save({ issVisible: issCheckbox.checked });
    });
  }

  // Night vision checkbox
  const nightVisionCheckbox = document.getElementById("night-vision") as HTMLInputElement | null;

  function setNightVision(enabled: boolean): void {
    document.body.classList.toggle("night-vision", enabled);
    if (nightVisionCheckbox) {
      nightVisionCheckbox.checked = enabled;
    }
    settingsSaver.save({ nightVisionEnabled: enabled });
  }

  if (nightVisionCheckbox) {
    const initialNightVision = settings.nightVisionEnabled ?? false;
    nightVisionCheckbox.checked = initialNightVision;
    document.body.classList.toggle("night-vision", initialNightVision);

    nightVisionCheckbox.addEventListener("change", () => {
      setNightVision(nightVisionCheckbox.checked);
    });
  }

  // Horizon checkbox
  const horizonCheckbox = document.getElementById("horizon") as HTMLInputElement | null;
  if (horizonCheckbox) {
    const initialHorizon = settings.horizonVisible ?? false;
    horizonCheckbox.checked = initialHorizon;
    renderer.setGroundPlaneVisible(initialHorizon);

    horizonCheckbox.addEventListener("change", () => {
      const isHubble = getViewMode() === "hubble";
      if (isHubble) {
        // In Hubble mode, toggle Earth visibility
        renderer.setHubbleMode(horizonCheckbox.checked);
      } else {
        // In other modes, toggle ground plane
        renderer.setGroundPlaneVisible(horizonCheckbox.checked);
      }
      settingsSaver.save({ horizonVisible: horizonCheckbox.checked });
    });
  }

  return {
    refs: {
      constellationCheckbox,
      labelsCheckbox,
      videosCheckbox,
      orbitsCheckbox,
      dsosCheckbox,
      deepFieldsCheckbox,
      meteorShowersCheckbox,
      issCheckbox,
      nightVisionCheckbox,
      horizonCheckbox,
    },
    actions: {
      setNightVision,
      isOrbitsVisible: () => orbitsCheckbox?.checked ?? false,
    },
  };
}
