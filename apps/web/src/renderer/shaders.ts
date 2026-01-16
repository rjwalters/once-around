/**
 * GLSL Shaders
 *
 * All vertex and fragment shaders used in the renderer.
 */

// -----------------------------------------------------------------------------
// Moon shader for phase rendering
// -----------------------------------------------------------------------------

export const moonVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Transform normal to world space (not view space)
  // Use the upper 3x3 of modelMatrix for normal transformation
  vNormal = normalize(mat3(modelMatrix) * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const moonFragmentShader = `
uniform vec3 sunDirection;
uniform vec3 moonColor;
uniform float eclipseMode;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // During eclipse, render as pure black silhouette
  if (eclipseMode > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

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
// Textured planet shaders (Jupiter)
// -----------------------------------------------------------------------------

export const texturedPlanetVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const texturedPlanetFragmentShader = `
uniform vec3 sunDirection;
uniform sampler2D planetTexture;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  vec3 texColor = texture2D(planetTexture, vUv).rgb;

  float illumination = dot(vNormal, sunDirection);
  float lit = smoothstep(-0.1, 0.1, illumination);
  float ambient = 0.03;
  float brightness = ambient + (1.0 - ambient) * lit;

  gl_FragColor = vec4(texColor * brightness, 1.0);
}
`;

// -----------------------------------------------------------------------------
// DSO (Deep Sky Object) shaders
// -----------------------------------------------------------------------------

export const dsoVertexShader = `
attribute float size;
attribute vec3 color;
attribute vec2 ellipseParams; // x = axisRatio, y = positionAngle (radians)

varying vec3 vColor;
varying vec2 vEllipseParams;

void main() {
  vColor = color;
  vEllipseParams = ellipseParams;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // Size is in pixels
  gl_PointSize = size;
}
`;

export const dsoFragmentShader = `
varying vec3 vColor;
varying vec2 vEllipseParams;

void main() {
  // Get point coordinates (0,0 at center, -1 to 1 range)
  vec2 coord = gl_PointCoord * 2.0 - 1.0;

  // Apply rotation for position angle
  float angle = vEllipseParams.y;
  float cosA = cos(angle);
  float sinA = sin(angle);
  vec2 rotated = vec2(
    coord.x * cosA - coord.y * sinA,
    coord.x * sinA + coord.y * cosA
  );

  // Apply ellipse transformation (stretch along minor axis)
  float axisRatio = vEllipseParams.x;
  rotated.y /= axisRatio;

  // Gaussian falloff
  float dist = length(rotated);
  float alpha = exp(-dist * dist * 2.0);

  // Fade out at edges
  alpha *= smoothstep(1.0, 0.7, dist);

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(vColor, alpha * 0.6);
}
`;

// -----------------------------------------------------------------------------
// Comet tail shaders
// -----------------------------------------------------------------------------

export const cometTailVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cometTailFragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  // UV: x goes along tail length (0 = head, 1 = end), y is across (-0.5 to 0.5)
  float x = vUv.x;
  float y = vUv.y - 0.5;

  // Tail brightness falls off along length (exponential decay)
  float lengthFalloff = exp(-x * 3.0);

  // Tail gets narrower toward the end
  float tailWidth = 0.5 * (1.0 - x * 0.7);

  // Gaussian falloff across the tail width
  float crossFalloff = exp(-y * y / (tailWidth * tailWidth) * 8.0);

  // Combine for final alpha
  float alpha = lengthFalloff * crossFalloff * uIntensity;

  // Add slight color variation - bluer at edges (ion tail), yellower in center (dust tail)
  vec3 color = mix(uColor, vec3(0.6, 0.8, 1.0), abs(y) * 2.0);

  if (alpha < 0.005) discard;

  gl_FragColor = vec4(color, alpha);
}
`;

// -----------------------------------------------------------------------------
// Solar Corona shaders for total solar eclipse rendering
// -----------------------------------------------------------------------------

