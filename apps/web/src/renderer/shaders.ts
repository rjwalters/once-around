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
uniform float time;
uniform vec3 zenith;
uniform float scintillationIntensity;
uniform bool scintillationEnabled;
uniform float planetId;
uniform float opacity;
// LOD uniforms
uniform float pixelSize;   // Apparent size in pixels
uniform vec3 bodyColor;    // Planet's characteristic color

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

// LOD thresholds (must match bodies.ts constants)
const float LOD_SIMPLE_DISK_MAX = 10.0;   // Below this: solid color only
const float LOD_BLEND_DISK_MAX = 30.0;    // Below this: blend color and texture

// Compute altitude of planet above horizon (0 to 1 for 0° to 90°)
float computeAltitude(vec3 pos, vec3 zenithDir) {
  vec3 dir = normalize(pos);
  float sinAlt = dot(dir, zenithDir);
  return max(0.0, sinAlt);
}

// Compute airmass approximation (Kasten-Young simplified)
float computeAirmass(float altitude) {
  float sinAlt = max(0.01, altitude);
  return 1.0 / sinAlt;
}

void main() {
  // Calculate phase lighting (used at all LOD levels)
  float illumination = dot(vNormal, sunDirection);
  float lit = smoothstep(-0.1, 0.1, illumination);
  float ambient = 0.03;
  float brightness = ambient + (1.0 - ambient) * lit;

  // LOD-based color selection:
  // Level 1 (< 10px): pure body color, no texture
  // Level 2 (10-30px): blend between body color and texture
  // Level 3 (> 30px): full texture
  vec3 baseColor;

  if (pixelSize < LOD_SIMPLE_DISK_MAX) {
    // Level 1: Simple solid color disk - texture detail would be wasted
    baseColor = bodyColor;
  } else if (pixelSize < LOD_BLEND_DISK_MAX) {
    // Level 2: Blend between solid color and texture
    // As we zoom in, gradually introduce texture detail
    float texBlend = (pixelSize - LOD_SIMPLE_DISK_MAX) / (LOD_BLEND_DISK_MAX - LOD_SIMPLE_DISK_MAX);
    vec3 texColor = texture2D(planetTexture, vUv).rgb;
    baseColor = mix(bodyColor, texColor, texBlend);
  } else {
    // Level 3: Full texture detail
    baseColor = texture2D(planetTexture, vUv).rgb;
  }

  vec3 finalColor = baseColor * brightness;

  // Apply scintillation when enabled (planets twinkle like bright stars when small)
  if (scintillationEnabled && scintillationIntensity > 0.0) {
    float altitude = computeAltitude(vPosition, zenith);
    float airmass = computeAirmass(altitude);

    // Planets are bright, so they twinkle noticeably
    float amplitude = min(airmass / 8.0, 0.6) * scintillationIntensity;

    // Use planet ID for phase offset (each planet twinkles differently)
    float phase = fract(planetId * 1234.5678) * 6.28318;
    float freq1 = 8.0 + mod(planetId, 7.0);
    float freq2 = 13.0 + mod(planetId, 11.0);
    float t = time;

    // Brightness modulation
    float scintBrightness = 1.0 + amplitude * 0.5 * (
      sin(freq1 * t + phase) +
      0.5 * sin(freq2 * t + phase * 1.7)
    );

    // Chromatic modulation (R/G/B at slightly different frequencies)
    float colorAmp = amplitude * 0.25;
    float r = 1.0 + colorAmp * sin(freq1 * 0.9 * t + phase);
    float g = 1.0 + colorAmp * sin(freq1 * t + phase + 0.5);
    float b = 1.0 + colorAmp * sin(freq1 * 1.1 * t + phase + 1.0);

    finalColor = finalColor * scintBrightness * vec3(r, g, b);
  }

  gl_FragColor = vec4(finalColor, opacity);
}
`;

// -----------------------------------------------------------------------------
// Earth shader for Hubble view (day/night terminator with city lights)
// -----------------------------------------------------------------------------

export const earthVertexShader = `
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

