/**
 * Earth Layer
 *
 * Renders Earth as a sphere for Hubble view mode,
 * positioned in the nadir direction (below the satellite observer).
 * Features day/night terminator with city lights on the dark side.
 */

import * as THREE from "three";
import { computeGMST } from "../utils/coordinates";
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
 * Create the Earth layer for Hubble view mode.
 * @param scene - The Three.js scene to add the Earth to
 * @returns EarthLayer interface
 */
export function createEarthLayer(scene: THREE.Scene): EarthLayer {
  // Group containing all Earth elements
  const group = new THREE.Group();
  group.visible = false; // Start hidden
  scene.add(group);

  // Load Earth textures
  const textureLoader = new THREE.TextureLoader();
  const dayTexture = textureLoader.load("/earth-day.jpg");
  const nightTexture = textureLoader.load("/earth-night.jpg");

  // Set proper color space for textures
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;

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

  // Cloud layer - slightly above Earth surface, drifts slowly
  const cloudTexture = textureLoader.load("/earth-clouds.jpg");
  cloudTexture.colorSpace = THREE.SRGBColorSpace;

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

  // Track current rotation state
  let currentRotationY = 0;
  let hasBeenPositioned = false;

  function setVisible(visible: boolean): void {
    group.visible = visible;

    // Set a default position if Earth hasn't been positioned yet
    // Default: Earth "below" the observer (negative Y in Three.js coords)
    if (visible && !hasBeenPositioned) {
      group.position.set(0, -EARTH_DISTANCE, 0);
      group.lookAt(0, 0, 0);
    }
  }

  function updatePosition(nadirDirection: THREE.Vector3): void {
    // Position Earth in the nadir direction (toward Earth's center)
    const direction = nadirDirection.clone().normalize();
    group.position.copy(direction.multiplyScalar(EARTH_DISTANCE));

    // Don't use lookAt - we want the Earth's Y-axis to remain aligned with
    // celestial north (Three.js +Y). The sphere geometry with its texture
    // will show the correct face based on the rotation we apply.

    hasBeenPositioned = true;
  }

  function updateRotation(date: Date, _longitudeDeg: number): void {
    if (!group.visible) return;

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
    const sunDir = new THREE.Vector3()
      .subVectors(sunPosition, earthPos)
      .normalize();

    // Update shader uniforms for Earth and cloud layers
    earthMaterial.uniforms.sunDirection.value.copy(sunDir);
    cloudMaterial.uniforms.sunDirection.value.copy(sunDir);

    // Orient terminator line perpendicular to Sun direction
    // The terminator is a great circle whose normal is the Sun direction
    const terminatorLine = group.children[3] as THREE.LineLoop;

    // Create a quaternion that rotates from +Z (initial normal) to sunDir
    const up = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, sunDir);
    terminatorLine.quaternion.copy(quaternion);
  }

  function isOccluded(position: THREE.Vector3): boolean {
    if (!group.visible) return false;

    // Camera is at origin, Earth center is at group.position
    // Ray from camera (origin) toward the target position
    const rayDir = position.clone().normalize();
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
