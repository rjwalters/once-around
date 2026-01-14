import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "./wasm/sky_engine";
import { getStarsPositionBuffer, getStarsMetaBuffer, getBodiesPositionBuffer } from "./engine";
import { getAllConstellationLines, CONSTELLATIONS } from "./constellations";

// -----------------------------------------------------------------------------
// Color utilities
// -----------------------------------------------------------------------------

function bvToColor(bv: number): THREE.Color {
  bv = Math.max(-0.4, Math.min(2.0, bv));

  let r: number, g: number, b: number;

  if (bv < 0) {
    const t = (bv + 0.4) / 0.4;
    r = 0.6 + 0.4 * t;
    g = 0.7 + 0.3 * t;
    b = 1.0;
  } else if (bv < 0.4) {
    const t = bv / 0.4;
    r = 0.9 + 0.1 * t;
    g = 0.9 + 0.1 * t;
    b = 1.0;
  } else if (bv < 0.8) {
    const t = (bv - 0.4) / 0.4;
    r = 1.0;
    g = 1.0 - 0.2 * t;
    b = 1.0 - 0.3 * t;
  } else if (bv < 1.4) {
    const t = (bv - 0.8) / 0.6;
    r = 1.0;
    g = 0.8 - 0.3 * t;
    b = 0.7 - 0.4 * t;
  } else {
    const t = (bv - 1.4) / 0.6;
    r = 1.0;
    g = 0.5 - 0.2 * t;
    b = 0.3 - 0.2 * t;
  }

  return new THREE.Color(r, g, b);
}

// Colors for celestial bodies: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn
const BODY_COLORS: THREE.Color[] = [
  new THREE.Color(1.0, 0.95, 0.4),  // Sun - bright yellow
  new THREE.Color(0.9, 0.9, 0.85),  // Moon - pale white
  new THREE.Color(0.7, 0.7, 0.7),   // Mercury - gray
  new THREE.Color(1.0, 0.95, 0.8),  // Venus - pale yellow
  new THREE.Color(1.0, 0.4, 0.3),   // Mars - red-orange
  new THREE.Color(0.9, 0.85, 0.7),  // Jupiter - tan
  new THREE.Color(0.9, 0.8, 0.6),   // Saturn - gold
];

const CONSTELLATION_COLOR = new THREE.Color(0.2, 0.4, 0.6);

const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

// -----------------------------------------------------------------------------
// LOD constants for star rendering
// -----------------------------------------------------------------------------

// Magnitude threshold - always render stars brighter than this
const LOD_BRIGHT_MAG_THRESHOLD = 4.5;

// Target star counts at different FOV ranges
const LOD_MAX_STARS_WIDE_FOV = 8000;   // FOV > 70°
const LOD_MAX_STARS_MEDIUM_FOV = 15000; // FOV 40-70°
const LOD_MAX_STARS_NARROW_FOV = 40000; // FOV < 40°

// Deterministic hash for star ID - produces a value 0-1
function starIdHash(id: number): number {
  // Simple hash using prime multiplication and bit operations
  let h = id * 2654435761;
  h = ((h >>> 16) ^ h) * 2246822519;
  h = ((h >>> 16) ^ h);
  return (h >>> 0) / 4294967295; // Convert to 0-1 range
}

// Major stars - HR (Harvard Revised / BSC) number → name
const MAJOR_STARS: [number, string][] = [
  [2491, "Sirius"],       // α CMa, mag -1.46
  [2326, "Canopus"],      // α Car, mag -0.72
  [5340, "Arcturus"],     // α Boo, mag -0.05
  [7001, "Vega"],         // α Lyr, mag 0.03
  [1708, "Capella"],      // α Aur, mag 0.08
  [1713, "Rigel"],        // β Ori, mag 0.13
  [2943, "Procyon"],      // α CMi, mag 0.34
  [2061, "Betelgeuse"],   // α Ori, mag 0.42
  [7557, "Altair"],       // α Aql, mag 0.76
  [1457, "Aldebaran"],    // α Tau, mag 0.85
  [5056, "Spica"],        // α Vir, mag 0.97
  [6134, "Antares"],      // α Sco, mag 1.06
  [2990, "Pollux"],       // β Gem, mag 1.14
  [8728, "Fomalhaut"],    // α PsA, mag 1.16
  [7924, "Deneb"],        // α Cyg, mag 1.25
  [3982, "Regulus"],      // α Leo, mag 1.36
  [2891, "Castor"],       // α Gem, mag 1.58
  [5267, "Mizar"],        // ζ UMa, mag 2.23
  [424, "Polaris"],       // α UMi, mag 1.98
  [6527, "Rasalhague"],   // α Oph, mag 2.08
];

