use sky_engine_core::{
    catalog::StarCatalog,
    planets::{compute_all_body_positions, compute_moon_position_full, CelestialBody},
    time::SkyTime,
};
use wasm_bindgen::prelude::*;

/// The main sky engine exposed to JavaScript.
/// Computes star and planet positions, maintaining buffers for efficient WebGL rendering.
#[wasm_bindgen]
pub struct SkyEngine {
    catalog: StarCatalog,
    time: SkyTime,
    mag_limit: f32,

    // Output buffers (owned by Rust, read by JS)
    stars_pos: Vec<f32>,  // x,y,z,x,y,z,... unit vectors
    stars_meta: Vec<f32>, // vmag, bv_color, id (as f32), padding
    bodies_pos: Vec<f32>, // 7 celestial bodies * 3 coords = 21 floats (Sun, Moon, 5 planets)

    // Cached visible star count
    visible_count: usize,
}

#[wasm_bindgen]
impl SkyEngine {
    /// Create a new SkyEngine.
    /// If catalog_bytes is empty, uses embedded bright stars.
    #[wasm_bindgen(constructor)]
    pub fn new(catalog_bytes: &[u8]) -> Result<SkyEngine, JsError> {
        let catalog = if catalog_bytes.is_empty() {
            StarCatalog::with_bright_stars()
        } else {
            StarCatalog::from_binary(catalog_bytes)
                .map_err(|e| JsError::new(e))?
        };

        let star_count = catalog.len();

        let mut engine = SkyEngine {
            catalog,
            time: SkyTime::now(),
            mag_limit: 6.5, // Default: dark sky (naked eye limit)
            stars_pos: vec![0.0; star_count * 3],
            stars_meta: vec![0.0; star_count * 4], // vmag, bv, id, padding
            bodies_pos: vec![0.0; 7 * 3], // Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn
            visible_count: 0,
        };

        engine.recompute();
        Ok(engine)
    }

    /// Set the observation time in UTC.
    pub fn set_time_utc(
        &mut self,
        year: i32,
        month: u8,
        day: u8,
        hour: u8,
        minute: u8,
        second: f64,
    ) {
        self.time = SkyTime::from_utc(year, month, day, hour, minute, second);
    }

    /// Set the magnitude limit for visible stars.
    /// Stars fainter than this limit won't be included in output buffers.
    pub fn set_mag_limit(&mut self, mag: f32) {
        self.mag_limit = mag;
    }

    /// Get the current magnitude limit.
    pub fn mag_limit(&self) -> f32 {
        self.mag_limit
    }

    /// Get total stars in catalog.
    pub fn total_stars(&self) -> usize {
        self.catalog.len()
    }

    /// Get count of currently visible stars (after magnitude filter).
    pub fn visible_stars(&self) -> usize {
        self.visible_count
    }

    /// Recompute all positions based on current time and magnitude limit.
    /// Call this after changing time or magnitude limit.
    pub fn recompute(&mut self) {
        self.recompute_stars();
        self.recompute_bodies();
    }

    fn recompute_stars(&mut self) {
        let mut pos_idx = 0;
        let mut meta_idx = 0;
        let mut count = 0;

        for star in self.catalog.stars_brighter_than(self.mag_limit) {
            let dir = star.direction();
            let (x, y, z) = dir.to_f32();

            // Ensure we have space (should always be true if catalog doesn't grow)
            if pos_idx + 3 <= self.stars_pos.len() {
                self.stars_pos[pos_idx] = x;
                self.stars_pos[pos_idx + 1] = y;
                self.stars_pos[pos_idx + 2] = z;
                pos_idx += 3;
            }

            if meta_idx + 4 <= self.stars_meta.len() {
                self.stars_meta[meta_idx] = star.vmag;
                self.stars_meta[meta_idx + 1] = star.bv_color;
                self.stars_meta[meta_idx + 2] = star.id as f32;
                self.stars_meta[meta_idx + 3] = 0.0; // padding for alignment
                meta_idx += 4;
            }

            count += 1;
        }

        self.visible_count = count;
    }

    fn recompute_bodies(&mut self) {
        let positions = compute_all_body_positions(&self.time);
        for (i, (_body, pos)) in positions.iter().enumerate() {
            let (x, y, z) = pos.to_f32();
            let idx = i * 3;
            self.bodies_pos[idx] = x;
            self.bodies_pos[idx + 1] = y;
            self.bodies_pos[idx + 2] = z;
        }
    }

    // --- Buffer accessors for zero-copy JS access ---

    /// Get pointer to stars position buffer.
    pub fn stars_pos_ptr(&self) -> *const f32 {
        self.stars_pos.as_ptr()
    }

    /// Get length of stars position buffer (in f32 elements).
    /// Note: actual visible stars is visible_stars() * 3.
    pub fn stars_pos_len(&self) -> usize {
        self.visible_count * 3
    }

    /// Get pointer to stars metadata buffer.
    pub fn stars_meta_ptr(&self) -> *const f32 {
        self.stars_meta.as_ptr()
    }

    /// Get length of stars metadata buffer (in f32 elements).
    /// 4 floats per star: vmag, bv_color, id, padding.
    pub fn stars_meta_len(&self) -> usize {
        self.visible_count * 4
    }

    /// Get pointer to celestial bodies position buffer.
    pub fn bodies_pos_ptr(&self) -> *const f32 {
        self.bodies_pos.as_ptr()
    }

    /// Get length of celestial bodies position buffer.
    /// Always 21 (7 bodies * 3 coords): Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn.
    pub fn bodies_pos_len(&self) -> usize {
        self.bodies_pos.len()
    }

    /// Get celestial body name by index (0-6).
    pub fn body_name(&self, index: usize) -> Option<String> {
        CelestialBody::ALL.get(index).map(|b| b.name().to_string())
    }

    /// Get Moon's angular diameter in radians.
    pub fn moon_angular_diameter(&self) -> f32 {
        compute_moon_position_full(&self.time).angular_diameter_rad as f32
    }

    // Legacy aliases for backwards compatibility
    /// Get pointer to planets position buffer (legacy - use bodies_pos_ptr).
    pub fn planets_pos_ptr(&self) -> *const f32 {
        // Skip Sun and Moon (first 2 bodies = 6 floats)
        unsafe { self.bodies_pos.as_ptr().add(6) }
    }

    /// Get length of planets position buffer (legacy - use bodies_pos_len).
    /// Always 15 (5 planets * 3 coords).
    pub fn planets_pos_len(&self) -> usize {
        15
    }

    /// Get planet name by index (0-4) (legacy - use body_name).
    pub fn planet_name(&self, index: usize) -> Option<String> {
        // Map 0-4 to Mercury(2), Venus(3), Mars(4), Jupiter(5), Saturn(6)
        CelestialBody::ALL.get(index + 2).map(|b| b.name().to_string())
    }
}

/// Log to browser console (for debugging).
#[wasm_bindgen]
pub fn log(s: &str) {
    web_sys::console::log_1(&s.into());
}
