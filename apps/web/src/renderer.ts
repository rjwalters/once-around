import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { SkyEngine } from "./wasm/sky_engine";
import { getStarsPositionBuffer, getStarsMetaBuffer, getBodiesPositionBuffer, getBodiesAngularDiametersBuffer, getPlanetaryMoonsBuffer, getAllStarsPositionBuffer, getAllStarsMetaBuffer } from "./engine";
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

// Colors for celestial bodies: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune
const BODY_COLORS: THREE.Color[] = [
  new THREE.Color(1.0, 0.95, 0.4),  // Sun - bright yellow
  new THREE.Color(0.9, 0.9, 0.85),  // Moon - pale white
  new THREE.Color(0.7, 0.7, 0.7),   // Mercury - gray
  new THREE.Color(1.0, 0.95, 0.8),  // Venus - pale yellow
  new THREE.Color(1.0, 0.4, 0.3),   // Mars - red-orange
  new THREE.Color(0.9, 0.85, 0.7),  // Jupiter - tan
  new THREE.Color(0.9, 0.8, 0.6),   // Saturn - gold
  new THREE.Color(0.6, 0.85, 0.9),  // Uranus - pale cyan
  new THREE.Color(0.4, 0.5, 0.9),   // Neptune - blue
];

const CONSTELLATION_COLOR = new THREE.Color(0.2, 0.4, 0.6);

const BODY_NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];

// Planetary moon colors and names: Io, Europa, Ganymede, Callisto, Titan
const PLANETARY_MOON_COLORS: THREE.Color[] = [
  new THREE.Color(0.95, 0.85, 0.4),  // Io - yellowish (sulfur volcanism)
  new THREE.Color(0.85, 0.8, 0.75),  // Europa - brownish-white (icy)
  new THREE.Color(0.65, 0.6, 0.55),  // Ganymede - gray-brown
  new THREE.Color(0.4, 0.4, 0.4),    // Callisto - dark gray (heavily cratered)
  new THREE.Color(0.9, 0.7, 0.4),    // Titan - orange (thick atmosphere)
];

const PLANETARY_MOON_NAMES = ["Io", "Europa", "Ganymede", "Callisto", "Titan"];

// FOV threshold for showing planetary moons (degrees) - only show when zoomed in
const PLANETARY_MOONS_FOV_THRESHOLD = 30;

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
  [5054, "Mizar"],        // ζ UMa, mag 2.23
  [424, "Polaris"],       // α UMi, mag 1.98
  [6556, "Rasalhague"],   // α Oph, mag 2.08
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
  // sunDirection points FROM body (Moon/planet) TO Sun
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
const MILKY_WAY_RADIUS = 49; // Slightly behind stars
const LABEL_OFFSET = 1.8; // Distance to offset labels from objects

// -----------------------------------------------------------------------------
// Milky Way procedural shader
// -----------------------------------------------------------------------------

const milkyWayVertexShader = `
varying vec3 vPosition;

void main() {
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const milkyWayFragmentShader = `
varying vec3 vPosition;
uniform float uVisibility; // 0.0 = hidden, 1.0 = full brightness

// Transformation matrix from equatorial to galactic coordinates
// Galactic north pole: RA=192.85948°, Dec=+27.12825°
// Galactic center: RA=266.405°, Dec=-28.936°
const mat3 equatorialToGalactic = mat3(
  -0.0548755604, -0.8734370902, -0.4838350155,
  +0.4941094279, -0.4448296300, +0.7469822445,
  -0.8676661490, -0.1980763734, +0.4559837762
);

// 3D hash function for seamless spherical noise
vec3 hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453);
}

// 3D value noise - continuous on sphere
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = dot(hash3(i), vec3(1.0));
  float b = dot(hash3(i + vec3(1.0, 0.0, 0.0)), vec3(1.0));
  float c = dot(hash3(i + vec3(0.0, 1.0, 0.0)), vec3(1.0));
  float d = dot(hash3(i + vec3(1.0, 1.0, 0.0)), vec3(1.0));
  float e = dot(hash3(i + vec3(0.0, 0.0, 1.0)), vec3(1.0));
  float f1 = dot(hash3(i + vec3(1.0, 0.0, 1.0)), vec3(1.0));
  float g = dot(hash3(i + vec3(0.0, 1.0, 1.0)), vec3(1.0));
  float h = dot(hash3(i + vec3(1.0, 1.0, 1.0)), vec3(1.0));

  float z1 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  float z2 = mix(mix(e, f1, f.x), mix(g, h, f.x), f.y);
  return mix(z1, z2, f.z);
}

