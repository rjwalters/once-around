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
import { createISSLayer } from "./layers/iss";

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
  setISSVisible(visible: boolean): void;
  isISSVisible(): boolean;
  hasISSData(): boolean;
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
  const issLayer = createISSLayer(scene, labelsGroup);

  // Track state
  let labelsVisible = true;
  let issEnabled = true;
  let constellationStarMapInitialized = false;

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
    if (issEnabled) {
      issLayer.update(engine, labelsVisible);
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

  function setISSVisible(visible: boolean): void {
    issEnabled = visible;
    issLayer.setEnabled(visible);
  }

  function isISSVisible(): boolean {
    return issLayer.isVisible();
  }

  function hasISSData(): boolean {
    return issLayer.hasData;
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
    setISSVisible,
    isISSVisible,
    hasISSData,
    render,
    resize,
  };
}
