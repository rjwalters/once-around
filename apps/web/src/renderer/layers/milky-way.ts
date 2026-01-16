/**
 * Milky Way Layer
 *
 * Procedurally rendered Milky Way background using a shader.
 */

import * as THREE from "three";
import { MILKY_WAY_RADIUS } from "../constants";
import { milkyWayVertexShader, milkyWayFragmentShader } from "../shaders";

export interface MilkyWayLayer {
  /** The milky way mesh */
  mesh: THREE.Mesh;
  /** Update visibility based on limiting magnitude */
  setVisibility(limitingMagnitude: number): void;
}

/**
 * Create the Milky Way layer.
 * @param scene - The Three.js scene to add the mesh to
 * @returns MilkyWayLayer interface
 */
export function createMilkyWayLayer(scene: THREE.Scene): MilkyWayLayer {
  const geometry = new THREE.SphereGeometry(MILKY_WAY_RADIUS, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader: milkyWayVertexShader,
    fragmentShader: milkyWayFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLimitingMag: { value: 6.0 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  function setVisibility(limitingMagnitude: number): void {
    material.uniforms.uLimitingMag.value = limitingMagnitude;
  }

  return {
    mesh,
    setVisibility,
  };
}
