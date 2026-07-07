/**
 * Earth Layer
 *
 * Renders Earth as a sphere for Hubble view mode,
 * positioned in the nadir direction (below the satellite observer).
 * Features day/night terminator with city lights on the dark side.
 *
 * Also renders Hubble's orbital-mechanics constraint overlays (issue #51):
 * - Sun avoidance zone: the ~50° exclusion cone around the Sun that HST cannot
 *   point toward (bright-object / solar avoidance).
 * - South Atlantic Anomaly (SAA): the region of trapped radiation over the
 *   South Atlantic that HST passes through in low Earth orbit, highlighted on
 *   the Earth's surface (it rotates with the Earth).
 * - Orbital path: a schematic ring showing HST's ~28.5°-inclination low Earth
 *   orbit around the Earth.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { computeGMST } from "../../geometry/time";
import { SKY_RADIUS } from "../constants";
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

// --- Hubble orbital-constraint overlay configuration (issue #51) ---

// HST solar avoidance: the telescope cannot point within ~50° of the Sun.
const HUBBLE_SUN_AVOIDANCE_DEG = 50;
const HUBBLE_SUN_AVOIDANCE_RAD = (HUBBLE_SUN_AVOIDANCE_DEG * Math.PI) / 180;

// South Atlantic Anomaly: centered roughly over the South Atlantic, off the
// coast of Brazil. Represented as a highlighted cap on the Earth's surface.
const SAA_CENTER_LAT_DEG = -25;
const SAA_CENTER_LON_DEG = -45;
const SAA_ANGULAR_RADIUS_DEG = 22;

// HST low Earth orbit: ~540 km altitude, 28.5° inclination. The orbit radius is
// scaled relative to the visual Earth radius so the ring hugs the sphere the way
// a real LEO orbit hugs the Earth.
const EARTH_MEAN_RADIUS_KM = 6371;
const HUBBLE_ORBIT_ALTITUDE_KM = 540;
const HUBBLE_ORBIT_INCLINATION_DEG = 28.5;
const HUBBLE_ORBIT_RADIUS =
  (EARTH_RADIUS * (EARTH_MEAN_RADIUS_KM + HUBBLE_ORBIT_ALTITUDE_KM)) /
  EARTH_MEAN_RADIUS_KM;

// Sun avoidance zone shader: renders a translucent warning cone on the sky
// sphere within HUBBLE_SUN_AVOIDANCE_RAD of the Sun direction (mirrors the JWST
// field-of-regard overlay). The camera sits at the origin, so the Sun's apparent
// sky direction is just normalize(sunPosition).
const sunAvoidanceVertexShader = `
varying vec3 vPosition;

void main() {
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const sunAvoidanceFragmentShader = `
uniform vec3 uSunDirection;
uniform float uHalfAngle;

varying vec3 vPosition;

void main() {
  vec3 viewDir = normalize(vPosition);
  float cosAngle = dot(viewDir, uSunDirection);
  float angle = acos(clamp(cosAngle, -1.0, 1.0));

  // Only show within the avoidance zone
  if (angle > uHalfAngle) {
    discard;
  }

  // Quadratic falloff, brightest at the Sun, fading to the cone edge
  float t = angle / uHalfAngle;
  float alpha = (1.0 - t * t) * 0.22;
  vec3 color = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.6, 0.2), t);

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Convert a geographic latitude/longitude to a unit direction in the Earth
 * mesh's local frame (the frame the day/night texture is mapped in, before the
 * GMST rotation is applied). Derived from the Three.js SphereGeometry UV mapping:
 * longitude 0 (prime meridian) maps to +X, and longitude increases eastward
 * toward -Z. Latitude maps to +Y at the north pole.
 *
 * Exported for testing.
 */
export function geoToLocalDirection(latDeg: number, lonDeg: number): THREE.Vector3 {
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return new THREE.Vector3(
    cosLat * Math.cos(lonRad),
    Math.sin(latRad),
    -cosLat * Math.sin(lonRad)
  ).normalize();
}

