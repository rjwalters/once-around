/**
 * Renderer Context
 *
 * Shared context passed to all layers, containing the scene, camera,
 * renderer, and label renderer.
 */

import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

export interface RendererContext {
  /** The Three.js scene */
  scene: THREE.Scene;
  /** The perspective camera */
  camera: THREE.PerspectiveCamera;
  /** The WebGL renderer */
  renderer: THREE.WebGLRenderer;
  /** The CSS2D label renderer */
  labelRenderer: CSS2DRenderer;
  /** The container element */
  container: HTMLElement;
  /** Group for all labels (shared across layers) */
  labelsGroup: THREE.Group;
}

/**
 * Create the renderer context with all shared resources.
 */
export function createRendererContext(container: HTMLElement): RendererContext {
  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000008);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 0.01);
  camera.lookAt(0, 0, 1);

  // WebGL renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // CSS2D label renderer
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  // Labels group
  const labelsGroup = new THREE.Group();
  scene.add(labelsGroup);

  return {
    scene,
    camera,
    renderer,
    labelRenderer,
    container,
    labelsGroup,
  };
}
