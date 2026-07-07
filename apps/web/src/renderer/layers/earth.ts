/**
 * Earth Layer
 *
 * Renders Earth as a sphere for Hubble view mode,
 * positioned in the nadir direction (below the satellite observer).
 * Features day/night terminator with city lights on the dark side.
 */

import * as THREE from "three";
import { computeGMST } from "../../geometry/time";
import {
  earthVertexShader,
  earthFragmentShader,
  cloudVertexShader,
  cloudFragmentShader,
} from "../shaders";

// Earth sphere configuration
const EARTH_RADIUS = 20;          // Visual radius in scene units
const EARTH_DISTANCE = 35;        // Distance from camera toward nadir
const CLOUD_ALTITUDE = 1.008;     // Cloud layer at 0.8% above surface
const CLOUD_DRIFT_RATE = 0.02;    // Clouds drift at 2% of Earth's rotation (eastward)

// Module-level scratch vectors/quaternion reused every frame to avoid per-call
// heap allocations in the hot Hubble render path.
const _tempDir = new THREE.Vector3();      // updatePosition: nadir direction
const _rayDir = new THREE.Vector3();       // isOccluded: ray direction (per label)
const _sunDir = new THREE.Vector3();       // updateSunDirection: Earth->Sun
const _up = new THREE.Vector3(0, 0, 1);    // updateSunDirection: terminator normal basis
const _quat = new THREE.Quaternion();      // updateSunDirection: terminator orientation

export interface EarthLayer {
  /** The group containing all Earth elements */
  group: THREE.Group;
  /** Set visibility of the Earth */
  setVisible(visible: boolean): void;
  /** Update Earth position based on nadir direction */
  updatePosition(nadirDirection: THREE.Vector3): void;
  /** Update Earth rotation for the current time and observer longitude */
  updateRotation(date: Date, longitudeDeg: number): void;
  /** Update Sun direction for day/night terminator */
  updateSunDirection(sunPosition: THREE.Vector3): void;
  /** Check if a world position is occluded by the Earth sphere */
  isOccluded(position: THREE.Vector3): boolean;
}

/**
 * A tiny 1×1 gray texture used as a placeholder for the Earth materials until
 * their real textures are lazy-loaded on first entry into Hubble mode (issue #5).
 */
