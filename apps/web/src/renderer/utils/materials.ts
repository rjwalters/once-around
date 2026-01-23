/**
 * Material creation utilities for the renderer.
 *
 * Provides factory functions for commonly used Three.js materials
 * to reduce code duplication across layer files.
 */

import * as THREE from "three";
import { getGlowTexture } from "./textures";
import {
  texturedPlanetVertexShader,
  texturedPlanetFragmentShader,
} from "../shaders";

/**
 * Create a glow sprite material for point-source rendering of celestial objects.
 * Used for stars, planets (when small), satellites, and body dots.
 *
 * @param color - Optional color for the glow (can be set/changed later via material.color)
 * @returns SpriteMaterial configured with glow texture and additive blending
 */
export function createGlowSpriteMaterial(color?: THREE.ColorRepresentation): THREE.SpriteMaterial {
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

  if (color !== undefined) {
    material.color.set(color);
  }

  return material;
}

/**
 * Create a textured planet shader material for bodies with spacecraft imagery.
 * Used for minor bodies (Pluto, Ceres, Vesta) that have detailed surface textures.
 *
 * @param texture - The planet surface texture
 * @param planetId - Unique identifier for the planet (used in shader)
 * @param bodyColor - Fallback color when texture is not visible (RGB values 0-1)
 * @returns ShaderMaterial configured for textured planet rendering with scintillation support
 */
export function createTexturedPlanetMaterial(
  texture: THREE.Texture,
  planetId: number,
  bodyColor: THREE.Vector3
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: texturedPlanetVertexShader,
    fragmentShader: texturedPlanetFragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      planetTexture: { value: texture },
      time: { value: 0.0 },
      zenith: { value: new THREE.Vector3(0, 1, 0) },
      scintillationIntensity: { value: 0.7 },
      scintillationEnabled: { value: false },
      planetId: { value: planetId },
      opacity: { value: 1.0 },
      pixelSize: { value: 100.0 },
      bodyColor: { value: bodyColor },
    },
    transparent: true,
  });
}

/**
 * Load a texture and set its color space to SRGB.
 * Common pattern for loading planet/body textures.
 *
 * @param loader - The texture loader to use
 * @param url - URL of the texture to load
 * @returns Texture configured with SRGB color space
 */
export function loadTextureWithColorSpace(
  loader: THREE.TextureLoader,
  url: string
): THREE.Texture {
  const texture = loader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