// -----------------------------------------------------------------------------
// Moon shader for phase rendering
// -----------------------------------------------------------------------------

const moonVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const moonFragmentShader = `
uniform vec3 sunDirection;
uniform vec3 moonColor;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Compute illumination from sun direction
  // sunDirection points FROM Earth TO Sun
  float illumination = dot(vNormal, sunDirection);

  // Smooth terminator with slight ambient
  float lit = smoothstep(-0.1, 0.1, illumination);

  // Dark side has slight ambient (earthshine approximation)
  float ambient = 0.03;
  float brightness = ambient + (1.0 - ambient) * lit;

  gl_FragColor = vec4(moonColor * brightness, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Renderer configuration
// -----------------------------------------------------------------------------

const SKY_RADIUS = 50;

export interface SkyRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  updateFromEngine(engine: SkyEngine, fov?: number): void;
  setConstellationsVisible(visible: boolean): void;
  setLabelsVisible(visible: boolean): void;
  getRenderedStarCount(): number;
  render(): void;
  resize(width: number, height: number): void;
}

// -----------------------------------------------------------------------------
// Main renderer
// -----------------------------------------------------------------------------

export function createRenderer(container: HTMLElement): SkyRenderer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000008);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.01,
    100
  );
  camera.position.set(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // ---------------------------------------------------------------------------
  // Stars layer
  // ---------------------------------------------------------------------------
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
  });
  const starsPoints = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starsPoints);

  // ---------------------------------------------------------------------------
  // Planets layer (Sun and planets as points, Moon rendered separately)
  // ---------------------------------------------------------------------------
  const planetsGeometry = new THREE.BufferGeometry();
  const planetsMaterial = new THREE.PointsMaterial({
    size: 4,
    sizeAttenuation: false,
    vertexColors: true,
  });
  const planetsPoints = new THREE.Points(planetsGeometry, planetsMaterial);
  scene.add(planetsPoints);

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
    },
  });
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moonMesh);

  // ---------------------------------------------------------------------------
  // Constellation lines layer
  // ---------------------------------------------------------------------------
  const constellationGeometry = new THREE.BufferGeometry();
  const constellationMaterial = new THREE.LineBasicMaterial({
    color: CONSTELLATION_COLOR,
    transparent: true,
    opacity: 0.4,
  });
  const constellationLines = new THREE.LineSegments(constellationGeometry, constellationMaterial);
  constellationLines.visible = false;
  scene.add(constellationLines);

  // ---------------------------------------------------------------------------
  // CSS2D Label renderer
  // ---------------------------------------------------------------------------
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  // Label container groups
  const labelsGroup = new THREE.Group();
  labelsGroup.visible = false;
  scene.add(labelsGroup);

  // Celestial body labels (Sun, Moon, planets)
  const bodyLabels: CSS2DObject[] = [];
  for (let i = 0; i < 7; i++) {
    const div = document.createElement("div");
    div.className = "sky-label planet-label";
    div.textContent = BODY_NAMES[i];
    const label = new CSS2DObject(div);
    bodyLabels.push(label);
    labelsGroup.add(label);
  }

  // Constellation labels (created once, positions updated when stars change)
  const constellationLabels: Map<string, CSS2DObject> = new Map();
  for (const constellation of CONSTELLATIONS) {
    const div = document.createElement("div");
    div.className = "sky-label constellation-label";
    div.textContent = constellation.name;
    const label = new CSS2DObject(div);
    label.visible = false; // Start hidden, shown when we have star positions
    constellationLabels.set(constellation.name, label);
    labelsGroup.add(label);
  }

  // Major star labels
  const starLabels: Map<number, CSS2DObject> = new Map();
  for (const [hr, name] of MAJOR_STARS) {
    const div = document.createElement("div");
    div.className = "sky-label star-label";
    div.textContent = name;
    const label = new CSS2DObject(div);
    label.visible = false;
    starLabels.set(hr, label);
    labelsGroup.add(label);
  }

  // Star ID → position lookup (built during updateStars)
  let starPositionMap: Map<number, THREE.Vector3> = new Map();

  // Track rendered star count (after LOD culling)
  let renderedStarCount = 0;

  // Constellation line pairs (HR numbers)
  const constellationPairs = getAllConstellationLines();

  // ---------------------------------------------------------------------------
  // Update functions
  // ---------------------------------------------------------------------------

  function updateStars(engine: SkyEngine, fov: number = 60): void {
    const positions = getStarsPositionBuffer(engine);
    const meta = getStarsMetaBuffer(engine);
    const totalStars = engine.visible_stars();

    // Clear old map
    starPositionMap = new Map();

    if (totalStars === 0) {
      starsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      starsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(0), 3));
      return;
    }

    // Calculate target star count based on FOV
    let targetStars: number;
    if (fov > 70) {
      targetStars = LOD_MAX_STARS_WIDE_FOV;
    } else if (fov > 40) {
      // Linear interpolation between narrow and wide
      const t = (fov - 40) / 30;
      targetStars = Math.floor(LOD_MAX_STARS_NARROW_FOV + t * (LOD_MAX_STARS_MEDIUM_FOV - LOD_MAX_STARS_NARROW_FOV));
    } else {
      targetStars = LOD_MAX_STARS_NARROW_FOV;
    }

    // First pass: count bright stars and faint stars separately
    let brightCount = 0;
    let faintCount = 0;
    for (let i = 0; i < totalStars; i++) {
      const vmag = meta[i * 4];
      if (vmag < LOD_BRIGHT_MAG_THRESHOLD) {
        brightCount++;
      } else {
        faintCount++;
      }
    }

    // Calculate sampling probability for faint stars
    // Always include all bright stars, sample faint ones to meet target
    const faintTarget = Math.max(0, targetStars - brightCount);
    const faintProbability = faintCount > 0 ? Math.min(1.0, faintTarget / faintCount) : 1.0;

    // Second pass: build arrays with LOD sampling
    // Pre-allocate for worst case (all stars), then trim
    const scaledPositions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < totalStars; i++) {
      const vmag = meta[i * 4];
      const bv = meta[i * 4 + 1];
      const id = Math.round(meta[i * 4 + 2]);

      // LOD check: always include bright stars, sample faint ones
      const isBright = vmag < LOD_BRIGHT_MAG_THRESHOLD;
      const includeInRender = isBright || (starIdHash(id) < faintProbability);

      // Always store position for constellation/label lookup (even if not rendered)
      const x = positions[i * 3] * SKY_RADIUS;
      const y = positions[i * 3 + 1] * SKY_RADIUS;
      const z = positions[i * 3 + 2] * SKY_RADIUS;
      starPositionMap.set(id, new THREE.Vector3(x, y, z));

      if (includeInRender) {
        scaledPositions.push(x, y, z);

        const color = bvToColor(bv);
        colors.push(color.r, color.g, color.b);
      }
    }

    starsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(scaledPositions), 3));
    starsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));

    // Update rendered count (scaledPositions has 3 floats per star)
    renderedStarCount = scaledPositions.length / 3;
  }

  function updateConstellations(): void {
    // Build line segment positions from star pairs
    const linePositions: number[] = [];

    for (const [hr1, hr2] of constellationPairs) {
      const pos1 = starPositionMap.get(hr1);
      const pos2 = starPositionMap.get(hr2);

      if (pos1 && pos2) {
        linePositions.push(pos1.x, pos1.y, pos1.z);
        linePositions.push(pos2.x, pos2.y, pos2.z);
      }
    }

    constellationGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(linePositions), 3)
    );

    // Update constellation label positions (centroid of visible stars)
    for (const constellation of CONSTELLATIONS) {
      const label = constellationLabels.get(constellation.name);
      if (!label) continue;

      // Collect unique star IDs from this constellation's lines
      const starIds = new Set<number>();
      for (const [hr1, hr2] of constellation.lines) {
        starIds.add(hr1);
        starIds.add(hr2);
      }

      // Calculate centroid of visible stars
      let cx = 0, cy = 0, cz = 0;
      let count = 0;
      for (const id of starIds) {
        const pos = starPositionMap.get(id);
        if (pos) {
          cx += pos.x;
          cy += pos.y;
          cz += pos.z;
          count++;
        }
      }

      if (count >= 2) {
        // Normalize to put label on sky sphere
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (len > 0) {
          label.position.set(
            (cx / len) * SKY_RADIUS,
            (cy / len) * SKY_RADIUS,
            (cz / len) * SKY_RADIUS
          );
          label.visible = true;
        }
      } else {
        label.visible = false;
      }
    }

    // Update major star label positions
    for (const [hr, _name] of MAJOR_STARS) {
      const label = starLabels.get(hr);
      if (!label) continue;

      const pos = starPositionMap.get(hr);
      if (pos) {
        label.position.set(pos.x, pos.y, pos.z);
        label.visible = true;
      } else {
        label.visible = false;
      }
    }
  }

  function updateBodies(engine: SkyEngine): void {
    const bodyPositions = getBodiesPositionBuffer(engine);
    const radius = SKY_RADIUS - 1;

    // Sun direction (index 0) - needed for Moon phase lighting
    const sunX = bodyPositions[0];
    const sunY = bodyPositions[1];
    const sunZ = bodyPositions[2];
    const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();

    // Moon position (index 1)
    const moonX = bodyPositions[3] * radius;
    const moonY = bodyPositions[4] * radius;
    const moonZ = bodyPositions[5] * radius;

    // Update Moon mesh position
    moonMesh.position.set(moonX, moonY, moonZ);

    // Scale Moon based on angular diameter
    // Angular diameter in radians, convert to sky sphere scale
    const angularDiameter = engine.moon_angular_diameter();
    // Moon's angular diameter is ~0.5 degrees = 0.00873 radians
    // Scale factor: angular diameter * sky radius / 2
    const moonScale = (angularDiameter * SKY_RADIUS) / 2;
    // Exaggerate slightly for visibility (real Moon is tiny at sky scale)
    const displayScale = Math.max(moonScale * 8, 0.4);
    moonMesh.scale.setScalar(displayScale);

    // Update Moon shader uniform - sun direction for phase lighting
    moonMaterial.uniforms.sunDirection.value.copy(sunDir);

    // Update Moon label position
    bodyLabels[1].position.set(moonX, moonY, moonZ);

    // Render Sun and planets as points (skip Moon at index 1)
    // Indices: 0=Sun, 2=Mercury, 3=Venus, 4=Mars, 5=Jupiter, 6=Saturn
    const pointIndices = [0, 2, 3, 4, 5, 6];
    const scaledPositions = new Float32Array(6 * 3);
    const colors = new Float32Array(6 * 3);

    for (let j = 0; j < 6; j++) {
      const i = pointIndices[j];
      const x = bodyPositions[i * 3] * radius;
      const y = bodyPositions[i * 3 + 1] * radius;
      const z = bodyPositions[i * 3 + 2] * radius;

      scaledPositions[j * 3] = x;
      scaledPositions[j * 3 + 1] = y;
      scaledPositions[j * 3 + 2] = z;

      const color = BODY_COLORS[i];
      colors[j * 3] = color.r;
      colors[j * 3 + 1] = color.g;
      colors[j * 3 + 2] = color.b;

      // Update body label position (skip Moon which is handled above)
      if (i !== 1) {
        bodyLabels[i].position.set(x, y, z);
      }
    }

    planetsGeometry.setAttribute("position", new THREE.BufferAttribute(scaledPositions, 3));
    planetsGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  function updateFromEngine(engine: SkyEngine, fov?: number): void {
    // Use provided FOV or get from camera
    const effectiveFov = fov ?? camera.fov;
    updateStars(engine, effectiveFov);
    updateConstellations();
    updateBodies(engine);
  }

  function setConstellationsVisible(visible: boolean): void {
    constellationLines.visible = visible;
  }

  function setLabelsVisible(visible: boolean): void {
    labelsGroup.visible = visible;
  }

  function getRenderedStarCount(): number {
    return renderedStarCount;
  }

  function render(): void {
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function resize(width: number, height: number): void {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
  }

  return {
    scene,
    camera,
    renderer,
    updateFromEngine,
    setConstellationsVisible,
    setLabelsVisible,
    getRenderedStarCount,
    render,
    resize,
  };
}
