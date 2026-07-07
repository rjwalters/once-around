/**
 * Deep Fields Layer
 *
 * Renders NASA deep field images (Hubble, JWST) at their precise celestial coordinates.
 * Images fade in when zoomed in sufficiently to show meaningful detail.
 */

import * as THREE from "three";
import { DEEP_FIELD_DATA, type DeepField } from "../../deepFieldData";
import { SKY_RADIUS, DEEP_FIELD_FADE_START_PX, DEEP_FIELD_FADE_END_PX } from "../constants";
import { deepFieldVertexShader, deepFieldFragmentShader } from "../shaders";
import { raDecToPosition } from "../utils/coordinates";
import { smoothstep } from "../utils/math";

interface DeepFieldMesh {
  field: DeepField;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export interface DeepFieldsLayer {
  /** Update deep field visibility based on FOV */
  update(fov: number, canvasHeight: number, camera: THREE.Camera): void;
  /** Set whether deep fields are visible */
  setVisible(visible: boolean): void;
  /** Check if deep fields are enabled */
  isVisible(): boolean;
}

/**
 * Calculate the apparent size of a deep field in pixels.
 * @param sizeArcmin - Angular size in arcminutes
 * @param fovDegrees - Current field of view in degrees
 * @param canvasHeight - Canvas height in pixels
 * @returns Size in pixels
 */
function calculateSizePixels(sizeArcmin: number, fovDegrees: number, canvasHeight: number): number {
  // Convert arcminutes to degrees
  const sizeDegrees = sizeArcmin / 60;
  // Calculate what fraction of the FOV this object subtends
  const fractionOfFov = sizeDegrees / fovDegrees;
  // Convert to pixels
  return fractionOfFov * canvasHeight;
}

/**
 * Create the deep fields layer.
 *
 * The ~18 MB of deep-field / Messier textures are NOT loaded at construction.
 * The layer starts hidden (checkbox defaults off), so the meshes, materials, and
 * textures are only created on the first `setVisible(true)` — i.e. when the user
 * toggles deep fields on. This keeps the textures off the startup critical path.
 *
 * @param scene - The Three.js scene to add meshes to
 * @param onTextureLoad - Called when a deep-field texture finishes loading, so a
 *   render-on-demand scene repaints the newly-arrived image on an otherwise
 *   static frame (PR #31).
 * @returns DeepFieldsLayer interface
 */
export function createDeepFieldsLayer(
  scene: THREE.Scene,
  onTextureLoad?: () => void
): DeepFieldsLayer {
  const textureLoader = new THREE.TextureLoader();
  const deepFieldMeshes: DeepFieldMesh[] = [];

  // Track visibility state
  let visible = true;

  // Cache the last fov/canvasHeight used to size deep fields. The per-mesh
  // opacity only depends on these two values, so when neither changes we can
  // skip recomputing 30 uniform sizes and only refresh the billboard rotation.
  let lastFov = NaN;
  let lastCanvasHeight = NaN;

  // Lazy-load guard. The mesh/material/texture creation below defers until the
  // layer is first shown (issue #5).
  let texturesLoaded = false;

  /**
   * Build the deep-field meshes and kick off their texture loads. Runs once, on
   * the first activation of the layer. Idempotent.
   */
  function ensureTexturesLoaded(): void {
    if (texturesLoaded) return;
    texturesLoaded = true;

    // Create a mesh for each deep field
    for (const field of DEEP_FIELD_DATA) {
      // Calculate the world-space size of the quad
      // The quad needs to subtend the correct angular size on the sky sphere
      // Angular size in radians = sizeArcmin / 60 * PI / 180
      const sizeRadians = (field.sizeArcmin / 60) * (Math.PI / 180);

      // The chord length for this angular size at SKY_RADIUS
      // For small angles: chord ≈ 2 * r * sin(θ/2) ≈ r * θ
      const quadSize = SKY_RADIUS * sizeRadians;

      // Create plane geometry - sized to match angular extent on sky
      const geometry = new THREE.PlaneGeometry(quadSize, quadSize);

      // Load texture (with error handling for missing textures). The onLoad
      // callback requests a render so the image appears on the current static
      // frame instead of waiting for the next user interaction.
      const texture = textureLoader.load(
        field.textureUrl,
        () => onTextureLoad?.(),
        undefined,
        () => {
          // Texture failed to load - create a placeholder
          console.warn(`Deep field texture not found: ${field.textureUrl}`);
        }
      );

      // Configure texture for best quality
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 4;

      // Create shader material
      const material = new THREE.ShaderMaterial({
        vertexShader: deepFieldVertexShader,
        fragmentShader: deepFieldFragmentShader,
        uniforms: {
          uTexture: { value: texture },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 6; // Render on top of DSO ellipses (renderOrder 5)

      // Position on the sky sphere (slightly in front to prevent z-fighting with stars)
      const pos = raDecToPosition(field.ra, field.dec, SKY_RADIUS - 0.5);
      mesh.position.copy(pos);

      // Apply rotation angle if specified
      if (field.rotationAngle !== 0) {
        mesh.rotation.z = (field.rotationAngle * Math.PI) / 180;
      }

      // Initially hidden
      mesh.visible = false;

      scene.add(mesh);

      deepFieldMeshes.push({
        field,
        mesh,
        material,
      });
    }
  }

  function update(fov: number, canvasHeight: number, camera: THREE.Camera): void {
    if (!visible) {
      // Hide all meshes when layer is disabled
      for (const dfm of deepFieldMeshes) {
        dfm.mesh.visible = false;
      }
      return;
    }

    // Opacity/visibility only depend on fov and canvasHeight. When neither has
    // changed, skip the 30 size/opacity recomputations and only refresh the
    // billboard orientation of already-visible meshes.
    const dimensionsChanged = fov !== lastFov || canvasHeight !== lastCanvasHeight;
    if (dimensionsChanged) {
      lastFov = fov;
      lastCanvasHeight = canvasHeight;
    }

    for (const dfm of deepFieldMeshes) {
      if (dimensionsChanged) {
        // Calculate apparent size in pixels
        const sizePixels = calculateSizePixels(dfm.field.sizeArcmin, fov, canvasHeight);

        // Calculate opacity based on size thresholds
        const opacity = smoothstep(DEEP_FIELD_FADE_START_PX, DEEP_FIELD_FADE_END_PX, sizePixels);

        // Update material opacity
        dfm.material.uniforms.uOpacity.value = opacity;

        // Show/hide mesh based on opacity
        dfm.mesh.visible = opacity > 0.01;
      }

      if (dfm.mesh.visible) {
        // Billboard toward camera - copy camera orientation so plane faces viewer
        dfm.mesh.quaternion.copy(camera.quaternion);
      }
    }
  }

  function setVisible(isVisible: boolean): void {
    visible = isVisible;
    // Build the meshes + load textures on the first activation (issue #5).
    if (isVisible) {
      ensureTexturesLoaded();
    }
    // Force the next update() to recompute opacity/visibility regardless of
    // whether fov/canvasHeight changed while the layer was toggled.
    lastFov = NaN;
    if (!isVisible) {
      for (const dfm of deepFieldMeshes) {
        dfm.mesh.visible = false;
      }
    }
  }

  function isVisibleFn(): boolean {
    return visible;
  }

  return {
    update,
    setVisible,
    isVisible: isVisibleFn,
  };
}
