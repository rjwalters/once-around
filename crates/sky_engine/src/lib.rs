use sky_engine_core::{
    catalog::StarCatalog,
    comets::{compute_all_comet_positions, Comet},
    coords::{apply_topocentric_correction, cartesian_to_ra_dec, compute_gmst, ra_dec_to_cartesian},
    minor_bodies::{compute_all_minor_body_positions, MinorBody},
    planetary_moons::{compute_all_planetary_moon_positions, PlanetaryMoon},
    planets::{compute_all_body_positions_full, compute_moon_position_full, CelestialBody},
    time::SkyTime,
};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;

/// The main sky engine exposed to JavaScript.
/// Computes star and planet positions, maintaining buffers for efficient WebGL rendering.
#[wasm_bindgen]
pub struct SkyEngine {
    catalog: StarCatalog,
    time: SkyTime,
    mag_limit: f32,

    // Observer location for topocentric corrections
    observer_lat_rad: f64, // Latitude in radians (positive = North)
    observer_lon_rad: f64, // Longitude in radians (positive = East)

    // Output buffers (owned by Rust, read by JS)
    stars_pos: Vec<f32>,  // x,y,z,x,y,z,... unit vectors (magnitude-filtered)
    stars_meta: Vec<f32>, // vmag, bv_color, id (as f32), padding (magnitude-filtered)
    bodies_pos: Vec<f32>, // 9 celestial bodies * 3 coords = 27 floats (Sun, Moon, 7 planets)
    bodies_angular_diameters: Vec<f32>, // 9 angular diameters in radians
    planetary_moons_pos: Vec<f32>, // 18 moons * 4 floats (x, y, z, angular_diam) = 72
    minor_bodies_pos: Vec<f32>, // N minor bodies * 4 floats (x, y, z, angular_diam)
    comets_pos: Vec<f32>, // N comets * 4 floats (x, y, z, magnitude)

    // All star positions for constellation line drawing (not magnitude-filtered)
    all_stars_pos: Vec<f32>,  // x,y,z for ALL stars in catalog
    all_stars_meta: Vec<f32>, // vmag, bv_color, id, padding for ALL stars

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

        // Default observer location: San Francisco (37.7749° N, 122.4194° W)
        let default_lat_deg = 37.7749;
        let default_lon_deg = -122.4194;

        let mut engine = SkyEngine {
            catalog,
            time: SkyTime::now(),
            mag_limit: 6.5, // Default: dark sky (naked eye limit)
            observer_lat_rad: default_lat_deg * PI / 180.0,
            observer_lon_rad: default_lon_deg * PI / 180.0,
            stars_pos: vec![0.0; star_count * 3],
            stars_meta: vec![0.0; star_count * 4], // vmag, bv, id, padding
            bodies_pos: vec![0.0; 9 * 3], // Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune
            bodies_angular_diameters: vec![0.0; 9], // Angular diameters for each body
            planetary_moons_pos: vec![0.0; PlanetaryMoon::ALL.len() * 4], // 18 moons total
            minor_bodies_pos: vec![0.0; MinorBody::ALL.len() * 4], // Pluto (dwarf planets)
            comets_pos: vec![0.0; Comet::ALL.len() * 4], // 7 comets * 4 floats (x, y, z, magnitude)
            all_stars_pos: vec![0.0; star_count * 3],
            all_stars_meta: vec![0.0; star_count * 4],
            visible_count: 0,
        };

        // Compute all star positions once (for constellation drawing)
        engine.compute_all_stars();
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

    /// Set the observer's location on Earth's surface.
    /// This enables topocentric corrections for the Moon (parallax up to ~1°).
    ///
    /// # Arguments
    /// * `lat_deg` - Latitude in degrees (-90 to +90, positive = North)
    /// * `lon_deg` - Longitude in degrees (-180 to +180, positive = East)
    pub fn set_observer_location(&mut self, lat_deg: f64, lon_deg: f64) {
        self.observer_lat_rad = lat_deg * PI / 180.0;
        self.observer_lon_rad = lon_deg * PI / 180.0;
    }

    /// Get the observer's latitude in degrees.
    pub fn observer_lat(&self) -> f64 {
        self.observer_lat_rad * 180.0 / PI
    }

    /// Get the observer's longitude in degrees.
    pub fn observer_lon(&self) -> f64 {
        self.observer_lon_rad * 180.0 / PI
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
        self.recompute_planetary_moons();
        self.recompute_minor_bodies();
        self.recompute_comets();
    }

