/**
 * Celestial Bodies Layer
 *
 * Renders the Sun, Moon, and planets with proper scaling, phase lighting,
 * and labels. Includes Saturn's rings and Jupiter's texture.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getBodiesPositionBuffer, getBodiesAngularDiametersBuffer } from "../../engine";
import { SKY_RADIUS, BODY_COLORS, BODY_NAMES, LABEL_OFFSET } from "../constants";
import { moonVertexShader, moonFragmentShader, texturedPlanetVertexShader, texturedPlanetFragmentShader } from "../shaders";
import { readPositionFromBuffer } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";

// Planet indices in body buffer
const PLANET_INDICES = [2, 3, 4, 5, 6]; // Mercury, Venus, Mars, Jupiter, Saturn

// Saturn's axial tilt
const SATURN_AXIAL_TILT = 26.73 * (Math.PI / 180);

export interface BodiesLayer {
  /** The Sun mesh */
  sunMesh: THREE.Mesh;
  /** The Moon mesh */
  moonMesh: THREE.Mesh;
  /** Planet meshes (Mercury, Venus, Mars, Jupiter, Saturn) */
  planetMeshes: THREE.Mesh[];
  /** Body labels (Sun, Moon, planets) */
  labels: CSS2DObject[];
  /** Flag lines connecting labels to bodies */
  flagLines: THREE.LineSegments;
  /** Get current Sun position */
  getSunPosition(): THREE.Vector3;
  /** Get current Moon position */
  getMoonPosition(): THREE.Vector3;
  /** Get Sun-Moon separation in degrees */
  getSunMoonSeparationDeg(): number;
  /** Update body positions and rendering */
  update(engine: SkyEngine): void;
}

/**
 * Create the celestial bodies layer.
 * @param scene - The Three.js scene to add meshes to
 * @param labelsGroup - The group to add body labels to
 * @returns BodiesLayer interface
 */
