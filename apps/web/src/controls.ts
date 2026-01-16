import * as THREE from "three";

/**
 * Camera state for persistence.
 */
export interface CameraState {
  quaternion: { x: number; y: number; z: number; w: number };
  fov: number;
}

/**
 * View mode type.
 * - geocentric: Observer at Earth's center, RA/Dec navigation, stars fixed
 * - topocentric: Observer on Earth's surface, Alt/Az navigation, horizon fixed
 */
export type ViewMode = 'geocentric' | 'topocentric';

/**
 * Celestial camera controls - simple drag-to-rotate model.
 *
 * Dragging the mouse rotates the view proportionally to the drag distance.
 * Uses quaternion-based rotation to avoid pole singularities in geocentric mode.
 * In topocentric mode, navigation is in Alt/Az coordinates with horizon always level.
 */
export interface CelestialControls {
  update(): void;
  dispose(): void;
  lookAtRaDec(ra: number, dec: number): void;
  animateToRaDec(ra: number, dec: number, durationMs?: number): void;
  getCameraState(): CameraState;
  setCameraState(state: CameraState): void;
  getRaDec(): { ra: number; dec: number };
  setQuaternion(quaternion: THREE.Quaternion): void;
  setEnabled(enabled: boolean): void;
  // Topocentric mode methods
  setViewMode(mode: ViewMode): void;
  getViewMode(): ViewMode;
  setTopocentricParams(latitudeRad: number, lstRad: number): void;
  getAltAz(): { altitude: number; azimuth: number } | null;
  animateToAltAz(altitude: number, azimuth: number, durationMs?: number): void;
  onFovChange?: (fov: number) => void;
  onCameraChange?: () => void;
}

// Debug elements
const dbg = {
  theta: document.getElementById("dbg-theta"),
  phi: document.getElementById("dbg-phi"),
  startX: document.getElementById("dbg-start-x"),
  startY: document.getElementById("dbg-start-y"),
  dx: document.getElementById("dbg-dx"),
  dy: document.getElementById("dbg-dy"),
  dtheta: document.getElementById("dbg-dtheta"),
  dphi: document.getElementById("dbg-dphi"),
  fov: document.getElementById("dbg-fov"),
};

function toDeg(rad: number): string {
  return ((rad * 180) / Math.PI).toFixed(1);
}

function updateDebug(data: {
  theta?: number;
  phi?: number;
  startX?: number;
  startY?: number;
  dx?: number;
  dy?: number;
  dtheta?: number;
  dphi?: number;
  fov: number;
}): void {
  if (dbg.theta) dbg.theta.textContent = data.theta !== undefined ? toDeg(data.theta) : "-";
  if (dbg.phi) dbg.phi.textContent = data.phi !== undefined ? toDeg(data.phi) : "-";
  if (dbg.startX) dbg.startX.textContent = data.startX?.toFixed(0) ?? "-";
  if (dbg.startY) dbg.startY.textContent = data.startY?.toFixed(0) ?? "-";
  if (dbg.dx) dbg.dx.textContent = data.dx?.toFixed(0) ?? "-";
  if (dbg.dy) dbg.dy.textContent = data.dy?.toFixed(0) ?? "-";
  if (dbg.dtheta) dbg.dtheta.textContent = data.dtheta !== undefined ? toDeg(data.dtheta) : "-";
  if (dbg.dphi) dbg.dphi.textContent = data.dphi !== undefined ? toDeg(data.dphi) : "-";
  if (dbg.fov) dbg.fov.textContent = data.fov.toFixed(0);
}

