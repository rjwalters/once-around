/**
 * Ground Layer
 *
 * Renders the ground hemisphere for topocentric view mode,
 * including the horizon ring and cardinal direction labels.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SKY_RADIUS } from "../constants";
import { computeGMST } from "../utils/coordinates";

export interface GroundLayer {
  /** The group containing all ground elements */
  group: THREE.Group;
  /** Set visibility of the ground plane */
  setVisible(visible: boolean): void;
  /** Update observer location for ground plane orientation */
  updateOrientation(latitudeDeg: number, longitudeDeg?: number): void;
  /** Update ground orientation for the current time */
  updateForTime(date: Date): void;
}

/**
 * Create the ground layer for topocentric view mode.
 * @param scene - The Three.js scene to add the ground to
 * @returns GroundLayer interface
 */
export function createGroundLayer(scene: THREE.Scene): GroundLayer {
  // Group containing all ground elements
  const group = new THREE.Group();
  group.visible = false; // Start hidden
  group.renderOrder = 999; // Render last (on top)
  scene.add(group);

  // Track observer location
  let latitude = 0;
  let longitude = 0;
  let initialized = false; // Don't update until properly configured

  // Hemisphere covering exactly half the celestial sphere (below horizon)
  const groundGeometry = new THREE.SphereGeometry(
    SKY_RADIUS - 0.1, // Slightly inside sky sphere
    64, // width segments
    32, // height segments
    0, Math.PI * 2, // full phi (longitude)
    Math.PI / 2, Math.PI / 2 // theta from equator to bottom pole (hemisphere)
  );
  const groundMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a2a1a, // Dark earth green
    side: THREE.BackSide, // Render inside of hemisphere
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.renderOrder = 999;
  group.add(groundMesh);

  // Horizon ring at the equator of the hemisphere
  const horizonRingGeometry = new THREE.TorusGeometry(SKY_RADIUS - 0.1, 0.15, 8, 128);
  const horizonRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x6a8a6a, // Brighter green ring
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  });
  const horizonRing = new THREE.Mesh(horizonRingGeometry, horizonRingMaterial);
  horizonRing.rotation.x = Math.PI / 2; // Rotate to be horizontal
  horizonRing.renderOrder = 1000;
  group.add(horizonRing);

  // Cardinal direction labels group
  const cardinalLabelsGroup = new THREE.Group();
  group.add(cardinalLabelsGroup);

  // Helper to create cardinal labels
  function createCardinalLabel(text: string, isPrimary: boolean = true, isNorth: boolean = false): CSS2DObject {
    const div = document.createElement("div");
    let className = "cardinal-label";
    if (isPrimary) className += " cardinal-primary";
    if (isNorth) className += " cardinal-label-n";
    div.className = className;
    div.textContent = text;
    return new CSS2DObject(div);
  }

  const horizonRadius = SKY_RADIUS - 0.05;
  const labelHeight = 0.3;

  // Primary cardinal directions
  const labelN = createCardinalLabel("N", true, true);
  labelN.position.set(horizonRadius, labelHeight, 0);
  cardinalLabelsGroup.add(labelN);

  const labelE = createCardinalLabel("E");
  labelE.position.set(0, labelHeight, horizonRadius);
  cardinalLabelsGroup.add(labelE);

  const labelS = createCardinalLabel("S");
  labelS.position.set(-horizonRadius, labelHeight, 0);
  cardinalLabelsGroup.add(labelS);

  const labelW = createCardinalLabel("W");
  labelW.position.set(0, labelHeight, -horizonRadius);
  cardinalLabelsGroup.add(labelW);

  // Intercardinal directions
  const diagOffset = horizonRadius * Math.SQRT1_2;

  const labelNE = createCardinalLabel("NE", false);
  labelNE.position.set(diagOffset, labelHeight, diagOffset);
  cardinalLabelsGroup.add(labelNE);

  const labelSE = createCardinalLabel("SE", false);
  labelSE.position.set(-diagOffset, labelHeight, diagOffset);
  cardinalLabelsGroup.add(labelSE);

  const labelSW = createCardinalLabel("SW", false);
  labelSW.position.set(-diagOffset, labelHeight, -diagOffset);
  cardinalLabelsGroup.add(labelSW);

  const labelNW = createCardinalLabel("NW", false);
  labelNW.position.set(diagOffset, labelHeight, -diagOffset);
  cardinalLabelsGroup.add(labelNW);

  function setVisible(visible: boolean): void {
    group.visible = visible;
  }

  function updateOrientation(latitudeDeg: number, longitudeDeg?: number): void {
    // Validate inputs - use defaults if invalid
    if (typeof latitudeDeg === 'number' && !isNaN(latitudeDeg) &&
        latitudeDeg >= -90 && latitudeDeg <= 90) {
      latitude = latitudeDeg;
    } else {
      console.warn("Invalid latitude for ground plane, using 0");
      latitude = 0;
    }
    if (longitudeDeg !== undefined &&
        typeof longitudeDeg === 'number' && !isNaN(longitudeDeg) &&
        longitudeDeg >= -180 && longitudeDeg <= 180) {
      longitude = longitudeDeg;
    }
    // Mark as initialized so updateForTime can start working
    initialized = true;
  }

  function updateForTime(date: Date): void {
    // Don't update until properly initialized with observer location
    if (!initialized || !group.visible) return;

    const latRad = latitude * Math.PI / 180;

    // Compute Local Sidereal Time
    const gmst = computeGMST(date);
    const lst = gmst + longitude;
    const lstRad = (lst * Math.PI) / 180;

    // Zenith direction: Dec = latitude, RA = LST
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const cosLst = Math.cos(lstRad);
    const sinLst = Math.sin(lstRad);

    // Equatorial coords (Z-up)
    const eqX = cosLat * cosLst;
    const eqY = cosLat * sinLst;
    const eqZ = sinLat;

    // Convert to Three.js (Y-up): (-X, Z, Y)
    const zenith = new THREE.Vector3(-eqX, eqZ, eqY).normalize();
    const nadir = zenith.clone().negate();

    console.log('[Ground] zenith:', zenith.x.toFixed(3), zenith.y.toFixed(3), zenith.z.toFixed(3),
      'lat:', latitude.toFixed(2), 'lon:', longitude.toFixed(2), 'LST:', lst.toFixed(2));

    // Create quaternion to rotate from default pole (-Y) to nadir
    const defaultPole = new THREE.Vector3(0, -1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(defaultPole, nadir);

    // Apply rotation to the group
    group.position.set(0, 0, 0);
    group.quaternion.copy(quaternion);

    // Align cardinal labels so North points toward celestial north pole
    const celestialNorth = new THREE.Vector3(0, 1, 0);
    const inverseQuat = quaternion.clone().invert();
    const northInLocal = celestialNorth.clone().applyQuaternion(inverseQuat);

    // Project onto local horizon plane (XZ plane)
    northInLocal.y = 0;

    // Handle edge case at poles
    if (northInLocal.lengthSq() > 0.001) {
      northInLocal.normalize();
      const angle = Math.atan2(northInLocal.z, northInLocal.x);
      cardinalLabelsGroup.rotation.y = -angle;
    }
  }

  return {
    group,
    setVisible,
    updateOrientation,
    updateForTime,
  };
}
