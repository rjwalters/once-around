import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// Video placement data structure
export interface VideoPlacement {
  id: string;
  title: string;
  object: string;
  ra: number;   // degrees
  dec: number;  // degrees
  moving: boolean;
  url: string;
}

const SKY_RADIUS = 50;
const VIDEO_MARKER_COLOR = new THREE.Color(0.6, 0.3, 0.9); // Purple

// Convert RA/Dec to 3D position on sky sphere
function raDecToPosition(ra: number, dec: number, radius: number): THREE.Vector3 {
  // Convert degrees to radians
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  // Convert spherical to Cartesian
  // RA increases eastward, Dec is latitude from equator
  const x = radius * Math.cos(decRad) * Math.cos(raRad);
  const y = radius * Math.sin(decRad);
  const z = -radius * Math.cos(decRad) * Math.sin(raRad);

  return new THREE.Vector3(x, y, z);
}

// Create ring geometry for video markers
function createRingGeometry(innerRadius: number, outerRadius: number, segments: number = 32): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
  return geometry;
}

export interface VideoMarkersLayer {
  group: THREE.Group;
  markers: Map<string, THREE.Mesh>;
  labels: Map<string, CSS2DObject>;
  setVisible(visible: boolean): void;
  setLabelsVisible(visible: boolean): void;
  getVideoAtPosition(raycaster: THREE.Raycaster): VideoPlacement | null;
}

export async function createVideoMarkersLayer(
  scene: THREE.Scene,
  onVideoClick: (video: VideoPlacement) => void
): Promise<VideoMarkersLayer> {
  // Load video placements
  const response = await fetch("/videos.json");
  const videos: VideoPlacement[] = await response.json();

  console.log(`Loaded ${videos.length} video placements`);

  // Create group for all video markers
  const group = new THREE.Group();
  group.visible = false; // Start hidden
  scene.add(group);

  // Create labels group
  const labelsGroup = new THREE.Group();
  labelsGroup.visible = false;
  group.add(labelsGroup);

  // Store markers and labels for raycasting
  const markers = new Map<string, THREE.Mesh>();
  const labels = new Map<string, CSS2DObject>();
  const videoDataMap = new Map<string, VideoPlacement>();

  // Create marker material (visible ring)
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: VIDEO_MARKER_COLOR,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });

  // Create invisible hit area material (larger clickable area)
  const hitAreaMaterial = new THREE.MeshBasicMaterial({
    color: VIDEO_MARKER_COLOR,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0, // Invisible
  });

  // Create ring geometry for visual display (inner 0.475, outer 0.625 = thickness 0.15)
  const ringGeometry = createRingGeometry(0.475, 0.625, 24);
  // Create larger circle for hit detection
  const hitGeometry = new THREE.CircleGeometry(1.2, 24);

  // Create markers for each video
  for (const video of videos) {
    const position = raDecToPosition(video.ra, video.dec, SKY_RADIUS - 0.5);

    // Create visible ring mesh
    const ringMesh = new THREE.Mesh(ringGeometry, markerMaterial.clone());
    ringMesh.position.copy(position);
    ringMesh.lookAt(0, 0, 0);
    group.add(ringMesh);

    // Create larger invisible hit area mesh
    const marker = new THREE.Mesh(hitGeometry, hitAreaMaterial.clone());
    marker.position.copy(position);
    marker.lookAt(0, 0, 0);

    marker.userData = { videoId: video.id };
    markers.set(video.id, marker);
    videoDataMap.set(video.id, video);
    group.add(marker);

    // Create label
    const labelDiv = document.createElement("div");
    labelDiv.className = "video-label";
    labelDiv.textContent = video.object || video.title;
    const label = new CSS2DObject(labelDiv);
    label.position.copy(position);
    labels.set(video.id, label);
    labelsGroup.add(label);
  }

  // Setup click handling
  function getVideoAtPosition(raycaster: THREE.Raycaster): VideoPlacement | null {
    const markerMeshes = Array.from(markers.values());
    const intersects = raycaster.intersectObjects(markerMeshes);

    if (intersects.length > 0) {
      const videoId = intersects[0].object.userData.videoId;
      return videoDataMap.get(videoId) || null;
    }
    return null;
  }

  return {
    group,
    markers,
    labels,
    setVisible(visible: boolean) {
      group.visible = visible;
    },
    setLabelsVisible(visible: boolean) {
      labelsGroup.visible = visible;
    },
    getVideoAtPosition,
  };
}

// YouTube embed popup management
export function createVideoPopup(): {
  show: (video: VideoPlacement) => void;
  hide: () => void;
  element: HTMLElement;
} {
  // Create popup container
  const popup = document.createElement("div");
  popup.id = "video-popup";
  popup.className = "video-popup hidden";
  popup.innerHTML = `
    <div class="video-popup-content">
      <button class="video-popup-close">&times;</button>
      <h3 class="video-popup-title"></h3>
      <div class="video-popup-embed"></div>
    </div>
  `;
  document.body.appendChild(popup);

  const titleEl = popup.querySelector(".video-popup-title") as HTMLElement;
  const embedEl = popup.querySelector(".video-popup-embed") as HTMLElement;
  const closeBtn = popup.querySelector(".video-popup-close") as HTMLElement;

  function show(video: VideoPlacement) {
    titleEl.textContent = video.title;
    embedEl.innerHTML = `
      <iframe
        width="560"
        height="315"
        src="https://www.youtube.com/embed/${video.id}?autoplay=1"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
    popup.classList.remove("hidden");
  }

  function hide() {
    popup.classList.add("hidden");
    embedEl.innerHTML = ""; // Stop video
  }

  closeBtn.addEventListener("click", hide);
  popup.addEventListener("click", (e) => {
    if (e.target === popup) hide();
  });

  // ESC key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return { show, hide, element: popup };
}
