/**
 * Eclipse Layer
 *
 * Renders the solar corona during total solar eclipses.
 */

import * as THREE from "three";
import { coronaVertexShader, coronaFragmentShader } from "../shaders";

// Eclipse thresholds in degrees
// Note: The Moon ephemeris has ~1° error, so we use larger thresholds
const ECLIPSE_FULL_VISIBILITY_THRESHOLD = 1.5;
const ECLIPSE_FADE_START_THRESHOLD = 3.0;

export interface EclipseLayer {
  /** The corona mesh */
  mesh: THREE.Mesh;
  /** Update eclipse rendering based on Sun-Moon separation */
  update(sunMoonSeparationDeg: number, sunMesh: THREE.Mesh, camera: THREE.Camera): void;
  /** Update corona animation time (call in render loop) */
  updateTime(): void;
  /**
   * Whether the corona is currently rendered. When true its shader advances a
   * time uniform every frame, so the render loop must keep rendering.
   */
  isCoronaActive(): boolean;
}

/**
 * Create the eclipse/corona layer.
 * @param scene - The Three.js scene to add the mesh to
 * @returns EclipseLayer interface
 */
export function createEclipseLayer(scene: THREE.Scene): EclipseLayer {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: coronaVertexShader,
    fragmentShader: coronaFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false; // Hidden until eclipse
  scene.add(mesh);

  let coronaTime = 0;
  let lastTimeStamp = performance.now();

  function update(sunMoonSeparationDeg: number, sunMesh: THREE.Mesh, camera: THREE.Camera): void {
    // Calculate corona intensity based on separation
    let intensity = 0;

    if (sunMoonSeparationDeg < ECLIPSE_FULL_VISIBILITY_THRESHOLD) {
      // Full totality - maximum corona
      intensity = 1.0;
    } else if (sunMoonSeparationDeg < ECLIPSE_FADE_START_THRESHOLD) {
      // Partial - fade corona in/out
      intensity = 1.0 - (sunMoonSeparationDeg - ECLIPSE_FULL_VISIBILITY_THRESHOLD) /
        (ECLIPSE_FADE_START_THRESHOLD - ECLIPSE_FULL_VISIBILITY_THRESHOLD);
      intensity = Math.max(0, Math.min(1, intensity));
    }

    // Update corona visibility and intensity
    material.uniforms.uIntensity.value = intensity;
    mesh.visible = intensity > 0.01;

    // Position corona at Sun location, facing camera
    if (mesh.visible) {
      // Copy Sun position
      mesh.position.copy(sunMesh.position);

      // Make corona face the camera (billboard)
      mesh.lookAt(camera.position);

      // Scale corona to be larger than the Sun (4x radius = 8x plane)
      const coronaScale = sunMesh.scale.x * 8;
      mesh.scale.setScalar(coronaScale);
    }
  }

  function updateTime(): void {
    // Advance corona animation using real elapsed time so the animation speed
    // is refresh-rate independent (previously hardcoded ~60 fps as 0.016 s).
    const now = performance.now();
    // Clamp dt to avoid a large jump after the tab was backgrounded/throttled.
    const dt = Math.min(0.1, Math.max(0, (now - lastTimeStamp) / 1000));
    lastTimeStamp = now;

    // Skip the uniform write entirely when the corona is not being rendered.
    if (!mesh.visible) return;

    coronaTime += dt;
    material.uniforms.uTime.value = coronaTime;
  }

  function isCoronaActive(): boolean {
    return mesh.visible;
  }

  return {
    mesh,
    update,
    updateTime,
    isCoronaActive,
  };
}
