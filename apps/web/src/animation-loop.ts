import * as THREE from "three";
import { computeGMST } from "./geometry/time";
import { SKY_RADIUS, type BodyPositions } from "./body-positions";
import type { SkyEngine } from "./wasm/sky_engine";
import { getHeliocentricPositions } from "./spacecraftPositions";
import { isAlwaysRenderMode, type RenderScheduler } from "./render-scheduler";

export interface AnimationLoopDependencies {
  controls: {
    update: () => void;
    getFov: () => number;
    /** Whether a multi-frame camera animation is running (always-render gate). */
    isAnimating: () => boolean;
  };
  tourEngine: {
    update: () => void;
    /** Whether a tour is playing/paused (always-render gate). */
    isActive: () => boolean;
  };
  renderer: {
    render: () => void;
    /** Corona shader is visible and animating (always-render gate). */
    isCoronaActive: () => boolean;
    /** A label fade is mid-animation (always-render gate). */
    hasFadesInProgress: () => boolean;
    updateGroundPlaneForTime: (date: Date) => void;
    updateScintillation: (latitude: number, lst: number) => void;
    updateHorizonZenith: (zenith: THREE.Vector3) => void;
    updateDeepFields: (fov: number) => void;
    updateJWST: (
      fov: number,
      sunPos: THREE.Vector3,
      moonPos: THREE.Vector3,
      date: Date
    ) => void;
    getSatellitePosition: (index: number, engine: SkyEngine) => { x: number; y: number; z: number } | null;
    updateEarthPosition: (nadir: THREE.Vector3) => void;
    updateEarthRotation: (date: Date, longitude: number) => void;
    updateEarthSunDirection: (sunPos: THREE.Vector3) => void;
    updateLabelOcclusion: () => void;
    isOccludedByEarth: (position: THREE.Vector3) => boolean;
    getSunPosition: () => THREE.Vector3;
    getMoonPosition: () => THREE.Vector3;
    copySunPositionInto: (out: THREE.Vector3) => void;
    copyMoonPositionInto: (out: THREE.Vector3) => void;
    updateRemoteView: (
      fov: number,
      heliocentricBodies?: Map<string, { x: number; y: number; z: number }>
    ) => void;
    isRemoteViewpointActive: () => boolean;
  };
  videoMarkers: {
    updateOcclusion: (isOccluded: (position: THREE.Vector3) => boolean) => void;
  };
  getViewMode: () => "geocentric" | "topocentric" | "hubble" | "jwst";
  getCurrentDate: () => Date;
  getObserverLocation: () => { latitude: number; longitude: number };
  getBodyPositions: () => BodyPositions;
  engine: SkyEngine;
  /** Render scheduler gating the expensive WebGL + CSS2D render calls. */
  renderScheduler: RenderScheduler;
  /** Whether AR device-orientation mode is active (always-render gate). */
  isARModeEnabled: () => boolean;
  /**
   * Optional guide-star (FGS) lock. `hold()` re-asserts pointing on the guide
   * star (epsilon-gated, so it only requests a render on real drift) and
   * `renderOverlay()` repositions the FGS reticle over the star on rendered
   * frames only.
   */
  guideStar?: {
    hold: (controlsAnimating: boolean) => void;
    renderOverlay: () => void;
  };
}

