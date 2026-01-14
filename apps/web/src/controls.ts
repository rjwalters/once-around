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

  // The grabbed point's spherical coordinates (where we clicked on the sky)
  let grabTheta = 0;
  let grabPhi = 0;

  // FOV zoom settings
  const minFov = 10;
  const maxFov = 100;
  const zoomSpeed = 0.05;

  /**
   * Convert screen pixel offset from center to angular offset.
   * Returns the angular offset in the camera's local coordinate system.
   */
  function screenToAngularOffset(screenX: number, screenY: number): { dTheta: number; dPhi: number } {
    const rect = domElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Offset from screen center in pixels
    const pixelX = screenX - centerX;
    const pixelY = screenY - centerY;

    // Convert to angles using FOV
    // Vertical: FOV covers the full height
    const fovRad = (camera.fov * Math.PI) / 180;
    const anglesPerPixelV = fovRad / rect.height;

    // Horizontal: aspect ratio scales the horizontal FOV
    const anglesPerPixelH = fovRad / rect.height; // Same scale, aspect handled by actual pixel count

    // dPhi: positive Y is up on screen, but larger phi is down in spherical coords
    const dPhi = pixelY * anglesPerPixelV;
    // dTheta: positive X is right on screen, positive theta is counterclockwise from above
    const dTheta = pixelX * anglesPerPixelH;

    return { dTheta, dPhi };
  }

  /**
   * Get the spherical coordinates of a point on the sky at a given screen position.
   */
  function screenToSky(screenX: number, screenY: number): { theta: number; phi: number } {
    const offset = screenToAngularOffset(screenX, screenY);

    // The offset needs to be applied in the camera's local tangent plane
    // dTheta is rotation around the up axis (Y)
    // dPhi is rotation in the vertical plane

    // For accurate projection, we need to account for the curvature of the sphere
    // At the current view direction (theta, phi), compute the sky coordinates

    // Simple approximation that works well for reasonable FOV:
    // The grabbed point's phi is the view's phi plus the vertical offset
    // The grabbed point's theta needs to be scaled by 1/sin(phi) at the grab latitude
    const grabPhi = phi + offset.dPhi;
    const clampedGrabPhi = Math.max(0.001, Math.min(Math.PI - 0.001, grabPhi));
    const grabTheta = theta + offset.dTheta / Math.sin(clampedGrabPhi);

    return { theta: grabTheta, phi: clampedGrabPhi };
  }

  /**
   * Compute the view direction (theta, phi) such that a sky point (skyTheta, skyPhi)
   * appears at screen position (screenX, screenY).
   */
  function computeViewForSkyAtScreen(
    skyTheta: number,
    skyPhi: number,
    screenX: number,
    screenY: number
  ): { theta: number; phi: number } {
    const offset = screenToAngularOffset(screenX, screenY);

    // We want: skyPhi = viewPhi + offset.dPhi
    // So: viewPhi = skyPhi - offset.dPhi
    const viewPhi = skyPhi - offset.dPhi;
    const clampedViewPhi = Math.max(0.001, Math.min(Math.PI - 0.001, viewPhi));

    // We want: skyTheta = viewTheta + offset.dTheta / sin(skyPhi)
    // So: viewTheta = skyTheta - offset.dTheta / sin(skyPhi)
    // But we should use the phi at the grab point for the scaling
    const viewTheta = skyTheta - offset.dTheta / Math.sin(skyPhi);

    return { theta: viewTheta, phi: clampedViewPhi };
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
    const newView = computeViewForSkyAtScreen(grabTheta, grabPhi, currentX, currentY);

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

    // Compute the sky coordinates of the grabbed point
    const grabbed = screenToSky(event.clientX, event.clientY);
    grabTheta = grabbed.theta;
    grabPhi = grabbed.phi;

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
    camera.fov = Math.max(minFov, Math.min(maxFov, camera.fov + delta));
    camera.updateProjectionMatrix();
    updateCameraDirection();
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

      const grabbed = screenToSky(dragStartX, dragStartY);
      grabTheta = grabbed.theta;
      grabPhi = grabbed.phi;
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
      camera.fov = Math.max(minFov, Math.min(maxFov, initialFov * scale));
      camera.updateProjectionMatrix();
      updateCameraDirection();
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

  function update(): void {}

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

  return { update, dispose };
}
