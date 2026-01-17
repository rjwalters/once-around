/**
 * Sky Renderer
 *
 * Main orchestrator that creates all rendering layers and coordinates
 * their updates. This is the entry point for the renderer module.
 */

import * as THREE from "three";
import type { SkyEngine } from "../wasm/sky_engine";
import { createRendererContext } from "./context";
import { createMilkyWayLayer } from "./layers/milky-way";
import { createGroundLayer } from "./layers/ground";
import { createStarsLayer } from "./layers/stars";
import { createConstellationsLayer } from "./layers/constellations";
import { createBodiesLayer } from "./layers/bodies";
import { createPlanetaryMoonsLayer } from "./layers/moons";
import { createDSOLayer } from "./layers/dso";
import { createOrbitsLayer } from "./layers/orbits";
import { createCometsLayer } from "./layers/comets";
import { createEclipseLayer } from "./layers/eclipse";
import { createSatellitesLayer } from "./layers/satellites";
import { createEarthLayer } from "./layers/earth";

export interface SkyRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  updateFromEngine(engine: SkyEngine, fov?: number): void;
  setConstellationsVisible(visible: boolean): void;
  setLabelsVisible(visible: boolean): void;
  setOrbitsVisible(visible: boolean): void;
  focusOrbit(bodyIndex: number | null): void;
  computeOrbits(engine: SkyEngine, centerDate: Date): Promise<void>;
  setMilkyWayVisibility(limitingMagnitude: number): void;
  updateDSOs(fov: number, magLimit: number): void;
  setDSOsVisible(visible: boolean): void;
  getRenderedStarCount(): number;
  updateEclipse(sunMoonSeparationDeg: number): void;
  setGroundPlaneVisible(visible: boolean): void;
  updateGroundPlaneOrientation(latitudeDeg: number, longitudeDeg?: number): void;
  updateGroundPlaneForTime(date: Date): void;
  setStarOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number }>): void;
  clearStarOverrides(): void;
  setScintillationEnabled(enabled: boolean): void;
  setScintillationIntensity(intensity: number): void;
  updateScintillation(latitude: number, lst: number): void;
  setSatellitesVisible(visible: boolean): void;
  getSatellitePosition(index: number, engine: SkyEngine): { x: number; y: number; z: number } | null;
  isSatelliteVisible(index: number): boolean;
  // Legacy ISS methods
  setISSVisible(visible: boolean): void;
  isISSVisible(): boolean;
  hasISSData(): boolean;
  setHorizonCulling(enabled: boolean): void;
  updateHorizonZenith(zenith: THREE.Vector3): void;
  // Orbital mode methods
  setOrbitalMode(enabled: boolean): void;
  updateEarthPosition(nadirDirection: THREE.Vector3): void;
  updateEarthRotation(date: Date, longitudeDeg: number): void;
  updateEarthSunDirection(sunPosition: THREE.Vector3): void;
  updateLabelOcclusion(): void;
  /** Check if a position is occluded by Earth (for external layers) */
  isOccludedByEarth(position: THREE.Vector3): boolean;
  render(): void;
  resize(width: number, height: number): void;
}

