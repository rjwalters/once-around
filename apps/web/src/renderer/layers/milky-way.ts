/**
 * Milky Way Layer
 *
 * The Milky Way is a static background feature for a given limiting magnitude.
 * Rather than evaluating the expensive procedural FBM shader (~72 hash
 * evaluations per pixel) every frame, we bake the shader once into an
 * equirectangular RGBA texture and display it on a textured sphere. The bake is
 * re-run only when the limiting magnitude changes (slider events), not per
 * frame — turning a heavy fragment pass into a single texture sample.
 */

import * as THREE from "three";
import { MILKY_WAY_RADIUS } from "../constants";
import {
  milkyWayBakeVertexShader,
  milkyWayBakeFragmentShader,
  milkyWayDisplayVertexShader,
  milkyWayDisplayFragmentShader,
} from "../shaders";

// Equirectangular bake resolution. 2048x1024 avoids visible banding for this
// soft cloud feature; the Milky Way band sits near the galactic equator so
// equirect pole distortion is benign.
const BAKE_WIDTH = 2048;
const BAKE_HEIGHT = 1024;

// Default limiting magnitude used for the initial bake at construction.
const DEFAULT_LIMITING_MAG = 6.0;

// Below this magnitude the sky is too bright for any Milky Way visibility; the
// mesh is hidden and the bake pass is skipped entirely.
const MIN_VISIBLE_MAG = 4.0;

export interface MilkyWayLayer {
  /** The milky way mesh */
  mesh: THREE.Mesh;
  /** Update visibility based on limiting magnitude (re-bakes the texture) */
  setVisibility(limitingMagnitude: number): void;
  /** Release GPU resources (render target, geometries, materials) */
  dispose(): void;
}

/**
 * Create the Milky Way layer.
 * @param scene - The Three.js scene to add the mesh to
 * @param renderer - The WebGL renderer used to bake the equirect texture
 * @returns MilkyWayLayer interface
 */
export function createMilkyWayLayer(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): MilkyWayLayer {
  // Render target holding the baked equirect texture. Linear filtering avoids
  // banding; no mipmaps are needed for a full-screen background sphere. The
  // texture keeps its default NoColorSpace: the bake shader writes raw,
  // un-encoded RGBA (RGBA8) and the custom display shader below samples and
  // writes it straight to the canvas without any sRGB OETF. This reproduces the
  // original custom ShaderMaterial's raw passthrough — the old Milky Way applied
  // zero color-space encodes, so neither does this path.
  const renderTarget = new THREE.WebGLRenderTarget(BAKE_WIDTH, BAKE_HEIGHT, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // Detached scene + camera for the bake pass. The bake material renders a
  // fullscreen NDC quad, so the camera is unused (the vertex shader writes clip
  // space directly), but render() requires one.
  const bakeScene = new THREE.Scene();
  const bakeCamera = new THREE.Camera();
  const bakeMaterial = new THREE.ShaderMaterial({
    vertexShader: milkyWayBakeVertexShader,
    fragmentShader: milkyWayBakeFragmentShader,
    // NoBlending: write the shader's straight-alpha RGBA directly into the
    // render target so the display sphere can alpha-blend it identically to the
    // original ShaderMaterial (transparent + NormalBlending).
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uLimitingMag: { value: DEFAULT_LIMITING_MAG },
    },
  });
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMaterial);
  bakeQuad.frustumCulled = false;
  bakeScene.add(bakeQuad);

  // Display sphere textured with the baked equirect. A custom ShaderMaterial
  // (rather than MeshBasicMaterial) samples the straight-alpha RGBA and writes
  // it raw to gl_FragColor with no colorspace_fragment, so no sRGB encode is
  // added — matching the original direct-render output exactly. transparent +
  // default NormalBlending reproduces the original blend mode.
  const geometry = new THREE.SphereGeometry(MILKY_WAY_RADIUS, 64, 32);
  const material = new THREE.ShaderMaterial({
    vertexShader: milkyWayDisplayVertexShader,
    fragmentShader: milkyWayDisplayFragmentShader,
    uniforms: {
      uBakedTexture: { value: renderTarget.texture },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  /**
   * Render the procedural shader into the equirect render target for the given
   * limiting magnitude. Runs through the shared renderer, saving/restoring the
   * active render target so the main render loop is unaffected.
   */
  function bake(limitingMagnitude: number): void {
    bakeMaterial.uniforms.uLimitingMag.value = limitingMagnitude;

    const prevTarget = renderer.getRenderTarget();
    // setRenderTarget(target) sets the viewport to the target's size and
    // setRenderTarget(prevTarget) restores it, so the canvas viewport is
    // preserved. autoClear (default true) clears the target before drawing; the
    // fullscreen quad then covers every texel, so the clear value is irrelevant.
    renderer.setRenderTarget(renderTarget);
    renderer.render(bakeScene, bakeCamera);
    renderer.setRenderTarget(prevTarget);
  }

  // Bake once at construction with the default limiting magnitude.
  bake(DEFAULT_LIMITING_MAG);

  function setVisibility(limitingMagnitude: number): void {
    if (limitingMagnitude < MIN_VISIBLE_MAG) {
      // Nothing is visible below this threshold: hide the mesh and skip the
      // bake pass entirely (avoids a wasted full-screen clear/render).
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    bake(limitingMagnitude);
  }

  function dispose(): void {
    renderTarget.dispose();
    bakeMaterial.dispose();
    bakeQuad.geometry.dispose();
    geometry.dispose();
    material.dispose();
  }

  return {
    mesh,
    setVisibility,
    dispose,
  };
}