function createPlaceholderTexture(): THREE.Texture {
  const tex = new THREE.DataTexture(
    new Uint8Array([128, 128, 128, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create the Earth layer for Hubble view mode.
 *
 * The Earth day/night/cloud textures (~several MB) are NOT loaded at
 * construction. The layer starts hidden, so the textures are only fetched on the
 * first `setVisible(true)` — i.e. when the user first enters Hubble mode. This
 * keeps them off the startup critical path (issue #5).
 *
 * @param scene - The Three.js scene to add the Earth to
 * @param getSharedNightTexture - Optional provider for the shared
 *   `/earth-night.jpg` texture. When supplied, Earth and JWST layers share a
 *   single texture + network request instead of each loading their own.
 * @param onTextureLoad - Called when a lazily-loaded texture arrives, so a
 *   render-on-demand scene repaints on an otherwise static frame (PR #31).
 * @returns EarthLayer interface
 */
export function createEarthLayer(
  scene: THREE.Scene,
  getSharedNightTexture?: () => THREE.Texture,
  onTextureLoad?: () => void
): EarthLayer {
  // Group containing all Earth elements
  const group = new THREE.Group();
  group.visible = false; // Start hidden
  scene.add(group);

  // Earth textures are lazy-loaded (issue #5). Materials start with a gray
  // placeholder and swap in the real textures on the first setVisible(true).
  const textureLoader = new THREE.TextureLoader();
  const placeholder = createPlaceholderTexture();
  const dayTexture = placeholder;
  const nightTexture = placeholder;

  // Earth sphere with day/night shader
  const earthGeometry = new THREE.SphereGeometry(
    EARTH_RADIUS,
    64, // width segments
    48  // height segments
  );

  // ShaderMaterial for day/night terminator with city lights
  const earthMaterial = new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
  });

  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  group.add(earthMesh);

  // Add subtle atmosphere glow
  const atmosphereGeometry = new THREE.SphereGeometry(
    EARTH_RADIUS * 1.02,
    32,
    24
  );
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x88bbff,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,
  });
  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  group.add(atmosphereMesh);

  // Cloud layer - slightly above Earth surface, drifts slowly. Texture is
  // lazy-loaded (issue #5); starts with the gray placeholder.
  const cloudTexture = placeholder;

  const cloudGeometry = new THREE.SphereGeometry(
    EARTH_RADIUS * CLOUD_ALTITUDE,
    64,
    48
  );
  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    uniforms: {
      cloudTexture: { value: cloudTexture },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    transparent: true,
    depthWrite: false, // Prevents z-fighting artifacts
  });
  const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
  group.add(cloudMesh);

  // Terminator line - dashed circle showing day/night boundary
  const terminatorSegments = 64;
  const terminatorGeometry = new THREE.BufferGeometry();
  const terminatorPositions = new Float32Array(terminatorSegments * 3);
  // Initialize with a unit circle in the XY plane (will be oriented toward Sun)
  for (let i = 0; i < terminatorSegments; i++) {
    const angle = (i / terminatorSegments) * Math.PI * 2;
    terminatorPositions[i * 3] = Math.cos(angle) * EARTH_RADIUS * 1.001;
    terminatorPositions[i * 3 + 1] = Math.sin(angle) * EARTH_RADIUS * 1.001;
    terminatorPositions[i * 3 + 2] = 0;
  }
  terminatorGeometry.setAttribute("position", new THREE.BufferAttribute(terminatorPositions, 3));

  const terminatorMaterial = new THREE.LineDashedMaterial({
    color: 0xffff00,
    dashSize: 1,
    gapSize: 0.5,
    linewidth: 2,
  });
  const terminatorLine = new THREE.LineLoop(terminatorGeometry, terminatorMaterial);
  terminatorLine.computeLineDistances(); // Required for dashed lines
  group.add(terminatorLine);

  // Track current positioning state
  let hasBeenPositioned = false;

  // Cache the last date the rotation was computed for. computeGMST() and the
  // mesh rotation writes only change when the date changes (playback / manual
  // time input), so a static Hubble frame can skip them entirely.
  let lastRotationDateMs = Number.NaN;

  // Lazy-load guard for the Earth textures. Runs once, on first setVisible(true).
  let texturesLoaded = false;

  /**
   * Load the Earth day/night/cloud textures on the first activation (issue #5)
   * and swap them into the materials, replacing the gray placeholder. The night
   * texture is shared with the JWST layer when a provider is supplied.
   */
  function ensureTexturesLoaded(): void {
    if (texturesLoaded) return;
    texturesLoaded = true;

    // Day texture (Earth-owned).
    textureLoader.load(
      "/earth-day.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        earthMaterial.uniforms.dayTexture.value = texture;
        onTextureLoad?.();
      },
      undefined,
      () => console.warn("Earth day texture not found: /earth-day.jpg")
    );

    // Night texture (shared with JWST via the provider when available).
    if (getSharedNightTexture) {
      const shared = getSharedNightTexture();
      earthMaterial.uniforms.nightTexture.value = shared;
      onTextureLoad?.();
    } else {
      textureLoader.load(
        "/earth-night.jpg",
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          earthMaterial.uniforms.nightTexture.value = texture;
          onTextureLoad?.();
        },
        undefined,
        () => console.warn("Earth night texture not found: /earth-night.jpg")
      );
    }

    // Cloud texture (Earth-owned; used as a single-channel alpha mask).
    textureLoader.load(
      "/earth-clouds.jpg",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        cloudMaterial.uniforms.cloudTexture.value = texture;
        onTextureLoad?.();
      },
      undefined,
      () => console.warn("Earth cloud texture not found: /earth-clouds.jpg")
    );
  }

  function setVisible(visible: boolean): void {
    group.visible = visible;

    // Load the Earth textures on the first activation (issue #5).
    if (visible) {
      ensureTexturesLoaded();
    }

    // Set a default position if Earth hasn't been positioned yet
    // Default: Earth "below" the observer (negative Y in Three.js coords)
    if (visible && !hasBeenPositioned) {
      group.position.set(0, -EARTH_DISTANCE, 0);
      group.lookAt(0, 0, 0);
    }
  }

  function updatePosition(nadirDirection: THREE.Vector3): void {
    // Position Earth in the nadir direction (toward Earth's center)
    const direction = _tempDir.copy(nadirDirection).normalize();
    group.position.copy(direction.multiplyScalar(EARTH_DISTANCE));

    // Don't use lookAt - we want the Earth's Y-axis to remain aligned with
    // celestial north (Three.js +Y). The sphere geometry with its texture
    // will show the correct face based on the rotation we apply.

    hasBeenPositioned = true;
  }

  function updateRotation(date: Date, _longitudeDeg: number): void {
    if (!group.visible) return;

    // Skip the GMST computation and rotation writes when the date is unchanged
    // (static Hubble frame). The rotation depends solely on the date.
    const dateMs = date.getTime();
    if (dateMs === lastRotationDateMs) return;
    lastRotationDateMs = dateMs;

    // Compute Greenwich Mean Sidereal Time - this tells us Earth's rotation angle
    const gmst = computeGMST(date);

    // The Earth mesh rotates around the world Y-axis (celestial north)
    // GMST directly gives us the angle: at GMST=0, the Prime Meridian
    // is at RA=0 (toward the vernal equinox direction, which is -X in Three.js)
    //
    // Three.js SphereGeometry has U=0 at +X and U=0.5 at -X
    // Standard Earth textures have Prime Meridian at U=0.5
    // So at GMST=0, we need rotation to put U=0.5 (-X) facing RA=0 (-X)
    // This means no offset is needed for the base case.
    //
    // GMST increases as Earth rotates eastward (counterclockwise from above north pole)
    // In Three.js Y-up with our coordinate mapping, we need negative rotation
    // to move the Prime Meridian eastward (toward increasing RA)
    const rotationRad = -(gmst * Math.PI) / 180;

    // Clouds drift eastward relative to Earth's surface (jet stream effect)
    // This creates a slight offset that accumulates over time
    const cloudRotationRad = rotationRad * (1 + CLOUD_DRIFT_RATE);

    // Apply rotation to the meshes around Y-axis (Earth's polar axis = celestial north)
    const earthMesh = group.children[0] as THREE.Mesh;
    const atmosphereMesh = group.children[1] as THREE.Mesh;
    const cloudMesh = group.children[2] as THREE.Mesh;
    earthMesh.rotation.y = rotationRad;
    atmosphereMesh.rotation.y = rotationRad;
    cloudMesh.rotation.y = cloudRotationRad;
  }

  function updateSunDirection(sunPosition: THREE.Vector3): void {
    if (!group.visible) return;

    // Calculate Sun direction from Earth's position
    // sunDirection should point FROM Earth TO Sun (normalized)
    const earthPos = group.position;
    const sunDir = _sunDir
      .subVectors(sunPosition, earthPos)
      .normalize();

    // Update shader uniforms for Earth and cloud layers
    earthMaterial.uniforms.sunDirection.value.copy(sunDir);
    cloudMaterial.uniforms.sunDirection.value.copy(sunDir);

    // Orient terminator line perpendicular to Sun direction
    // The terminator is a great circle whose normal is the Sun direction
    const terminatorLine = group.children[3] as THREE.LineLoop;

    // Create a quaternion that rotates from +Z (initial normal) to sunDir
    const quaternion = _quat.setFromUnitVectors(_up, sunDir);
    terminatorLine.quaternion.copy(quaternion);
  }

  function isOccluded(position: THREE.Vector3): boolean {
    if (!group.visible) return false;

    // Camera is at origin, Earth center is at group.position
    // Ray from camera (origin) toward the target position
    const rayDir = _rayDir.copy(position).normalize();
    const earthCenter = group.position;

    // Ray-sphere intersection test
    // Ray: P = t * rayDir (from origin)
    // Sphere: |P - earthCenter|^2 = EARTH_RADIUS^2
    //
    // Substituting: |t*rayDir - earthCenter|^2 = R^2
    // t^2 - 2t*(rayDir·earthCenter) + |earthCenter|^2 - R^2 = 0
    //
    // Using quadratic formula: a=1, b=-2*(rayDir·earthCenter), c=|earthCenter|^2-R^2
    const b = -2 * rayDir.dot(earthCenter);
    const c = earthCenter.lengthSq() - EARTH_RADIUS * EARTH_RADIUS;
    const discriminant = b * b - 4 * c;

    // If discriminant < 0, ray misses sphere (not occluded)
    if (discriminant < 0) return false;

    // Find the nearest intersection point
    const t = (-b - Math.sqrt(discriminant)) / 2;

    // If t > 0, the ray hits the sphere in front of the camera
    // Since celestial objects are essentially at infinity, any intersection means occlusion
    return t > 0;
  }

  return {
    group,
    setVisible,
    updatePosition,
    updateRotation,
    updateSunDirection,
    isOccluded,
  };
}
