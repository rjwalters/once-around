import * as THREE from "three";

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
const LABEL_REPULSION_DISTANCE = 3.5; // Minimum distance between labels before repulsion kicks in
const LABEL_REPULSION_STRENGTH = 0.3; // How strongly labels repel each other
const LABEL_REPULSION_ITERATIONS = 8; // Number of iterations to settle labels

// Co-location grouping constants
const COORDINATE_TOLERANCE = 0.01; // degrees (~36 arcsec) for grouping nearby videos
const ARC_GAP = 0.08; // radians (~4.5 degrees) gap between pie slices

// Interface for grouped videos at the same location
interface VideoGroup {
  ra: number;
  dec: number;
  position: THREE.Vector3;
  videos: VideoPlacement[];
}

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

// Group videos that share the same or very close coordinates
function groupVideosByLocation(videos: VideoPlacement[]): VideoGroup[] {
  const groups: VideoGroup[] = [];

  for (const video of videos) {
    // Find existing group within coordinate tolerance
    let foundGroup: VideoGroup | null = null;
    for (const group of groups) {
      const raDiff = Math.abs(group.ra - video.ra);
      const decDiff = Math.abs(group.dec - video.dec);
      if (raDiff < COORDINATE_TOLERANCE && decDiff < COORDINATE_TOLERANCE) {
        foundGroup = group;
        break;
      }
    }

    if (foundGroup) {
      foundGroup.videos.push(video);
    } else {
      const position = raDecToPosition(video.ra, video.dec, SKY_RADIUS - 0.5);
      groups.push({
        ra: video.ra,
        dec: video.dec,
        position,
        videos: [video],
      });
    }
  }

  return groups;
}

// Create ring geometry for video markers
function createRingGeometry(innerRadius: number, outerRadius: number, segments: number = 32): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
  return geometry;
}

// Create arc geometry for pie-slice markers when multiple videos share a location
function createArcGeometry(
  innerRadius: number,
  outerRadius: number,
  sliceIndex: number,
  totalSlices: number,
  segments: number = 24
): THREE.BufferGeometry {
  // Calculate arc parameters
  const totalGap = ARC_GAP * totalSlices;
  const availableAngle = Math.PI * 2 - totalGap;
  const arcLength = availableAngle / totalSlices;

  // Each slice starts after the previous slice plus a gap
  const thetaStart = sliceIndex * (arcLength + ARC_GAP);

  // THREE.RingGeometry accepts thetaStart and thetaLength
  const geometry = new THREE.RingGeometry(
    innerRadius,
    outerRadius,
    segments,
    1,
    thetaStart,
    arcLength
  );

  return geometry;
}

// Create arc hit detection geometry for clickable area
function createArcHitGeometry(
  outerRadius: number,
  sliceIndex: number,
  totalSlices: number,
  segments: number = 24
): THREE.BufferGeometry {
  const totalGap = ARC_GAP * totalSlices;
  const availableAngle = Math.PI * 2 - totalGap;
  const arcLength = availableAngle / totalSlices;
  const thetaStart = sliceIndex * (arcLength + ARC_GAP);

  // Use RingGeometry with small inner radius for hit detection
  // Larger outer radius for easier clicking
  const geometry = new THREE.RingGeometry(
    0.2, // Small inner radius
    outerRadius * 1.3, // Larger outer radius for easier clicking
    segments,
    1,
    thetaStart,
    arcLength
  );

  return geometry;
}

// Calculate label position for videos in a group, spreading them radially
function calculateGroupedLabelPosition(
  markerPosition: THREE.Vector3,
  sliceIndex: number,
  totalSlices: number,
  labelOffset: number
): THREE.Vector3 {
  const radial = markerPosition.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Calculate tangent vectors on the sphere surface
  const east = new THREE.Vector3().crossVectors(worldUp, radial).normalize();
  const north = new THREE.Vector3().crossVectors(radial, east).normalize();

  // Calculate arc center angle for this slice
  const totalGap = ARC_GAP * totalSlices;
  const availableAngle = Math.PI * 2 - totalGap;
  const arcLength = availableAngle / totalSlices;
  const thetaStart = sliceIndex * (arcLength + ARC_GAP);
  const arcCenter = thetaStart + arcLength / 2;

  // Direction from marker center toward arc center (on tangent plane)
  const labelDir = east
    .clone()
    .multiplyScalar(Math.cos(arcCenter))
    .add(north.clone().multiplyScalar(-Math.sin(arcCenter)));

  // Offset position on the sphere
  const labelPos = markerPosition.clone().add(labelDir.multiplyScalar(labelOffset));
  return labelPos.normalize().multiplyScalar(markerPosition.length());
}

// Create a text sprite using canvas
function createTextSprite(text: string, color: string = "#b366ff"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;

  // Set canvas size (power of 2 for better texture handling)
  canvas.width = 512;
  canvas.height = 64;

  // Configure text style
  context.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Draw text shadow for better visibility
  context.fillStyle = "rgba(0, 0, 0, 0.8)";
  context.fillText(text, canvas.width / 2 + 2, canvas.height / 2 + 2);

  // Draw text
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  // Create texture and sprite
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  // Scale sprite to reasonable size (width based on text length, height proportional)
  const aspectRatio = canvas.width / canvas.height;
  const spriteHeight = 1.2;
  sprite.scale.set(spriteHeight * aspectRatio, spriteHeight, 1);

  return sprite;
}

