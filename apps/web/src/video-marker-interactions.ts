/**
 * Video marker click and hover interactions.
 */

import * as THREE from "three";
import type { VideoPlacement } from "./videos";

export interface VideoMarkersLayer {
  group: { visible: boolean };
  getVideoAtPosition: (raycaster: THREE.Raycaster) => VideoPlacement | null;
}

export interface VideoMarkerInteractionsOptions {
  domElement: HTMLCanvasElement;
  camera: THREE.Camera;
  videoMarkers: VideoMarkersLayer;
  onVideoClick: (video: VideoPlacement) => void;
  lookAtRaDec: (ra: number, dec: number) => void;
}

const MOUSE_MOVE_THROTTLE = 50; // ms

/**
 * Set up click and hover interactions for video markers.
 */
export function setupVideoMarkerInteractions(options: VideoMarkerInteractionsOptions): void {
  const { domElement, camera, videoMarkers, onVideoClick, lookAtRaDec } = options;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let isHovering = false;
  let lastMouseMoveTime = 0;

  // Click handler
  domElement.addEventListener("click", (event) => {
    if (!videoMarkers.group.visible) return;

    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const video = videoMarkers.getVideoAtPosition(raycaster);
    if (video) {
      lookAtRaDec(video.ra, video.dec);
      onVideoClick(video);
    }
  });

  // Hover handler (throttled)
  domElement.addEventListener("mousemove", (event) => {
    if (!videoMarkers.group.visible) {
      if (isHovering) {
        domElement.style.cursor = "grab";
        isHovering = false;
      }
      return;
    }

    const now = performance.now();
    if (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE) {
      return;
    }
    lastMouseMoveTime = now;

    const rect = domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const video = videoMarkers.getVideoAtPosition(raycaster);
    if (video) {
      if (!isHovering) {
        domElement.style.cursor = "pointer";
        isHovering = true;
      }
    } else {
      if (isHovering) {
        domElement.style.cursor = "grab";
        isHovering = false;
      }
    }
  });
}