export function createBodiesLayer(scene: THREE.Scene, labelsGroup: THREE.Group): BodiesLayer {
  // ---------------------------------------------------------------------------
  // Sun sphere (simple emissive material)
  // ---------------------------------------------------------------------------
  const sunGeometry = new THREE.SphereGeometry(1, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: BODY_COLORS[0],
  });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sunMesh);

  // ---------------------------------------------------------------------------
  // Planet spheres
  // ---------------------------------------------------------------------------
  const planetGeometry = new THREE.SphereGeometry(1, 24, 24);
  const jupiterGeometry = new THREE.SphereGeometry(1, 48, 48);

  // Load Jupiter texture
  const textureLoader = new THREE.TextureLoader();
  const jupiterTexture = textureLoader.load("/jupiter.jpg");
  jupiterTexture.colorSpace = THREE.SRGBColorSpace;

  const planetMeshes: THREE.Mesh[] = [];
  const planetMaterials: THREE.ShaderMaterial[] = [];

  for (let i = 0; i < 5; i++) {
    const bodyIdx = PLANET_INDICES[i];
    const color = BODY_COLORS[bodyIdx];

    let material: THREE.ShaderMaterial;
    let geometry: THREE.SphereGeometry;

    if (bodyIdx === 5) {
      // Jupiter - use textured shader
      material = new THREE.ShaderMaterial({
        vertexShader: texturedPlanetVertexShader,
        fragmentShader: texturedPlanetFragmentShader,
        uniforms: {
          sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          planetTexture: { value: jupiterTexture },
        },
      });
      geometry = jupiterGeometry;
    } else {
      // Other planets - use solid color shader
      material = new THREE.ShaderMaterial({
        vertexShader: moonVertexShader,
        fragmentShader: moonFragmentShader,
        uniforms: {
          sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          moonColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
        },
      });
      geometry = planetGeometry;
    }

    const mesh = new THREE.Mesh(geometry, material);
    planetMeshes.push(mesh);
    planetMaterials.push(material);
    scene.add(mesh);
  }

  // ---------------------------------------------------------------------------
  // Saturn's rings
  // ---------------------------------------------------------------------------
  const saturnMesh = planetMeshes[4]; // Saturn is at index 4

  const ringGeometry = new THREE.RingGeometry(1.2, 2.3, 64);

  // Fix UV coordinates for ring
  const pos = ringGeometry.attributes.position;
  const uv = ringGeometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    uv.setXY(i, (r - 1.2) / (2.3 - 1.2), 0.5);
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xc4a66a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });

  const saturnRings = new THREE.Mesh(ringGeometry, ringMaterial);
  saturnRings.rotation.x = Math.PI / 2;
  saturnRings.rotation.order = "ZXY";
  saturnRings.rotation.z = SATURN_AXIAL_TILT;
  saturnMesh.add(saturnRings);

  // ---------------------------------------------------------------------------
  // Moon sphere with phase lighting
  // ---------------------------------------------------------------------------
  const moonGeometry = new THREE.SphereGeometry(1, 32, 32);
  const moonMaterial = new THREE.ShaderMaterial({
    vertexShader: moonVertexShader,
    fragmentShader: moonFragmentShader,
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      moonColor: { value: new THREE.Vector3(0.9, 0.9, 0.85) },
      eclipseMode: { value: 0.0 },
    },
  });
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moonMesh);

  // ---------------------------------------------------------------------------
  // Body labels
  // ---------------------------------------------------------------------------
  const bodyLabels: CSS2DObject[] = [];
  for (let i = 0; i < 9; i++) {
    const div = document.createElement("div");
    div.className = "sky-label planet-label";
    div.textContent = BODY_NAMES[i];
    div.dataset.body = String(i);
    const label = new CSS2DObject(div);
    bodyLabels.push(label);
    labelsGroup.add(label);
  }

  // ---------------------------------------------------------------------------
  // Body flag lines
  // ---------------------------------------------------------------------------
  const bodyFlagLinesGeometry = new THREE.BufferGeometry();
  bodyFlagLinesGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9 * 2 * 3), 3));
  bodyFlagLinesGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9 * 2 * 3), 3));
  const bodyFlagLinesMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
  });
  const bodyFlagLines = new THREE.LineSegments(bodyFlagLinesGeometry, bodyFlagLinesMaterial);
  labelsGroup.add(bodyFlagLines);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let currentSunPos = new THREE.Vector3();
  let currentMoonPos = new THREE.Vector3();
  let currentSunMoonSeparationDeg = 180;

  function update(engine: SkyEngine): void {
    const bodyPositions = getBodiesPositionBuffer(engine);
    const angularDiameters = getBodiesAngularDiametersBuffer(engine);
    const radius = SKY_RADIUS - 1;

    const flagLinePositions = new Float32Array(9 * 2 * 3);
    const flagLineColors = new Float32Array(9 * 2 * 3);

    // Helper to set flag line
    function setFlagLine(bodyIdx: number, objPos: THREE.Vector3, labelPos: THREE.Vector3) {
      const color = BODY_COLORS[bodyIdx];
      const baseIdx = bodyIdx * 6;
      flagLinePositions[baseIdx] = objPos.x;
      flagLinePositions[baseIdx + 1] = objPos.y;
      flagLinePositions[baseIdx + 2] = objPos.z;
      flagLinePositions[baseIdx + 3] = labelPos.x;
      flagLinePositions[baseIdx + 4] = labelPos.y;
      flagLinePositions[baseIdx + 5] = labelPos.z;
      flagLineColors[baseIdx] = color.r;
      flagLineColors[baseIdx + 1] = color.g;
      flagLineColors[baseIdx + 2] = color.b;
      flagLineColors[baseIdx + 3] = color.r;
      flagLineColors[baseIdx + 4] = color.g;
      flagLineColors[baseIdx + 5] = color.b;
    }

    // Update Sun
    const sunPos = readPositionFromBuffer(bodyPositions, 0, radius);
    currentSunPos.copy(sunPos);
    sunMesh.position.copy(sunPos);
    const sunAngDiam = angularDiameters[0];
    const sunDisplayScale = (sunAngDiam * SKY_RADIUS) / 2;
    sunMesh.scale.setScalar(sunDisplayScale);
    const sunLabelPos = calculateLabelOffset(sunPos, LABEL_OFFSET);
    bodyLabels[0].position.copy(sunLabelPos);
    setFlagLine(0, sunPos, sunLabelPos);

    // Update Moon
    const moonPos = readPositionFromBuffer(bodyPositions, 1, radius);
    currentMoonPos.copy(moonPos);
    moonMesh.position.copy(moonPos);
    const moonAngDiam = angularDiameters[1];
    const moonDisplayScale = (moonAngDiam * SKY_RADIUS) / 2;
    moonMesh.scale.setScalar(moonDisplayScale);

    // Moon phase lighting
    const sunDirFromMoon = new THREE.Vector3().subVectors(sunPos, moonPos).normalize();
    moonMaterial.uniforms.sunDirection.value.copy(sunDirFromMoon);

    // Eclipse mode
    const moonSunDist = moonPos.distanceTo(sunPos);
    const eclipseThreshold = sunDisplayScale + moonDisplayScale;
    moonMaterial.uniforms.eclipseMode.value = moonSunDist < eclipseThreshold ? 1.0 : 0.0;

    // Calculate Sun-Moon separation in degrees
    const sunDir = sunPos.clone().normalize();
    const moonDir = moonPos.clone().normalize();
    const dotProduct = sunDir.dot(moonDir);
    currentSunMoonSeparationDeg = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);

    const moonLabelPos = calculateLabelOffset(moonPos, LABEL_OFFSET);
    bodyLabels[1].position.copy(moonLabelPos);
    setFlagLine(1, moonPos, moonLabelPos);

    // Update planets
    for (let i = 0; i < 5; i++) {
      const bodyIdx = PLANET_INDICES[i];
      const planetPos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);

      planetMeshes[i].position.copy(planetPos);

      const angDiam = angularDiameters[bodyIdx];
      const displayScale = (angDiam * SKY_RADIUS) / 2;
      planetMeshes[i].scale.setScalar(displayScale);

      // Phase lighting
      const sunDirFromPlanet = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
      planetMaterials[i].uniforms.sunDirection.value.copy(sunDirFromPlanet);

      const labelPos = calculateLabelOffset(planetPos, LABEL_OFFSET);
      bodyLabels[bodyIdx].position.copy(labelPos);
      setFlagLine(bodyIdx, planetPos, labelPos);
    }

    // Update Uranus and Neptune labels (not rendered as spheres)
    for (const bodyIdx of [7, 8]) {
      const pos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);
      const labelPos = calculateLabelOffset(pos, LABEL_OFFSET);
      bodyLabels[bodyIdx].position.copy(labelPos);
      setFlagLine(bodyIdx, pos, labelPos);
    }

    // Update flag line geometry
    bodyFlagLinesGeometry.attributes.position.array.set(flagLinePositions);
    (bodyFlagLinesGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    bodyFlagLinesGeometry.attributes.color.array.set(flagLineColors);
    (bodyFlagLinesGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  return {
    sunMesh,
    moonMesh,
    planetMeshes,
    labels: bodyLabels,
    flagLines: bodyFlagLines,
    getSunPosition: () => currentSunPos.clone(),
    getMoonPosition: () => currentMoonPos.clone(),
    getSunMoonSeparationDeg: () => currentSunMoonSeparationDeg,
    update,
  };
}
