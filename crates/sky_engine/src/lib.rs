use sky_engine_core::{
    catalog::StarCatalog,
    comets::{compute_all_comet_positions, Comet},
    coords::{apply_topocentric_correction, cartesian_to_ra_dec, compute_gmst, compute_lst, ra_dec_to_cartesian},
    minor_bodies::{compute_all_minor_body_positions, MinorBody},
    planetary_moons::{compute_all_planetary_moon_positions, PlanetaryMoon},
    planets::{compute_all_body_positions_full, compute_moon_position_full, compute_planet_position_full, compute_sun_position, CelestialBody, Planet},
    satellites::{compute_satellite_position, SatelliteEphemeris, SatelliteId},
    time::SkyTime,
};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;

/// Number of `f64` values per pass record returned by [`SkyEngine::find_passes`].
/// Layout: `[rise_jd, rise_az_deg, max_jd, max_alt_deg, max_az_deg, set_jd, set_az_deg]`.
pub const PASS_RECORD_LEN: usize = 7;

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

    // Satellites (ISS, Hubble, etc.)
    // Using parallel arrays: one ephemeris per satellite, one position buffer per satellite
    satellite_ephemerides: Vec<Option<SatelliteEphemeris>>, // One per SatelliteId
    satellites_pos: Vec<f32>, // N satellites * 6 floats: x, y, z, illuminated (0/1), visible (0/1), distance_km

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
            satellite_ephemerides: vec![None; SatelliteId::ALL.len()],
            satellites_pos: vec![0.0; SatelliteId::ALL.len() * 6], // 6 floats per satellite
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

    /// Get the current Julian Date (TDB).
    pub fn julian_date_tdb(&self) -> f64 {
        self.time.julian_date_tdb()
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
        self.recompute_satellites();
    }

    /// Compute the apparent equatorial direction (J2000 unit vector) of a single planet
    /// across `count` time samples, without recomputing the Moon, other planets, planetary
    /// moons, minor bodies, comets, satellites, or the star filter.
    ///
    /// This is the targeted evaluation path used for drawing planet orbit tracks. Compared to
    /// calling `set_time_utc` + `recompute()` per sample (which evaluates all 9 bodies plus 18
    /// moons, 7 comets, satellites and the magnitude filter just to read one planet's 3 floats),
    /// this evaluates only the requested planet and is roughly two orders of magnitude cheaper
    /// per sample.
    ///
    /// # Arguments
    /// * `body_index` - CelestialBody ordering: 2=Mercury, 3=Venus, 4=Mars, 5=Jupiter,
    ///   6=Saturn, 7=Uranus, 8=Neptune. Values 0 (Sun) and 1 (Moon) and anything out of range
    ///   are invalid and yield an all-zero buffer.
    /// * `start_jd` - Julian Date (UTC) of the first sample.
    /// * `step_days` - Spacing between consecutive samples, in days.
    /// * `count` - Number of samples to compute.
    ///
    /// Returns a flat `Vec<f32>` (surfaced to JS as a `Float32Array`) of length `count * 3`
    /// holding (x, y, z) equatorial unit vectors. These are byte-for-byte the same values that
    /// `recompute()` writes into the bodies position buffer for that planet at the same instant,
    /// so the renderer applies its own Y-up / radius conversion exactly as before; no coordinate
    /// transform is baked in here.
    pub fn fill_planet_track(
        &self,
        body_index: usize,
        start_jd: f64,
        step_days: f64,
        count: usize,
    ) -> Vec<f32> {
        // CelestialBody index -> Planet enum. Earth has no CelestialBody slot, so there is a
        // gap: CelestialBody index 2..=8 maps to Mercury..=Neptune (Earth is skipped entirely).
        let planet = match body_index {
            2 => Planet::Mercury,
            3 => Planet::Venus,
            4 => Planet::Mars,
            5 => Planet::Jupiter,
            6 => Planet::Saturn,
            7 => Planet::Uranus,
            8 => Planet::Neptune,
            _ => return vec![0.0; count * 3],
        };

        let mut out = Vec::with_capacity(count * 3);
        for i in 0..count {
            let jd = start_jd + i as f64 * step_days;
            let time = SkyTime::from_jd(jd);
            let dir = compute_planet_position_full(planet, &time).direction;
            let (x, y, z) = dir.to_f32();
            out.push(x);
            out.push(y);
            out.push(z);
        }
        out
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

    fn recompute_satellites(&mut self) {
        for (i, ephemeris_opt) in self.satellite_ephemerides.iter().enumerate() {
            let base_idx = i * 6;
            if let Some(ephemeris) = ephemeris_opt {
                if let Some(pos) = compute_satellite_position(
                    ephemeris,
                    &self.time,
                    self.observer_lat_rad,
                    self.observer_lon_rad,
                    0.0, // Observer height (km), assume sea level
                ) {
                    let (x, y, z) = pos.direction.to_f32();
                    self.satellites_pos[base_idx] = x;
                    self.satellites_pos[base_idx + 1] = y;
                    self.satellites_pos[base_idx + 2] = z;
                    self.satellites_pos[base_idx + 3] = if pos.illuminated { 1.0 } else { 0.0 };
                    self.satellites_pos[base_idx + 4] = if pos.above_horizon { 1.0 } else { 0.0 };
                    self.satellites_pos[base_idx + 5] = pos.distance_km as f32;
                } else {
                    // Outside ephemeris range or error
                    self.satellites_pos[base_idx] = 0.0;
                    self.satellites_pos[base_idx + 1] = 0.0;
                    self.satellites_pos[base_idx + 2] = 0.0;
                    self.satellites_pos[base_idx + 3] = 0.0;
                    self.satellites_pos[base_idx + 4] = 0.0;
                    self.satellites_pos[base_idx + 5] = 0.0;
                }
            } else {
                // No ephemeris loaded for this satellite
                self.satellites_pos[base_idx] = 0.0;
                self.satellites_pos[base_idx + 1] = 0.0;
                self.satellites_pos[base_idx + 2] = 0.0;
                self.satellites_pos[base_idx + 3] = 0.0;
                self.satellites_pos[base_idx + 4] = 0.0;
                self.satellites_pos[base_idx + 5] = 0.0;
            }
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

    // --- Satellite buffer accessors (generalized) ---

    /// Get the number of supported satellites.
    pub fn satellites_count(&self) -> usize {
        SatelliteId::ALL.len()
    }

    /// Get satellite name by index.
    /// 0: ISS, 1: Hubble
    pub fn satellite_name(&self, index: usize) -> Option<String> {
        SatelliteId::from_index(index).map(|id| id.name().to_string())
    }

    /// Get satellite full name by index.
    /// 0: "International Space Station", 1: "Hubble Space Telescope"
    pub fn satellite_full_name(&self, index: usize) -> Option<String> {
        SatelliteId::from_index(index).map(|id| id.full_name().to_string())
    }

    /// Load satellite ephemeris from binary data.
    /// Format: [count: u32] followed by [jd: f64, x: f64, y: f64, z: f64] for each point.
    /// Call recompute() after loading to update satellite position.
    pub fn load_satellite_ephemeris(&mut self, index: usize, data: &[u8]) -> Result<(), JsError> {
        let id = SatelliteId::from_index(index)
            .ok_or_else(|| JsError::new(&format!("Invalid satellite index: {}", index)))?;
        let ephemeris = SatelliteEphemeris::from_binary(id, data)
            .map_err(|e| JsError::new(e))?;
        self.satellite_ephemerides[index] = Some(ephemeris);
        Ok(())
    }

    /// Check if satellite ephemeris is loaded by index.
    pub fn has_satellite_ephemeris(&self, index: usize) -> bool {
        self.satellite_ephemerides.get(index)
            .map(|opt| opt.is_some())
            .unwrap_or(false)
    }

    /// Check if current time is within satellite ephemeris coverage.
    pub fn satellite_in_range(&self, index: usize) -> bool {
        self.satellite_ephemerides.get(index)
            .and_then(|opt| opt.as_ref())
            .map(|e| e.covers(self.time.julian_date_tdb()))
            .unwrap_or(false)
    }

    /// Get pointer to satellites position buffer.
    /// N satellites * 5 floats: x, y, z (direction), illuminated (0/1), visible (0/1).
    pub fn satellites_pos_ptr(&self) -> *const f32 {
        self.satellites_pos.as_ptr()
    }

    /// Get length of satellites position buffer.
    /// satellites_count() * 6 floats.
    pub fn satellites_pos_len(&self) -> usize {
        self.satellites_pos.len()
    }

    /// Check if a satellite is currently illuminated (not in Earth's shadow).
    pub fn satellite_illuminated(&self, index: usize) -> bool {
        let base_idx = index * 6;
        self.satellites_pos.get(base_idx + 3).map(|v| *v > 0.5).unwrap_or(false)
    }

    /// Check if a satellite is currently above the observer's horizon.
    pub fn satellite_above_horizon(&self, index: usize) -> bool {
        let base_idx = index * 6;
        self.satellites_pos.get(base_idx + 4).map(|v| *v > 0.5).unwrap_or(false)
    }

    /// Get the distance to a satellite in kilometers.
    pub fn satellite_distance_km(&self, index: usize) -> f32 {
        let base_idx = index * 6;
        self.satellites_pos.get(base_idx + 5).copied().unwrap_or(0.0)
    }

    /// Check if a satellite is visible (both illuminated and above horizon).
    pub fn satellite_visible(&self, index: usize) -> bool {
        self.satellite_illuminated(index) && self.satellite_above_horizon(index)
    }

    // --- Legacy ISS buffer accessors (for backwards compatibility) ---

    /// Load ISS ephemeris from binary data (legacy - use load_satellite_ephemeris).
    /// Format: [count: u32] followed by [jd: f64, x: f64, y: f64, z: f64] for each point.
    /// Call recompute() after loading to update ISS position.
    pub fn load_iss_ephemeris(&mut self, data: &[u8]) -> Result<(), JsError> {
        self.load_satellite_ephemeris(SatelliteId::ISS.index(), data)
    }

    /// Check if ISS ephemeris is loaded (legacy - use has_satellite_ephemeris).
    pub fn has_iss_ephemeris(&self) -> bool {
        self.has_satellite_ephemeris(SatelliteId::ISS.index())
    }

    /// Check if current time is within ISS ephemeris coverage (legacy - use satellite_in_range).
    pub fn iss_in_range(&self) -> bool {
        self.satellite_in_range(SatelliteId::ISS.index())
    }

    /// Get pointer to ISS position buffer (legacy - use satellites_pos_ptr).
    /// 5 floats: x, y, z (direction unit vector), illuminated (0/1), visible (0/1).
    pub fn iss_pos_ptr(&self) -> *const f32 {
        // ISS is at index 0, so it's at the start of the buffer
        self.satellites_pos.as_ptr()
    }

    /// Get length of ISS position buffer (always 5) (legacy - use satellites_pos_len).
    pub fn iss_pos_len(&self) -> usize {
        5
    }

    /// Check if ISS is currently illuminated (legacy - use satellite_illuminated).
    pub fn iss_illuminated(&self) -> bool {
        self.satellite_illuminated(SatelliteId::ISS.index())
    }

    /// Check if ISS is currently above the observer's horizon (legacy - use satellite_above_horizon).
    pub fn iss_above_horizon(&self) -> bool {
        self.satellite_above_horizon(SatelliteId::ISS.index())
    }

    /// Check if ISS is visible (legacy - use satellite_visible).
    pub fn iss_visible(&self) -> bool {
        self.satellite_visible(SatelliteId::ISS.index())
    }

    // --- Sun altitude for ISS pass visibility calculations ---

    /// Get Sun altitude in degrees for current time and observer location.
    /// Negative = below horizon. Used to determine if sky is dark enough for satellite viewing.
    /// Returns the altitude of the Sun above/below the horizon.
    pub fn sun_altitude(&self) -> f64 {
        self.sun_altitude_at(&self.time)
    }

    /// Sun altitude in degrees for the observer at an arbitrary time.
    ///
    /// Identical math to [`Self::sun_altitude`], but parameterized on `time` so that
    /// pass-finding can evaluate many instants without mutating the shared engine time.
    fn sun_altitude_at(&self, time: &SkyTime) -> f64 {
        // Get Sun's geocentric position
        let sun_dir = compute_sun_position(time);
        let (ra, dec) = cartesian_to_ra_dec(&sun_dir);

        // Compute GMST and LST
        let jd_ut1 = time.julian_date_utc();
        let gmst = compute_gmst(jd_ut1);
        let lst = compute_lst(gmst, self.observer_lon_rad);

        // Hour angle: H = LST - RA
        let hour_angle = lst - ra;

        // Compute altitude using the standard formula:
        // sin(alt) = sin(dec)*sin(lat) + cos(dec)*cos(lat)*cos(H)
        let sin_alt = dec.sin() * self.observer_lat_rad.sin()
            + dec.cos() * self.observer_lat_rad.cos() * hour_angle.cos();

        // Return altitude in degrees
        sin_alt.asin() * 180.0 / PI
    }

    /// Get ephemeris time range for a satellite as [start_jd, end_jd].
    /// Returns None if no ephemeris is loaded for this satellite.
    pub fn satellite_ephemeris_range(&self, index: usize) -> Option<Vec<f64>> {
        self.satellite_ephemerides
            .get(index)
            .and_then(|opt| opt.as_ref())
            .and_then(|e| e.time_range())
            .map(|(start, end)| vec![start, end])
    }

    // --- Satellite pass prediction ---

    /// Find upcoming visible passes for a satellite without mutating engine state.
    ///
    /// This subsumes the entire ISS-pass scan that previously lived in JavaScript
    /// (`iss-passes.ts`): a coarse visibility scan, binary-search refinement of the rise/set
    /// transitions, and max-altitude sampling. The old JS path called `set_time_utc` +
    /// `recompute()` (a full stars + 9 bodies + 18 moons + minor bodies + comets + satellites
    /// evaluation) ~1000+ times on the main thread just to read one satellite's visibility
    /// flags. Here each sample constructs a local [`SkyTime`] via [`SkyTime::from_jd`] and
    /// evaluates only `compute_satellite_position` (interpolation + GMST + ECI-to-topocentric
    /// + Earth-shadow) plus the Sun altitude — orders of magnitude cheaper, and the shared
    /// engine time is never touched.
    ///
    /// # Arguments
    /// * `sat_index` - Satellite index (`SatelliteId` ordering; ISS = 0).
    /// * `start_jd` - Julian Date (UTC scale, same as [`Self::satellite_ephemeris_range`]) to
    ///   begin scanning from.
    /// * `end_jd` - Julian Date (UTC scale) to stop scanning at.
    /// * `step_days` - Coarse scan step in days (e.g. 10 minutes = `10.0 / 1440.0`).
    /// * `min_alt_deg` - Minimum peak altitude (degrees) for a pass to be included.
    /// * `sun_alt_limit_deg` - Sky is "dark" when the Sun is below this altitude (e.g. -6°).
    /// * `max_passes` - Stop after collecting this many passes.
    ///
    /// Returns a flat `Vec<f64>` (surfaced to JS as a `Float64Array`) of
    /// `PASS_RECORD_LEN` values per pass:
    /// `[rise_jd, rise_az_deg, max_jd, max_alt_deg, max_az_deg, set_jd, set_az_deg]`.
    /// All JDs are in the UTC scale, so JS can convert with the same Unix-epoch offset it uses
    /// for `satellite_ephemeris_range`. Returns an empty vec when no ephemeris is loaded for
    /// `sat_index`, when the window is empty, or when `step_days <= 0`.
    #[allow(clippy::too_many_arguments)]
    pub fn find_passes(
        &self,
        sat_index: usize,
        start_jd: f64,
        end_jd: f64,
        step_days: f64,
        min_alt_deg: f64,
        sun_alt_limit_deg: f64,
        max_passes: usize,
    ) -> Vec<f64> {
        let mut out: Vec<f64> = Vec::new();

        let ephemeris = match self
            .satellite_ephemerides
            .get(sat_index)
            .and_then(|opt| opt.as_ref())
        {
            Some(e) => e,
            None => return out,
        };

        if step_days <= 0.0 || !(end_jd > start_jd) || max_passes == 0 {
            return out;
        }

        // Refinement precision matches the previous JS scan: 30-second binary search and
        // 30-second max-altitude sampling.
        let refine_threshold = 30.0 / 86400.0;
        let sample_step = 30.0 / 86400.0;

        let mut current = start_jd;
        let mut was_visible = false;
        let mut pass_start: Option<f64> = None;

        while current < end_jd && out.len() / PASS_RECORD_LEN < max_passes {
            let now_visible = self.satellite_visible_at(ephemeris, current, sun_alt_limit_deg);

            if !was_visible && now_visible {
                // Pass started: refine the rise time between the previous and current step.
                pass_start = Some(self.refine_transition(
                    ephemeris,
                    current - step_days,
                    current,
                    sun_alt_limit_deg,
                    true,
                    refine_threshold,
                ));
            } else if was_visible && !now_visible {
                if let Some(rise_jd) = pass_start {
                    // Pass ended: refine the set time.
                    let set_jd = self.refine_transition(
                        ephemeris,
                        current - step_days,
                        current,
                        sun_alt_limit_deg,
                        false,
                        refine_threshold,
                    );

                    let (max_jd, max_alt, max_az) =
                        self.max_altitude(ephemeris, rise_jd, set_jd, sun_alt_limit_deg, sample_step);

                    if max_alt >= min_alt_deg {
                        let (_, _, rise_az) = self
                            .satellite_sample(ephemeris, rise_jd)
                            .unwrap_or((false, -10.0, 0.0));
                        let (_, _, set_az) = self
                            .satellite_sample(ephemeris, set_jd)
                            .unwrap_or((false, -10.0, 0.0));

                        out.push(rise_jd);
                        out.push(rise_az);
                        out.push(max_jd);
                        out.push(max_alt);
                        out.push(max_az);
                        out.push(set_jd);
                        out.push(set_az);
                    }

                    pass_start = None;
                }
            }

            was_visible = now_visible;
            current += step_days;
        }

        out
    }

    /// Sample the satellite at `jd`, returning `(visible, altitude_deg, azimuth_deg)`.
    ///
    /// `altitude_deg` reproduces the previous JS distance-based estimate exactly (so pass
    /// filtering and reported peak altitudes are unchanged): `-10` below the horizon,
    /// otherwise a linear map of slant distance onto `0..90°`. `azimuth_deg` is the true
    /// topocentric azimuth from `compute_satellite_position` (the old JS path used a `0`
    /// placeholder here). Returns `None` when the time is outside the ephemeris range.
    fn satellite_sample(
        &self,
        ephemeris: &SatelliteEphemeris,
        jd: f64,
    ) -> Option<(bool, f64, f64)> {
        let time = SkyTime::from_jd(jd);
        let pos = compute_satellite_position(
            ephemeris,
            &time,
            self.observer_lat_rad,
            self.observer_lon_rad,
            0.0, // observer height (km), assume sea level (matches recompute_satellites)
        )?;

        // Distance-based altitude estimate, identical to the previous JS computeAltAz:
        // ISS ~400 km at zenith, ~2300 km at the horizon.
        const MIN_DIST: f64 = 400.0;
        const MAX_DIST: f64 = 2300.0;
        let alt_fraction = ((MAX_DIST - pos.distance_km) / (MAX_DIST - MIN_DIST)).clamp(0.0, 1.0);
        let altitude = if pos.above_horizon { alt_fraction * 90.0 } else { -10.0 };

        Some((pos.above_horizon, altitude, pos.azimuth_deg))
    }

    /// Whether the satellite is visible at `jd`: above the horizon, sunlit, and the observer's
    /// sky is dark (Sun below `sun_alt_limit_deg`). Mirrors the old JS `isVisible` predicate.
    fn satellite_visible_at(
        &self,
        ephemeris: &SatelliteEphemeris,
        jd: f64,
        sun_alt_limit_deg: f64,
    ) -> bool {
        let time = SkyTime::from_jd(jd);
        let pos = match compute_satellite_position(
            ephemeris,
            &time,
            self.observer_lat_rad,
            self.observer_lon_rad,
            0.0,
        ) {
            Some(p) => p,
            None => return false,
        };
        let sun_below = self.sun_altitude_at(&time) < sun_alt_limit_deg;
        pos.above_horizon && pos.illuminated && sun_below
    }

    /// Binary-search the visibility transition between `lo_jd` and `hi_jd`, refining until the
    /// bracket is narrower than `threshold_days`. `find_rise = true` locates a not-visible →
    /// visible edge (returning the upper bound); `false` locates visible → not-visible
    /// (returning the lower bound). Matches the old JS `binarySearchTransition`.
    fn refine_transition(
        &self,
        ephemeris: &SatelliteEphemeris,
        lo_jd: f64,
        hi_jd: f64,
        sun_alt_limit_deg: f64,
        find_rise: bool,
        threshold_days: f64,
    ) -> f64 {
        let mut lo = lo_jd;
        let mut hi = hi_jd;
        while hi - lo > threshold_days {
            let mid = (lo + hi) / 2.0;
            let visible = self.satellite_visible_at(ephemeris, mid, sun_alt_limit_deg);
            if find_rise == visible {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        if find_rise { hi } else { lo }
    }

    /// Sample the pass window `[start_jd, end_jd]` every `step_days` and return the
    /// `(jd, altitude_deg, azimuth_deg)` of peak altitude. Matches the old JS `findMaxAltitude`.
    fn max_altitude(
        &self,
        ephemeris: &SatelliteEphemeris,
        start_jd: f64,
        end_jd: f64,
        _sun_alt_limit_deg: f64,
        step_days: f64,
    ) -> (f64, f64, f64) {
        let mut max_alt = -90.0;
        let mut max_jd = start_jd;
        let mut max_az = 0.0;
        let mut t = start_jd;
        while t <= end_jd {
            if let Some((_, alt, az)) = self.satellite_sample(ephemeris, t) {
                if alt > max_alt {
                    max_alt = alt;
                    max_jd = t;
                    max_az = az;
                }
            }
            t += step_days;
        }
        (max_jd, max_alt, max_az)
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Equivalence proof for the orbit-worker optimization: `fill_planet_track` must produce
    /// exactly the same equatorial unit vectors that the full `recompute()` path writes into
    /// the bodies position buffer. `recompute_bodies` stores, for each planet index i (2..=8),
    /// `compute_all_body_positions_full(&time)[i].direction.to_f32()`, so we compare against
    /// that canonical source across several Julian Dates and all 7 planet indices.
    #[test]
    fn fill_planet_track_matches_full_recompute() {
        // Empty catalog -> embedded bright stars; planet math is independent of the catalog.
        let engine = SkyEngine::new(&[]).expect("engine");

        // A spread of JDs: J2000, ~2020, ~2026, and a far-future date.
        let test_jds = [2451545.0_f64, 2458849.5, 2461041.5, 2470000.0];

        for &jd in &test_jds {
            let full = compute_all_body_positions_full(&SkyTime::from_jd(jd));

            for body_index in 2usize..=8 {
                // Single-sample track at exactly this JD (step is irrelevant for count == 1).
                let track = engine.fill_planet_track(body_index, jd, 0.0, 1);
                assert_eq!(track.len(), 3, "expected 3 floats per sample");

                let (ex, ey, ez) = full[body_index].direction.to_f32();

                assert_eq!(
                    track[0], ex,
                    "x mismatch for body {body_index} at jd {jd}"
                );
                assert_eq!(
                    track[1], ey,
                    "y mismatch for body {body_index} at jd {jd}"
                );
                assert_eq!(
                    track[2], ez,
                    "z mismatch for body {body_index} at jd {jd}"
                );
            }
        }
    }

    /// A multi-sample track must be internally consistent: sample i of an N-sample call at
    /// (start_jd, step_days) must equal a single-sample call at start_jd + i * step_days.
    #[test]
    fn fill_planet_track_samples_are_time_indexed() {
        let engine = SkyEngine::new(&[]).expect("engine");
        let start_jd = 2461041.5_f64;
        let step_days = 12.5_f64;
        let count = 8usize;

        // Jupiter (index 5).
        let track = engine.fill_planet_track(5, start_jd, step_days, count);
        assert_eq!(track.len(), count * 3);

        for i in 0..count {
            let jd = start_jd + i as f64 * step_days;
            let single = engine.fill_planet_track(5, jd, 0.0, 1);
            assert_eq!(track[i * 3], single[0], "x mismatch at sample {i}");
            assert_eq!(track[i * 3 + 1], single[1], "y mismatch at sample {i}");
            assert_eq!(track[i * 3 + 2], single[2], "z mismatch at sample {i}");
        }
    }

    /// Invalid body indices (Sun, Moon, out-of-range) yield an all-zero buffer of the right size.
    #[test]
    fn fill_planet_track_invalid_index_is_zeroed() {
        let engine = SkyEngine::new(&[]).expect("engine");
        for bad in [0usize, 1, 9, 100] {
            let track = engine.fill_planet_track(bad, 2451545.0, 1.0, 5);
            assert_eq!(track.len(), 15);
            assert!(track.iter().all(|&v| v == 0.0), "index {bad} should be zero");
        }
    }

    // ------------------------------------------------------------------------
    // ISS pass-prediction equivalence (issue #9)
    //
    // These tests prove the new immutable `find_passes` (which samples via
    // `SkyTime::from_jd` + `compute_satellite_position`, never touching the shared
    // engine time) reproduces the passes that the previous JS scan produced by
    // repeatedly mutating engine time (`set_time_utc`) and calling the full
    // `recompute()` before reading the satellite/sun buffers. The reference below is
    // a faithful transcription of that old mutate-and-recompute path.
    // ------------------------------------------------------------------------

    // The committed ISS ephemeris used by the web app (covers 2026-01-17 .. 2026-02-15).
    const ISS_EPHEMERIS_PATH: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/web/public/data/iss_ephemeris.bin");

    fn engine_with_iss() -> SkyEngine {
        let bytes = std::fs::read(ISS_EPHEMERIS_PATH).expect("read committed ISS ephemeris");
        let mut engine = SkyEngine::new(&[]).expect("engine");
        engine
            .load_satellite_ephemeris(0, &bytes)
            .expect("load ISS ephemeris");
        engine
    }

    /// Reference visibility via the OLD mutate-engine + full-recompute path.
    fn ref_visible(engine: &mut SkyEngine, jd: f64, sun_limit: f64) -> bool {
        engine.time = SkyTime::from_jd(jd);
        engine.recompute();
        engine.satellite_above_horizon(0)
            && engine.satellite_illuminated(0)
            && engine.sun_altitude() < sun_limit
    }

    /// Reference distance-based altitude estimate, reading the f32 satellite buffer
    /// exactly as the old JS `computeAltAz` did.
    fn ref_altitude(engine: &mut SkyEngine, jd: f64) -> f64 {
        engine.time = SkyTime::from_jd(jd);
        engine.recompute();
        if !engine.satellite_above_horizon(0) {
            return -10.0;
        }
        let d = engine.satellite_distance_km(0) as f64;
        let frac = ((2300.0 - d) / 1900.0).clamp(0.0, 1.0);
        frac * 90.0
    }

    fn ref_binary(
        engine: &mut SkyEngine,
        lo_jd: f64,
        hi_jd: f64,
        sun_limit: f64,
        find_rise: bool,
    ) -> f64 {
        let threshold = 30.0 / 86400.0;
        let mut lo = lo_jd;
        let mut hi = hi_jd;
        while hi - lo > threshold {
            let mid = (lo + hi) / 2.0;
            let vis = ref_visible(engine, mid, sun_limit);
            if find_rise == vis {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        if find_rise { hi } else { lo }
    }

    fn ref_max(engine: &mut SkyEngine, start_jd: f64, end_jd: f64) -> (f64, f64) {
        let step = 30.0 / 86400.0;
        let mut max_alt = -90.0;
        let mut max_jd = start_jd;
        let mut t = start_jd;
        while t <= end_jd {
            let alt = ref_altitude(engine, t);
            if alt > max_alt {
                max_alt = alt;
                max_jd = t;
            }
            t += step;
        }
        (max_jd, max_alt)
    }

    /// Full transcription of the old JS `findISSPasses` coarse scan.
    /// Returns `(rise_jd, max_jd, max_alt, set_jd)` per pass.
    fn ref_scan(
        engine: &mut SkyEngine,
        start_jd: f64,
        end_jd: f64,
        step: f64,
        min_alt: f64,
        sun_limit: f64,
        max_passes: usize,
    ) -> Vec<(f64, f64, f64, f64)> {
        let mut passes = Vec::new();
        let mut cur = start_jd;
        let mut was = false;
        let mut pstart: Option<f64> = None;
        while cur < end_jd && passes.len() < max_passes {
            let vis = ref_visible(engine, cur, sun_limit);
            if !was && vis {
                pstart = Some(ref_binary(engine, cur - step, cur, sun_limit, true));
            } else if was && !vis {
                if let Some(rise) = pstart {
                    let set = ref_binary(engine, cur - step, cur, sun_limit, false);
                    let (mj, ma) = ref_max(engine, rise, set);
                    if ma >= min_alt {
                        passes.push((rise, mj, ma, set));
                    }
                    pstart = None;
                }
            }
            was = vis;
            cur += step;
        }
        passes
    }

    #[test]
    fn find_passes_matches_legacy_scan() {
        let step = 10.0 / 1440.0; // 10-minute coarse scan
        let min_alt = 10.0;
        let sun_limit = -6.0;
        let max_passes = 5;

        let mut engine = engine_with_iss();
        let range = engine
            .satellite_ephemeris_range(0)
            .expect("ephemeris range");
        let start_jd = range[0];
        // Bounded window keeps the ~thousand-recompute reference scan fast while still
        // covering several real passes.
        let end_jd = start_jd + 2.0;

        // Reference passes via the mutate-and-recompute path.
        let reference = ref_scan(
            &mut engine, start_jd, end_jd, step, min_alt, sun_limit, max_passes,
        );

        // New immutable path.
        let jd_before = engine.julian_date_tdb();
        let buf = engine.find_passes(0, start_jd, end_jd, step, min_alt, sun_limit, max_passes);
        let jd_after = engine.julian_date_tdb();

        // Shared engine time must NOT be mutated by find_passes.
        assert_eq!(
            jd_before, jd_after,
            "find_passes must not mutate the shared engine time"
        );

        assert_eq!(buf.len() % PASS_RECORD_LEN, 0, "buffer must be whole records");
        let found = buf.len() / PASS_RECORD_LEN;

        // Sanity: the reference window must actually contain passes, otherwise the test
        // proves nothing.
        assert!(
            !reference.is_empty(),
            "expected the 2-day reference window to contain visible ISS passes"
        );
        assert_eq!(
            found,
            reference.len(),
            "pass count mismatch: find_passes={found}, reference={}",
            reference.len()
        );

        let step_tol = step; // rise/set within one coarse step
        for (i, r) in reference.iter().enumerate() {
            let base = i * PASS_RECORD_LEN;
            let rise = buf[base];
            let max_jd = buf[base + 2];
            let max_alt = buf[base + 3];
            let set = buf[base + 5];

            let (ref_rise, ref_max_jd, ref_max_alt, ref_set) = *r;

            assert!(
                (rise - ref_rise).abs() <= step_tol,
                "pass {i} rise mismatch: {rise} vs {ref_rise}"
            );
            assert!(
                (set - ref_set).abs() <= step_tol,
                "pass {i} set mismatch: {set} vs {ref_set}"
            );
            assert!(
                (max_jd - ref_max_jd).abs() <= step_tol,
                "pass {i} max-time mismatch: {max_jd} vs {ref_max_jd}"
            );
            assert!(
                (max_alt - ref_max_alt).abs() <= 5.0,
                "pass {i} max-altitude mismatch: {max_alt} vs {ref_max_alt}"
            );
        }
    }

    #[test]
    fn find_passes_no_ephemeris_returns_empty() {
        // No satellite ephemeris loaded -> empty, not an error/panic.
        let engine = SkyEngine::new(&[]).expect("engine");
        let out = engine.find_passes(0, 2461057.5, 2461059.5, 10.0 / 1440.0, 10.0, -6.0, 10);
        assert!(out.is_empty());
    }

    #[test]
    fn find_passes_degenerate_windows_return_empty() {
        let engine = engine_with_iss();
        let s = engine.satellite_ephemeris_range(0).unwrap()[0];
        // Empty window (end <= start), non-positive step, and zero max_passes.
        assert!(engine.find_passes(0, s, s, 10.0 / 1440.0, 10.0, -6.0, 10).is_empty());
        assert!(engine.find_passes(0, s + 1.0, s, 10.0 / 1440.0, 10.0, -6.0, 10).is_empty());
        assert!(engine.find_passes(0, s, s + 1.0, 0.0, 10.0, -6.0, 10).is_empty());
        assert!(engine.find_passes(0, s, s + 1.0, 10.0 / 1440.0, 10.0, -6.0, 0).is_empty());
        // Out-of-range satellite index.
        assert!(engine.find_passes(99, s, s + 1.0, 10.0 / 1440.0, 10.0, -6.0, 10).is_empty());
    }

    #[test]
    fn find_passes_at_pole_does_not_panic() {
        // Observer at the north pole (lat = +90) must not panic and returns a valid buffer.
        let mut engine = engine_with_iss();
        engine.set_observer_location(90.0, 0.0);
        let s = engine.satellite_ephemeris_range(0).unwrap()[0];
        let out = engine.find_passes(0, s, s + 1.0, 10.0 / 1440.0, 10.0, -6.0, 10);
        assert_eq!(out.len() % PASS_RECORD_LEN, 0);
    }
}
