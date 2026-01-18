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
 *
 * Rendering from L2:
 * - Earth: Night side visible with city lights + bright atmospheric limb glow
 * - Moon: Primarily earthshine illumination (bluish) + thin sun crescent
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SKY_RADIUS } from "../constants";
import {
  jwstEarthVertexShader,
  jwstEarthFragmentShader,
  jwstMoonVertexShader,
  jwstMoonFragmentShader,
} from "../shaders";

// L2 distance from Earth in km
const L2_DISTANCE_KM = 1_500_000;

// Moon's orbital radius in km
const MOON_ORBITAL_RADIUS_KM = 384_400;

// Moon's angular diameter from L2 (about 0.1° - much smaller than from Earth)
// Moon diameter: 3,474 km, distance from L2: ~1.5M km + orbital offset
const MOON_ANGULAR_DIAMETER_RAD = 3_474 / (L2_DISTANCE_KM + MOON_ORBITAL_RADIUS_KM);

// Maximum angular separation of Moon from Earth as seen from L2
const MOON_MAX_SEPARATION_RAD = Math.atan(MOON_ORBITAL_RADIUS_KM / L2_DISTANCE_KM); // ~14.4°

// Earth's diameter in km
const EARTH_DIAMETER_KM = 12_742;

// Sun's diameter in km
const SUN_DIAMETER_KM = 1_392_700;

// Distance from L2 to Sun in km (Earth-Sun distance + L2 distance from Earth)
const L2_TO_SUN_DISTANCE_KM = 149_597_870 + L2_DISTANCE_KM;

// Angular diameters from L2 in radians
const EARTH_ANGULAR_DIAMETER_RAD = EARTH_DIAMETER_KM / L2_DISTANCE_KM; // ~0.49°
const SUN_ANGULAR_DIAMETER_RAD = SUN_DIAMETER_KM / L2_TO_SUN_DISTANCE_KM; // ~0.53°