export function createRenderer(container: HTMLElement): SkyRenderer {
  const ctx = createRendererContext(container);
  const { scene, camera, renderer, labelRenderer, labelsGroup } = ctx;

  // Create all layers
  const milkyWayLayer = createMilkyWayLayer(scene);
  const groundLayer = createGroundLayer(scene);
  const starsLayer = createStarsLayer(scene, labelsGroup);
  const constellationsLayer = createConstellationsLayer(scene, labelsGroup);
  const bodiesLayer = createBodiesLayer(scene, labelsGroup);
  const moonsLayer = createPlanetaryMoonsLayer(scene, labelsGroup);
  const dsoLayer = createDSOLayer(scene, labelsGroup);
  const orbitsLayer = createOrbitsLayer(scene);
  const cometsLayer = createCometsLayer(scene, labelsGroup);
  const eclipseLayer = createEclipseLayer(scene);
  const satellitesLayer = createSatellitesLayer(scene, labelsGroup);
  const earthLayer = createEarthLayer(scene);

  // Track state
  let labelsVisible = true;
  let satellitesEnabled = true;
  let constellationStarMapInitialized = false;
  let orbitalModeEnabled = false;

  function updateFromEngine(engine: SkyEngine, fov: number = 60): void {
    const effectiveFov = fov * 1.2;
    const canvasHeight = ctx.container.clientHeight;

    // Build constellation star map once on first call
    if (!constellationStarMapInitialized) {
      starsLayer.buildConstellationStarMap(engine);
      constellationStarMapInitialized = true;
    }

    // Update all layers
    starsLayer.update(engine, effectiveFov, canvasHeight);
    constellationsLayer.update(starsLayer.getConstellationStarPositionMap());
    starsLayer.updateLabels(labelsVisible);
    constellationsLayer.setLabelsVisible(labelsVisible);
    bodiesLayer.update(engine);
    moonsLayer.update(engine, fov, labelsVisible, canvasHeight);
    cometsLayer.update(engine, bodiesLayer.getSunPosition(), labelsVisible);
    if (satellitesEnabled) {
      satellitesLayer.update(engine, labelsVisible);
    }
  }

  function setConstellationsVisible(visible: boolean): void {
    constellationsLayer.setVisible(visible);
  }

  function setLabelsVisible(visible: boolean): void {
    labelsVisible = visible;
    labelsGroup.visible = visible;
  }

  function setOrbitsVisible(visible: boolean): void {
    orbitsLayer.setVisible(visible);
  }

  function focusOrbit(bodyIndex: number | null): void {
    orbitsLayer.focusOrbit(bodyIndex);
  }

  async function computeOrbits(engine: SkyEngine, centerDate: Date): Promise<void> {
    await orbitsLayer.compute(engine, centerDate);
  }

  function setMilkyWayVisibility(limitingMagnitude: number): void {
    milkyWayLayer.setVisibility(limitingMagnitude);
  }

  function updateDSOs(fov: number, magLimit: number): void {
    const canvasHeight = ctx.container.clientHeight;
    dsoLayer.update(fov, magLimit, labelsVisible, canvasHeight);
  }

  function setDSOsVisible(visible: boolean): void {
    dsoLayer.setVisible(visible);
  }

  function getRenderedStarCount(): number {
    return starsLayer.getRenderedCount();
  }

  function updateEclipse(sunMoonSeparationDeg: number): void {
    eclipseLayer.update(sunMoonSeparationDeg, bodiesLayer.sunMesh, camera);
  }

  function setGroundPlaneVisible(visible: boolean): void {
    groundLayer.setVisible(visible);
  }

  function updateGroundPlaneOrientation(latitudeDeg: number, longitudeDeg?: number): void {
    groundLayer.updateOrientation(latitudeDeg, longitudeDeg);
  }

  function updateGroundPlaneForTime(date: Date): void {
    groundLayer.updateForTime(date);
  }

  function setStarOverrides(overrides: Array<{ starHR: number; magnitude?: number; bvColor?: number; scale?: number }>): void {
    starsLayer.setOverrides(overrides);
  }

  function clearStarOverrides(): void {
    starsLayer.clearOverrides();
  }

  function setScintillationEnabled(enabled: boolean): void {
    starsLayer.setScintillationEnabled(enabled);
  }

  function setScintillationIntensity(intensity: number): void {
    starsLayer.setScintillationIntensity(intensity);
  }

  function updateScintillation(latitude: number, lst: number): void {
    starsLayer.updateScintillation(latitude, lst);
  }

  function setSatellitesVisible(visible: boolean): void {
    satellitesEnabled = visible;
    satellitesLayer.setEnabled(visible);
  }

  function getSatellitePositionFn(index: number, engine: SkyEngine): { x: number; y: number; z: number } | null {
    return satellitesLayer.getSatellitePosition(index, engine);
  }

  function isSatelliteVisible(index: number): boolean {
    return satellitesLayer.isSatelliteVisible(index);
  }

  // Legacy ISS functions
  function setISSVisible(visible: boolean): void {
    setSatellitesVisible(visible);
  }

  function isISSVisible(): boolean {
    return satellitesLayer.isSatelliteVisible(0); // ISS is index 0
  }

  function hasISSData(): boolean {
    return satellitesLayer.satellites[0]?.hasData ?? false;
  }

  function setHorizonCulling(enabled: boolean): void {
    bodiesLayer.setHorizonCulling(enabled);
  }

  function updateHorizonZenith(zenith: THREE.Vector3): void {
    bodiesLayer.setHorizonCulling(true, zenith);
  }

  function setOrbitalMode(enabled: boolean): void {
    orbitalModeEnabled = enabled;
    earthLayer.setVisible(enabled);
    // Hide ground when in orbital mode
    if (enabled) {
      groundLayer.setVisible(false);
    } else {
      // When exiting orbital mode, reset all label visibility that may have been
      // hidden by Earth occlusion
      labelsGroup.traverse((obj) => {
        if (obj === labelsGroup) return;
        const css2dObj = obj as THREE.Object3D & { element?: HTMLElement };
        if (css2dObj.element) {
          css2dObj.element.style.opacity = '';
          css2dObj.element.style.pointerEvents = '';
        }
        if (obj instanceof THREE.Sprite || obj instanceof THREE.Mesh) {
          obj.visible = true;
        }
        if (obj instanceof THREE.LineSegments) {
          obj.visible = true;
        }
      });
    }
    // Enable depth testing on orbits in orbital mode so they're hidden behind Earth
    orbitsLayer.setDepthTest(enabled);
  }

  function updateEarthPosition(nadirDirection: THREE.Vector3): void {
    if (orbitalModeEnabled) {
      earthLayer.updatePosition(nadirDirection);
    }
  }

  function updateEarthRotation(date: Date, longitudeDeg: number): void {
    if (orbitalModeEnabled) {
      earthLayer.updateRotation(date, longitudeDeg);
    }
  }

  function updateEarthSunDirection(sunPosition: THREE.Vector3): void {
    if (orbitalModeEnabled) {
      earthLayer.updateSunDirection(sunPosition);
    }
  }

  function updateLabelOcclusion(): void {
    if (!orbitalModeEnabled) return;

    // Reusable vector for world position
    const worldPos = new THREE.Vector3();

    // Iterate through all labels in the labelsGroup and hide occluded ones
    labelsGroup.traverse((obj) => {
      // Skip the labelsGroup itself
      if (obj === labelsGroup) return;

      // Get world position (not local position)
      obj.getWorldPosition(worldPos);

      // Skip objects at origin (invalid position)
      if (worldPos.lengthSq() < 0.01) return;

      const isOccluded = earthLayer.isOccluded(worldPos);

      // CSS2DObject has element property
      const css2dObj = obj as THREE.Object3D & { element?: HTMLElement };
      if (css2dObj.element) {
        css2dObj.element.style.opacity = isOccluded ? '0' : '';
        css2dObj.element.style.pointerEvents = isOccluded ? 'none' : '';
      }

      // Sprites and other 3D objects
      if (obj instanceof THREE.Sprite || obj instanceof THREE.Mesh) {
        obj.visible = !isOccluded;
      }

      // Line segments (flag lines connecting markers to labels)
      if (obj instanceof THREE.LineSegments) {
        obj.visible = !isOccluded;
      }
    });
  }

  function isOccludedByEarth(position: THREE.Vector3): boolean {
    if (!orbitalModeEnabled) return false;
    return earthLayer.isOccluded(position);
  }

  function render(): void {
    eclipseLayer.updateTime();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function resize(width: number, height: number): void {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
  }

  return {
    scene,
    camera,
    renderer,
    updateFromEngine,
    setConstellationsVisible,
    setLabelsVisible,
    setOrbitsVisible,
    focusOrbit,
    computeOrbits,
    setMilkyWayVisibility,
    updateDSOs,
    setDSOsVisible,
    getRenderedStarCount,
    updateEclipse,
    setGroundPlaneVisible,
    updateGroundPlaneOrientation,
    updateGroundPlaneForTime,
    setStarOverrides,
    clearStarOverrides,
    setScintillationEnabled,
    setScintillationIntensity,
    updateScintillation,
    setSatellitesVisible,
    getSatellitePosition: getSatellitePositionFn,
    isSatelliteVisible,
    setISSVisible,
    isISSVisible,
    hasISSData,
    setHorizonCulling,
    updateHorizonZenith,
    setOrbitalMode,
    updateEarthPosition,
    updateEarthRotation,
    updateEarthSunDirection,
    updateLabelOcclusion,
    isOccludedByEarth,
    render,
    resize,
  };
}