export function createAnimationLoop(deps: AnimationLoopDependencies): () => void {
  const {
    controls,
    tourEngine,
    renderer,
    videoMarkers,
    getViewMode,
    getCurrentDate,
    getObserverLocation,
    engine,
    renderScheduler,
    isARModeEnabled,
    guideStar,
  } = deps;

  // Pre-allocated vectors reused every frame to avoid per-frame GC pressure.
  // updateHorizonZenith copies the value, so reusing this instance is safe.
  const zenith = new THREE.Vector3();
  const hubbleNadir = new THREE.Vector3();
  // Hubble/JWST body-position reads, filled in-place from the renderer's cached
  // positions to avoid the full body-map (Map + ~31 Vector3) rebuild per frame.
  const sunPosHubble = new THREE.Vector3();
  const sunPosJwst = new THREE.Vector3();
  const moonPosJwst = new THREE.Vector3();

  function animate(): void {
    requestAnimationFrame(animate);

    // controls.update() and tourEngine.update() must run every frame: they
    // advance in-progress animations and (via onCameraChange / setTimeForTour)
    // call requestRender() when they change something. Run them before the
    // render-skip decision so a newly-started animation is not missed.
    controls.update();
    tourEngine.update();

    // Guide-star lock re-asserts pointing before the render-skip decision so a
    // drift correction can trigger this frame's render. Epsilon-gated: a settled,
    // on-target lock does nothing and does not force a render.
    guideStar?.hold(controls.isAnimating());

    const viewMode = getViewMode();

    // Render-on-demand gate: skip the expensive WebGL draw + CSS2D style writes
    // when the scene is clean AND no mode needs continuous frames. Any dirty
    // source (camera, time, toggle, resize, ...) calls requestRender().
    const alwaysRender = isAlwaysRenderMode({
      viewMode,
      arEnabled: isARModeEnabled(),
      coronaActive: renderer.isCoronaActive(),
      fadesInProgress: renderer.hasFadesInProgress(),
      controlsAnimating: controls.isAnimating(),
      tourActive: tourEngine.isActive(),
    });
    if (!renderScheduler.shouldRender(alwaysRender)) {
      return;
    }

    const currentDate = getCurrentDate();
    const location = getObserverLocation();

    // Update ground plane position for current sidereal time
    renderer.updateGroundPlaneForTime(currentDate);

    // Update scintillation and horizon zenith for topocentric mode
    if (viewMode === "topocentric") {
      const gmst = computeGMST(currentDate);
      let lst = gmst + location.longitude; // LST in degrees
      lst = ((lst % 360) + 360) % 360; // Normalize to 0-360
      renderer.updateScintillation(location.latitude, lst);

      // Update horizon zenith direction for proper horizon culling
      // Zenith in equatorial coords: RA = LST, Dec = latitude
      const latRad = (location.latitude * Math.PI) / 180;
      const lstRad = (lst * Math.PI) / 180;
      const cosLat = Math.cos(latRad);
      const sinLat = Math.sin(latRad);
      const cosLst = Math.cos(lstRad);
      const sinLst = Math.sin(lstRad);
      // Equatorial coords (Z-up): eqX = cosLat*cosLst, eqY = cosLat*sinLst, eqZ = sinLat
      // Convert to Three.js (Y-up): (-eqX, eqZ, eqY)
      zenith.set(-cosLat * cosLst, sinLat, cosLat * sinLst);
      renderer.updateHorizonZenith(zenith);
    }

    // Update Earth position/rotation for Hubble mode
    if (viewMode === "hubble") {
      // Get Hubble's position (index 1) to compute nadir direction
      const hubblePos = renderer.getSatellitePosition(1, engine);
      if (hubblePos) {
        // Nadir is opposite to satellite position (toward Earth center)
        const nadir = hubbleNadir.set(-hubblePos.x, -hubblePos.y, -hubblePos.z).normalize();
        renderer.updateEarthPosition(nadir);
      }
      renderer.updateEarthRotation(currentDate, location.longitude);

      // Update Sun direction for day/night terminator. Read the Sun from the
      // renderer's cached position and rescale to the body-map sky radius
      // (SKY_RADIUS - 0.5) so the value is identical to the previous
      // getBodyPositions().get("Sun") read, without the Map/Vector3 rebuild.
      renderer.copySunPositionInto(sunPosHubble);
      if (sunPosHubble.lengthSq() > 0) {
        sunPosHubble.setLength(SKY_RADIUS - 0.5);
        renderer.updateEarthSunDirection(sunPosHubble);
      }

      // Hide labels occluded by Earth
      renderer.updateLabelOcclusion();

      // Hide video markers occluded by Earth
      videoMarkers.updateOcclusion(renderer.isOccludedByEarth);
    }

    // Update deep fields visibility based on current FOV
    const currentFov = controls.getFov();
    renderer.updateDeepFields(currentFov);

    // Update remote view (for tour viewpoints like Pale Blue Dot)
    if (renderer.isRemoteViewpointActive()) {
      // Get heliocentric positions for the current date (if available)
      const helioPositions = getHeliocentricPositions(currentDate);
      renderer.updateRemoteView(currentFov, helioPositions ?? undefined);
    } else {
      renderer.updateRemoteView(currentFov);
    }

    // Update JWST layer (Earth and Moon as distant objects)
    if (viewMode === "jwst") {
      renderer.copySunPositionInto(sunPosJwst);
      renderer.copyMoonPositionInto(moonPosJwst);
      renderer.updateJWST(currentFov, sunPosJwst, moonPosJwst, currentDate);
    }

    // Reposition the FGS reticle over the guide star. Done on rendered frames
    // only (after the render-skip gate) so the DOM overlay tracks the WebGL frame.
    guideStar?.renderOverlay();

    renderer.render();
  }

  return animate;
}
