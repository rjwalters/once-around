import * as THREE from "three";

/**
 * Camera state for persistence.
 */
export interface CameraState {
  quaternion: { x: number; y: number; z: number; w: number };
  fov: number;
}

/**
 * Celestial camera controls - simple drag-to-rotate model.
 *
 * Dragging the mouse rotates the view proportionally to the drag distance.
 * Uses quaternion-based rotation to avoid pole singularities.
 */
export interface CelestialControls {
  update(): void;
  dispose(): void;
  lookAtRaDec(ra: number, dec: number): void;
  animateToRaDec(ra: number, dec: number, durationMs?: number): void;
  getCameraState(): CameraState;
  setCameraState(state: CameraState): void;
  getRaDec(): { ra: number; dec: number };
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
    // Default view direction is +X (before any rotation)
    return new THREE.Vector3(1, 0, 0).applyQuaternion(viewQuaternion);
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
    // Default right is +Z (in our coordinate system), transformed by view quaternion
    // Actually: right = forward × up, but we can derive it from the quaternion directly
    // For a view looking at +X with up +Y, right is -Z
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
   * dx rotates around camera's local up axis (left/right)
   * dy rotates around camera's local right axis (up/down)
   */
  function applyRotation(angleX: number, angleY: number): void {
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

  /**
   * Apply incremental rotation from pixel delta.
   */
  function applyDragDelta(dx: number, dy: number): void {
    const angleX = -pixelToAngle(dx); // Flip horizontal
    const angleY = pixelToAngle(dy);
    applyRotation(angleX, angleY);
  }

  // --- Mouse handlers ---

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

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
    event.preventDefault();
    const delta = event.deltaY * zoomSpeed;
    const newFov = Math.max(minFov, Math.min(maxFov, camera.fov + delta));
    if (newFov !== camera.fov) {
      camera.fov = newFov;
      camera.updateProjectionMatrix();
      updateCameraDirection();
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
        updateCameraDirection();
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
    let angleX = 0;
    let angleY = 0;

    switch (event.key) {
      case "ArrowLeft":
        angleX = -ARROW_KEY_SPEED;
        break;
      case "ArrowRight":
        angleX = ARROW_KEY_SPEED;
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
    // X axis points to RA=0, Dec=0
    // Y axis points to Dec=+90 (north celestial pole)
    // Z axis points to RA=90°, Dec=0
    // This matches getRaDec() which uses atan2(z, x) for RA
    const cosDec = Math.cos(decRad);
    const targetDir = new THREE.Vector3(
      cosDec * Math.cos(raRad),
      Math.sin(decRad),
      cosDec * Math.sin(raRad)
    );

    // Our default view direction is +X
    const defaultDir = new THREE.Vector3(1, 0, 0);

    // Create quaternion that rotates default to target
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(defaultDir, targetDir);

    return quat;
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
    // RA from atan2(z, x), converted to degrees
    let ra = Math.atan2(dir.z, dir.x) * (180 / Math.PI);
    if (ra < 0) ra += 360;
    // Dec from asin(y), converted to degrees
    const dec = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    return { ra, dec };
  }

  const controlsApi: CelestialControls = {
    update,
    dispose,
    lookAtRaDec,
    animateToRaDec,
    getCameraState,
    setCameraState,
    getRaDec,
    onFovChange: undefined,
    onCameraChange: undefined,
  };

  // Mark API as ready for callback invocation
  apiReady = true;

  return controlsApi;
}
