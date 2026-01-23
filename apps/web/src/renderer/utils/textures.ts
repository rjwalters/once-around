/**
 * Texture Utilities
 *
 * Shared texture creation functions with caching to avoid redundant allocations.
 */

import * as THREE from "three";

// Cached glow texture (shared across all layers that need it)
let cachedGlowTexture: THREE.Texture | null = null;

/**
 * Create a radial glow texture for bright object rendering (stars, planets, etc.).
 * Uses a Gaussian-like falloff for a natural glow appearance.
 *
 * The texture is cached and shared across all callers to avoid redundant
 * canvas/texture allocations.
 *
 * @param size - Texture size in pixels (default 128)
 * @returns Cached THREE.Texture with radial glow
 */
export function getGlowTexture(size = 128): THREE.Texture {
  if (cachedGlowTexture) {
    return cachedGlowTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Create radial gradient with soft falloff
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  // Bright core with soft gaussian-like falloff
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.05, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.1, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.2)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.08)");
  gradient.addColorStop(0.8, "rgba(255,255,255,0.02)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  cachedGlowTexture = texture;
  return texture;
}