export function createCelestialControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement
): CelestialControls {
  // View orientation stored as a quaternion
  const viewQuaternion = new THREE.Quaternion();

  // Drag state
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let dragStartX = 0;
  let dragStartY = 0;

  // FOV zoom settings
  // minFov of 0.5° simulates a high-power telescope eyepiece (~100x magnification)
  const minFov = 0.5;
  const maxFov = 100;
  const zoomSpeed = 0.05;

  // Animation state
  let isAnimating = false;
  let animStartTime = 0;
  let animDuration = 1000;

  // Flag to track if API is ready (for callback invocation)
  let apiReady = false;
  let animStartQuaternion = new THREE.Quaternion();
  let animTargetQuaternion = new THREE.Quaternion();

  // View mode state
  let viewMode: ViewMode = 'geocentric';

  // Topocentric mode state
  let topoLatitude = 0; // Observer latitude in radians
  let topoLST = 0; // Local Sidereal Time in radians
  let topoAzimuth = 0; // Azimuth in radians, 0 = North, increasing eastward
  let topoAltitude = (30 * Math.PI) / 180; // Altitude in radians, default +30° (looking up)

  /**
   * Convert pixel delta to angular delta based on FOV.
   */
  function pixelToAngle(pixels: number): number {
    const rect = domElement.getBoundingClientRect();
    const fovRad = (camera.fov * Math.PI) / 180;
    return (pixels / rect.height) * fovRad;
  }

  /**
   * Get the current view direction from the quaternion.
   */
  function getViewDirection(): THREE.Vector3 {
    // Default view direction is -X (RA=0 after east-west fix)
    return new THREE.Vector3(-1, 0, 0).applyQuaternion(viewQuaternion);
  }

  /**
   * Get the camera's local up vector from the quaternion.
   */
  function getCameraUp(): THREE.Vector3 {
    // Default up is +Y, transformed by view quaternion
    return new THREE.Vector3(0, 1, 0).applyQuaternion(viewQuaternion);
  }

  /**
   * Get the camera's local right vector from the quaternion.
   */
  function getCameraRight(): THREE.Vector3 {
    // Default right is -Z (when forward = -X and up = +Y, right = -Z)
    return new THREE.Vector3(0, 0, -1).applyQuaternion(viewQuaternion);
  }

  /**
   * Get theta/phi from current view direction (for debug display).
   */
  function getSphericalFromQuaternion(): { theta: number; phi: number } {
    const dir = getViewDirection();
    const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    const theta = Math.atan2(dir.z, dir.x);
    return {
      theta: ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
      phi,
    };
  }

  /**
   * Update camera to match current view quaternion.
   */
  function updateCameraDirection(): void {
    const dir = getViewDirection();

    // Calculate and set the camera's up vector BEFORE lookAt
    // (lookAt uses camera.up to determine the final orientation)
    const right = getCameraRight();
    const cameraUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    camera.up.copy(cameraUp);

    // Now lookAt will use the correct up vector
    camera.lookAt(dir.x * 100, dir.y * 100, dir.z * 100);

    const spherical = getSphericalFromQuaternion();
    updateDebug({
      theta: spherical.theta,
      phi: spherical.phi,
      fov: camera.fov,
    });

    // Notify listeners of camera change (for settings persistence)
    if (apiReady) {
      controlsApi.onCameraChange?.();
    }
  }

  /**
   * Apply incremental rotation from mouse/keyboard delta.
   * In geocentric mode: dx/dy rotate around camera's local axes
   * In topocentric mode: dx changes azimuth, dy changes altitude
   */
  function applyRotation(angleX: number, angleY: number): void {
    if (viewMode === 'topocentric') {
      // In topocentric mode, horizontal drag changes azimuth
      // Drag left = look left (decrease azimuth), drag right = look right (increase azimuth)
      topoAzimuth = (topoAzimuth + angleX + 2 * Math.PI) % (2 * Math.PI);

      // Vertical drag changes altitude, clamped to valid range
      topoAltitude = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, topoAltitude + angleY)
      );

      updateTopocentricCamera();
    } else {
      // Geocentric mode: quaternion-based rotation
      // Rotate around camera's local up axis for horizontal movement
      const up = getCameraUp();
      const yawQuat = new THREE.Quaternion();
      yawQuat.setFromAxisAngle(up, angleX);

      // Rotate around camera's local right axis for vertical movement
      const right = getCameraRight();
      const pitchQuat = new THREE.Quaternion();
      pitchQuat.setFromAxisAngle(right, angleY);

      // Apply rotations: first yaw, then pitch
      viewQuaternion.premultiply(yawQuat);
      viewQuaternion.premultiply(pitchQuat);

      updateCameraDirection();
    }
  }

  /**
   * Apply incremental rotation from pixel delta.
   */
  function applyDragDelta(dx: number, dy: number): void {
    const angleX = pixelToAngle(dx); // No flip needed after east-west coordinate fix
    const angleY = pixelToAngle(dy);
    applyRotation(angleX, angleY);
  }

  // --- Mouse handlers ---

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || !inputEnabled) return;

    isDragging = true;
    isAnimating = false;
    lastX = event.clientX;
    lastY = event.clientY;
    dragStartX = event.clientX;
    dragStartY = event.clientY;

    domElement.style.cursor = "grabbing";
  }

  function onMouseMove(event: MouseEvent): void {
    if (!isDragging) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;

    applyDragDelta(dx, dy);

    // Update debug display
    const spherical = getSphericalFromQuaternion();
    updateDebug({
      theta: spherical.theta,
      phi: spherical.phi,
      startX: dragStartX,
      startY: dragStartY,
      dx: event.clientX - dragStartX,
      dy: event.clientY - dragStartY,
      fov: camera.fov,
    });

    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onMouseUp(): void {
    isDragging = false;
    domElement.style.cursor = "grab";
  }

  function onWheel(event: WheelEvent): void {
    if (!inputEnabled) return;
    event.preventDefault();
    const delta = event.deltaY * zoomSpeed;
    const newFov = Math.max(minFov, Math.min(maxFov, camera.fov + delta));
    if (newFov !== camera.fov) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
      // Update camera based on view mode
      if (viewMode === 'topocentric') {
        updateTopocentricCamera();
      } else {
        updateCameraDirection();
      }
      controlsApi.onFovChange?.(camera.fov);
    }
  }

  // --- Touch handlers ---

  let initialPinchDistance = 0;
  let initialFov = 60;

  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(event: TouchEvent): void {
    if (!inputEnabled) return;
    if (event.touches.length === 1) {
      isDragging = true;
      isAnimating = false;
      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
      dragStartX = lastX;
      dragStartY = lastY;
    } else if (event.touches.length === 2) {
      isDragging = false;
      initialPinchDistance = getTouchDistance(event.touches);
      initialFov = camera.fov;
    }
  }

  function onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1 && isDragging) {
      const dx = event.touches[0].clientX - lastX;
      const dy = event.touches[0].clientY - lastY;

      applyDragDelta(dx, dy);

      lastX = event.touches[0].clientX;
      lastY = event.touches[0].clientY;
    } else if (event.touches.length === 2) {
      const currentDistance = getTouchDistance(event.touches);
      const scale = initialPinchDistance / currentDistance;
      const newFov = Math.max(minFov, Math.min(maxFov, initialFov * scale));
      if (newFov !== camera.fov) {
        camera.fov = newFov;
        camera.updateProjectionMatrix();
        // Update camera based on view mode
        if (viewMode === 'topocentric') {
          updateTopocentricCamera();
        } else {
          updateCameraDirection();
        }
        controlsApi.onFovChange?.(camera.fov);
      }
    }
  }

  function onTouchEnd(): void {
    isDragging = false;
  }

  // --- Keyboard handlers ---

  // Arrow key rotation speed in radians per keypress
  const ARROW_KEY_SPEED = 0.05;

  function onKeyDown(event: KeyboardEvent): void {
    if (!inputEnabled) return;
    let angleX = 0;
    let angleY = 0;

    switch (event.key) {
      case "ArrowLeft":
        angleX = ARROW_KEY_SPEED; // Flipped for east-west coordinate fix
        break;
      case "ArrowRight":
        angleX = -ARROW_KEY_SPEED; // Flipped for east-west coordinate fix
        break;
      case "ArrowUp":
        angleY = ARROW_KEY_SPEED;
        break;
      case "ArrowDown":
        angleY = -ARROW_KEY_SPEED;
        break;
      default:
        return; // Don't prevent default for other keys
    }

    event.preventDefault();
    isAnimating = false;
    applyRotation(angleX, angleY);
  }

  // --- Setup ---

  domElement.addEventListener("mousedown", onMouseDown);
  domElement.addEventListener("mousemove", onMouseMove);
  domElement.addEventListener("mouseup", onMouseUp);
  domElement.addEventListener("mouseleave", onMouseUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });

  domElement.addEventListener("touchstart", onTouchStart, { passive: false });
  domElement.addEventListener("touchmove", onTouchMove, { passive: false });
  domElement.addEventListener("touchend", onTouchEnd);

  window.addEventListener("keydown", onKeyDown);

  domElement.style.cursor = "grab";
  updateCameraDirection();

  // Easing function for smooth animation
  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function update(): void {
    if (!isAnimating) return;

    const now = performance.now();
    const elapsed = now - animStartTime;
    const progress = Math.min(1, elapsed / animDuration);
    const eased = easeInOutCubic(progress);

    // Spherical linear interpolation between quaternions
    viewQuaternion.slerpQuaternions(animStartQuaternion, animTargetQuaternion, eased);

    updateCameraDirection();

    if (progress >= 1) {
      isAnimating = false;
    }
  }

  /**
   * Create a quaternion that orients the view to look at the given RA/Dec.
   */
  function raDecToQuaternion(ra: number, dec: number): THREE.Quaternion {
    const raRad = (ra * Math.PI) / 180;
    const decRad = (dec * Math.PI) / 180;

    // Convert RA/Dec to a direction vector
    // -X axis points to RA=0, Dec=0 (negated for east-west fix)
    // Y axis points to Dec=+90 (north celestial pole)
    // +Z axis points to RA=90°, Dec=0
    // This matches getRaDec() which uses atan2(z, -x) for RA
    const cosDec = Math.cos(decRad);
    const targetDir = new THREE.Vector3(
      -cosDec * Math.cos(raRad),
      Math.sin(decRad),
      cosDec * Math.sin(raRad)
    );

    // Our default view direction is -X (matches RA=0 after east-west fix)
    const defaultDir = new THREE.Vector3(-1, 0, 0);

    // Create quaternion that rotates default to target
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(defaultDir, targetDir);

    return quat;
  }

  // ---------------------------------------------------------------------------
  // Coordinate conversion functions for topocentric mode
  // ---------------------------------------------------------------------------

  /**
   * Convert RA/Dec (degrees) to direction vector in Three.js coordinates.
   */
  function raDecToDirection(raDeg: number, decDeg: number): THREE.Vector3 {
    const raRad = (raDeg * Math.PI) / 180;
    const decRad = (decDeg * Math.PI) / 180;
    const cosDec = Math.cos(decRad);
    return new THREE.Vector3(
      -cosDec * Math.cos(raRad),
      Math.sin(decRad),
      cosDec * Math.sin(raRad)
    );
  }

  /**
   * Convert equatorial (RA/Dec) to horizontal (Alt/Az) coordinates.
   * All inputs and outputs in degrees.
   */
  function equatorialToHorizontal(
    raDeg: number,
    decDeg: number,
    lstDeg: number,
    latDeg: number
  ): { altitude: number; azimuth: number } {
    const raRad = (raDeg * Math.PI) / 180;
    const decRad = (decDeg * Math.PI) / 180;
    const lstRad = (lstDeg * Math.PI) / 180;
    const latRad = (latDeg * Math.PI) / 180;

    const ha = lstRad - raRad; // Hour angle

    const sinAlt =
      Math.sin(decRad) * Math.sin(latRad) +
      Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
    const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const cosAlt = Math.cos(altitude);
    // Avoid division by zero at zenith
    if (Math.abs(cosAlt) < 1e-10) {
      return { altitude: (altitude * 180) / Math.PI, azimuth: 0 };
    }

    const cosAz =
      (Math.sin(decRad) - Math.sin(altitude) * Math.sin(latRad)) /
      (cosAlt * Math.cos(latRad));
    const sinAz = (-Math.cos(decRad) * Math.sin(ha)) / cosAlt;
    let azimuth = Math.atan2(sinAz, cosAz);
    if (azimuth < 0) azimuth += 2 * Math.PI;

    return {
      altitude: (altitude * 180) / Math.PI,
      azimuth: (azimuth * 180) / Math.PI,
    };
  }

  /**
   * Convert horizontal (Alt/Az) to equatorial (RA/Dec) coordinates.
   * All inputs and outputs in degrees.
   */
  function horizontalToEquatorial(
    azDeg: number,
    altDeg: number,
    lstDeg: number,
    latDeg: number
  ): { ra: number; dec: number } {
    const azRad = (azDeg * Math.PI) / 180;
    const altRad = (altDeg * Math.PI) / 180;
    const latRad = (latDeg * Math.PI) / 180;

    const sinDec =
      Math.sin(altRad) * Math.sin(latRad) +
      Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
    const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

    const cosDec = Math.cos(dec);
    // Avoid division by zero near poles
    if (Math.abs(cosDec) < 1e-10 || Math.abs(Math.cos(latRad)) < 1e-10) {
      return { ra: lstDeg, dec: (dec * 180) / Math.PI };
    }

    const cosHA =
      (Math.sin(altRad) - Math.sin(dec) * Math.sin(latRad)) /
      (cosDec * Math.cos(latRad));
    const sinHA = (-Math.cos(altRad) * Math.sin(azRad)) / cosDec;
    const ha = Math.atan2(sinHA, Math.max(-1, Math.min(1, cosHA)));

    let ra = lstDeg - (ha * 180) / Math.PI;
    if (ra < 0) ra += 360;
    if (ra >= 360) ra -= 360;

    return { ra, dec: (dec * 180) / Math.PI };
  }

  /**
   * Update camera orientation for topocentric mode based on current Alt/Az.
   * Horizon is always level in this mode.
   */
  function updateTopocentricCamera(): void {
    // Zenith direction in equatorial coords: Dec = latitude, RA = LST
    const lstDeg = (topoLST * 180) / Math.PI;
    const latDeg = (topoLatitude * 180) / Math.PI;
    const zenith = raDecToDirection(lstDeg, latDeg);

    // North celestial pole
    const northPole = new THREE.Vector3(0, 1, 0);

    // North direction on horizon = north pole projected to horizon plane
    // (perpendicular to zenith)
    const north = northPole
      .clone()
      .sub(zenith.clone().multiplyScalar(northPole.dot(zenith)))
      .normalize();

    // East = zenith × north (right-hand rule)
    const east = new THREE.Vector3().crossVectors(zenith, north).normalize();

    // View direction from Alt/Az
    const cosAlt = Math.cos(topoAltitude);
    const sinAlt = Math.sin(topoAltitude);
    const cosAz = Math.cos(topoAzimuth);
    const sinAz = Math.sin(topoAzimuth);

    const viewDir = new THREE.Vector3()
      .addScaledVector(north, cosAlt * cosAz)
      .addScaledVector(east, cosAlt * sinAz)
      .addScaledVector(zenith, sinAlt)
      .normalize();

    // Camera up is always toward zenith (horizon stays level)
    camera.up.copy(zenith);
    camera.lookAt(viewDir.x * 100, viewDir.y * 100, viewDir.z * 100);

    // Update debug display
    updateDebug({ fov: camera.fov });

    // Notify listeners
    if (apiReady) {
      controlsApi.onCameraChange?.();
    }
  }

  /**
   * Center the camera on a celestial object given its RA/Dec coordinates.
   * @param ra Right Ascension in degrees (0-360)
   * @param dec Declination in degrees (-90 to +90)
   */
  function lookAtRaDec(ra: number, dec: number): void {
    viewQuaternion.copy(raDecToQuaternion(ra, dec));
    isAnimating = false;
    updateCameraDirection();
  }

  /**
   * Animate the camera to center on a celestial object given its RA/Dec coordinates.
   * @param ra Right Ascension in degrees (0-360)
   * @param dec Declination in degrees (-90 to +90)
   * @param durationMs Animation duration in milliseconds (default 1000)
   */
  function animateToRaDec(ra: number, dec: number, durationMs: number = 1000): void {
    animStartQuaternion.copy(viewQuaternion);
    animTargetQuaternion.copy(raDecToQuaternion(ra, dec));
    animDuration = durationMs;
    animStartTime = performance.now();
    isAnimating = true;
  }

  function dispose(): void {
    domElement.removeEventListener("mousedown", onMouseDown);
    domElement.removeEventListener("mousemove", onMouseMove);
    domElement.removeEventListener("mouseup", onMouseUp);
    domElement.removeEventListener("mouseleave", onMouseUp);
    domElement.removeEventListener("wheel", onWheel);
    domElement.removeEventListener("touchstart", onTouchStart);
    domElement.removeEventListener("touchmove", onTouchMove);
    domElement.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("keydown", onKeyDown);
  }

  function getCameraState(): CameraState {
    return {
      quaternion: {
        x: viewQuaternion.x,
        y: viewQuaternion.y,
        z: viewQuaternion.z,
        w: viewQuaternion.w,
      },
      fov: camera.fov,
    };
  }

  function setCameraState(state: CameraState): void {
    viewQuaternion.set(
      state.quaternion.x,
      state.quaternion.y,
      state.quaternion.z,
      state.quaternion.w
    );
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
    updateCameraDirection();
  }

  /**
   * Get the current view center as RA/Dec coordinates.
   * @returns RA in degrees (0-360), Dec in degrees (-90 to +90)
   */
  function getRaDec(): { ra: number; dec: number } {
    const dir = getViewDirection();
    // RA from atan2(z, -x) to account for east-west coordinate fix (only X negated)
    let ra = Math.atan2(dir.z, -dir.x) * (180 / Math.PI);
    if (ra < 0) ra += 360;
    // Dec from asin(y), converted to degrees
    const dec = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    return { ra, dec };
  }

  /**
   * Set the view quaternion directly (used by device orientation / AR mode).
   */
  function setQuaternion(quaternion: THREE.Quaternion): void {
    viewQuaternion.copy(quaternion);
    isAnimating = false;
    updateCameraDirection();
  }

  // Track whether user input is enabled (disabled during AR mode)
  let inputEnabled = true;

  /**
   * Enable or disable user input controls (mouse/touch/keyboard).
   * Used to disable manual controls when device orientation / AR mode is active.
   */
  function setEnabled(enabled: boolean): void {
    inputEnabled = enabled;
    domElement.style.cursor = enabled ? "grab" : "default";
  }

  /**
   * Set the view mode (geocentric or topocentric).
   * When switching modes, converts the current view direction to preserve
   * the same sky region being centered.
   */
  function setViewMode(mode: ViewMode): void {
    if (mode === viewMode) return;

    if (mode === 'topocentric') {
      // Convert current RA/Dec to Alt/Az
      const { ra, dec } = getRaDec();
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const altAz = equatorialToHorizontal(ra, dec, lstDeg, latDeg);
      topoAzimuth = (altAz.azimuth * Math.PI) / 180;
      topoAltitude = (altAz.altitude * Math.PI) / 180;
      viewMode = mode;
      updateTopocentricCamera();
    } else {
      // Convert current Alt/Az to RA/Dec
      const altDeg = (topoAltitude * 180) / Math.PI;
      const azDeg = (topoAzimuth * 180) / Math.PI;
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const raDec = horizontalToEquatorial(azDeg, altDeg, lstDeg, latDeg);
      viewMode = mode;
      lookAtRaDec(raDec.ra, raDec.dec);
    }

    isAnimating = false;
  }

  /**
   * Get the current view mode.
   */
  function getViewMode(): ViewMode {
    return viewMode;
  }

  /**
   * Set the topocentric parameters (observer latitude and local sidereal time).
   * Call this when time changes to keep the horizon correctly positioned.
   * @param latitudeRad Observer latitude in radians
   * @param lstRad Local Sidereal Time in radians
   */
  function setTopocentricParams(latitudeRad: number, lstRad: number): void {
    topoLatitude = latitudeRad;
    topoLST = lstRad;

    // If in topocentric mode, update the camera to reflect new LST
    if (viewMode === 'topocentric') {
      updateTopocentricCamera();
    }
  }

  /**
   * Get the current view center as Alt/Az coordinates.
   * Only valid in topocentric mode.
   * @returns Altitude in degrees (-90 to +90), Azimuth in degrees (0 to 360)
   */
  function getAltAz(): { altitude: number; azimuth: number } | null {
    if (viewMode !== 'topocentric') {
      // In geocentric mode, compute Alt/Az from current RA/Dec
      const { ra, dec } = getRaDec();
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      return equatorialToHorizontal(ra, dec, lstDeg, latDeg);
    }

    return {
      altitude: (topoAltitude * 180) / Math.PI,
      azimuth: (topoAzimuth * 180) / Math.PI,
    };
  }

  // Animation state for Alt/Az
  let altAzAnimStartAlt = 0;
  let altAzAnimStartAz = 0;
  let altAzAnimTargetAlt = 0;
  let altAzAnimTargetAz = 0;
  let altAzAnimDuration = 0;
  let altAzAnimStartTime = 0;
  let altAzIsAnimating = false;

  /**
   * Animate the view to a specific Alt/Az position (topocentric mode only).
   * @param altitude Target altitude in degrees (-90 to +90)
   * @param azimuth Target azimuth in degrees (0 to 360, 0 = North)
   * @param durationMs Animation duration in milliseconds (default 1000)
   */
  function animateToAltAz(altitude: number, azimuth: number, durationMs: number = 1000): void {
    if (viewMode !== 'topocentric') {
      // If not in topocentric mode, convert to RA/Dec and use that animation
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const raDec = horizontalToEquatorial(azimuth, altitude, lstDeg, latDeg);
      animateToRaDec(raDec.ra, raDec.dec, durationMs);
      return;
    }

    altAzAnimStartAlt = topoAltitude;
    altAzAnimStartAz = topoAzimuth;
    altAzAnimTargetAlt = (altitude * Math.PI) / 180;

    // Normalize target azimuth
    let targetAz = ((azimuth % 360) * Math.PI) / 180;
    if (targetAz < 0) targetAz += 2 * Math.PI;

    // Choose shortest path for azimuth animation
    let azDiff = targetAz - topoAzimuth;
    if (azDiff > Math.PI) azDiff -= 2 * Math.PI;
    if (azDiff < -Math.PI) azDiff += 2 * Math.PI;
    altAzAnimTargetAz = topoAzimuth + azDiff;

    altAzAnimDuration = durationMs;
    altAzAnimStartTime = performance.now();
    altAzIsAnimating = true;
    isAnimating = true;
  }

  // Modify update to handle Alt/Az animation
  const originalUpdate = update;
  update = function() {
    if (altAzIsAnimating && viewMode === 'topocentric') {
      const elapsed = performance.now() - altAzAnimStartTime;
      const t = Math.min(1, elapsed / altAzAnimDuration);

      // Smooth easing
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      topoAltitude = altAzAnimStartAlt + (altAzAnimTargetAlt - altAzAnimStartAlt) * eased;
      topoAzimuth = altAzAnimStartAz + (altAzAnimTargetAz - altAzAnimStartAz) * eased;

      // Normalize azimuth
      topoAzimuth = ((topoAzimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

      updateTopocentricCamera();

      if (t >= 1) {
        altAzIsAnimating = false;
        isAnimating = false;
      }
    }

    originalUpdate();
  };

  const controlsApi: CelestialControls = {
    update,
    dispose,
    lookAtRaDec,
    animateToRaDec,
    getCameraState,
    setCameraState,
    getRaDec,
    setQuaternion,
    setEnabled,
    setViewMode,
    getViewMode,
    setTopocentricParams,
    getAltAz,
    animateToAltAz,
    onFovChange: undefined,
    onCameraChange: undefined,
  };

  // Mark API as ready for callback invocation
  apiReady = true;

  return controlsApi;
}
