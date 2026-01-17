/**
 * Celestial Camera Controls
 *
 * Main module for camera controls supporting geocentric (RA/Dec),
 * topocentric (Alt/Az), and orbital navigation modes.
 *
 * - Geocentric: Observer at Earth center, quaternion-based free navigation
 * - Topocentric: Observer on Earth surface, Alt/Az with horizon lock
 * - Orbital: Observer on satellite, quaternion-based free navigation (like geocentric)
 */

import * as THREE from "three";
import type { CameraState, ViewMode, CelestialControls } from "./types";
import { updateDebug } from "./debug";
import {
  raDecToDirection,
  raDecToQuaternion,
  equatorialToHorizontal,
  horizontalToEquatorial,
} from "./coordinates";
import { easeInOutCubic, easeInOutQuad } from "./animation";

// Re-export types for convenience
export type { CameraState, ViewMode, CelestialControls } from "./types";

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
  const minFov = 0.5;
  const maxFov = 100;
  const zoomSpeed = 0.05;

  // Animation state
  let isAnimating = false;
  let animStartTime = 0;
  let animDuration = 1000;
  let apiReady = false;
  let animStartQuaternion = new THREE.Quaternion();
  let animTargetQuaternion = new THREE.Quaternion();

  // View mode state
  let viewMode: ViewMode = "geocentric";

  // Topocentric mode state
  let topoLatitude = 0;
  let topoLST = 0;
  let topoAzimuth = 0;
  let topoAltitude = (30 * Math.PI) / 180;

  // Input enabled state
  let inputEnabled = true;

  // Alt/Az animation state
  let altAzAnimStartAlt = 0;
  let altAzAnimStartAz = 0;
  let altAzAnimTargetAlt = 0;
  let altAzAnimTargetAz = 0;
  let altAzAnimDuration = 0;
  let altAzAnimStartTime = 0;
  let altAzIsAnimating = false;

  // ---------------------------------------------------------------------------
  // Helper functions
  // ---------------------------------------------------------------------------

  function pixelToAngle(pixels: number): number {
    const rect = domElement.getBoundingClientRect();
    const fovRad = (camera.fov * Math.PI) / 180;
    return (pixels / rect.height) * fovRad;
  }

  function getViewDirection(): THREE.Vector3 {
    return new THREE.Vector3(-1, 0, 0).applyQuaternion(viewQuaternion);
  }

  function getCameraUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(viewQuaternion);
  }

  function getCameraRight(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(viewQuaternion);
  }

  function getSphericalFromQuaternion(): { theta: number; phi: number } {
    const dir = getViewDirection();
    const phi = Math.acos(Math.max(-1, Math.min(1, dir.y)));
    const theta = Math.atan2(dir.z, dir.x);
    return {
      theta: ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
      phi,
    };
  }

  // ---------------------------------------------------------------------------
  // Camera update functions
  // ---------------------------------------------------------------------------

  function updateCameraDirection(): void {
    const dir = getViewDirection();
    const right = getCameraRight();
    const cameraUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    camera.up.copy(cameraUp);
    camera.lookAt(dir.x * 100, dir.y * 100, dir.z * 100);

    const spherical = getSphericalFromQuaternion();
    updateDebug({
      theta: spherical.theta,
      phi: spherical.phi,
      fov: camera.fov,
    });

    if (apiReady) {
      controlsApi.onCameraChange?.();
    }
  }

  function updateTopocentricCamera(): void {
    const lstDeg = (topoLST * 180) / Math.PI;
    const latDeg = (topoLatitude * 180) / Math.PI;
    const zenith = raDecToDirection(lstDeg, latDeg);

    const northPole = new THREE.Vector3(0, 1, 0);
    const north = northPole
      .clone()
      .sub(zenith.clone().multiplyScalar(northPole.dot(zenith)))
      .normalize();

    const east = new THREE.Vector3().crossVectors(zenith, north).normalize();

    const cosAlt = Math.cos(topoAltitude);
    const sinAlt = Math.sin(topoAltitude);
    const cosAz = Math.cos(topoAzimuth);
    const sinAz = Math.sin(topoAzimuth);

    const viewDir = new THREE.Vector3()
      .addScaledVector(north, cosAlt * cosAz)
      .addScaledVector(east, cosAlt * sinAz)
      .addScaledVector(zenith, sinAlt)
      .normalize();

    camera.up.copy(zenith);
    camera.lookAt(viewDir.x * 100, viewDir.y * 100, viewDir.z * 100);

    updateDebug({ fov: camera.fov });

    if (apiReady) {
      controlsApi.onCameraChange?.();
    }
  }

  // ---------------------------------------------------------------------------
  // Rotation functions
  // ---------------------------------------------------------------------------

  function applyRotation(angleX: number, angleY: number): void {
    if (viewMode === "topocentric") {
      topoAzimuth = (topoAzimuth + angleX + 2 * Math.PI) % (2 * Math.PI);
      topoAltitude = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, topoAltitude + angleY)
      );
      updateTopocentricCamera();
    } else {
      const up = getCameraUp();
      const yawQuat = new THREE.Quaternion();
      yawQuat.setFromAxisAngle(up, angleX);

      const right = getCameraRight();
      const pitchQuat = new THREE.Quaternion();
      pitchQuat.setFromAxisAngle(right, angleY);

      viewQuaternion.premultiply(yawQuat);
      viewQuaternion.premultiply(pitchQuat);

      updateCameraDirection();
    }
  }

  function applyDragDelta(dx: number, dy: number): void {
    const angleX = pixelToAngle(dx);
    const angleY = pixelToAngle(dy);
    applyRotation(angleX, angleY);
  }

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------

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
      if (viewMode === "topocentric") {
        updateTopocentricCamera();
      } else {
        updateCameraDirection();
      }
      controlsApi.onFovChange?.(camera.fov);
    }
  }

  // ---------------------------------------------------------------------------
  // Touch handlers
  // ---------------------------------------------------------------------------

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
        if (viewMode === "topocentric") {
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

  // ---------------------------------------------------------------------------
  // Keyboard handlers
  // ---------------------------------------------------------------------------

  const ARROW_KEY_SPEED = 0.05;

  function onKeyDown(event: KeyboardEvent): void {
    if (!inputEnabled) return;
    let angleX = 0;
    let angleY = 0;

    switch (event.key) {
      case "ArrowLeft":
        angleX = ARROW_KEY_SPEED;
        break;
      case "ArrowRight":
        angleX = -ARROW_KEY_SPEED;
        break;
      case "ArrowUp":
        angleY = ARROW_KEY_SPEED;
        break;
      case "ArrowDown":
        angleY = -ARROW_KEY_SPEED;
        break;
      default:
        return;
    }

    event.preventDefault();
    isAnimating = false;
    applyRotation(angleX, angleY);
  }

  // ---------------------------------------------------------------------------
  // Event listener setup
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Animation update loop
  // ---------------------------------------------------------------------------

  function update(): void {
    // Handle Alt/Az animation
    if (altAzIsAnimating && viewMode === "topocentric") {
      const elapsed = performance.now() - altAzAnimStartTime;
      const t = Math.min(1, elapsed / altAzAnimDuration);
      const eased = easeInOutQuad(t);

      topoAltitude =
        altAzAnimStartAlt + (altAzAnimTargetAlt - altAzAnimStartAlt) * eased;
      topoAzimuth =
        altAzAnimStartAz + (altAzAnimTargetAz - altAzAnimStartAz) * eased;
      topoAzimuth = ((topoAzimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

      updateTopocentricCamera();

      if (t >= 1) {
        altAzIsAnimating = false;
        isAnimating = false;
      }
    }

    // Handle RA/Dec quaternion animation
    if (!isAnimating) return;

    const now = performance.now();
    const elapsed = now - animStartTime;
    const progress = Math.min(1, elapsed / animDuration);
    const eased = easeInOutCubic(progress);

    viewQuaternion.slerpQuaternions(
      animStartQuaternion,
      animTargetQuaternion,
      eased
    );

    updateCameraDirection();

    if (progress >= 1) {
      isAnimating = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  function lookAtRaDec(ra: number, dec: number): void {
    if (viewMode === "topocentric") {
      // In topocentric mode, convert RA/Dec to Alt/Az to keep horizon horizontal
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const altAz = equatorialToHorizontal(ra, dec, lstDeg, latDeg);
      topoAzimuth = (altAz.azimuth * Math.PI) / 180;
      topoAltitude = (altAz.altitude * Math.PI) / 180;
      isAnimating = false;
      altAzIsAnimating = false;
      updateTopocentricCamera();
      return;
    }

    viewQuaternion.copy(raDecToQuaternion(ra, dec));
    isAnimating = false;
    updateCameraDirection();
  }

  function animateToRaDec(
    ra: number,
    dec: number,
    durationMs: number = 1000
  ): void {
    console.log('[Controls] animateToRaDec called, viewMode:', viewMode);
    if (viewMode === "topocentric") {
      // In topocentric mode, convert RA/Dec to Alt/Az and animate there
      // to keep the horizon horizontal
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const altAz = equatorialToHorizontal(ra, dec, lstDeg, latDeg);
      console.log('[Controls] animateToRaDec (topocentric):', 'RA:', ra.toFixed(2), 'Dec:', dec.toFixed(2),
        'LST:', lstDeg.toFixed(2), 'Lat:', latDeg.toFixed(2),
        '-> Alt:', altAz.altitude.toFixed(2), 'Az:', altAz.azimuth.toFixed(2));
      animateToAltAz(altAz.altitude, altAz.azimuth, durationMs);
      return;
    }

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

  function getRaDec(): { ra: number; dec: number } {
    const dir = getViewDirection();
    let ra = Math.atan2(dir.z, -dir.x) * (180 / Math.PI);
    if (ra < 0) ra += 360;
    const dec = Math.asin(Math.max(-1, Math.min(1, dir.y))) * (180 / Math.PI);
    return { ra, dec };
  }

  function setQuaternion(quaternion: THREE.Quaternion): void {
    viewQuaternion.copy(quaternion);
    isAnimating = false;
    updateCameraDirection();
  }

  function setEnabled(enabled: boolean): void {
    inputEnabled = enabled;
    domElement.style.cursor = enabled ? "grab" : "default";
  }

  function setViewMode(mode: ViewMode): void {
    console.log('[Controls] setViewMode:', mode, 'from:', viewMode);
    if (mode === viewMode) return;

    const previousMode = viewMode;

    if (mode === "topocentric") {
      // Entering topocentric: convert RA/Dec to Alt/Az
      const { ra, dec } = getRaDec();
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      console.log('[Controls] setViewMode topocentric with LST:', lstDeg.toFixed(2), 'Lat:', latDeg.toFixed(2));
      const altAz = equatorialToHorizontal(ra, dec, lstDeg, latDeg);
      topoAzimuth = (altAz.azimuth * Math.PI) / 180;
      topoAltitude = (altAz.altitude * Math.PI) / 180;
      viewMode = mode;
      updateTopocentricCamera();
    } else {
      // Entering geocentric or orbital: both use quaternion-based navigation
      if (previousMode === "topocentric") {
        // Convert Alt/Az back to RA/Dec for quaternion mode
        const altDeg = (topoAltitude * 180) / Math.PI;
        const azDeg = (topoAzimuth * 180) / Math.PI;
        const lstDeg = (topoLST * 180) / Math.PI;
        const latDeg = (topoLatitude * 180) / Math.PI;
        const raDec = horizontalToEquatorial(azDeg, altDeg, lstDeg, latDeg);
        viewMode = mode;
        lookAtRaDec(raDec.ra, raDec.dec);
      } else {
        // Switching between geocentric and orbital: keep current orientation
        viewMode = mode;
        updateCameraDirection();
      }
    }

    isAnimating = false;
  }

  function getViewMode(): ViewMode {
    return viewMode;
  }

  function setTopocentricParams(latitudeRad: number, lstRad: number): void {
    console.log('[Controls] setTopocentricParams:', 'lat:', (latitudeRad * 180 / Math.PI).toFixed(2),
      'LST:', (lstRad * 180 / Math.PI).toFixed(2));
    topoLatitude = latitudeRad;
    topoLST = lstRad;

    if (viewMode === "topocentric") {
      updateTopocentricCamera();
    }
  }

  function getAltAz(): { altitude: number; azimuth: number } | null {
    if (viewMode !== "topocentric") {
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

  function animateToAltAz(
    altitude: number,
    azimuth: number,
    durationMs: number = 1000
  ): void {
    if (viewMode !== "topocentric") {
      const lstDeg = (topoLST * 180) / Math.PI;
      const latDeg = (topoLatitude * 180) / Math.PI;
      const raDec = horizontalToEquatorial(azimuth, altitude, lstDeg, latDeg);
      animateToRaDec(raDec.ra, raDec.dec, durationMs);
      return;
    }

    altAzAnimStartAlt = topoAltitude;
    altAzAnimStartAz = topoAzimuth;
    altAzAnimTargetAlt = (altitude * Math.PI) / 180;

    let targetAz = ((azimuth % 360) * Math.PI) / 180;
    if (targetAz < 0) targetAz += 2 * Math.PI;

    let azDiff = targetAz - topoAzimuth;
    if (azDiff > Math.PI) azDiff -= 2 * Math.PI;
    if (azDiff < -Math.PI) azDiff += 2 * Math.PI;
    altAzAnimTargetAz = topoAzimuth + azDiff;

    altAzAnimDuration = durationMs;
    altAzAnimStartTime = performance.now();
    altAzIsAnimating = true;
    isAnimating = true;
  }

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

  apiReady = true;

  return controlsApi;
}
