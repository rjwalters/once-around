/**
 * Remote View Layer
 *
 * Displays imagery from remote viewpoints (e.g., Voyager's Pale Blue Dot image).
 * When a remote viewpoint is active, this layer renders a billboard sprite
 * showing what the spacecraft actually photographed, plus colored dots showing
 * accurate positions of celestial bodies as seen from that viewpoint.
 */

import * as THREE from "three";
import { SKY_RADIUS } from "../constants";
import { deepFieldVertexShader, deepFieldFragmentShader } from "../shaders";
import { raDecToPosition } from "../utils/coordinates";
import type { HeliocentricPosition } from "../../spacecraftPositions";

export interface RemoteViewpoint {
  x: number;           // Heliocentric X in AU (ecliptic)
  y: number;           // Heliocentric Y in AU (ecliptic)
  z: number;           // Heliocentric Z in AU (ecliptic)
  distanceAU: number;  // Distance from Sun
  // Computed RA/Dec of Sun direction (for camera alignment)
  sunRA?: number;
  sunDec?: number;
}

/** A body with its position transformed to the remote viewpoint */
interface TransformedBody {
  name: string;
  position: THREE.Vector3;  // On sky sphere
  raDeg: number;
  decDeg: number;
}

/** Colors for body dots when viewed from remote viewpoint */
const BODY_DOT_COLORS: Record<string, number> = {
  'Sun': 0xFFFF88,
  'Mercury': 0xAAAAAA,
  'Venus': 0xFFEECC,
  'Earth': 0x4488FF,  // The pale blue dot!
  'Mars': 0xFF6644,
  'Jupiter': 0xFFCC88,
  'Saturn': 0xFFEE99,
  'Uranus': 0x88FFFF,
  'Neptune': 0x4444FF,
};

/** Base scale for body dots (Sun is larger) */
const BODY_DOT_BASE_SCALE: Record<string, number> = {
  'Sun': 0.8,
  'Mercury': 0.2,
  'Venus': 0.25,
  'Earth': 0.3,
  'Mars': 0.25,
  'Jupiter': 0.5,
  'Saturn': 0.45,
  'Uranus': 0.35,
  'Neptune': 0.35,
};

export interface RemoteViewLayer {
  /** Set the remote viewpoint position */
  setViewpoint(x: number, y: number, z: number, distanceAU: number): void;
  /** Clear the remote viewpoint (return to geocentric) */
  clearViewpoint(): void;
  /** Check if remote viewpoint is active */
  isActive(): boolean;
  /** Update the remote view with heliocentric body positions */
  update(
    fov: number,
    canvasHeight: number,
    camera: THREE.Camera,
    heliocentricBodies?: Map<string, HeliocentricPosition>
  ): void;
  /** Get the current viewpoint (if any) */
  getViewpoint(): RemoteViewpoint | null;
}

/**
 * Convert heliocentric ecliptic direction to equatorial RA/Dec.
 * @param x, y, z - Direction vector in ecliptic coordinates
 * @returns { ra, dec } in degrees
 */
function eclipticDirectionToRaDec(x: number, y: number, z: number): { ra: number; dec: number } {
  // Normalize the direction
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len === 0) return { ra: 0, dec: 0 };
  const dx = x / len;
  const dy = y / len;
  const dz = z / len;

  // Convert from ecliptic to equatorial coordinates
  // Obliquity of the ecliptic (J2000): 23.4393°
  const eps = 23.4393 * Math.PI / 180;
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  // Rotation about X-axis
  const eqX = dx;
  const eqY = dy * cosEps - dz * sinEps;
  const eqZ = dy * sinEps + dz * cosEps;

  // Calculate RA and Dec
  let ra = Math.atan2(eqY, eqX) * 180 / Math.PI;
  if (ra < 0) ra += 360;
  const dec = Math.asin(eqZ) * 180 / Math.PI;

  return { ra, dec };
}

/**
 * Create a glow texture for body dot rendering.
 */
function createGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  // Gaussian-like falloff for natural glow
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.05, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.1, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(0.8, 'rgba(255,255,255,0.02)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Transform heliocentric body positions to sky positions as seen from viewpoint.
 */
function transformBodyPositions(
  heliocentricBodies: Map<string, HeliocentricPosition>,
  viewpoint: RemoteViewpoint
): TransformedBody[] {
  const results: TransformedBody[] = [];

  for (const [name, helioPos] of heliocentricBodies) {
    // Direction from viewpoint to body (in ecliptic coords)
    const dx = helioPos.x - viewpoint.x;
    const dy = helioPos.y - viewpoint.y;
    const dz = helioPos.z - viewpoint.z;

    // Convert to RA/Dec using eclipticDirectionToRaDec()
    const { ra, dec } = eclipticDirectionToRaDec(dx, dy, dz);

    // Position on sky sphere
    const position = raDecToPosition(ra, dec, SKY_RADIUS - 0.5);

    results.push({ name, position, raDeg: ra, decDeg: dec });
  }

  return results;
}

/**
 * Create the remote view layer.
 */
export function createRemoteViewLayer(scene: THREE.Scene): RemoteViewLayer {
  const textureLoader = new THREE.TextureLoader();
  const glowTexture = createGlowTexture();

  // State
  let viewpoint: RemoteViewpoint | null = null;
  let mesh: THREE.Mesh | null = null;
  let material: THREE.ShaderMaterial | null = null;

  // Body dot sprites for transformed celestial bodies
  const bodyDots: Map<string, THREE.Sprite> = new Map();
  const bodyDotMaterials: Map<string, THREE.SpriteMaterial> = new Map();

  // Create sprites for all bodies
  for (const [name, color] of Object.entries(BODY_DOT_COLORS)) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 15; // Render after the Pale Blue Dot image
    sprite.visible = false;
    scene.add(sprite);
    bodyDots.set(name, sprite);
    bodyDotMaterials.set(name, spriteMaterial);
  }

  // Lazy-load the Pale Blue Dot texture when first needed
  function ensureMeshCreated(): void {
    if (mesh) return;

    // Load the Pale Blue Dot image
    const texture = textureLoader.load(
      '/deep-fields/pale-blue-dot.jpg',
      undefined,
      undefined,
      (err) => {
        console.warn('Failed to load Pale Blue Dot image:', err);
      }
    );

    // Configure texture
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;

    // Create a plane geometry
    // Size will be adjusted based on FOV in update()
    const sizeRadians = (30 / 60) * (Math.PI / 180); // ~30 arcmin
    const quadSize = SKY_RADIUS * sizeRadians;
    const geometry = new THREE.PlaneGeometry(quadSize, quadSize);

    // Use the same shader as deep fields for consistent appearance
    material = new THREE.ShaderMaterial({
      vertexShader: deepFieldVertexShader,
      fragmentShader: deepFieldFragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uOpacity: { value: 1.0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10; // Render on top of everything
    mesh.visible = false;

    scene.add(mesh);
  }

  function setViewpoint(x: number, y: number, z: number, distanceAU: number): void {
    // Calculate RA/Dec of the Sun as seen from this position
    // Direction to Sun is opposite of position (Sun is at origin)
    const { ra, dec } = eclipticDirectionToRaDec(-x, -y, -z);

    viewpoint = { x, y, z, distanceAU, sunRA: ra, sunDec: dec };

    console.log(`Remote viewpoint set: position=(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) AU, Sun at RA=${ra.toFixed(1)}°, Dec=${dec.toFixed(1)}°`);

    // Ensure mesh is created
    ensureMeshCreated();

    if (mesh) {
      mesh.visible = true;
    }
  }

  function clearViewpoint(): void {
    viewpoint = null;

    if (mesh) {
      mesh.visible = false;
    }

    // Hide all body dots
    for (const sprite of bodyDots.values()) {
      sprite.visible = false;
    }
  }

  function isActive(): boolean {
    return viewpoint !== null;
  }

  function update(
    fov: number,
    _canvasHeight: number,
    camera: THREE.Camera,
    heliocentricBodies?: Map<string, HeliocentricPosition>
  ): void {
    if (!viewpoint) {
      // Hide all body dots when not active
      for (const sprite of bodyDots.values()) {
        sprite.visible = false;
      }
      return;
    }

    // Update Pale Blue Dot image billboard
    if (mesh && material) {
      // Position the billboard at the Sun's RA/Dec as seen from the viewpoint
      if (viewpoint.sunRA !== undefined && viewpoint.sunDec !== undefined) {
        const position = raDecToPosition(viewpoint.sunRA, viewpoint.sunDec, SKY_RADIUS - 0.5);
        mesh.position.copy(position);
      }

      // Billboard toward camera
      mesh.quaternion.copy(camera.quaternion);

      // Adjust opacity based on FOV
      // The image should be more prominent when zoomed in
      // Fade in: starts visible at FOV 60, fully visible at FOV 30
      const fadeStart = 60;
      const fadeEnd = 20;
      const t = Math.max(0, Math.min(1, (fadeStart - fov) / (fadeStart - fadeEnd)));
      material.uniforms.uOpacity.value = 0.3 + 0.7 * t; // Always at least 30% visible

      // Adjust size based on FOV - larger when zoomed out so it's always visible
      // Base size: ~30 arcmin (half a degree)
      const baseSizeArcmin = 30;
      const sizeMultiplier = Math.max(1, fov / 30); // Scale up when FOV > 30
      const adjustedSizeArcmin = baseSizeArcmin * sizeMultiplier;
      const sizeRadians = (adjustedSizeArcmin / 60) * (Math.PI / 180);
      const quadSize = SKY_RADIUS * sizeRadians;

      // Update geometry if needed (only if significantly different)
      const currentSize = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
      if (Math.abs(currentSize - quadSize) / currentSize > 0.1) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(quadSize, quadSize);
      }
    }

    // Update body dots with transformed positions
    if (heliocentricBodies && heliocentricBodies.size > 0) {
      const transformed = transformBodyPositions(heliocentricBodies, viewpoint);

      // Update each body dot
      for (const body of transformed) {
        const sprite = bodyDots.get(body.name);
        if (sprite) {
          sprite.position.copy(body.position);

          // Scale based on FOV and body type
          const baseScale = BODY_DOT_BASE_SCALE[body.name] ?? 0.3;
          // At FOV 60, use base scale; scale up when zoomed in
          const scaleFactor = baseScale * (60 / fov);
          // Convert to world units (similar to star sprites)
          const worldSize = scaleFactor * SKY_RADIUS * 0.02;
          sprite.scale.set(worldSize, worldSize, 1);

          sprite.visible = true;
        }
      }

      // Hide any body dots that weren't in the transformed list
      for (const [name, sprite] of bodyDots) {
        if (!heliocentricBodies.has(name)) {
          sprite.visible = false;
        }
      }
    } else {
      // No heliocentric data - hide all body dots
      for (const sprite of bodyDots.values()) {
        sprite.visible = false;
      }
    }
  }

  function getViewpoint(): RemoteViewpoint | null {
    return viewpoint;
  }

  return {
    setViewpoint,
    clearViewpoint,
    isActive,
    update,
    getViewpoint,
  };
}
