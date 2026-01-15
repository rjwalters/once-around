import init, { SkyEngine } from "./wasm/sky_engine";

let wasmMemory: WebAssembly.Memory | null = null;

// Callback for when new stars are loaded (so renderer can refresh)
let onStarsLoadedCallback: (() => void) | null = null;

/**
 * Set a callback to be called when additional star tiers are loaded.
 * Use this to trigger renderer updates when the catalog grows.
 */
export function onStarsLoaded(callback: () => void): void {
  onStarsLoadedCallback = callback;
}

/**
 * Load additional star tiers in the background.
 * Called after initial engine creation to progressively load more stars.
 */
async function loadRemainingTiers(engine: SkyEngine): Promise<void> {
  // Tier 2: Load immediately after init (medium brightness stars)
  try {
    const tier2 = await fetch("/data/stars/bsc5-tier2.bin");
    if (tier2.ok) {
      const buffer = await tier2.arrayBuffer();
      const added = engine.add_stars(new Uint8Array(buffer));
      console.log(`Loaded tier 2: +${added} stars (total: ${engine.total_stars()})`);
      engine.recompute();
      onStarsLoadedCallback?.();
    }
  } catch (e) {
    console.warn("Failed to load tier 2 stars:", e);
  }

  // Tier 3: Load after a short delay (faint stars for dark sky viewing)
  setTimeout(async () => {
    try {
      const tier3 = await fetch("/data/stars/bsc5-tier3.bin");
      if (tier3.ok) {
        const buffer = await tier3.arrayBuffer();
        const added = engine.add_stars(new Uint8Array(buffer));
        console.log(`Loaded tier 3: +${added} stars (total: ${engine.total_stars()})`);
        engine.recompute();
        onStarsLoadedCallback?.();
      }
    } catch (e) {
      console.warn("Failed to load tier 3 stars:", e);
    }
  }, 500);
}

/**
 * Initialize the WASM module and create a SkyEngine instance.
 * Uses tiered loading for fast initial render:
 * - Tier 1 (mag < 3.0): ~170 brightest stars, loaded immediately
 * - Constellation stars: ~700 stars for constellation lines, loaded immediately
 * - Tier 2 (mag 3-5): ~1400 medium stars, loaded after init
 * - Tier 3 (mag 5-6.5): ~6800 faint stars, loaded after delay
 */
export async function createEngine(): Promise<SkyEngine> {
  // Parallel load: WASM + tier 1 + constellation stars
  const [wasm, tier1Resp, constResp] = await Promise.all([
    init(),
    fetch("/data/stars/bsc5-tier1.bin"),
    fetch("/data/stars/constellation-stars.bin"),
  ]);
  wasmMemory = wasm.memory;

  // Get tier 1 bytes (brightest stars)
  let tier1Bytes = new Uint8Array(0);
  if (tier1Resp.ok) {
    tier1Bytes = new Uint8Array(await tier1Resp.arrayBuffer());
    console.log(`Loaded tier 1: ${tier1Bytes.length} bytes (${Math.floor(tier1Bytes.length / 20)} stars)`);
  }

  // Initialize engine with tier 1 stars
  const engine = new SkyEngine(tier1Bytes);

  // Add constellation stars (deduped internally by HR number)
  if (constResp.ok) {
    const constBytes = new Uint8Array(await constResp.arrayBuffer());
    const added = engine.add_stars(constBytes);
    console.log(`Loaded constellation stars: +${added} unique stars (total: ${engine.total_stars()})`);
    engine.recompute();
  }

  // Load remaining tiers in background (non-blocking)
  loadRemainingTiers(engine);

  return engine;
}

/**
 * Get the WASM memory buffer.
 * Required for zero-copy access to Rust buffers.
 */
export function getWasmMemory(): WebAssembly.Memory {
  if (!wasmMemory) {
    throw new Error("WASM not initialized");
  }
  return wasmMemory;
}

/**
 * Create a Float32Array view into the stars position buffer.
 * This is a zero-copy view - it reads directly from WASM memory.
 *
 * IMPORTANT: This view becomes invalid if WASM memory grows.
 * Get a fresh view after any operation that might allocate.
 */
export function getStarsPositionBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.stars_pos_ptr();
  const len = engine.stars_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the stars metadata buffer.
 * Layout per star: [vmag, bv_color, id, padding]
 */
export function getStarsMetaBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.stars_meta_ptr();
  const len = engine.stars_meta_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the planets position buffer (legacy).
 * 5 planets * 3 coords = 15 floats.
 * Order: Mercury, Venus, Mars, Jupiter, Saturn
 */
export function getPlanetsPositionBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.planets_pos_ptr();
  const len = engine.planets_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the celestial bodies position buffer.
 * 9 bodies * 3 coords = 27 floats.
 * Order: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune
 */
export function getBodiesPositionBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.bodies_pos_ptr();
  const len = engine.bodies_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the celestial bodies angular diameters buffer.
 * 9 floats (one per body, in radians).
 * Order: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune
 */
export function getBodiesAngularDiametersBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.bodies_angular_diameters_ptr();
  const len = engine.bodies_angular_diameters_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the planetary moons position buffer.
 * 18 moons * 4 floats (x, y, z, angular_diameter) = 72 floats.
 * Order: Jupiter (Io, Europa, Ganymede, Callisto), Saturn (Mimas, Enceladus,
 * Tethys, Dione, Rhea, Titan), Uranus (Miranda, Ariel, Umbriel, Titania, Oberon),
 * Neptune (Triton), Mars (Phobos, Deimos)
 */
export function getPlanetaryMoonsBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.planetary_moons_pos_ptr();
  const len = engine.planetary_moons_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the ALL stars position buffer.
 * Contains all stars regardless of magnitude limit (for constellation drawing).
 */
export function getAllStarsPositionBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.all_stars_pos_ptr();
  const len = engine.all_stars_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the ALL stars metadata buffer.
 * Layout per star: [vmag, bv_color, id, padding]
 * Contains all stars regardless of magnitude limit (for constellation drawing).
 */
export function getAllStarsMetaBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.all_stars_meta_ptr();
  const len = engine.all_stars_meta_len();
  return new Float32Array(memory.buffer, ptr, len);
}

/**
 * Create a Float32Array view into the minor bodies position buffer.
 * N bodies * 4 floats (x, y, z, angular_diameter).
 * Currently: Pluto (index 0)
 */
export function getMinorBodiesBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.minor_bodies_pos_ptr();
  const len = engine.minor_bodies_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}