// Apply repulsion between labels to prevent overlapping
// Labels are pushed apart on the sphere surface while staying close to their markers
function applyLabelRepulsion(
  labelPositions: Map<string, THREE.Vector3>,
  markerPositions: Map<string, THREE.Vector3>
): void {
  const ids = Array.from(labelPositions.keys());

  for (let iteration = 0; iteration < LABEL_REPULSION_ITERATIONS; iteration++) {
    // Calculate repulsion forces for each label
    const forces = new Map<string, THREE.Vector3>();

    for (const id of ids) {
      forces.set(id, new THREE.Vector3(0, 0, 0));
    }

    // Calculate pairwise repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const id1 = ids[i];
        const id2 = ids[j];
        const pos1 = labelPositions.get(id1)!;
        const pos2 = labelPositions.get(id2)!;

        const distance = pos1.distanceTo(pos2);

        if (distance < LABEL_REPULSION_DISTANCE && distance > 0.01) {
          // Calculate repulsion direction (tangent to sphere)
          const midpoint = pos1.clone().add(pos2).multiplyScalar(0.5);
          const radial = midpoint.clone().normalize();

          // Direction from pos2 to pos1
          const rawDir = pos1.clone().sub(pos2).normalize();

          // Project onto tangent plane (remove radial component)
          const tangentDir = rawDir.clone().sub(
            radial.clone().multiplyScalar(rawDir.dot(radial))
          ).normalize();

          // Repulsion strength decreases with distance
          const strength = LABEL_REPULSION_STRENGTH * (1 - distance / LABEL_REPULSION_DISTANCE);

          // Apply equal and opposite forces
          forces.get(id1)!.add(tangentDir.clone().multiplyScalar(strength));
          forces.get(id2)!.add(tangentDir.clone().multiplyScalar(-strength));
        }
      }
    }

    // Apply forces and re-project to sphere
    for (const id of ids) {
      const pos = labelPositions.get(id)!;
      const force = forces.get(id)!;
      const markerPos = markerPositions.get(id)!;

      // Apply force
      pos.add(force);

      // Re-project to sphere surface at same radius
      const radius = markerPos.length();
      pos.normalize().multiplyScalar(radius);

      // Constrain: don't let label drift too far from its marker
      const maxDrift = 4.0; // Maximum distance from marker
      const driftDistance = pos.distanceTo(markerPos);
      if (driftDistance > maxDrift) {
        // Pull back toward marker
        const toMarker = markerPos.clone().sub(pos).normalize();
        pos.add(toMarker.multiplyScalar(driftDistance - maxDrift));
        pos.normalize().multiplyScalar(radius);
      }
    }
  }
}

export interface VideoMarkersLayer {
  group: THREE.Group;
  markers: Map<string, THREE.Mesh>;
  labels: Map<string, THREE.Sprite>;
  setVisible(visible: boolean): void;
  setLabelsVisible(visible: boolean): void;
  getVideoAtPosition(raycaster: THREE.Raycaster): VideoPlacement | null;
}

export async function createVideoMarkersLayer(
  scene: THREE.Scene,
  _onVideoClick: (video: VideoPlacement) => void
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
  const labels = new Map<string, THREE.Sprite>();
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

  // Create ring geometry for visual display
  const ringGeometry = createRingGeometry(0.475, 0.625, 24);
  // Create larger circle for hit detection
  const hitGeometry = new THREE.CircleGeometry(1.2, 24);

  // Store positions for repulsion calculation
  const labelPositions = new Map<string, THREE.Vector3>();
  const markerPositions = new Map<string, THREE.Vector3>();

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

    // Store marker position for repulsion constraint
    markerPositions.set(video.id, position.clone());

    // Create label sprite - positioned below the ring
    const labelText = video.object || video.title;
    const labelSprite = createTextSprite(labelText);

    // Calculate "down" direction on the sphere's surface at this position
    const radial = position.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(worldUp, radial).normalize();
    const down = new THREE.Vector3().crossVectors(radial, east).normalize();

    // Offset the label position downward on the sphere
    const labelOffset = 1.5; // Units on the sky sphere
    const labelPosition = position.clone().add(down.multiplyScalar(labelOffset));

    // Store initial label position for repulsion
    labelPositions.set(video.id, labelPosition.clone());

    labels.set(video.id, labelSprite);
    labelsGroup.add(labelSprite);
  }

  // Apply repulsion to spread out overlapping labels
  applyLabelRepulsion(labelPositions, markerPositions);

  // Update sprite positions with repelled positions
  for (const [id, sprite] of labels) {
    const newPosition = labelPositions.get(id);
    if (newPosition) {
      sprite.position.copy(newPosition);
    }
  }

  // Create flag lines connecting markers to labels
  const flagLinePositions: number[] = [];
  for (const video of videos) {
    const markerPos = markerPositions.get(video.id);
    const labelPos = labelPositions.get(video.id);
    if (markerPos && labelPos) {
      // Line from marker to label
      flagLinePositions.push(markerPos.x, markerPos.y, markerPos.z);
      flagLinePositions.push(labelPos.x, labelPos.y, labelPos.z);
    }
  }

  const flagLinesGeometry = new THREE.BufferGeometry();
  flagLinesGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(flagLinePositions), 3)
  );
  const flagLinesMaterial = new THREE.LineBasicMaterial({
    color: VIDEO_MARKER_COLOR,
    transparent: true,
    opacity: 0.6,
  });
  const flagLines = new THREE.LineSegments(flagLinesGeometry, flagLinesMaterial);
  labelsGroup.add(flagLines);

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
