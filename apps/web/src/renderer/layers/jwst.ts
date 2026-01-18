/**
 * JWST Layer
 *
 * Renders the view from James Webb Space Telescope at L2 Lagrange point.
 * From L2 (~1.5 million km from Earth), Earth appears as a distant planet-like
 * object in the same direction as the Sun. This layer renders Earth with the
 * same sprite-to-textured-disk LOD transition used for planets.
 *
 * Key L2 characteristics:
 * - Earth angular diameter: ~0.5° (similar to Sun/Moon from Earth)
 * - Sun, Earth, and Moon cluster in same direction (blocked by sunshield)
 * - JWST always points away from this cluster
 * - Sun avoidance zone: ~45° half-angle cone that JWST cannot point toward
 */

import * as THREE from "three";
import { SKY_RADIUS } from "../constants";
import {
  earthVertexShader,
  earthFragmentShader,
} from "../shaders";

// L2 distance from Earth in km
const L2_DISTANCE_KM = 1_500_000;

// Earth's diameter in km
const EARTH_DIAMETER_KM = 12_742;

// Earth's angular diameter from L2 in radians
// arctan(diameter / distance) ≈ diameter / distance for small angles
const EARTH_ANGULAR_DIAMETER_RAD = EARTH_DIAMETER_KM / L2_DISTANCE_KM;

// LOD thresholds (matching bodies layer)
const LOD_POINT_SOURCE_MAX_PX = 3;
const LOD_SIMPLE_DISK_MAX_PX = 10;
const LOD_BLEND_DISK_MAX_PX = 30;

// Earth color for sprite/simple disk rendering (blue marble)
const EARTH_COLOR = new THREE.Color(0.2, 0.4, 0.8);

// JWST sun avoidance zone: field of regard is 85°-135° from Sun
// This means a ~45° half-angle exclusion cone around the Sun
const SUN_AVOIDANCE_HALF_ANGLE_DEG = 45;
const SUN_AVOIDANCE_HALF_ANGLE_RAD = (SUN_AVOIDANCE_HALF_ANGLE_DEG * Math.PI) / 180;

// Sun avoidance zone shader
const sunAvoidanceVertexShader = `
varying vec3 vPosition;
varying vec3 vNormal;

void main() {
  vPosition = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const sunAvoidanceFragmentShader = `
uniform vec3 uSunDirection;
uniform float uHalfAngle;

varying vec3 vPosition;
varying vec3 vNormal;