// Module-level scratch vectors/quaternion reused every frame to avoid per-call
// heap allocations in the hot Hubble render path.
const _tempDir = new THREE.Vector3();      // updatePosition: nadir direction
const _rayDir = new THREE.Vector3();       // isOccluded: ray direction (per label)
const _sunDir = new THREE.Vector3();       // updateSunDirection: Earth->Sun
const _up = new THREE.Vector3(0, 0, 1);    // updateSunDirection: terminator normal basis
const _quat = new THREE.Quaternion();      // updateSunDirection: terminator orientation
const _sunSkyDir = new THREE.Vector3();    // updateSunDirection: Sun sky direction from origin
const _saaWorld = new THREE.Vector3();     // updateSunDirection: SAA label world position
const _saaNormal = new THREE.Vector3();    // updateSunDirection: SAA outward surface normal
const _toCamera = new THREE.Vector3();     // updateSunDirection: SAA -> camera direction

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

  // --- Hubble orbital-constraint overlays (issue #51) ---
  // NOTE: The existing updateRotation()/updateSunDirection() read the first four
  // group children by index (earthMesh, atmosphere, cloud, terminator). All new
  // overlay objects below are either children of earthMesh (SAA) or appended
  // after index 3 (orbit ring) or added to the scene (sun avoidance), so those
  // index lookups remain valid.

  // Sun avoidance zone: a translucent cone on the sky sphere around the Sun that
  // HST cannot point toward. Centered on the camera (origin), so it is added to
  // the scene rather than the nadir-translated Earth group.
  const sunAvoidanceGeometry = new THREE.SphereGeometry(SKY_RADIUS - 2, 64, 32);
  const sunAvoidanceMaterial = new THREE.ShaderMaterial({
    vertexShader: sunAvoidanceVertexShader,
    fragmentShader: sunAvoidanceFragmentShader,
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
      uHalfAngle: { value: HUBBLE_SUN_AVOIDANCE_RAD },
    },
    transparent: true,
    side: THREE.BackSide, // Render the inside of the sphere (camera is inside)
    depthTest: false,
    depthWrite: false,
  });
  const sunAvoidanceZone = new THREE.Mesh(sunAvoidanceGeometry, sunAvoidanceMaterial);
  sunAvoidanceZone.renderOrder = -1; // Behind everything, occluded by opaque Earth
  sunAvoidanceZone.visible = false;
  scene.add(sunAvoidanceZone);

  // Orbital path: a schematic ring around the Earth in HST's ~28.5°-inclination
  // low Earth orbit. Added to the Earth group (not earthMesh) so it follows the
  // Earth's position and celestial-north alignment but does NOT spin with the
  // surface (an orbit is fixed in inertial space, not Earth-fixed). The line of
  // nodes is drawn along the group's local X axis; RAAN precession is not
  // modeled, so the ring shows the orbit's inclination rather than its exact
  // instantaneous orientation.
  const orbitRingGeometry = new THREE.TorusGeometry(
    HUBBLE_ORBIT_RADIUS,
    0.12, // tube radius (thin ring)
    8,
    128
  );
  const orbitRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const orbitRing = new THREE.Mesh(orbitRingGeometry, orbitRingMaterial);
  // Torus lies in its local XY plane (normal +Z); rotate it into the equatorial
  // XZ plane (normal +Y) so it circles the poles correctly.
  orbitRing.rotation.x = Math.PI / 2;
  const orbitPlane = new THREE.Group();
  orbitPlane.add(orbitRing);
  // Tilt the whole plane by the orbital inclination about the local X (nodes) axis.
  orbitPlane.rotation.x = (HUBBLE_ORBIT_INCLINATION_DEG * Math.PI) / 180;
  group.add(orbitPlane);

  // South Atlantic Anomaly: a highlighted cap on the Earth's surface. Added as a
  // child of earthMesh so it rotates with the surface (GMST) and sits at the
  // correct geographic location. The disc is depth-tested against the opaque
  // Earth, so it is automatically hidden when it rotates to the far side.
  const saaDir = geoToLocalDirection(SAA_CENTER_LAT_DEG, SAA_CENTER_LON_DEG);
  const saaCapRadius = EARTH_RADIUS * Math.sin((SAA_ANGULAR_RADIUS_DEG * Math.PI) / 180);
  const saaGeometry = new THREE.CircleGeometry(saaCapRadius, 48);
  const saaMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3344,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const saaPatch = new THREE.Mesh(saaGeometry, saaMaterial);
  // Lift slightly above the surface to avoid z-fighting, and orient the disc so
  // its +Z normal points outward along the SAA direction.
  saaPatch.position.copy(saaDir).multiplyScalar(EARTH_RADIUS * 1.003);
  saaPatch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), saaDir);
  earthMesh.add(saaPatch);

  // SAA label (CSS2D). CSS labels ignore depth, so its visibility is culled
  // manually each frame based on whether the SAA faces the camera.
  const saaLabelDiv = document.createElement("div");
  saaLabelDiv.className = "body-label saa-label";
  saaLabelDiv.textContent = "SAA";
  saaLabelDiv.style.color = "#ff8080";
  saaLabelDiv.style.fontSize = "10px";
  saaLabelDiv.style.pointerEvents = "none";
  const saaLabel = new CSS2DObject(saaLabelDiv);
  saaLabel.layers.set(0);
  saaLabel.position.copy(saaDir).multiplyScalar(EARTH_RADIUS * 1.02);
  earthMesh.add(saaLabel);

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

    // The sun avoidance zone lives on the scene (centered at the camera), so its
    // visibility is not inherited from the Earth group and must be set directly.
    sunAvoidanceZone.visible = visible;

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

    // Update the Sun avoidance zone (issue #51). From the telescope at the origin
    // the Sun's apparent sky direction is normalize(sunPosition) (the incoming
    // sunPosition is already scaled onto the sky sphere from the origin).
    _sunSkyDir.copy(sunPosition).normalize();
    sunAvoidanceMaterial.uniforms.uSunDirection.value.copy(_sunSkyDir);

    // Cull the SAA label (CSS2D ignores depth): show it only when the SAA faces
    // the camera. earthMesh carries the current GMST rotation, so use its world
    // matrix to find the label's world position and surface normal.
    saaLabel.updateWorldMatrix(true, false);
    _saaWorld.setFromMatrixPosition(saaLabel.matrixWorld);
    _saaNormal.copy(_saaWorld).sub(group.position).normalize(); // outward normal
    _toCamera.copy(_saaWorld).multiplyScalar(-1).normalize();   // SAA -> origin (camera)
    const saaFacesCamera = _toCamera.dot(_saaNormal) > 0.05;
    saaLabelDiv.style.opacity = saaFacesCamera ? "1" : "0";
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