export const earthFragmentShader = `
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  // Sample both textures
  vec3 dayColor = texture2D(dayTexture, vUv).rgb;
  vec3 nightColor = texture2D(nightTexture, vUv).rgb;

  // Compute illumination from sun direction
  // sunDirection points FROM Earth TO Sun
  float illumination = dot(vNormal, sunDirection);

  // Smooth terminator transition for day side
  // -0.1 to 0.2 gives a realistic twilight zone
  float dayMix = smoothstep(-0.1, 0.2, illumination);

  // Night lights intensity - only visible on dark side
  // Fade out as we approach the terminator
  float nightIntensity = smoothstep(0.1, -0.2, illumination);

  // Boost night lights for visibility (they're dim in the texture)
  vec3 boostedNightColor = nightColor * 3.0;

  // Ambient light so Earth is always visible (important for JWST view where we see night side)
  vec3 ambientColor = dayColor * 0.15;

  // Combine: day texture on lit side, night lights + ambient on dark side
  vec3 finalColor = dayColor * dayMix + (boostedNightColor * nightIntensity + ambientColor) * (1.0 - dayMix);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Earth cloud layer shader (uses texture brightness as alpha)
// -----------------------------------------------------------------------------

export const cloudVertexShader = `
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragmentShader = `
uniform sampler2D cloudTexture;
uniform vec3 sunDirection;

varying vec3 vNormal;
varying vec2 vUv;

void main() {
  // Sample cloud texture - grayscale where white = clouds
  float cloudDensity = texture2D(cloudTexture, vUv).r;

  // Compute illumination from sun direction
  float illumination = dot(vNormal, sunDirection);

  // Smooth lighting transition
  float lit = smoothstep(-0.1, 0.3, illumination);

  // Clouds are white, lit by the sun
  // Ambient light on night side so clouds aren't invisible
  float ambient = 0.15;
  float brightness = ambient + (1.0 - ambient) * lit;

  // Cloud color (slightly blue-tinted white)
  vec3 cloudColor = vec3(0.95, 0.97, 1.0) * brightness;

  // Use cloud density as alpha (threshold to reduce haze)
  float alpha = smoothstep(0.1, 0.6, cloudDensity) * 0.9;

  gl_FragColor = vec4(cloudColor, alpha);
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

// -----------------------------------------------------------------------------
// JWST View Mode - Earth from L2 (night side with limb glow)
// -----------------------------------------------------------------------------

export const jwstEarthVertexShader = `
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

