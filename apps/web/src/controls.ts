import * as THREE from "three";

/**
 * Celestial camera controls - "grab the sphere from inside" model.
 *
 * When you grab a point on the sky and drag, that point should track your cursor
 * exactly. We achieve this by:
 * 1. Converting screen position to a direction on the sky sphere
 * 2. Computing the rotation needed to move the grabbed point to the cursor position
 * 3. Decomposing that rotation into yaw (around world Y) and pitch (around camera right)
 *    to prevent roll accumulation
 */
export interface CelestialControls {
  update(): void;
  dispose(): void;
  lookAtRaDec(ra: number, dec: number): void;
  animateToRaDec(ra: number, dec: number, durationMs?: number): void;
  onFovChange?: (fov: number) => void;
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
  // View direction in spherical coordinates
  // theta: azimuth angle around Y axis (0 = +X direction)
  // phi: polar angle from +Y axis (0 = up, π/2 = horizon, π = down)
  let theta = 0;
  let phi = Math.PI / 2;

  // Drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTheta = 0;
  let dragStartPhi = 0;

  // The grabbed point as a 3D unit vector (where we clicked on the sky)
  const grabDir = new THREE.Vector3();

  // FOV zoom settings
  const minFov = 10;
  const maxFov = 100;
  const zoomSpeed = 0.05;

  // Animation state
  let isAnimating = false;
  let animStartTime = 0;
  let animDuration = 1000;
  let animStartTheta = 0;
  let animStartPhi = 0;
  let animTargetTheta = 0;
  let animTargetPhi = 0;

  /**
   * Convert screen position to a 3D direction vector on the unit sphere.
   * This properly handles the perspective projection without spherical coordinate singularities.
   */
  function screenToDirection(screenX: number, screenY: number): THREE.Vector3 {
    const rect = domElement.getBoundingClientRect();

    // Normalized device coordinates (-1 to 1)
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    // Convert to view angles
    const fovRad = (camera.fov * Math.PI) / 180;
    const aspect = rect.width / rect.height;

    // Half-angles
    const halfFovY = fovRad / 2;
    const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);

    // Direction in camera space (camera looks down -Z in Three.js camera space)
    const dirCamX = Math.tan(halfFovX) * ndcX;
    const dirCamY = Math.tan(halfFovY) * ndcY;
    const dirCamZ = -1; // Forward

    // Create direction vector in camera space
    const dirCam = new THREE.Vector3(dirCamX, dirCamY, dirCamZ).normalize();

