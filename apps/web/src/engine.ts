import init, { SkyEngine } from "./wasm/sky_engine";

let wasmMemory: WebAssembly.Memory | null = null;

/**
 * Initialize the WASM module and create a SkyEngine instance.
 * Loads the Hipparcos catalog (~118k stars) from /data/stars/hipparcos.bin.
 * Falls back to BSC (~9k stars) or embedded bright stars if catalog fails to load.
 */
export async function createEngine(): Promise<SkyEngine> {
  const wasm = await init();
  wasmMemory = wasm.memory;

  // Try to load Hipparcos catalog (118k stars), fallback to BSC (9k stars)
  let catalogBytes = new Uint8Array(0);
  try {
    let response = await fetch("/data/stars/hipparcos.bin");
    if (!response.ok) {
      console.log("Hipparcos catalog not found, trying BSC...");
      response = await fetch("/data/stars/bsc5.bin");
    }
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      catalogBytes = new Uint8Array(buffer);
      console.log(`Loaded catalog: ${catalogBytes.length} bytes (${Math.floor(catalogBytes.length / 20)} stars)`);
    }
  } catch (e) {
    console.warn("Failed to load star catalog, using embedded bright stars:", e);
  }

  const engine = new SkyEngine(catalogBytes);
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
 * 7 bodies * 3 coords = 21 floats.
 * Order: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn
 */
export function getBodiesPositionBuffer(engine: SkyEngine): Float32Array {
  const memory = getWasmMemory();
  const ptr = engine.bodies_pos_ptr();
  const len = engine.bodies_pos_len();
  return new Float32Array(memory.buffer, ptr, len);
}