    /// Add more stars to the catalog from binary data.
    /// Returns the number of new stars added (duplicates are skipped).
    /// Call recompute() after this to refresh position buffers.
    pub fn add_stars(&mut self, additional_bytes: &[u8]) -> Result<usize, JsError> {
        let added = self.catalog.extend(additional_bytes)
            .map_err(|e| JsError::new(e))?;

        if added > 0 {
            // Reallocate buffers for new capacity
            let new_count = self.catalog.len();
            self.stars_pos.resize(new_count * 3, 0.0);
            self.stars_meta.resize(new_count * 4, 0.0);
            self.all_stars_pos.resize(new_count * 3, 0.0);
            self.all_stars_meta.resize(new_count * 4, 0.0);

            // Recompute all star positions (for constellation drawing)
            self.compute_all_stars();
        }

        Ok(added)
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
        let positions = compute_all_body_positions_full(&self.time);

        // Compute GMST for topocentric corrections
        let jd_ut1 = self.time.julian_date_utc(); // Close enough to UT1 for our purposes
        let gmst = compute_gmst(jd_ut1);

        for (i, body_pos) in positions.iter().enumerate() {
            let direction = if i == 1 {
                // Moon (index 1): Apply topocentric parallax correction
                // This can shift the Moon's position by up to ~1° depending on observer location
                let (ra, dec) = cartesian_to_ra_dec(&body_pos.direction);

                // Get Moon distance from the full computation
                let moon_pos = compute_moon_position_full(&self.time);

                let (topo_ra, topo_dec) = apply_topocentric_correction(
                    ra,
                    dec,
                    moon_pos.distance_km,
                    self.observer_lat_rad,
                    self.observer_lon_rad,
                    gmst,
                );

                ra_dec_to_cartesian(topo_ra, topo_dec)
            } else {
                // Other bodies: use geocentric position (parallax is negligible)
                body_pos.direction
            };

            let (x, y, z) = direction.to_f32();
            let idx = i * 3;
            self.bodies_pos[idx] = x;
            self.bodies_pos[idx + 1] = y;
            self.bodies_pos[idx + 2] = z;
            self.bodies_angular_diameters[i] = body_pos.angular_diameter_rad as f32;
        }
    }

    fn recompute_planetary_moons(&mut self) {
        let positions = compute_all_planetary_moon_positions(&self.time);
        for (i, moon_pos) in positions.iter().enumerate() {
            let (x, y, z) = moon_pos.direction.to_f32();
            let idx = i * 4;
            self.planetary_moons_pos[idx] = x;
            self.planetary_moons_pos[idx + 1] = y;
            self.planetary_moons_pos[idx + 2] = z;
            self.planetary_moons_pos[idx + 3] = moon_pos.angular_diameter_rad as f32;
        }
    }

    fn recompute_minor_bodies(&mut self) {
        let positions = compute_all_minor_body_positions(&self.time);
        for (i, body_pos) in positions.iter().enumerate() {
            let (x, y, z) = body_pos.direction.to_f32();
            let idx = i * 4;
            self.minor_bodies_pos[idx] = x;
            self.minor_bodies_pos[idx + 1] = y;
            self.minor_bodies_pos[idx + 2] = z;
            self.minor_bodies_pos[idx + 3] = body_pos.angular_diameter_rad as f32;
        }
    }

    fn recompute_comets(&mut self) {
        let positions = compute_all_comet_positions(&self.time);
        for (i, comet_pos) in positions.iter().enumerate() {
            let (x, y, z) = comet_pos.direction.to_f32();
            let idx = i * 4;
            self.comets_pos[idx] = x;
            self.comets_pos[idx + 1] = y;
            self.comets_pos[idx + 2] = z;
            // Store magnitude instead of angular diameter (comets don't have meaningful sizes)
            self.comets_pos[idx + 3] = comet_pos.magnitude as f32;
        }
    }