// 3D Fractal Brownian Motion - seamless on sphere
float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise3(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Normalize position to get direction on unit sphere
  vec3 dir = normalize(vPosition);

  // Transform to galactic coordinates
  vec3 galDir = equatorialToGalactic * dir;

  // Calculate galactic latitude (b) and longitude (l)
  float galLat = asin(clamp(galDir.z, -1.0, 1.0)); // -PI/2 to PI/2
  float galLon = atan(galDir.y, galDir.x); // -PI to PI

  // Base brightness: exponential falloff from galactic plane
  float latFalloff = exp(-abs(galLat) * 3.5);

  // Brightness variation along the plane (brighter toward galactic center at l=0)
  // Use galDir.x directly to avoid longitude discontinuity
  float centerDist = 1.0 - galDir.x; // galDir.x = 1 at center, -1 at anti-center
  float lonVariation = 0.6 + 0.4 * exp(-centerDist * centerDist * 0.5);

  // Add cloud structure with 3D noise (seamless on sphere)
  float cloudNoise = fbm3(galDir * 4.0);
  float detailNoise = fbm3(galDir * 12.0);

  // Combine for final brightness
  float brightness = latFalloff * lonVariation;
  brightness *= 0.7 + 0.5 * cloudNoise;
  brightness *= 0.85 + 0.3 * detailNoise;

  // Add some dark "dust lanes" near the galactic center
  float dustLane = smoothstep(0.0, 0.3, abs(galLat)) + 0.3;
  float dustNoise = fbm3(galDir * 8.0 + vec3(100.0, 0.0, 0.0)); // Offset for different pattern
  dustLane = mix(dustLane, 1.0, dustNoise * 0.5);
  brightness *= dustLane;

  // Color: slightly warm white, cooler at edges
  vec3 coreColor = vec3(1.0, 0.95, 0.85);
  vec3 edgeColor = vec3(0.7, 0.8, 1.0);
  vec3 color = mix(edgeColor, coreColor, brightness);

  // Final output - subtle glow, not overpowering the stars
  // Scale by visibility uniform (controlled by limiting magnitude setting)
  float alpha = brightness * 0.4 * uVisibility;
  gl_FragColor = vec4(color * brightness * 0.5 * uVisibility, alpha);
}
`;

// Calculate label offset position on sphere surface
// Returns position offset "downward" (toward south celestial pole) from the object
function calculateLabelOffset(objectPos: THREE.Vector3, offset: number): THREE.Vector3 {
  const radial = objectPos.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Calculate "east" direction (perpendicular to radial and up)
  const east = new THREE.Vector3().crossVectors(worldUp, radial);

  // Handle case where object is at celestial poles
  if (east.lengthSq() < 0.001) {
    east.set(1, 0, 0);
  }
  east.normalize();

  // Calculate "down" direction on sphere surface (toward south)
  const down = new THREE.Vector3().crossVectors(radial, east).normalize();

  // Offset position, then re-project to sphere
  const labelPos = objectPos.clone().add(down.multiplyScalar(offset));
  const radius = objectPos.length();
  return labelPos.normalize().multiplyScalar(radius);
}

export interface SkyRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  updateFromEngine(engine: SkyEngine, fov?: number): void;
  setConstellationsVisible(visible: boolean): void;
  setLabelsVisible(visible: boolean): void;
  setMilkyWayVisibility(limitingMagnitude: number): void;
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

  // ---------------------------------------------------------------------------
  // Milky Way background layer (rendered first, behind everything)
  // Visibility controlled by limiting magnitude - visible when mag limit >= 5.0
  // ---------------------------------------------------------------------------
  const milkyWayGeometry = new THREE.SphereGeometry(MILKY_WAY_RADIUS, 64, 32);
  const milkyWayMaterial = new THREE.ShaderMaterial({
    vertexShader: milkyWayVertexShader,
    fragmentShader: milkyWayFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uVisibility: { value: 1.0 },
    },
  });
  const milkyWaySphere = new THREE.Mesh(milkyWayGeometry, milkyWayMaterial);
  scene.add(milkyWaySphere);

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
  // Sun sphere (simple emissive material - no phase lighting needed)
  // ---------------------------------------------------------------------------
  const sunGeometry = new THREE.SphereGeometry(1, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: BODY_COLORS[0],
  });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sunMesh);

  // ---------------------------------------------------------------------------
  // Planet spheres (Mercury, Venus, Mars, Jupiter, Saturn - indices 2-6)
  // Mercury and Venus use phase lighting, outer planets use simple materials
  // ---------------------------------------------------------------------------
  const planetGeometry = new THREE.SphereGeometry(1, 24, 24);

  // Planet meshes array: [Mercury, Venus, Mars, Jupiter, Saturn]
  const planetMeshes: THREE.Mesh[] = [];
  const planetMaterials: THREE.ShaderMaterial[] = [];

  // Indices in body buffer: Mercury=2, Venus=3, Mars=4, Jupiter=5, Saturn=6
  const PLANET_INDICES = [2, 3, 4, 5, 6];

  for (let i = 0; i < 5; i++) {
    const bodyIdx = PLANET_INDICES[i];
    const color = BODY_COLORS[bodyIdx];

    // Mercury and Venus (indices 2, 3) use phase lighting
    // Outer planets use simple emissive material (fully lit from Earth)
    const material = new THREE.ShaderMaterial({
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
      uniforms: {
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        moonColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
      },
    });

    const mesh = new THREE.Mesh(planetGeometry, material);
    planetMeshes.push(mesh);
    planetMaterials.push(material);
    scene.add(mesh);
  }

  // ---------------------------------------------------------------------------
  // Saturn's rings - added as child of Saturn mesh so they move/scale together
  // ---------------------------------------------------------------------------
  // Saturn is at index 4 in planetMeshes (body index 6)
  const saturnMesh = planetMeshes[4];

  // Ring dimensions relative to Saturn's radius (1.0)
  // Inner edge at ~1.2 radii, outer edge at ~2.3 radii
  const ringGeometry = new THREE.RingGeometry(1.2, 2.3, 64);

  // Rotate UV coordinates to make the ring texture work correctly
  const pos = ringGeometry.attributes.position;
  const uv = ringGeometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    // Map UV.x to radial distance (0 = inner, 1 = outer)
    uv.setXY(i, (r - 1.2) / (2.3 - 1.2), 0.5);
  }

  // Semi-transparent ring material with Saturn's golden color
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xc4a66a, // Golden brown, slightly different from Saturn body
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });

  const saturnRings = new THREE.Mesh(ringGeometry, ringMaterial);

  // Rotate ring to be in Saturn's equatorial plane
  // RingGeometry is in XY plane, rotate 90° around X to make it horizontal
  saturnRings.rotation.x = Math.PI / 2;

  // Apply Saturn's axial tilt (26.73°) - tilts the equatorial plane
  // We apply this as a rotation around Z after the X rotation
  const SATURN_AXIAL_TILT = 26.73 * (Math.PI / 180);
  saturnRings.rotation.order = "ZXY";
  saturnRings.rotation.z = SATURN_AXIAL_TILT;

  // Add rings as child of Saturn so they scale and move together
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
    },
  });
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  scene.add(moonMesh);

  // ---------------------------------------------------------------------------
  // Planetary moons (Io, Europa, Ganymede, Callisto, Titan)
  // Only visible when zoomed in (FOV < threshold)
  // ---------------------------------------------------------------------------
  const planetaryMoonGeometry = new THREE.SphereGeometry(1, 16, 16);
  const planetaryMoonMeshes: THREE.Mesh[] = [];
  const planetaryMoonMaterials: THREE.MeshBasicMaterial[] = [];

  for (let i = 0; i < 5; i++) {
    const color = PLANETARY_MOON_COLORS[i];
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(planetaryMoonGeometry, material);
    mesh.visible = false; // Hidden by default, shown when zoomed in
    planetaryMoonMeshes.push(mesh);
    planetaryMoonMaterials.push(material);
    scene.add(mesh);
  }

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
  for (let i = 0; i < 9; i++) {
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

  // Major star labels (clickable for star info popup)
  const starLabels: Map<number, CSS2DObject> = new Map();
  for (const [hr, name] of MAJOR_STARS) {
    const div = document.createElement("div");
    div.className = "sky-label star-label";
    div.textContent = name;
    div.dataset.hr = String(hr); // Store HR number for click handler
    const label = new CSS2DObject(div);
    label.visible = false;
    starLabels.set(hr, label);
    labelsGroup.add(label);
  }

  // Planetary moon labels (Io, Europa, Ganymede, Callisto, Titan)
  const planetaryMoonLabels: CSS2DObject[] = [];
  for (let i = 0; i < 5; i++) {
    const div = document.createElement("div");
    div.className = "sky-label planetary-moon-label";
    div.textContent = PLANETARY_MOON_NAMES[i];
    const label = new CSS2DObject(div);
    label.visible = false; // Hidden by default
    planetaryMoonLabels.push(label);
    labelsGroup.add(label);
  }

  // ---------------------------------------------------------------------------
  // Flag lines for labels (connecting labels to their objects)
  // ---------------------------------------------------------------------------

  // Body flag lines (9 bodies * 2 endpoints * 3 coords = 54 floats)
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

  // Star flag lines (one line segment per major star)
  const starFlagLinesGeometry = new THREE.BufferGeometry();
  const starFlagLinesMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(0.6, 0.6, 0.7),
    transparent: true,
    opacity: 0.5,
  });
  const starFlagLines = new THREE.LineSegments(starFlagLinesGeometry, starFlagLinesMaterial);
  labelsGroup.add(starFlagLines);

  // Star ID → position lookup (built during updateStars, magnitude-filtered)
  let starPositionMap: Map<number, THREE.Vector3> = new Map();

  // Star ID → position lookup for ALL stars (for constellation drawing, not magnitude-filtered)
  // Built once at initialization and reused regardless of magnitude settings
  let constellationStarPositionMap: Map<number, THREE.Vector3> = new Map();

  // Track rendered star count (after LOD culling)
  let renderedStarCount = 0;

  // Constellation line pairs (HR numbers)
  const constellationPairs = getAllConstellationLines();

  // Build the constellation star position map from all stars buffer (called once)
  function buildConstellationStarMap(engine: SkyEngine): void {
    const positions = getAllStarsPositionBuffer(engine);
    const meta = getAllStarsMetaBuffer(engine);
    const totalStars = engine.total_stars();

    constellationStarPositionMap = new Map();

    for (let i = 0; i < totalStars; i++) {
      const id = Math.round(meta[i * 4 + 2]);
      const x = positions[i * 3] * SKY_RADIUS;
      const y = positions[i * 3 + 1] * SKY_RADIUS;
      const z = positions[i * 3 + 2] * SKY_RADIUS;
      constellationStarPositionMap.set(id, new THREE.Vector3(x, y, z));
    }
  }

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
    // Use constellationStarPositionMap (all stars) to draw complete constellation lines
    // regardless of current magnitude limit
    const linePositions: number[] = [];

    for (const [hr1, hr2] of constellationPairs) {
      const pos1 = constellationStarPositionMap.get(hr1);
      const pos2 = constellationStarPositionMap.get(hr2);

      if (pos1 && pos2) {
        linePositions.push(pos1.x, pos1.y, pos1.z);
        linePositions.push(pos2.x, pos2.y, pos2.z);
      }
    }

    constellationGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(linePositions), 3)
    );

    // Update constellation label positions (centroid of all stars in constellation)
    for (const constellation of CONSTELLATIONS) {
      const label = constellationLabels.get(constellation.name);
      if (!label) continue;

      // Collect unique star IDs from this constellation's lines
      const starIds = new Set<number>();
      for (const [hr1, hr2] of constellation.lines) {
        starIds.add(hr1);
        starIds.add(hr2);
      }

      // Calculate centroid of all stars in constellation (using complete star map)
      let cx = 0, cy = 0, cz = 0;
      let count = 0;
      for (const id of starIds) {
        const pos = constellationStarPositionMap.get(id);
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

    // Update major star label positions with offset and flag lines
    const starFlagPositions: number[] = [];

    for (const [hr, _name] of MAJOR_STARS) {
      const label = starLabels.get(hr);
      if (!label) continue;

      const pos = starPositionMap.get(hr);
      if (pos) {
        // Calculate offset label position
        const labelPos = calculateLabelOffset(pos, LABEL_OFFSET);
        label.position.copy(labelPos);
        label.visible = true;

        // Add flag line from star to label
        starFlagPositions.push(pos.x, pos.y, pos.z);
        starFlagPositions.push(labelPos.x, labelPos.y, labelPos.z);
      } else {
        label.visible = false;
      }
    }

    // Update star flag lines geometry
    starFlagLinesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(starFlagPositions), 3)
    );
  }

  function updateBodies(engine: SkyEngine): void {
    const bodyPositions = getBodiesPositionBuffer(engine);
    const angularDiameters = getBodiesAngularDiametersBuffer(engine);
    const radius = SKY_RADIUS - 1;

    // Arrays for flag line geometry
    const flagLinePositions = new Float32Array(9 * 2 * 3);
    const flagLineColors = new Float32Array(9 * 2 * 3);

    // Sun direction (index 0) - needed for Moon/planet phase lighting
    const sunX = bodyPositions[0];
    const sunY = bodyPositions[1];
    const sunZ = bodyPositions[2];
    const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();

    // Helper to update flag line for a body
    function setFlagLine(bodyIdx: number, objPos: THREE.Vector3, labelPos: THREE.Vector3) {
      const color = BODY_COLORS[bodyIdx];
      const baseIdx = bodyIdx * 6;
      // Object end
      flagLinePositions[baseIdx] = objPos.x;
      flagLinePositions[baseIdx + 1] = objPos.y;
      flagLinePositions[baseIdx + 2] = objPos.z;
      // Label end
      flagLinePositions[baseIdx + 3] = labelPos.x;
      flagLinePositions[baseIdx + 4] = labelPos.y;
      flagLinePositions[baseIdx + 5] = labelPos.z;
      // Colors (same for both ends)
      flagLineColors[baseIdx] = color.r;
      flagLineColors[baseIdx + 1] = color.g;
      flagLineColors[baseIdx + 2] = color.b;
      flagLineColors[baseIdx + 3] = color.r;
      flagLineColors[baseIdx + 4] = color.g;
      flagLineColors[baseIdx + 5] = color.b;
    }

    // Update Sun mesh position
    const sunPos = new THREE.Vector3(sunX * radius, sunY * radius, sunZ * radius);
    sunMesh.position.copy(sunPos);

    // Scale Sun based on angular diameter (same exaggeration as Moon since they appear similar size)
    const sunAngDiam = angularDiameters[0];
    const sunScale = (sunAngDiam * SKY_RADIUS) / 2;
    const sunDisplayScale = Math.max(sunScale * 8, 0.4);
    sunMesh.scale.setScalar(sunDisplayScale);

    const sunLabelPos = calculateLabelOffset(sunPos, LABEL_OFFSET);
    bodyLabels[0].position.copy(sunLabelPos);
    setFlagLine(0, sunPos, sunLabelPos);

    // Moon position (index 1)
    const moonPos = new THREE.Vector3(
      bodyPositions[3] * radius,
      bodyPositions[4] * radius,
      bodyPositions[5] * radius
    );

    // Update Moon mesh position
    moonMesh.position.copy(moonPos);

    // Scale Moon based on angular diameter
    const moonAngDiam = angularDiameters[1];
    const moonScale = (moonAngDiam * SKY_RADIUS) / 2;
    // Exaggerate for visibility (real Moon is tiny at sky scale)
    const moonDisplayScale = Math.max(moonScale * 8, 0.4);
    moonMesh.scale.setScalar(moonDisplayScale);

    // Update Moon shader uniform - sun direction FROM MOON TO SUN for phase lighting
    const sunDirFromMoon = new THREE.Vector3().subVectors(sunPos, moonPos).normalize();
    moonMaterial.uniforms.sunDirection.value.copy(sunDirFromMoon);
    const moonLabelPos = calculateLabelOffset(moonPos, LABEL_OFFSET);
    bodyLabels[1].position.copy(moonLabelPos);
    setFlagLine(1, moonPos, moonLabelPos);

    // Update planet spheres (Mercury=2, Venus=3, Mars=4, Jupiter=5, Saturn=6)
    for (let i = 0; i < 5; i++) {
      const bodyIdx = PLANET_INDICES[i];
      const planetPos = new THREE.Vector3(
        bodyPositions[bodyIdx * 3] * radius,
        bodyPositions[bodyIdx * 3 + 1] * radius,
        bodyPositions[bodyIdx * 3 + 2] * radius
      );

      // Update position
      planetMeshes[i].position.copy(planetPos);

      // Scale based on angular diameter
      const angDiam = angularDiameters[bodyIdx];
      const scale = (angDiam * SKY_RADIUS) / 2;
      // Larger exaggeration for planets (they're much smaller than Moon)
      const displayScale = Math.max(scale * 40, 0.15);
      planetMeshes[i].scale.setScalar(displayScale);

      // Update phase shader uniform - sun direction FROM PLANET TO SUN
      const sunDirFromPlanet = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
      planetMaterials[i].uniforms.sunDirection.value.copy(sunDirFromPlanet);

      // Update label position with offset
      const labelPos = calculateLabelOffset(planetPos, LABEL_OFFSET);
      bodyLabels[bodyIdx].position.copy(labelPos);
      setFlagLine(bodyIdx, planetPos, labelPos);
    }

    // Update Uranus and Neptune labels (indices 7, 8) - not rendered as spheres
    for (const bodyIdx of [7, 8]) {
      const pos = new THREE.Vector3(
        bodyPositions[bodyIdx * 3] * radius,
        bodyPositions[bodyIdx * 3 + 1] * radius,
        bodyPositions[bodyIdx * 3 + 2] * radius
      );
      const labelPos = calculateLabelOffset(pos, LABEL_OFFSET);
      bodyLabels[bodyIdx].position.copy(labelPos);
      setFlagLine(bodyIdx, pos, labelPos);
    }

    // Update flag line geometry
    bodyFlagLinesGeometry.attributes.position.array.set(flagLinePositions);
    bodyFlagLinesGeometry.attributes.position.needsUpdate = true;
    bodyFlagLinesGeometry.attributes.color.array.set(flagLineColors);
    bodyFlagLinesGeometry.attributes.color.needsUpdate = true;
  }

  function updatePlanetaryMoons(engine: SkyEngine, fov: number): void {
    const visible = fov < PLANETARY_MOONS_FOV_THRESHOLD;

    // Hide all moons and labels if FOV is too wide
    if (!visible) {
      for (let i = 0; i < 5; i++) {
        planetaryMoonMeshes[i].visible = false;
        planetaryMoonLabels[i].visible = false;
      }
      return;
    }

    const moonsBuffer = getPlanetaryMoonsBuffer(engine);
    const radius = SKY_RADIUS - 0.5; // Slightly in front of sky sphere

    for (let i = 0; i < 5; i++) {
      const idx = i * 4;
      const x = moonsBuffer[idx] * radius;
      const y = moonsBuffer[idx + 1] * radius;
      const z = moonsBuffer[idx + 2] * radius;
      const angDiam = moonsBuffer[idx + 3];

      const mesh = planetaryMoonMeshes[i];
      mesh.position.set(x, y, z);

      // Scale - planetary moons are tiny, need significant exaggeration
      // Ganymede (largest) is ~1.7 arcsec at opposition = ~8e-6 rad
      const displayScale = Math.max((angDiam * SKY_RADIUS / 2) * 200, 0.08);
      mesh.scale.setScalar(displayScale);
      mesh.visible = true;

      // Update label position with offset
      const moonPos = new THREE.Vector3(x, y, z);
      const labelPos = calculateLabelOffset(moonPos, LABEL_OFFSET * 0.5);
      planetaryMoonLabels[i].position.copy(labelPos);
      planetaryMoonLabels[i].visible = labelsGroup.visible;
    }
  }

  // Track whether constellation star map has been initialized
  let constellationStarMapInitialized = false;

  function updateFromEngine(engine: SkyEngine, fov?: number): void {
    // Build constellation star map once on first call
    // This contains all star positions regardless of magnitude for complete constellation lines
    if (!constellationStarMapInitialized) {
      buildConstellationStarMap(engine);
      constellationStarMapInitialized = true;
    }

    // Use provided FOV or get from camera
    const effectiveFov = fov ?? camera.fov;
    updateStars(engine, effectiveFov);
    updateConstellations();
    updateBodies(engine);
    updatePlanetaryMoons(engine, effectiveFov);
  }

  function setConstellationsVisible(visible: boolean): void {
    constellationLines.visible = visible;
  }

  function setLabelsVisible(visible: boolean): void {
    labelsGroup.visible = visible;
  }

  /**
   * Set Milky Way visibility based on limiting magnitude.
   * The Milky Way becomes visible around mag 5.0 and reaches full brightness at mag 6.0+
   */
  function setMilkyWayVisibility(limitingMagnitude: number): void {
    // Milky Way starts becoming visible at mag 5.0, fully visible at 6.0
    const MIN_MAG = 5.0;
    const MAX_MAG = 6.0;
    const visibility = Math.max(0, Math.min(1, (limitingMagnitude - MIN_MAG) / (MAX_MAG - MIN_MAG)));
    milkyWayMaterial.uniforms.uVisibility.value = visibility;
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
    setMilkyWayVisibility,
    getRenderedStarCount,
    render,
    resize,
  };
}