// LOD threshold - below this pixel size, show as point source
const LOD_POINT_SOURCE_MAX_PX = 4;

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
  /** Update layer based on current FOV, sun position, and moon position */
  update(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, moonPosition: THREE.Vector3, currentDate: Date): void;
  /** Get Earth's current position as a unit vector (for search) */
  getEarthPosition(): THREE.Vector3 | null;
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

  // Load textures
  const textureLoader = new THREE.TextureLoader();
  const earthNightTexture = textureLoader.load("/earth-night.jpg");
  earthNightTexture.colorSpace = THREE.SRGBColorSpace;

  // Earth sphere with JWST-specific shader (night side + limb glow)
  const earthGeometry = new THREE.SphereGeometry(1, 48, 48);
  const earthMaterial = new THREE.ShaderMaterial({
    vertexShader: jwstEarthVertexShader,
    fragmentShader: jwstEarthFragmentShader,
    uniforms: {
      nightTexture: { value: earthNightTexture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      pixelSize: { value: 100.0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const earthSphere = new THREE.Mesh(earthGeometry, earthMaterial);
  earthSphere.renderOrder = 50;
  group.add(earthSphere);

  // Small point sprite for when Earth is too small to see as a sphere
  const earthSpriteMaterial = new THREE.SpriteMaterial({
    color: 0x203060, // Dark blue with hint of city lights
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const earthSprite = new THREE.Sprite(earthSpriteMaterial);
  earthSprite.renderOrder = 50;
  group.add(earthSprite);

  // Moon sphere with JWST-specific shader (earthshine + crescent)
  const moonGeometry = new THREE.SphereGeometry(1, 32, 32);
  const moonMaterial = new THREE.ShaderMaterial({
    vertexShader: jwstMoonVertexShader,
    fragmentShader: jwstMoonFragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      earthDirection: { value: new THREE.Vector3(1, 0, 0) },
      earthPhase: { value: 0.5 },
      moonColor: { value: new THREE.Vector3(0.9, 0.9, 0.85) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const moonSphere = new THREE.Mesh(moonGeometry, moonMaterial);
  moonSphere.renderOrder = 51;
  group.add(moonSphere);

  // Moon sprite for when too small
  const moonSpriteMaterial = new THREE.SpriteMaterial({
    color: 0x444455, // Dark gray with slight blue (earthshine hint)
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const moonSprite = new THREE.Sprite(moonSpriteMaterial);
  moonSprite.renderOrder = 51;
  group.add(moonSprite);

  // Moon label
  const moonLabelDiv = document.createElement('div');
  moonLabelDiv.className = 'body-label moon-label';
  moonLabelDiv.textContent = 'Moon';
  moonLabelDiv.style.color = '#aaaaaa';
  moonLabelDiv.style.fontSize = '11px';
  moonLabelDiv.style.pointerEvents = 'none';
  const moonLabel = new CSS2DObject(moonLabelDiv);
  moonLabel.layers.set(0);
  group.add(moonLabel);

  // Earth label
  const earthLabelDiv = document.createElement('div');
  earthLabelDiv.className = 'body-label earth-label';
  earthLabelDiv.textContent = 'Earth';
  earthLabelDiv.style.color = '#6699cc';
  earthLabelDiv.style.fontSize = '11px';
  earthLabelDiv.style.pointerEvents = 'none';
  const earthLabel = new CSS2DObject(earthLabelDiv);
  earthLabel.layers.set(0);
  group.add(earthLabel);

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
   * Calculate Earth's phase as seen from the Moon.
   * This determines earthshine brightness.
   * Returns 0 (new Earth from Moon = full moon from Earth) to 1 (full Earth from Moon = new moon from Earth)
   */
  function calculateEarthPhase(sunDir: THREE.Vector3, moonDir: THREE.Vector3): number {
    // The angle between Sun and Moon as seen from Earth determines the Moon's phase
    // From the Moon's perspective, when Sun-Earth-Moon angle is 0° (new moon), Earth appears full
    // When angle is 180° (full moon), Earth appears new
    const dotProduct = sunDir.dot(moonDir);
    // Convert from cosine of angle to phase (0 = new Earth, 1 = full Earth)
    // At new moon (dotProduct ≈ 1, same direction), Earth appears full
    // At full moon (dotProduct ≈ -1, opposite), Earth appears new
    const earthPhase = (dotProduct + 1) / 2; // Map [-1, 1] to [0, 1]
    return earthPhase;
  }

  function update(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, moonPosition: THREE.Vector3, _currentDate: Date): void {
    if (!visible) return;

    // Update sun avoidance zone direction
    const sunDir = sunPosition.clone().normalize();
    avoidanceMaterial.uniforms.uSunDirection.value.copy(sunDir);

    // Calculate Earth position (toward Sun from L2, slightly in front)
    const earthPos = getEarthPosition(sunPosition);
    const earthDir = earthPos.clone().normalize();

    // Calculate Moon position from L2
    // Moon's geocentric position tells us where it is in its orbit
    // From L2, the Moon appears offset from Earth by up to ~14.4°
    const moonDir = moonPosition.clone().normalize();
    const sunDirNorm = sunPosition.clone().normalize();

    // Calculate Moon's offset from Sun direction (represents its orbital position)
    // This is the angular difference between Moon and Sun as seen from Earth
    const moonOffsetFromSun = new THREE.Vector3().subVectors(moonDir, sunDirNorm);

    // Scale the offset: from L2, max separation is ~14.4° vs geocentric max of ~180°
    const scaleFactor = MOON_MAX_SEPARATION_RAD / Math.PI;
    const scaledOffset = moonOffsetFromSun.multiplyScalar(scaleFactor * SKY_RADIUS);

    // Moon position = Earth position + scaled offset
    const moonPos = earthPos.clone().add(scaledOffset);
    // Keep on sky sphere
    moonPos.normalize().multiplyScalar(SKY_RADIUS - 1);

    // Calculate Earth's phase as seen from Moon (for earthshine intensity)
    const earthPhase = calculateEarthPhase(sunDirNorm, moonDir);

    // Calculate apparent sizes in pixels
    const earthAngDiamDeg = EARTH_ANGULAR_DIAMETER_RAD * (180 / Math.PI);
    const earthPixelSize = (earthAngDiamDeg / fov) * canvasHeight;

    const moonAngDiamDeg = MOON_ANGULAR_DIAMETER_RAD * (180 / Math.PI);
    const moonPixelSize = (moonAngDiamDeg / fov) * canvasHeight;

    // Calculate world scales
    const earthWorldRadius = (EARTH_ANGULAR_DIAMETER_RAD * SKY_RADIUS) / 2;
    const moonWorldRadius = (MOON_ANGULAR_DIAMETER_RAD * SKY_RADIUS) / 2;

    // Label offset
    const labelOffset = 0.5;

    // Update Earth shader uniforms
    // Sun direction is FROM Earth toward Sun (for lighting calculation)
    earthMaterial.uniforms.sunDirection.value.copy(sunDirNorm);
    earthMaterial.uniforms.pixelSize.value = earthPixelSize;

    // Render Earth
    if (earthPixelSize >= LOD_POINT_SOURCE_MAX_PX) {
      earthSphere.position.copy(earthPos);
      earthSphere.scale.setScalar(earthWorldRadius);
      earthSphere.visible = true;
      earthSprite.visible = false;
    } else {
      earthSprite.position.copy(earthPos);
      const minSizePx = 6;
      const spriteAngularSize = (minSizePx / canvasHeight) * fov * (Math.PI / 180);
      const spriteScale = spriteAngularSize * SKY_RADIUS * 2;
      earthSprite.scale.set(spriteScale, spriteScale, 1);
      earthSprite.visible = true;
      earthSphere.visible = false;
    }

    // Earth label
    const earthLabelPos = earthPos.clone().normalize().multiplyScalar(SKY_RADIUS - 1 + labelOffset);
    earthLabel.position.copy(earthLabelPos);

    // Update Moon shader uniforms
    // Sun direction FROM Moon TO Sun (same as Earth's sun direction approximately)
    moonMaterial.uniforms.sunDirection.value.copy(sunDirNorm);
    // Earth direction FROM Moon TO Earth (Moon is offset from Earth, so calculate direction)
    const earthDirFromMoon = earthDir.clone().sub(moonPos.clone().normalize()).normalize();
    moonMaterial.uniforms.earthDirection.value.copy(earthDirFromMoon);
    // Earthshine intensity based on Earth's phase
    moonMaterial.uniforms.earthPhase.value = earthPhase;

    // Render Moon
    if (moonPixelSize >= LOD_POINT_SOURCE_MAX_PX) {
      moonSphere.position.copy(moonPos);
      moonSphere.scale.setScalar(moonWorldRadius);
      moonSphere.visible = true;
      moonSprite.visible = false;
    } else {
      moonSprite.position.copy(moonPos);
      const minSizePx = 4;
      const spriteAngularSize = (minSizePx / canvasHeight) * fov * (Math.PI / 180);
      const spriteScale = spriteAngularSize * SKY_RADIUS * 2;
      moonSprite.scale.set(spriteScale, spriteScale, 1);
      moonSprite.visible = true;
      moonSphere.visible = false;
    }

    // Moon label - show earthshine status
    const earthshineStrength = earthPhase > 0.7 ? "bright" : earthPhase > 0.3 ? "moderate" : "dim";
    moonLabelDiv.textContent = `Moon (${earthshineStrength} earthshine)`;

    // Moon label position
    const moonLabelPos = moonPos.clone().normalize().multiplyScalar(SKY_RADIUS - 1 + labelOffset);
    moonLabel.position.copy(moonLabelPos);
  }

  function setVisible(isVisible: boolean): void {
    visible = isVisible;
    group.visible = isVisible;
    if (!isVisible) {
      earthSphere.visible = false;
      earthSprite.visible = false;
      moonSphere.visible = false;
      moonSprite.visible = false;
    }
  }

  function isVisibleFn(): boolean {
    return visible;
  }

  // Track last computed Earth position for search
  let lastEarthPosition: THREE.Vector3 | null = null;

  // Wrap update to track Earth position
  const originalUpdate = update;
  function wrappedUpdate(fov: number, canvasHeight: number, sunPosition: THREE.Vector3, moonPosition: THREE.Vector3, currentDate: Date): void {
    originalUpdate(fov, canvasHeight, sunPosition, moonPosition, currentDate);
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