    /// Compute positions for ALL stars in the catalog (regardless of magnitude).
    /// This is used for constellation line drawing. Called once at initialization
    /// since star positions are fixed in J2000 coordinates.
    fn compute_all_stars(&mut self) {
        for (i, star) in self.catalog.stars().iter().enumerate() {
            let dir = star.direction();
            let (x, y, z) = dir.to_f32();

            let pos_idx = i * 3;
            self.all_stars_pos[pos_idx] = x;
            self.all_stars_pos[pos_idx + 1] = y;
            self.all_stars_pos[pos_idx + 2] = z;

            let meta_idx = i * 4;
            self.all_stars_meta[meta_idx] = star.vmag;
            self.all_stars_meta[meta_idx + 1] = star.bv_color;
            self.all_stars_meta[meta_idx + 2] = star.id as f32;
            self.all_stars_meta[meta_idx + 3] = 0.0; // padding
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
    /// Always 27 (9 bodies * 3 coords): Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune.
    pub fn bodies_pos_len(&self) -> usize {
        self.bodies_pos.len()
    }

    /// Get pointer to celestial bodies angular diameters buffer.
    pub fn bodies_angular_diameters_ptr(&self) -> *const f32 {
        self.bodies_angular_diameters.as_ptr()
    }

    /// Get length of celestial bodies angular diameters buffer.
    /// Always 9 (one angular diameter per body in radians).
    pub fn bodies_angular_diameters_len(&self) -> usize {
        self.bodies_angular_diameters.len()
    }

    /// Get angular diameter for a specific body by index (0-8).
    /// Returns angular diameter in radians.
    pub fn body_angular_diameter(&self, index: usize) -> f32 {
        self.bodies_angular_diameters.get(index).copied().unwrap_or(0.0)
    }

    /// Get celestial body name by index (0-8).
    pub fn body_name(&self, index: usize) -> Option<String> {
        CelestialBody::ALL.get(index).map(|b| b.name().to_string())
    }

    /// Get Moon's angular diameter in radians.
    pub fn moon_angular_diameter(&self) -> f32 {
        self.bodies_angular_diameters.get(1).copied().unwrap_or(
            compute_moon_position_full(&self.time).angular_diameter_rad as f32
        )
    }

    // --- Planetary moons buffer accessors ---

    /// Get pointer to planetary moons position buffer.
    /// 18 moons * 4 floats (x, y, z, angular_diameter) = 72 floats.
    /// Order: Jupiter (Io, Europa, Ganymede, Callisto), Saturn (Mimas, Enceladus, Tethys,
    /// Dione, Rhea, Titan), Uranus (Miranda, Ariel, Umbriel, Titania, Oberon),
    /// Neptune (Triton), Mars (Phobos, Deimos)
    pub fn planetary_moons_pos_ptr(&self) -> *const f32 {
        self.planetary_moons_pos.as_ptr()
    }

    /// Get length of planetary moons position buffer.
    /// 18 moons * 4 floats = 72 floats.
    pub fn planetary_moons_pos_len(&self) -> usize {
        self.planetary_moons_pos.len()
    }

    /// Get the total number of planetary moons.
    pub fn planetary_moons_count(&self) -> usize {
        PlanetaryMoon::ALL.len()
    }

    /// Get planetary moon name by index (0-17).
    /// 0-3: Jupiter (Io, Europa, Ganymede, Callisto)
    /// 4-9: Saturn (Mimas, Enceladus, Tethys, Dione, Rhea, Titan)
    /// 10-14: Uranus (Miranda, Ariel, Umbriel, Titania, Oberon)
    /// 15: Neptune (Triton)
    /// 16-17: Mars (Phobos, Deimos)
    pub fn planetary_moon_name(&self, index: usize) -> Option<String> {
        PlanetaryMoon::ALL.get(index).map(|m| m.name().to_string())
    }

    // --- Minor bodies buffer accessors (dwarf planets, asteroids, etc.) ---

    /// Get pointer to minor bodies position buffer.
    /// N bodies * 4 floats (x, y, z, angular_diameter).
    /// Currently: Pluto (index 0)
    pub fn minor_bodies_pos_ptr(&self) -> *const f32 {
        self.minor_bodies_pos.as_ptr()
    }

    /// Get length of minor bodies position buffer.
    pub fn minor_bodies_pos_len(&self) -> usize {
        self.minor_bodies_pos.len()
    }

    /// Get the total number of minor bodies.
    pub fn minor_bodies_count(&self) -> usize {
        MinorBody::ALL.len()
    }

    /// Get minor body name by index.
    /// Currently: 0 = Pluto
    pub fn minor_body_name(&self, index: usize) -> Option<String> {
        MinorBody::ALL.get(index).map(|b| b.name().to_string())
    }

    // --- Comets buffer accessors ---

    /// Get pointer to comets position buffer.
    /// N comets * 4 floats (x, y, z, magnitude).
    pub fn comets_pos_ptr(&self) -> *const f32 {
        self.comets_pos.as_ptr()
    }

    /// Get length of comets position buffer.
    pub fn comets_pos_len(&self) -> usize {
        self.comets_pos.len()
    }

    /// Get the total number of comets.
    pub fn comets_count(&self) -> usize {
        Comet::ALL.len()
    }

    /// Get comet name by index.
    /// 0: 1P/Halley, 1: 2P/Encke, 2: 67P/C-G, 3: 46P/Wirtanen,
    /// 4: C/2020 F3 NEOWISE, 5: C/2023 A3 Tsuchinshan-ATLAS, 6: C/1995 O1 Hale-Bopp
    pub fn comet_name(&self, index: usize) -> Option<String> {
        Comet::ALL.get(index).map(|c| c.name().to_string())
    }

    /// Get comet magnitude by index.
    /// Returns estimated visual magnitude (lower = brighter).
    pub fn comet_magnitude(&self, index: usize) -> f32 {
        let idx = index * 4 + 3;
        self.comets_pos.get(idx).copied().unwrap_or(99.0)
    }

    // --- All stars buffer accessors (for constellation drawing, not magnitude-filtered) ---

    /// Get pointer to all stars position buffer (for constellation line drawing).
    /// Contains ALL stars in the catalog regardless of magnitude limit.
    pub fn all_stars_pos_ptr(&self) -> *const f32 {
        self.all_stars_pos.as_ptr()
    }

    /// Get length of all stars position buffer (in f32 elements).
    /// Always total_stars() * 3.
    pub fn all_stars_pos_len(&self) -> usize {
        self.catalog.len() * 3
    }

    /// Get pointer to all stars metadata buffer (for constellation line drawing).
    /// 4 floats per star: vmag, bv_color, id, padding.
    pub fn all_stars_meta_ptr(&self) -> *const f32 {
        self.all_stars_meta.as_ptr()
    }

    /// Get length of all stars metadata buffer (in f32 elements).
    /// Always total_stars() * 4.
    pub fn all_stars_meta_len(&self) -> usize {
        self.catalog.len() * 4
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
