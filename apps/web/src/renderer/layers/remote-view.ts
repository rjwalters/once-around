/**
 * Remote View Layer
 *
 * Displays imagery from remote viewpoints (e.g., Voyager's Pale Blue Dot image).
 * When a remote viewpoint is active, this layer renders a billboard sprite
 * showing what the spacecraft actually photographed.
 */

import * as THREE from "three";
import { SKY_RADIUS } from "../constants";
import { deepFieldVertexShader, deepFieldFragmentShader } from "../shaders";
import { raDecToPosition } from "../utils/coordinates";

export interface RemoteViewpoint {
  x: number;           // Heliocentric X in AU (ecliptic)
  y: number;           // Heliocentric Y in AU (ecliptic)
  z: number;           // Heliocentric Z in AU (ecliptic)
  distanceAU: number;  // Distance from Sun
  // Computed RA/Dec of Sun direction (for camera alignment)
  sunRA?: number;
  sunDec?: number;
}

export interface RemoteViewLayer {
  /** Set the remote viewpoint position */
  setViewpoint(x: number, y: number, z: number, distanceAU: number): void;
  /** Clear the remote viewpoint (return to geocentric) */
  clearViewpoint(): void;
  /** Check if remote viewpoint is active */
  isActive(): boolean;
  /** Update the remote view (position billboard, adjust visibility based on FOV) */
  update(fov: number, canvasHeight: number, camera: THREE.Camera): void;
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
 * Create the remote view layer.
 */
export function createRemoteViewLayer(scene: THREE.Scene): RemoteViewLayer {
  const textureLoader = new THREE.TextureLoader();

  // State
  let viewpoint: RemoteViewpoint | null = null;
  let mesh: THREE.Mesh | null = null;
  let material: THREE.ShaderMaterial | null = null;

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
  }

  function isActive(): boolean {
    return viewpoint !== null;
  }

  function update(fov: number, _canvasHeight: number, camera: THREE.Camera): void {
    if (!viewpoint || !mesh || !material) return;

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