void main() {
  // Calculate angle from sun direction
  vec3 viewDir = normalize(vPosition);
  float cosAngle = dot(viewDir, uSunDirection);
  float angle = acos(clamp(cosAngle, -1.0, 1.0));

  // Only show within the avoidance zone
  if (angle > uHalfAngle) {
    discard;
  }

  // Gradient from center (more opaque) to edge (transparent)
  float t = angle / uHalfAngle;
  float alpha = (1.0 - t * t) * 0.25; // Quadratic falloff, max 25% opacity

  // Warning red/orange color
  vec3 color = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.6, 0.2), t);

  gl_FragColor = vec4(color, alpha);
}
`;

export interface JWSTLayer {
  /** Set visibility of the JWST layer */
  setVisible(visible: boolean): void;
  /** Check if JWST layer is visible */
  isVisible(): boolean;
  /** Update layer based on current FOV and sun position */
  update(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, currentDate: Date): void;
  /** Get Earth's current position as a unit vector (for search) */
  getEarthPosition(): THREE.Vector3 | null;
}

/**
 * Smoothstep interpolation for smooth LOD transitions.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Create a glow texture for point source rendering.
 */
function createGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  // Gaussian-like falloff for natural glow
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.05, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.1, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.2, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.2)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.05)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Create the JWST layer.
 * @param scene - The Three.js scene to add objects to
 * @returns JWSTLayer interface
 */
export function createJWSTLayer(scene: THREE.Scene): JWSTLayer {
  let visible = false;

  // Group for all JWST-specific objects
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Load Earth textures (same as Earth layer for Hubble mode)
  const textureLoader = new THREE.TextureLoader();
  const dayTexture = textureLoader.load("/earth-day.jpg");
  const nightTexture = textureLoader.load("/earth-night.jpg");
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;

  // Create Earth sphere mesh for detailed view
  const earthGeometry = new THREE.SphereGeometry(1, 64, 32);
  const earthMaterial = new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    transparent: true,
  });
  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  earthMesh.visible = false;
  group.add(earthMesh);

  // Create Earth sprite for point source view
  const glowTexture = createGlowTexture();
  const earthSpriteMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: EARTH_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const earthSprite = new THREE.Sprite(earthSpriteMaterial);
  earthSprite.renderOrder = 10;
  group.add(earthSprite);

  // Simple disk material for intermediate LOD (solid color with opacity)
  const simpleDiskGeometry = new THREE.CircleGeometry(1, 32);
  const simpleDiskMaterial = new THREE.MeshBasicMaterial({
    color: EARTH_COLOR,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const simpleDisk = new THREE.Mesh(simpleDiskGeometry, simpleDiskMaterial);
  simpleDisk.visible = false;
  simpleDisk.renderOrder = 5;
  group.add(simpleDisk);

  // Sun avoidance zone - a sphere with shader that only renders within the cone
  const avoidanceGeometry = new THREE.SphereGeometry(SKY_RADIUS - 2, 64, 32);
  const avoidanceMaterial = new THREE.ShaderMaterial({
    vertexShader: sunAvoidanceVertexShader,
    fragmentShader: sunAvoidanceFragmentShader,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uHalfAngle: { value: SUN_AVOIDANCE_HALF_ANGLE_RAD },
    },
    transparent: true,
    side: THREE.BackSide, // Render inside of sphere
    depthTest: false,
    depthWrite: false,
  });
  const avoidanceZone = new THREE.Mesh(avoidanceGeometry, avoidanceMaterial);
  avoidanceZone.renderOrder = -1; // Render behind everything
  group.add(avoidanceZone);

  /**
   * Calculate Earth's position from JWST at L2.
   * From L2, Earth is in the direction toward the Sun (between L2 and Sun).
   */
  function getEarthPosition(sunPosition: THREE.Vector3): THREE.Vector3 {
    // Earth is in the same direction as the Sun from L2 (but much closer)
    // We place it on the sky sphere in the Sun's direction
    const earthDir = sunPosition.clone().normalize();
    return earthDir.multiplyScalar(SKY_RADIUS - 1);
  }

  /**
   * Calculate sun direction for Earth's day/night terminator.
   * From L2's perspective looking at Earth, the Sun is behind Earth.
   */
  function getSunDirectionForEarth(earthPos: THREE.Vector3): THREE.Vector3 {
    // Sun is behind Earth from L2's view, so sun direction is away from camera
    return earthPos.clone().normalize();
  }

  function update(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, currentDate: Date): void {
    if (!visible) return;

    // Update sun avoidance zone direction
    const sunDir = sunPosition.clone().normalize();
    avoidanceMaterial.uniforms.uSunDirection.value.copy(sunDir);

    // Calculate Earth position (toward Sun from L2)
    const earthPos = getEarthPosition(sunPosition);

    // Calculate apparent size in pixels
    const angDiamArcsec = EARTH_ANGULAR_DIAMETER_RAD * (180 / Math.PI) * 3600;
    const fovArcsec = fov * 3600;
    const pixelSize = (angDiamArcsec / fovArcsec) * canvasHeight;

    // LOD transition factors
    const diskBlend = smoothstep(LOD_POINT_SOURCE_MAX_PX, LOD_SIMPLE_DISK_MAX_PX, pixelSize);
    const textureBlend = smoothstep(LOD_SIMPLE_DISK_MAX_PX, LOD_BLEND_DISK_MAX_PX, pixelSize);

    // Calculate world scale for sphere (angular diameter to world units)
    const worldScale = (EARTH_ANGULAR_DIAMETER_RAD * SKY_RADIUS) / 2;

    // Update sun direction for Earth shader
    const earthSunDir = getSunDirectionForEarth(earthPos);
    earthMaterial.uniforms.sunDirection.value.copy(earthSunDir);

    // --- Full textured Earth (high LOD) ---
    if (pixelSize >= LOD_SIMPLE_DISK_MAX_PX) {
      earthMesh.position.copy(earthPos);
      earthMesh.scale.setScalar(worldScale);
      earthMesh.visible = true;

      // Rotate Earth based on time (sidereal rotation)
      // Earth rotates 360° per sidereal day (~23h 56m)
      const msPerSiderealDay = 86164090.5;
      const rotationAngle = ((currentDate.getTime() % msPerSiderealDay) / msPerSiderealDay) * Math.PI * 2;
      earthMesh.rotation.y = rotationAngle;

      // Billboard the mesh to face the camera (approximate)
      earthMesh.lookAt(0, 0, 0);
      earthMesh.rotateY(rotationAngle);

      // Fade in based on LOD
      (earthMaterial as THREE.ShaderMaterial).transparent = true;
      (earthMaterial as THREE.ShaderMaterial).opacity = textureBlend;
    } else {
      earthMesh.visible = false;
    }

    // --- Simple disk (medium LOD) ---
    if (pixelSize >= LOD_POINT_SOURCE_MAX_PX && pixelSize < LOD_BLEND_DISK_MAX_PX) {
      simpleDisk.position.copy(earthPos);
      simpleDisk.scale.setScalar(worldScale);
      simpleDisk.visible = true;
      simpleDisk.lookAt(0, 0, 0);

      // Fade based on LOD transitions
      const opacity = diskBlend * (1 - textureBlend);
      simpleDiskMaterial.opacity = opacity;
    } else {
      simpleDisk.visible = false;
    }

    // --- Point source sprite (low LOD) ---
    if (pixelSize < LOD_SIMPLE_DISK_MAX_PX) {
      earthSprite.position.copy(earthPos);

      // Keep sprite at minimum visible size
      const minSizePx = 4;
      const spriteAngularSize = (minSizePx / canvasHeight) * fov * (Math.PI / 180);
      const spriteScale = spriteAngularSize * SKY_RADIUS * 2;
      earthSprite.scale.set(spriteScale, spriteScale, 1);

      earthSprite.visible = true;
      earthSpriteMaterial.opacity = 1 - diskBlend;
    } else {
      earthSprite.visible = false;
    }
  }

  function setVisible(isVisible: boolean): void {
    visible = isVisible;
    group.visible = isVisible;
    if (!isVisible) {
      earthMesh.visible = false;
      earthSprite.visible = false;
      simpleDisk.visible = false;
    }
  }

  function isVisibleFn(): boolean {
    return visible;
  }

  // Track last computed Earth position for search
  let lastEarthPosition: THREE.Vector3 | null = null;

  // Wrap update to track Earth position
  const originalUpdate = update;
  function wrappedUpdate(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, currentDate: Date): void {
    originalUpdate(fov, canvasHeight, sunPosition, currentDate);
    // Store Earth position (normalized direction on sky sphere)
    if (visible) {
      lastEarthPosition = sunPosition.clone().normalize();
    }
  }

  function getEarthPositionFn(): THREE.Vector3 | null {
    if (!visible) return null;
    return lastEarthPosition;
  }

  return {
    setVisible,
    isVisible: isVisibleFn,
    update: wrappedUpdate,
    getEarthPosition: getEarthPositionFn,
  };
}