export const coronaVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const coronaFragmentShader = `
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying vec3 vNormal;

// Simplex-like noise for streamer variation
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Center coordinates
  vec2 centered = vUv * 2.0 - 1.0;
  float dist = length(centered);
  float angle = atan(centered.y, centered.x);

  // Inner cutoff (where the Moon is covering the Sun)
  // Corona plane is scaled to 8x Sun size (4x radius in each direction)
  // Inner radius of 0.25 corresponds to 1 solar/lunar radius
  // This is where the Moon's edge is during totality
  float innerRadius = 0.25;
  float outerRadius = 1.0;

  // Mask out the center and beyond the corona
  if (dist < innerRadius || dist > outerRadius) {
    discard;
  }

  // Radial falloff - K-corona brightness falls off as r^-2 to r^-3
  float radialFalloff = pow(innerRadius / dist, 2.5);

  // Streamer structure - coronal streamers extend outward
  // More streamers near solar equator, fewer at poles
  float numStreamers = 8.0;
  float streamerAngle = angle * numStreamers;

  // Add noise to break up regularity
  float noiseVal = fbm(vec2(angle * 3.0 + uTime * 0.1, dist * 5.0));
  float streamerNoise = fbm(vec2(angle * 6.0, dist * 2.0 + uTime * 0.05));

  // Streamer pattern - brighter at certain angles
  float streamers = 0.5 + 0.5 * sin(streamerAngle + noiseVal * 2.0);
  streamers = pow(streamers, 1.5);

  // Add fine structure variation
  float fineStructure = 0.7 + 0.3 * streamerNoise;

  // Combine effects
  float brightness = radialFalloff * (0.5 + 0.5 * streamers) * fineStructure;

  // Corona color - pearly white with slight warmth
  vec3 coronaColor = vec3(1.0, 0.98, 0.95);

  // Add subtle color variation at edges
  float edgeTint = smoothstep(0.3, 1.0, dist);
  coronaColor = mix(coronaColor, vec3(0.95, 0.9, 1.0), edgeTint * 0.3);

  // Apply intensity control
  brightness *= uIntensity;

  // Soft edge falloff
  float edgeFade = smoothstep(outerRadius, outerRadius * 0.7, dist);

  gl_FragColor = vec4(coronaColor * brightness, brightness * edgeFade);
}
`;

// -----------------------------------------------------------------------------
// Milky Way procedural shader
// -----------------------------------------------------------------------------

export const milkyWayVertexShader = `
varying vec3 vPosition;

void main() {
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const milkyWayFragmentShader = `
varying vec3 vPosition;
uniform float uLimitingMag; // Limiting magnitude of the sky

// Transformation matrix from equatorial to galactic coordinates (column-major for GLSL)
// Galactic north pole: RA=192.85948°, Dec=+27.12825° (12h 51m)
// Galactic center: RA=266.405°, Dec=-28.936° (17h 46m)
// Matrix transposed from standard row-major form for GLSL's column-major storage
const mat3 equatorialToGalactic = mat3(
  -0.0548755604, +0.4941094279, -0.8676661490,  // column 0
  -0.8734370902, -0.4448296300, -0.1980763734,  // column 1
  -0.4838350155, +0.7469822445, +0.4559837762   // column 2
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

// 3D Fractal Brownian Motion - seamless on sphere (reduced octaves for performance)
float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise3(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Early out if sky is too bright for any Milky Way visibility
  // Brightest parts are ~mag 4.5, so nothing visible below ~4.0
  if (uLimitingMag < 4.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Normalize position to get direction on unit sphere (Three.js Y-up coords)
  vec3 dir = normalize(vPosition);

  // Convert from Three.js (Y-up) to equatorial (Z-up) before galactic transform
  // Three.js: X=RA0, Y=north pole, Z=RA90
  // Equatorial: X=RA0, Y=RA90, Z=north pole
  vec3 eqDir = vec3(dir.x, dir.z, dir.y);

  // Transform to galactic coordinates
  vec3 galDir = equatorialToGalactic * eqDir;

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

  // Convert brightness to surface magnitude
  // Peak brightness (1.0) = mag 4.5, following magnitude formula
  // surfaceMag = peakMag - 2.5 * log10(brightness)
  // Clamp brightness to avoid log(0)
  float clampedBrightness = max(brightness, 0.001);
  float surfaceMag = 4.5 - 2.5 * log(clampedBrightness) / log(10.0);

  // Visibility based on whether this region's surface brightness
  // is detectable given the limiting magnitude
  // Use smoothstep for gradual transition over ~0.5 mag
  float visibility = smoothstep(surfaceMag - 0.25, surfaceMag + 0.25, uLimitingMag);

  // Final output - subtle glow, not overpowering the stars
  float alpha = brightness * 0.4 * visibility;
  gl_FragColor = vec4(color * brightness * 0.5 * visibility, alpha);
}
`;
