import * as THREE from "three";
import { createEngine } from "./engine";
import { createRenderer } from "./renderer";
import { createCelestialControls } from "./controls";
import { setupUI, applyTimeToEngine } from "./ui";
import { createVideoMarkersLayer, createVideoPopup, type VideoPlacement } from "./videos";

async function main(): Promise<void> {
  console.log("Initializing Once Around...");

  // Get container
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Container #app not found");
  }

  // Initialize WASM engine
  console.log("Loading sky engine...");
  const engine = await createEngine();
  console.log(
    `Engine loaded: ${engine.total_stars()} stars, ${engine.visible_stars()} visible`
  );

  // Create Three.js renderer
  const renderer = createRenderer(container);

  // Create camera controls
  const controls = createCelestialControls(
    renderer.camera,
    renderer.renderer.domElement
  );

  // Initial render from engine
  renderer.updateFromEngine(engine);

  // Update rendered star count display
  const renderedStarsEl = document.getElementById("rendered-stars");
  function updateRenderedStars(): void {
    if (renderedStarsEl) {
      renderedStarsEl.textContent = renderer.getRenderedStarCount().toLocaleString();
    }
  }
  updateRenderedStars();

  // Update star LOD when FOV changes (zooming)
  controls.onFovChange = (fov: number) => {
    renderer.updateFromEngine(engine, fov);
    updateRenderedStars();
  };

  // Setup UI
  setupUI(engine, {
    onTimeChange: (date: Date) => {
      applyTimeToEngine(engine, date);
      engine.recompute();
      renderer.updateFromEngine(engine);
      updateRenderedStars();
    },
    onMagnitudeChange: (mag: number) => {
      engine.set_mag_limit(mag);
      engine.recompute();
      renderer.updateFromEngine(engine);
      updateRenderedStars();
    },
  });

  // Constellation checkbox
  const constellationCheckbox = document.getElementById("constellations") as HTMLInputElement | null;
  if (constellationCheckbox) {
    constellationCheckbox.addEventListener("change", () => {
      renderer.setConstellationsVisible(constellationCheckbox.checked);
    });
  }

  // Labels checkbox
  const labelsCheckbox = document.getElementById("labels") as HTMLInputElement | null;
  if (labelsCheckbox) {
    labelsCheckbox.addEventListener("change", () => {
      renderer.setLabelsVisible(labelsCheckbox.checked);
    });
  }

  // ---------------------------------------------------------------------------
  // Video markers layer
  // ---------------------------------------------------------------------------
  const videoPopup = createVideoPopup();

  const videoMarkers = await createVideoMarkersLayer(
    renderer.scene,
    (video: VideoPlacement) => {
      console.log("Video clicked:", video.title);
      videoPopup.show(video);
    }
  );

  // Videos checkbox
  const videosCheckbox = document.getElementById("videos") as HTMLInputElement | null;
  if (videosCheckbox) {
    videosCheckbox.addEventListener("change", () => {
      videoMarkers.setVisible(videosCheckbox.checked);
      // Also show labels when videos are visible
      videoMarkers.setLabelsVisible(videosCheckbox.checked);
    });
  }

  // About modal
  const aboutBtn = document.getElementById("about-btn");
  const aboutModal = document.getElementById("about-modal");
  const aboutClose = document.getElementById("about-close");

  if (aboutBtn && aboutModal && aboutClose) {
    aboutBtn.addEventListener("click", () => {
      aboutModal.classList.remove("hidden");
    });

    aboutClose.addEventListener("click", () => {
      aboutModal.classList.add("hidden");
    });

    aboutModal.addEventListener("click", (e) => {
      if (e.target === aboutModal) {
        aboutModal.classList.add("hidden");
      }
    });
  }

  // Click handling for video markers
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  renderer.renderer.domElement.addEventListener("click", (event) => {
    // Only process if videos layer is visible
    if (!videoMarkers.group.visible) return;

    // Calculate mouse position in normalized device coordinates
    const rect = renderer.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, renderer.camera);

    // Check for video marker intersection
    const video = videoMarkers.getVideoAtPosition(raycaster);
    if (video) {
      // Center camera on the video's celestial coordinates
      controls.lookAtRaDec(video.ra, video.dec);
      videoPopup.show(video);
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  });

  // Animation loop
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render();
  }

  animate();
  console.log("Once Around ready!");
}

main().catch((err) => {
  console.error("Failed to initialize:", err);
  const container = document.getElementById("app");
  if (container) {
    container.innerHTML = `
      <div style="color: #ff4444; padding: 20px; font-family: monospace;">
        <h2>Failed to initialize</h2>
        <pre>${err.message}</pre>
        <p>Make sure to build the WASM module first:</p>
        <code>cd crates/sky_engine && wasm-pack build --target web --out-dir ../../apps/web/src/wasm</code>
      </div>
    `;
  }
});
