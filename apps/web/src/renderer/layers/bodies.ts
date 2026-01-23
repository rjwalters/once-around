/**
 * Celestial Bodies Layer
 *
 * Renders the Sun, Moon, and planets with proper scaling, phase lighting,
 * and labels. Includes Saturn's rings and Jupiter's texture.
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "../../wasm/sky_engine";
import { getBodiesPositionBuffer, getBodiesAngularDiametersBuffer, getMinorBodiesBuffer } from "../../engine";
import { SKY_RADIUS, BODY_COLORS, BODY_NAMES, LABEL_OFFSET, POINT_SOURCE_MIN_SIZE_PX, MINOR_BODY_NAMES, MINOR_BODY_COLORS, MINOR_BODY_COUNT } from "../constants";
import { moonVertexShader, moonFragmentShader } from "../shaders";
import { readPositionFromBuffer, raDecToPosition } from "../utils/coordinates";
import { calculateLabelOffset } from "../utils/labels";
import { smoothstep } from "../utils/math";
import { createGlowSpriteMaterial, createTexturedPlanetMaterial, loadTextureWithColorSpace } from "../utils/materials";
import type { LabelManager } from "../label-manager";
import { LABEL_PRIORITY } from "../label-manager";

// Planet indices in body buffer (Mercury through Neptune)
const PLANET_INDICES = [2, 3, 4, 5, 6, 7, 8]; // Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune

// Saturn's axial tilt
const SATURN_AXIAL_TILT = 26.73 * (Math.PI / 180);

// Multi-LOD rendering thresholds (in pixels)
// Level 0: Point source    (< 3 px)  → Glow sprite only
// Level 1: Simple disk     (3-10 px) → Solid color + phase, no texture (shader handles this)
// Level 2: Low-detail disk (10-30 px) → Blend between solid color and texture
// Level 3: Full detail     (> 30 px) → Full textured sphere
const LOD_POINT_SOURCE_MAX_PX = 3;    // Below this, pure point source (sprite only)
const LOD_SIMPLE_DISK_MAX_PX = 10;    // Below this, solid color disk (no texture)
const LOD_BLEND_DISK_MAX_PX = 30;     // Below this, blend color and texture
// Above LOD_BLEND_DISK_MAX_PX: full texture detail

export interface BodiesLayer {
  /** The Sun mesh */
  sunMesh: THREE.Mesh;
  /** The Moon mesh */
  moonMesh: THREE.Mesh;
  /** Planet meshes (Mercury, Venus, Mars, Jupiter, Saturn) */
  planetMeshes: THREE.Mesh[];
  /** Body labels (Sun, Moon, planets) */
  labels: CSS2DObject[];
  /** Get current Sun position */
  getSunPosition(): THREE.Vector3;
  /** Get current Moon position */
  getMoonPosition(): THREE.Vector3;
  /** Get Sun-Moon separation in degrees */
  getSunMoonSeparationDeg(): number;
  /** Update body positions and rendering */
  update(engine: SkyEngine, fov: number, canvasHeight: number, labelManager?: LabelManager): void;
  /** Enable/disable horizon culling (hide objects below horizon) */
  setHorizonCulling(enabled: boolean, zenith?: THREE.Vector3): void;
  /** Enable/disable scintillation (topocentric mode) */
  setScintillationEnabled(enabled: boolean): void;
  /** Set scintillation intensity (0-1, representing atmospheric turbulence) */
  setScintillationIntensity(intensity: number): void;
  /** Update scintillation for current frame (call each frame when enabled) */
  updateScintillation(latitude: number, lst: number): void;
  /** Enable/disable remote view mode (hides normal body renderings) */
  setRemoteViewActive(active: boolean): void;
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
  // High detail geometry for all textured planets
  const planetGeometry = new THREE.SphereGeometry(1, 48, 48);

  // Load planet textures
  const textureLoader = new THREE.TextureLoader();

  const mercuryTexture = textureLoader.load("/mercury.jpg");
  mercuryTexture.colorSpace = THREE.SRGBColorSpace;

  const venusTexture = textureLoader.load("/venus.jpg");
  venusTexture.colorSpace = THREE.SRGBColorSpace;

  const marsTexture = textureLoader.load("/mars.jpg");
  marsTexture.colorSpace = THREE.SRGBColorSpace;

  const jupiterTexture = textureLoader.load("/jupiter.jpg");
  jupiterTexture.colorSpace = THREE.SRGBColorSpace;

  const saturnTexture = textureLoader.load("/saturn.jpg");
  saturnTexture.colorSpace = THREE.SRGBColorSpace;

  const uranusTexture = textureLoader.load("/uranus.jpg");
  uranusTexture.colorSpace = THREE.SRGBColorSpace;

  const neptuneTexture = textureLoader.load("/neptune.jpg");
  neptuneTexture.colorSpace = THREE.SRGBColorSpace;

  // Map body indices to textures
  const planetTextures: Record<number, THREE.Texture> = {
    2: mercuryTexture,
    3: venusTexture,
    4: marsTexture,
    5: jupiterTexture,
    6: saturnTexture,
    7: uranusTexture,
    8: neptuneTexture,
  };

  const planetMeshes: THREE.Mesh[] = [];
  const planetMaterials: THREE.ShaderMaterial[] = [];

  for (let i = 0; i < PLANET_INDICES.length; i++) {
    const bodyIdx = PLANET_INDICES[i];
    const texture = planetTextures[bodyIdx];

    // All planets use textured shader with LOD and scintillation support
    const bodyColor = BODY_COLORS[bodyIdx];
    const material = new THREE.ShaderMaterial({
      vertexShader: texturedPlanetVertexShader,
      fragmentShader: texturedPlanetFragmentShader,
      uniforms: {
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        planetTexture: { value: texture },
        time: { value: 0.0 },
        zenith: { value: new THREE.Vector3(0, 1, 0) },
        scintillationIntensity: { value: 0.7 },
        scintillationEnabled: { value: false },
        planetId: { value: bodyIdx },
        opacity: { value: 1.0 },
        // LOD uniforms
        pixelSize: { value: 100.0 },  // Apparent size in pixels
        bodyColor: { value: new THREE.Vector3(bodyColor.r, bodyColor.g, bodyColor.b) },
      },
    });

    const mesh = new THREE.Mesh(planetGeometry, material);
    // Enable transparency for crossfade
    material.transparent = true;
    planetMeshes.push(mesh);
    planetMaterials.push(material);
    scene.add(mesh);
  }

  // ---------------------------------------------------------------------------
  // Planet point source sprites (for when planets are too small to resolve)
  // ---------------------------------------------------------------------------
  const planetSprites: THREE.Sprite[] = [];
  const planetSpriteMaterials: THREE.SpriteMaterial[] = [];

  for (let i = 0; i < PLANET_INDICES.length; i++) {
    const bodyIdx = PLANET_INDICES[i];
    const color = BODY_COLORS[bodyIdx];

    const spriteMaterial = createGlowSpriteMaterial(color);
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 10; // Render after most things
    planetSprites.push(sprite);
    planetSpriteMaterials.push(spriteMaterial);
    scene.add(sprite);
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
  // Minor body sprites (dwarf planets and asteroids)
  // ---------------------------------------------------------------------------
  const minorBodySprites: THREE.Sprite[] = [];
  const minorBodySpriteMaterials: THREE.SpriteMaterial[] = [];

  for (let i = 0; i < MINOR_BODY_COUNT; i++) {
    const color = MINOR_BODY_COLORS[i];
    const spriteMaterial = createGlowSpriteMaterial(color);
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 10;
    minorBodySprites.push(sprite);
    minorBodySpriteMaterials.push(spriteMaterial);
    scene.add(sprite);
  }

  // ---------------------------------------------------------------------------
  // Minor body labels
  // ---------------------------------------------------------------------------
  const minorBodyLabels: CSS2DObject[] = [];
  for (let i = 0; i < MINOR_BODY_COUNT; i++) {
    const div = document.createElement("div");
    div.className = "sky-label minor-body-label";
    div.textContent = MINOR_BODY_NAMES[i];
    div.dataset.minorBody = String(i);
    const label = new CSS2DObject(div);
    minorBodyLabels.push(label);
    labelsGroup.add(label);
  }

  // ---------------------------------------------------------------------------
  // Textured meshes for minor bodies with spacecraft imagery (for extreme zoom)
  // ---------------------------------------------------------------------------

  // Pluto (index 0) - New Horizons mission
  const plutoTexture = loadTextureWithColorSpace(textureLoader, "/pluto.jpg");
  const plutoMaterial = createTexturedPlanetMaterial(
    plutoTexture,
    100,
    new THREE.Vector3(0.85, 0.80, 0.75)
  );
  const plutoMesh = new THREE.Mesh(planetGeometry, plutoMaterial);
  scene.add(plutoMesh);

  // Ceres (index 1) - Dawn mission
  const ceresTexture = loadTextureWithColorSpace(textureLoader, "/ceres.jpg");
  const ceresMaterial = createTexturedPlanetMaterial(
    ceresTexture,
    101,
    new THREE.Vector3(0.75, 0.75, 0.70)
  );
  const ceresMesh = new THREE.Mesh(planetGeometry, ceresMaterial);
  scene.add(ceresMesh);

  // Vesta (index 10) - Dawn mission
  const vestaTexture = loadTextureWithColorSpace(textureLoader, "/vesta.jpg");
  const vestaMaterial = createTexturedPlanetMaterial(
    vestaTexture,
    110,
    new THREE.Vector3(0.80, 0.80, 0.75)
  );
  const vestaMesh = new THREE.Mesh(planetGeometry, vestaMaterial);
  scene.add(vestaMesh);

  // Collect all minor body materials for scintillation updates
  const minorBodyMaterials = [plutoMaterial, ceresMaterial, vestaMaterial];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let currentSunPos = new THREE.Vector3();
  let currentMoonPos = new THREE.Vector3();
  let currentSunMoonSeparationDeg = 180;
  let horizonCullingEnabled = false;
  let remoteViewActive = false;
  // Zenith direction for proper horizon culling (set by setHorizonCulling)
  const zenithDirection = new THREE.Vector3(0, 1, 0);

  /**
   * Check if a position is above the horizon.
   * Uses dot product with zenith - positive means above horizon.
   */
  function isAboveHorizon(pos: THREE.Vector3): boolean {
    if (!horizonCullingEnabled) return true;
    // Dot product with zenith: positive = above horizon
    return pos.clone().normalize().dot(zenithDirection) > -0.01; // Small tolerance for objects near horizon
  }

  function update(engine: SkyEngine, fov: number, canvasHeight: number, labelManager?: LabelManager): void {
    // If remote view is active, hide all normal body renderings
    if (remoteViewActive) {
      sunMesh.visible = false;
      moonMesh.visible = false;
      for (const mesh of planetMeshes) mesh.visible = false;
      for (const sprite of planetSprites) sprite.visible = false;
      for (const label of bodyLabels) label.visible = false;
      saturnRings.visible = false;
      // Also hide minor bodies
      plutoMesh.visible = false;
      ceresMesh.visible = false;
      vestaMesh.visible = false;
      for (const sprite of minorBodySprites) sprite.visible = false;
      for (const label of minorBodyLabels) label.visible = false;
      return;
    }

    const bodyPositions = getBodiesPositionBuffer(engine);
    const angularDiameters = getBodiesAngularDiametersBuffer(engine);
    const radius = SKY_RADIUS - 1;

    // Convert angular diameter to world scale for spheres on the sky sphere
    // Formula: scale = angDiam * SKY_RADIUS / 2 (geometric optics)
    function angularDiameterToScale(angDiamRadians: number): number {
      return (angDiamRadians * SKY_RADIUS) / 2;
    }

    // Update Sun (no minimum size - Sun is always large enough)
    const sunPos = readPositionFromBuffer(bodyPositions, 0, radius);
    currentSunPos.copy(sunPos);
    sunMesh.position.copy(sunPos);
    const sunAngDiam = angularDiameters[0];
    const sunDisplayScale = angularDiameterToScale(sunAngDiam);
    sunMesh.scale.setScalar(sunDisplayScale);
    const sunLabelPos = calculateLabelOffset(sunPos, LABEL_OFFSET);
    bodyLabels[0].position.copy(sunLabelPos);
    // Hide sun if below horizon in topocentric mode
    const sunAboveHorizon = isAboveHorizon(sunPos);
    sunMesh.visible = sunAboveHorizon;
    bodyLabels[0].visible = sunAboveHorizon;

    // Register Sun label with label manager
    if (sunAboveHorizon && labelManager) {
      labelManager.registerLabel({
        id: 'body-sun',
        objectPos: sunPos,
        labelPos: sunLabelPos,
        priority: LABEL_PRIORITY.SUN,
        label: bodyLabels[0],
        color: BODY_COLORS[0],
      });
    }

    // Update Moon (no minimum - Moon is always large enough)
    const moonPos = readPositionFromBuffer(bodyPositions, 1, radius);
    currentMoonPos.copy(moonPos);
    moonMesh.position.copy(moonPos);
    const moonAngDiam = angularDiameters[1];
    const moonDisplayScale = angularDiameterToScale(moonAngDiam);
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
    // Hide moon if below horizon in topocentric mode
    const moonAboveHorizon = isAboveHorizon(moonPos);
    moonMesh.visible = moonAboveHorizon;
    bodyLabels[1].visible = moonAboveHorizon;

    // Register Moon label with label manager
    if (moonAboveHorizon && labelManager) {
      labelManager.registerLabel({
        id: 'body-moon',
        objectPos: moonPos,
        labelPos: moonLabelPos,
        priority: LABEL_PRIORITY.MOON,
        label: bodyLabels[1],
        color: BODY_COLORS[1],
      });
    }

    // Update planets with multi-LOD rendering
    // LOD levels based on pixel size:
    // Level 0 (< 3px): sprite only
    // Level 1 (3-10px): solid color disk (shader uses bodyColor, no texture)
    // Level 2 (10-30px): blend color and texture
    // Level 3 (> 30px): full texture
    const fovArcsec = fov * 3600;

    for (let i = 0; i < PLANET_INDICES.length; i++) {
      const bodyIdx = PLANET_INDICES[i];
      const planetPos = readPositionFromBuffer(bodyPositions, bodyIdx, radius);

      // Calculate angular diameter in pixels for LOD selection
      const angDiam = angularDiameters[bodyIdx];
      const angDiamArcsec = angDiam * (180 / Math.PI) * 3600;
      const pixelSize = (angDiamArcsec / fovArcsec) * canvasHeight;

      // Disk opacity blend for transition from sprite to disk
      const diskBlend = smoothstep(LOD_POINT_SOURCE_MAX_PX, LOD_SIMPLE_DISK_MAX_PX, pixelSize);

      // Position both mesh and sprite
      planetMeshes[i].position.copy(planetPos);
      planetSprites[i].position.copy(planetPos);

      // Hide planet if below horizon in topocentric mode
      const planetAboveHorizon = isAboveHorizon(planetPos);

      // ----- Resolved disk (sphere with LOD-aware shader) -----
      // Show disk once we're past the pure point-source regime
      // Disk fades in from LOD_POINT_SOURCE_MAX_PX to LOD_SIMPLE_DISK_MAX_PX
      if (pixelSize >= LOD_POINT_SOURCE_MAX_PX && planetAboveHorizon) {
        // Use actual angular diameter for the sphere
        const displayScale = angularDiameterToScale(angDiam);
        planetMeshes[i].scale.setScalar(displayScale);
        planetMeshes[i].visible = true;

        // Pass pixel size to shader for LOD-based texture sampling
        planetMaterials[i].uniforms.pixelSize.value = pixelSize;

        // Fade opacity during sprite-to-disk transition
        planetMaterials[i].uniforms.opacity.value = diskBlend;

        // Phase lighting
        const sunDirFromPlanet = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
        planetMaterials[i].uniforms.sunDirection.value.copy(sunDirFromPlanet);
      } else {
        planetMeshes[i].visible = false;
      }

      // ----- Point source (sprite) -----
      // Hide sprite completely once disk is visible to avoid glow obscuring moons/details
      // Sprite uses additive blending, so even faint glow can obscure nearby objects
      if (pixelSize < LOD_POINT_SOURCE_MAX_PX && planetAboveHorizon) {
        planetSprites[i].visible = true;
        planetSpriteMaterials[i].opacity = 1.0;

        // Keep sprite at fixed star-like size
        const pointSizeArcsec = Math.max(POINT_SOURCE_MIN_SIZE_PX * fov * 3600 / canvasHeight, 2);
        const spriteWorldSize = (pointSizeArcsec / fovArcsec) * SKY_RADIUS * 4; // 4x for glow extent
        planetSprites[i].scale.set(spriteWorldSize, spriteWorldSize, 1);
      } else {
        planetSprites[i].visible = false;
      }

      // Labels
      const labelPos = calculateLabelOffset(planetPos, LABEL_OFFSET);
      bodyLabels[bodyIdx].position.copy(labelPos);
      bodyLabels[bodyIdx].visible = planetAboveHorizon;

      // Register planet label with label manager
      if (planetAboveHorizon && labelManager) {
        labelManager.registerLabel({
          id: `body-planet-${bodyIdx}`,
          objectPos: planetPos,
          labelPos: labelPos,
          priority: LABEL_PRIORITY.PLANET,
          label: bodyLabels[bodyIdx],
          color: BODY_COLORS[bodyIdx],
        });
      }
    }

    // Saturn's rings visibility follows the sphere (show when disk is visible)
    const saturnPixelSize = (angularDiameters[6] * (180 / Math.PI) * 3600 / fovArcsec) * canvasHeight;
    const saturnDiskVisible = saturnPixelSize >= LOD_POINT_SOURCE_MAX_PX;
    // Rings fade in smoothly as we transition from sprite to disk
    const saturnRingOpacity = smoothstep(LOD_POINT_SOURCE_MAX_PX, LOD_SIMPLE_DISK_MAX_PX, saturnPixelSize);
    saturnRings.visible = saturnDiskVisible && isAboveHorizon(planetMeshes[4].position);
    ringMaterial.opacity = 0.7 * saturnRingOpacity;

    // -------------------------------------------------------------------------
    // Update minor bodies (dwarf planets and asteroids)
    // -------------------------------------------------------------------------
    const minorBodiesBuffer = getMinorBodiesBuffer(engine);

    for (let i = 0; i < MINOR_BODY_COUNT; i++) {
      const idx = i * 4; // 4 floats per minor body: x, y, z, angular_diameter
      // Minor bodies buffer uses same coordinate system as main bodies
      const minorPos = readPositionFromBuffer(
        new Float32Array([minorBodiesBuffer[idx], minorBodiesBuffer[idx + 1], minorBodiesBuffer[idx + 2]]),
        0,
        radius
      );
      const angDiam = minorBodiesBuffer[idx + 3];

      // Calculate pixel size for LOD selection
      const angDiamArcsec = angDiam * (180 / Math.PI) * 3600;
      const pixelSize = (angDiamArcsec / fovArcsec) * canvasHeight;

      // Check horizon culling
      const aboveHorizon = isAboveHorizon(minorPos);

      // Calculate disk blend for opacity transition
      const diskBlend = smoothstep(LOD_POINT_SOURCE_MAX_PX, LOD_SIMPLE_DISK_MAX_PX, pixelSize);

      // Position sprite
      minorBodySprites[i].position.copy(minorPos);

      // Textured sphere rendering for minor bodies with spacecraft imagery
      // Pluto (index 0), Ceres (index 1), Vesta (index 10)
      if (i === 0) {
        // Pluto - New Horizons
        plutoMesh.position.copy(minorPos);
        if (pixelSize >= LOD_POINT_SOURCE_MAX_PX && aboveHorizon) {
          const displayScale = angularDiameterToScale(angDiam);
          plutoMesh.scale.setScalar(displayScale);
          plutoMesh.visible = true;
          plutoMaterial.uniforms.pixelSize.value = pixelSize;
          plutoMaterial.uniforms.opacity.value = diskBlend;
          const sunDir = new THREE.Vector3().subVectors(currentSunPos, minorPos).normalize();
          plutoMaterial.uniforms.sunDirection.value.copy(sunDir);
        } else {
          plutoMesh.visible = false;
        }
      } else if (i === 1) {
        // Ceres - Dawn
        ceresMesh.position.copy(minorPos);
        if (pixelSize >= LOD_POINT_SOURCE_MAX_PX && aboveHorizon) {
          const displayScale = angularDiameterToScale(angDiam);
          ceresMesh.scale.setScalar(displayScale);
          ceresMesh.visible = true;
          ceresMaterial.uniforms.pixelSize.value = pixelSize;
          ceresMaterial.uniforms.opacity.value = diskBlend;
          const sunDir = new THREE.Vector3().subVectors(currentSunPos, minorPos).normalize();
          ceresMaterial.uniforms.sunDirection.value.copy(sunDir);
        } else {
          ceresMesh.visible = false;
        }
      } else if (i === 10) {
        // Vesta - Dawn
        vestaMesh.position.copy(minorPos);
        if (pixelSize >= LOD_POINT_SOURCE_MAX_PX && aboveHorizon) {
          const displayScale = angularDiameterToScale(angDiam);
          vestaMesh.scale.setScalar(displayScale);
          vestaMesh.visible = true;
          vestaMaterial.uniforms.pixelSize.value = pixelSize;
          vestaMaterial.uniforms.opacity.value = diskBlend;
          const sunDir = new THREE.Vector3().subVectors(currentSunPos, minorPos).normalize();
          vestaMaterial.uniforms.sunDirection.value.copy(sunDir);
        } else {
          vestaMesh.visible = false;
        }
      }

      // Point source sprite for all minor bodies
      // Hide sprite completely once disk is visible to avoid glow obscuring details
      if (pixelSize < LOD_POINT_SOURCE_MAX_PX && aboveHorizon) {
        minorBodySprites[i].visible = true;
        minorBodySpriteMaterials[i].opacity = 1.0;

        // Keep sprite at fixed star-like size
        const pointSizeArcsec = Math.max(POINT_SOURCE_MIN_SIZE_PX * fov * 3600 / canvasHeight, 2);
        const spriteWorldSize = (pointSizeArcsec / fovArcsec) * SKY_RADIUS * 4;
        minorBodySprites[i].scale.set(spriteWorldSize, spriteWorldSize, 1);
      } else {
        minorBodySprites[i].visible = false;
      }

      // Update label
      const labelPos = calculateLabelOffset(minorPos, LABEL_OFFSET);
      minorBodyLabels[i].position.copy(labelPos);
      minorBodyLabels[i].visible = aboveHorizon;

      // Register minor body label with label manager
      if (aboveHorizon && labelManager) {
        // Pluto (index 0) gets higher priority
        const priority = i === 0 ? LABEL_PRIORITY.MINOR_BODY_HIGH : LABEL_PRIORITY.MINOR_BODY_LOW;
        labelManager.registerLabel({
          id: `body-minor-${i}`,
          objectPos: minorPos,
          labelPos: labelPos,
          priority: priority,
          label: minorBodyLabels[i],
          color: MINOR_BODY_COLORS[i],
        });
      }
    }
  }

  function setHorizonCulling(enabled: boolean, zenith?: THREE.Vector3): void {
    horizonCullingEnabled = enabled;
    if (zenith) {
      zenithDirection.copy(zenith).normalize();
    }
  }

  // Scintillation state
  let scintillationEnabled = false;
  let scintillationStartTime = 0;

  function setScintillationEnabled(enabled: boolean): void {
    scintillationEnabled = enabled;
    for (const material of planetMaterials) {
      material.uniforms.scintillationEnabled.value = enabled;
    }
    // Also update minor body materials (Pluto, Ceres, Vesta)
    for (const material of minorBodyMaterials) {
      material.uniforms.scintillationEnabled.value = enabled;
    }
    if (enabled) {
      scintillationStartTime = performance.now();
    }
  }

  function setScintillationIntensity(intensity: number): void {
    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    for (const material of planetMaterials) {
      material.uniforms.scintillationIntensity.value = clampedIntensity;
    }
    // Also update minor body materials (Pluto, Ceres, Vesta)
    for (const material of minorBodyMaterials) {
      material.uniforms.scintillationIntensity.value = clampedIntensity;
    }
  }

  /**
   * Update scintillation for current frame.
   * Call this every frame when scintillation is enabled.
   * @param latitude - Observer latitude in degrees
   * @param lst - Local Sidereal Time in degrees
   */
  function updateScintillation(latitude: number, lst: number): void {
    if (!scintillationEnabled) return;

    // Update time (in seconds since scintillation started)
    const elapsed = (performance.now() - scintillationStartTime) / 1000;

    // Compute zenith direction in Three.js coordinates
    // Zenith is at RA=LST, Dec=latitude
    const zenith = raDecToPosition(lst, latitude, 1);
    zenith.normalize();

    for (const material of planetMaterials) {
      material.uniforms.time.value = elapsed;
      material.uniforms.zenith.value.copy(zenith);
    }
    // Also update minor body materials (Pluto, Ceres, Vesta)
    for (const material of minorBodyMaterials) {
      material.uniforms.time.value = elapsed;
      material.uniforms.zenith.value.copy(zenith);
    }
  }

  function setRemoteViewActive(active: boolean): void {
    remoteViewActive = active;
  }

  return {
    sunMesh,
    moonMesh,
    planetMeshes,
    labels: bodyLabels,
    getSunPosition: () => currentSunPos.clone(),
    getMoonPosition: () => currentMoonPos.clone(),
    getSunMoonSeparationDeg: () => currentSunMoonSeparationDeg,
    update,
    setHorizonCulling,
    setScintillationEnabled,
    setScintillationIntensity,
    updateScintillation,
    setRemoteViewActive,
  };
}