    // Transform to world space using camera's world matrix
    // But our camera is at origin and we control it via theta/phi, so we need to
    // manually construct the rotation
    const viewDir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );

    // Camera's right vector (perpendicular to view and world up)
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(viewDir, worldUp).normalize();

    // Camera's up vector (perpendicular to view and right)
    const up = new THREE.Vector3().crossVectors(right, viewDir).normalize();

    // Transform camera-space direction to world space
    // dirCam.x -> right, dirCam.y -> up, dirCam.z -> -viewDir
    const worldDir = new THREE.Vector3()
      .addScaledVector(right, dirCam.x)
      .addScaledVector(up, dirCam.y)
      .addScaledVector(viewDir, -dirCam.z)
      .normalize();

    return worldDir;
  }

  /**
   * Compute the view direction (theta, phi) such that a given world direction
   * appears at the specified screen position.
   *
   * Uses vector math to avoid polar singularities.
   */
  function computeViewForDirectionAtScreen(
    targetDir: THREE.Vector3,
    screenX: number,
    screenY: number
  ): { theta: number; phi: number } {
    const rect = domElement.getBoundingClientRect();

    // Normalized device coordinates
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    // Convert to view angles
    const fovRad = (camera.fov * Math.PI) / 180;
    const aspect = rect.width / rect.height;
    const halfFovY = fovRad / 2;
    const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);

    // The offset angles from center
    const angleX = Math.atan(Math.tan(halfFovX) * ndcX);
    const angleY = Math.atan(Math.tan(halfFovY) * ndcY);

    // We need to find a view direction V such that targetDir appears at (angleX, angleY)
    // from the view center.

    // Start with targetDir and rotate it to be the view center
    // First, undo the vertical offset (pitch)
    const pitchAxis = new THREE.Vector3(1, 0, 0); // Will be rotated
    const yawAxis = new THREE.Vector3(0, 1, 0);

    // We need to find V such that rotating V by angleY around camera-right
    // and then by angleX around world-up gives us targetDir

    // Work backwards: rotate targetDir by -angleX around world-up, then -angleY around right
    const viewDir = targetDir.clone();

    // Undo horizontal rotation (around world Y)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(yawAxis, -angleX);
    viewDir.applyQuaternion(yawQuat);

    // For vertical rotation, we need the right vector of this intermediate view
    const intermediateRight = new THREE.Vector3().crossVectors(viewDir, yawAxis);
    if (intermediateRight.lengthSq() < 0.001) {
      // Looking straight up or down - use a default right vector
      intermediateRight.set(1, 0, 0);
    }
    intermediateRight.normalize();

    // Undo vertical rotation
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(intermediateRight, -angleY);
    viewDir.applyQuaternion(pitchQuat);
    viewDir.normalize();

    // Convert viewDir back to theta/phi
    // phi: angle from +Y axis (0 = up, π = down)
    const newPhi = Math.acos(Math.max(-1, Math.min(1, viewDir.y)));

    // theta: angle around Y axis
    let newTheta = Math.atan2(viewDir.z, viewDir.x);
    if (newTheta < 0) newTheta += 2 * Math.PI;

    // Clamp phi to avoid exact poles
    const clampedPhi = Math.max(0.01, Math.min(Math.PI - 0.01, newPhi));

    return { theta: newTheta, phi: clampedPhi };
  }

  /**
   * Update camera to look in direction (theta, phi).
   */
  function updateCameraDirection(): void {
    // Convert spherical to Cartesian
    // phi=0 is +Y (up), phi=π/2 is horizon, phi=π is -Y (down)
    // theta=0 is +X, theta=π/2 is +Z
    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    camera.lookAt(x * 100, y * 100, z * 100);

    updateDebug({
      theta,
      phi,
      fov: camera.fov,
    });
  }

  function applyDrag(currentX: number, currentY: number): void {
    const dx = currentX - dragStartX;
    const dy = currentY - dragStartY;

    // Compute the view direction that puts the grabbed sky point at the current cursor position
    const newView = computeViewForDirectionAtScreen(grabDir, currentX, currentY);

    // Wrap theta to [0, 2π)
    theta = ((newView.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    phi = newView.phi;

    updateDebug({
      theta,
      phi,
      startX: dragStartX,
      startY: dragStartY,
      dx,
      dy,
      dtheta: theta - dragStartTheta,
      dphi: phi - dragStartPhi,
      fov: camera.fov,
    });

    updateCameraDirection();
  }

  // --- Mouse handlers ---

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;

    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartTheta = theta;
    dragStartPhi = phi;

    // Compute the 3D direction of the grabbed point
    grabDir.copy(screenToDirection(event.clientX, event.clientY));

    domElement.style.cursor = "grabbing";

    updateDebug({
      theta,
      phi,
      startX: dragStartX,
      startY: dragStartY,
      dx: 0,
      dy: 0,
      dtheta: 0,
      dphi: 0,
      fov: camera.fov,
    });
  }

  function onMouseMove(event: MouseEvent): void {
    if (!isDragging) return;
    applyDrag(event.clientX, event.clientY);
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
      // Notify about FOV change for LOD updates
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
      dragStartX = event.touches[0].clientX;
      dragStartY = event.touches[0].clientY;
      dragStartTheta = theta;
      dragStartPhi = phi;

      // Compute the 3D direction of the grabbed point
      grabDir.copy(screenToDirection(dragStartX, dragStartY));
    } else if (event.touches.length === 2) {
      isDragging = false;
      initialPinchDistance = getTouchDistance(event.touches);
      initialFov = camera.fov;
    }
  }

  function onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1 && isDragging) {
      applyDrag(event.touches[0].clientX, event.touches[0].clientY);
    } else if (event.touches.length === 2) {
      const currentDistance = getTouchDistance(event.touches);
      const scale = initialPinchDistance / currentDistance;
      const newFov = Math.max(minFov, Math.min(maxFov, initialFov * scale));
      if (newFov !== camera.fov) {
        camera.fov = newFov;
        camera.updateProjectionMatrix();
        updateCameraDirection();
        // Notify about FOV change for LOD updates
        controlsApi.onFovChange?.(camera.fov);
      }
    }
  }

  function onTouchEnd(): void {
    isDragging = false;
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

  domElement.style.cursor = "grab";
  updateCameraDirection();

  // Easing function for smooth animation
  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Find the shortest angular path between two angles
  function shortestAngleDelta(from: number, to: number): number {
    let delta = to - from;
    // Normalize to [-π, π]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
  }

  function update(): void {
    if (!isAnimating) return;

    const now = performance.now();
    const elapsed = now - animStartTime;
    const progress = Math.min(1, elapsed / animDuration);
    const eased = easeInOutCubic(progress);

    // Interpolate theta (handling wraparound)
    const deltaTheta = shortestAngleDelta(animStartTheta, animTargetTheta);
    theta = animStartTheta + deltaTheta * eased;
    // Normalize theta to [0, 2π)
    theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Interpolate phi (no wraparound needed)
    phi = animStartPhi + (animTargetPhi - animStartPhi) * eased;

    updateCameraDirection();

    if (progress >= 1) {
      isAnimating = false;
    }
  }

  /**
   * Center the camera on a celestial object given its RA/Dec coordinates.
   * @param ra Right Ascension in degrees (0-360)
   * @param dec Declination in degrees (-90 to +90)
   */
  function lookAtRaDec(ra: number, dec: number): void {
    const raRad = (ra * Math.PI) / 180;
    const decRad = (dec * Math.PI) / 180;

    // Convert RA/Dec to theta/phi
    // theta: azimuth angle (RA increases eastward, but our theta goes opposite direction)
    // phi: polar angle from +Y (dec=90° → phi=0, dec=0° → phi=π/2, dec=-90° → phi=π)
    theta = (((-raRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    phi = Math.PI / 2 - decRad;

    // Clamp phi to valid range
    phi = Math.max(0.001, Math.min(Math.PI - 0.001, phi));

    updateCameraDirection();
  }

  /**
   * Animate the camera to center on a celestial object given its RA/Dec coordinates.
   * @param ra Right Ascension in degrees (0-360)
   * @param dec Declination in degrees (-90 to +90)
   * @param durationMs Animation duration in milliseconds (default 1000)
   */
  function animateToRaDec(ra: number, dec: number, durationMs: number = 1000): void {
    const raRad = (ra * Math.PI) / 180;
    const decRad = (dec * Math.PI) / 180;

    // Convert RA/Dec to target theta/phi
    const targetTheta = (((-raRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    const targetPhi = Math.max(0.001, Math.min(Math.PI - 0.001, Math.PI / 2 - decRad));

    // Store current position as start
    animStartTheta = theta;
    animStartPhi = phi;
    animTargetTheta = targetTheta;
    animTargetPhi = targetPhi;
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
  }

  // Create API object so handlers can access onFovChange
  const controlsApi: CelestialControls = {
    update,
    dispose,
    lookAtRaDec,
    animateToRaDec,
    onFovChange: undefined,
  };

  return controlsApi;
}
