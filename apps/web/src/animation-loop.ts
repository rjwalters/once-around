import * as THREE from "three";
import { computeGMST } from "./geometry/time";
import type { BodyPositions } from "./body-positions";
import type { SkyEngine } from "./wasm/sky_engine";
import { getHeliocentricPositions } from "./spacecraftPositions";

export interface AnimationLoopDependencies {
  controls: {
    update: () => void;
    getCameraState: () => { fov: number; quaternion: { x: number; y: number; z: number; w: number } };
  };
  tourEngine: {
    update: () => void;
  };
  renderer: {
    render: () => void;
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
    getBodyPositions,
    engine,
  } = deps;

  // Pre-allocated vectors reused every frame to avoid per-frame GC pressure.
  // updateHorizonZenith copies the value, so reusing this instance is safe.
  const zenith = new THREE.Vector3();
  const hubbleNadir = new THREE.Vector3();

  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    tourEngine.update();

    const currentDate = getCurrentDate();
    const viewMode = getViewMode();
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

      // Update Sun direction for day/night terminator
      const bodyPos = getBodyPositions();
      const sunPos = bodyPos.get("Sun");
      if (sunPos) {
        renderer.updateEarthSunDirection(sunPos);
      }

      // Hide labels occluded by Earth
      renderer.updateLabelOcclusion();

      // Hide video markers occluded by Earth
      videoMarkers.updateOcclusion(renderer.isOccludedByEarth);
    }

    // Update deep fields visibility based on current FOV
    const currentFov = controls.getCameraState().fov;
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
      const sunPos = renderer.getSunPosition();
      const moonPos = renderer.getMoonPosition();
      renderer.updateJWST(currentFov, sunPos, moonPos, currentDate);
    }

    renderer.render();
  }

  return animate;
}