export const jwstEarthFragmentShader = `
uniform sampler2D nightTexture;
uniform vec3 sunDirection;    // Direction FROM Earth TO Sun
uniform float pixelSize;      // For LOD-based rendering

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
  // From L2, we primarily see Earth's night side (facing away from Sun)
  // sunDirection points toward Sun, so the lit side faces +sunDirection
  // We're viewing from the opposite side, so we see the dark side

  float illumination = dot(vNormal, sunDirection);

  // Night side texture (city lights)
  vec3 nightColor = texture2D(nightTexture, vUv).rgb;

  // Boost night lights significantly for visibility
  vec3 boostedNight = nightColor * 4.0;

  // Base dark Earth color (very dark blue-gray)
  vec3 darkSide = vec3(0.02, 0.03, 0.05);

  // Night lights only visible on the dark side (which is what we see from L2)
  // The terminator is on the edge of the visible disk
  float nightIntensity = smoothstep(0.2, -0.1, illumination);

  // Atmospheric limb glow on the sun-facing edge
  // This is the bright crescent we'd see from L2
  // Calculate view direction (from object toward camera at origin)
  vec3 viewDir = normalize(-vPosition);
  float rimFactor = 1.0 - abs(dot(vNormal, viewDir));
  rimFactor = pow(rimFactor, 3.0);

  // Limb glow is brightest where the atmosphere catches sunlight
  // This is the sun-facing edge
  float sunEdge = smoothstep(-0.3, 0.5, illumination);

  // Atmospheric glow colors (blue scattered light + golden sun edge)
  vec3 atmosphereBlue = vec3(0.3, 0.5, 1.0);
  vec3 atmosphereGold = vec3(1.0, 0.8, 0.5);
  vec3 limbColor = mix(atmosphereBlue, atmosphereGold, sunEdge) * rimFactor * 2.5;

  // Thin crescent of actual daylight at the very edge
  float crescentEdge = smoothstep(0.0, 0.15, illumination) * rimFactor;
  vec3 crescentLight = vec3(0.9, 0.95, 1.0) * crescentEdge * 3.0;

  // Combine: dark base + city lights + atmospheric limb + crescent
  vec3 finalColor = darkSide + boostedNight * nightIntensity + limbColor + crescentLight;

  // Subtle overall blue tint for Earth's atmosphere
  finalColor = mix(finalColor, finalColor * vec3(0.9, 0.95, 1.1), 0.2);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// -----------------------------------------------------------------------------
// JWST View Mode - Moon from L2 (earthshine illumination)
// -----------------------------------------------------------------------------

export const jwstMoonVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const jwstMoonFragmentShader = `
uniform vec3 sunDirection;       // Direction FROM Moon TO Sun
uniform vec3 earthDirection;     // Direction FROM Moon TO Earth
uniform float earthPhase;        // Earth's illuminated fraction as seen from Moon (0-1)
uniform vec3 moonColor;          // Base moon surface color

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // From L2, we see primarily the Moon's dark side (facing away from Sun)
  // But the Moon is illuminated by earthshine (sunlight reflected from Earth)

  // Direct sunlight illumination (for the thin crescent)
  float sunIllum = dot(vNormal, sunDirection);

  // Earthshine illumination
  // Earth's brightness as seen from Moon varies with Earth's phase
  // At "full Earth" (new moon from Earth), earthshine is brightest
  float earthIllum = dot(vNormal, earthDirection);
  earthIllum = max(0.0, earthIllum);

  // Earthshine intensity based on Earth's phase
  // When Earth shows full face to Moon (earthPhase = 1), earthshine is maximum
  // Earthshine is about 0.1-0.2 lux at maximum (very dim)
  float earthshineStrength = earthPhase * 0.15;

  // Earthshine has a bluish tint (Earth reflects blue light from oceans/atmosphere)
  vec3 earthshineColor = vec3(0.6, 0.7, 1.0);

  // Thin crescent from direct sunlight on the sun-facing limb
  // From L2, this is the edge facing away from us (toward the Sun)
  float crescentFactor = smoothstep(0.0, 0.2, sunIllum);

  // View direction for rim lighting calculation
  vec3 viewDir = normalize(-vPosition);
  float rimFactor = 1.0 - abs(dot(vNormal, viewDir));
  rimFactor = pow(rimFactor, 4.0);

  // Crescent is visible at the rim where sun illuminates
  float crescent = crescentFactor * rimFactor * 3.0;

  // Base dark moon (what we see from L2 is the shadowed side)
  vec3 darkMoon = moonColor * 0.02;

  // Earthshine illumination of the visible (dark) side
  vec3 earthshine = moonColor * earthshineColor * earthshineStrength * earthIllum;

  // Direct sun crescent (bright edge)
  vec3 sunCrescent = moonColor * crescent;

  // Very subtle ambient (starlight, etc.)
  vec3 ambient = moonColor * 0.005;

  // Combine all lighting
  vec3 finalColor = darkMoon + earthshine + sunCrescent + ambient;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// -----------------------------------------------------------------------------
// Deep Field image shaders
// -----------------------------------------------------------------------------

export const deepFieldVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const deepFieldFragmentShader = `
uniform sampler2D uTexture;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  // Sample the deep field texture
  vec4 texColor = texture2D(uTexture, vUv);

  // Calculate distance from center for edge fade
  vec2 centered = vUv - 0.5;
  float dist = length(centered) * 2.0; // 0 at center, 1 at corners

  // Smooth edge fade to blend with starfield background
  // Start fading at 70% from center, fully faded at 100%
  float edgeFade = 1.0 - smoothstep(0.7, 1.0, dist);

  // Apply opacity and edge fade
  float finalAlpha = texColor.a * uOpacity * edgeFade;

  // Discard nearly transparent pixels
  if (finalAlpha < 0.01) discard;

  gl_FragColor = vec4(texColor.rgb, finalAlpha);
}
`;
