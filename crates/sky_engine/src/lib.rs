use sky_engine_core::{
    catalog::StarCatalog,
    comets::{compute_all_comet_positions_with_ctx, Comet},
    coords::{apply_topocentric_correction, cartesian_to_ra_dec, compute_gmst, compute_lst, ra_dec_to_cartesian},
    events,
    minor_bodies::{compute_all_minor_body_positions_with_ctx, MinorBody},
    planetary_moons::{compute_all_planetary_moon_positions_with_ctx, PlanetaryMoon},
    planets::{compute_all_body_positions_with_ctx, compute_moon_position_full, compute_planet_position_full, compute_sun_position, CelestialBody, Planet},
    satellites::{compute_satellite_position, SatelliteEphemeris, SatelliteId},
    time::SkyTime,
    time_context::TimeContext,
};
use std::f64::consts::PI;
use wasm_bindgen::prelude::*;

/// Number of `f64` values per pass record returned by [`SkyEngine::find_passes`].
/// Layout: `[rise_jd, rise_az_deg, max_jd, max_alt_deg, max_az_deg, set_jd, set_az_deg]`.
pub const PASS_RECORD_LEN: usize = 7;

/// Number of `f64` values per event record returned by [`SkyEngine::find_body_events`].
/// Layout: `[event_type, jd_utc, azimuth_deg]`, where `event_type` is
/// `0 = rise`, `1 = set`, `2 = transit`. Mirrors `EVENT_RECORD_LEN` in
/// `sky_engine_core::events` and the TS constant in `apps/web/src/rise-set.ts`.
pub const EVENT_RECORD_LEN: usize = events::EVENT_RECORD_LEN;

/// Floats per satellite in the `satellites_pos` output buffer.
///
/// Layout: `x, y, z, illuminated (0/1), visible (0/1), distance_km, shadow_depth (0.0..=1.0)`.
///
/// Slot 3 stays the umbra-boundary boolean that pass prediction and
/// `satellite_illuminated` depend on; slot 6 is the continuous shadow depth
/// added for the renderer's marker fade (see `earth_shadow_depth` in
/// `sky_engine_core::satellites`).
///
/// Mirrored by `SATELLITE_FLOATS` in `apps/web/src/engine.ts`.
const SATELLITE_FLOATS: usize = 7;

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
    // N satellites * SATELLITE_FLOATS: x, y, z, illuminated (0/1), visible (0/1),
    // distance_km, shadow_depth (0.0..=1.0)
    satellites_pos: Vec<f32>,

    // Cached visible star count
    visible_count: usize,

    // Star output buffers only change when the magnitude limit or the catalog change
    // (stars are J2000-fixed and time-invariant). This flag lets `recompute_stars`
    // skip the full-catalog scan on time-only recomputes (the common playback / tour
    // / pass-scan case). Set on construction, `set_mag_limit`, and `add_stars`.
    stars_dirty: bool,
}

/// Everything one satellite evaluation says about visibility at an instant.
///
/// Satellite visibility is a three-way conjunction — `above_horizon &&
/// illuminated && sun_below` — whose conjuncts are governed by entirely
/// different physics (the satellite crossing the observer's horizon, the
/// satellite crossing Earth's umbra, the Sun crossing the twilight limit). The
/// coarse pass scan only ever sees the composite boolean flip; keeping the
/// conjuncts apart lets `find_passes` tell *which* event bracketed an edge and
/// pick a refinement method suited to it (see [`SkyEngine::refine_edge`]).
///
/// The signed umbra distance rides along because it falls out of the very same
/// `compute_satellite_position` call, so the shadow root-find never has to pay
/// to re-evaluate an instant the scan or the bisection already visited.
#[derive(Clone, Copy, Debug)]
struct VisibilitySample {
    above_horizon: bool,
    illuminated: bool,
    sun_below: bool,
    /// Signed distance (km) to Earth's umbra boundary, `> 0.0` eclipsed. Related
    /// to the boolean above by `illuminated == (umbra_signed_distance_km <= 0.0)`,
    /// definitionally — see `sky_engine_core::satellites::umbra_signed_distance_km`.
    umbra_signed_distance_km: f64,
}

impl VisibilitySample {
    /// The composite visibility predicate.
    fn visible(self) -> bool {
        self.above_horizon && self.illuminated && self.sun_below
    }

    /// Whether the satellite is inside the umbra, as the root-find's sign test
    /// sees it. Strict `>`, mirroring `is_in_earth_shadow`'s `perp_dist < umbra_r`.
    fn eclipsed(self) -> bool {
        self.umbra_signed_distance_km > 0.0
    }

    /// Whether the edge between `self` and `other` is caused by the umbra alone —
    /// the shadow conjunct flipped and the other two held. Only then does the
    /// continuous shadow root-find apply; if the horizon or twilight state also
    /// moved, `illuminated` may be flat (or already saturated) across the bracket
    /// and root-finding on it would converge to a spurious instant.
    fn shadow_limited_edge(self, other: Self) -> bool {
        self.illuminated != other.illuminated
            && self.above_horizon == other.above_horizon
            && self.sun_below == other.sun_below
    }
}

/// Anderson-Björck relaxation factor for a regula-falsi step.
///
/// Plain false position keeps one endpoint fixed forever when `f` is curved, so
/// the bracket shrinks from one side only and convergence degrades to linear.
/// The fix is to shrink the *retained* endpoint's stored function value after
/// each step, which pulls the next secant back toward the root. Illinois always
/// uses `0.5`; Anderson-Björck instead derives `1 - f_new / f_replaced` from the
/// two most recent values, which adapts to the local curvature and typically
/// converges in noticeably fewer samples. Non-positive or non-finite factors
/// (the case where the estimate is useless) fall back to the Illinois `0.5`.
///
/// `f_new` is the freshly-sampled value, `f_replaced` the value at the endpoint
/// the new sample displaced.
fn anderson_bjorck_factor(f_new: f64, f_replaced: f64) -> f64 {
    let factor = 1.0 - f_new / f_replaced;
    if factor.is_finite() && factor > 0.0 {
        factor
    } else {
        0.5
    }
}

/// A visibility edge under refinement: the two bracketing instants together with
/// the samples already evaluated there, or `None` for an instant outside the
/// ephemeris window.
///
/// Carrying the samples costs nothing — the coarse scan and the bisection
/// evaluated those instants anyway — and it is what makes the handoff to the
/// continuous root-find free: no endpoint re-evaluation, and the returned
/// instant arrives pre-verified.
#[derive(Clone, Copy, Debug)]
struct EdgeBracket {
    lo_jd: f64,
    lo: Option<VisibilitySample>,
    hi_jd: f64,
    hi: Option<VisibilitySample>,
}

// Test-only counter of `recompute_stars` full-catalog scans (vs. skips). Lets the
// dirty-flag test assert that a time-only recompute does not rescan the catalog.
#[cfg(test)]
thread_local! {
    static STAR_SCAN_COUNT: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

// Test-only counter of rise/set edges resolved by the continuous shadow
// root-find rather than boolean bisection. Lets the pass tests assert that both
// refinement paths are genuinely exercised by the pinned fixture, instead of
// the shadow path being present but unreachable.
#[cfg(test)]
thread_local! {
    static SHADOW_ROOT_FIND_COUNT: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
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
            comets_pos: vec![0.0; Comet::ALL.len() * 4], // 9 comets * 4 floats (x, y, z, magnitude)
            all_stars_pos: vec![0.0; star_count * 3],
            all_stars_meta: vec![0.0; star_count * 4],
            satellite_ephemerides: vec![None; SatelliteId::ALL.len()],
            satellites_pos: vec![0.0; SatelliteId::ALL.len() * SATELLITE_FLOATS],
            visible_count: 0,
            stars_dirty: true, // first recompute() must populate the star buffers
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
        if mag != self.mag_limit {
            self.mag_limit = mag;
            self.stars_dirty = true;
        }
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

        // Compute the per-time-step shared context ONCE and thread it through every
        // body path. This dedupes the ~50 Earth-VSOP87 and ~74 nutation evaluations
        // that the sub-functions previously performed independently at the same instant.
        let ctx = TimeContext::new(&self.time);
        self.recompute_bodies(&ctx);
        self.recompute_planetary_moons(&ctx);
        self.recompute_minor_bodies(&ctx);
        self.recompute_comets(&ctx);
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

            // The magnitude-filtered visible buffers must be rebuilt to include the
            // new stars on the next recompute().
            self.stars_dirty = true;
        }

        Ok(added)
    }

    fn recompute_stars(&mut self) {
        // Stars are J2000-fixed; the visible buffers only change when the magnitude
        // limit or the catalog change. Skip the full-catalog scan otherwise.
        if !self.stars_dirty {
            return;
        }
        #[cfg(test)]
        STAR_SCAN_COUNT.with(|c| c.set(c.get() + 1));

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
        self.stars_dirty = false;
    }

    fn recompute_bodies(&mut self, ctx: &TimeContext) {
        let positions = compute_all_body_positions_with_ctx(ctx);

        // GMST for topocentric corrections (shared from the context).
        let gmst = ctx.gmst;

        for (i, body_pos) in positions.iter().enumerate() {
            let direction = if i == 1 {
                // Moon (index 1): Apply topocentric parallax correction
                // This can shift the Moon's position by up to ~1° depending on observer location
                let (ra, dec) = cartesian_to_ra_dec(&body_pos.direction);

                // Moon distance is already in positions[1] (this element) — no need to
                // re-run the ~180-term Meeus lunar series a second time.
                let (topo_ra, topo_dec) = apply_topocentric_correction(
                    ra,
                    dec,
                    body_pos.distance_km,
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

    fn recompute_planetary_moons(&mut self, ctx: &TimeContext) {
        let positions = compute_all_planetary_moon_positions_with_ctx(ctx);
        for (i, moon_pos) in positions.iter().enumerate() {
            let (x, y, z) = moon_pos.direction.to_f32();
            let idx = i * 4;
            self.planetary_moons_pos[idx] = x;
            self.planetary_moons_pos[idx + 1] = y;
            self.planetary_moons_pos[idx + 2] = z;
            self.planetary_moons_pos[idx + 3] = moon_pos.angular_diameter_rad as f32;
        }
    }

    fn recompute_minor_bodies(&mut self, ctx: &TimeContext) {
        let positions = compute_all_minor_body_positions_with_ctx(ctx);
        for (i, body_pos) in positions.iter().enumerate() {
            let (x, y, z) = body_pos.direction.to_f32();
            let idx = i * 4;
            self.minor_bodies_pos[idx] = x;
            self.minor_bodies_pos[idx + 1] = y;
            self.minor_bodies_pos[idx + 2] = z;
            self.minor_bodies_pos[idx + 3] = body_pos.angular_diameter_rad as f32;
        }
    }

    fn recompute_comets(&mut self, ctx: &TimeContext) {
        let positions = compute_all_comet_positions_with_ctx(ctx);
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
            let base_idx = i * SATELLITE_FLOATS;
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
                    self.satellites_pos[base_idx + 6] = pos.shadow_depth as f32;
                } else {
                    // Outside ephemeris range or error
                    self.satellites_pos[base_idx..base_idx + SATELLITE_FLOATS].fill(0.0);
                }
            } else {
                // No ephemeris loaded for this satellite
                self.satellites_pos[base_idx..base_idx + SATELLITE_FLOATS].fill(0.0);
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
    /// N satellites * 7 floats: x, y, z (direction), illuminated (0/1), visible (0/1),
    /// distance_km, shadow_depth (0.0..=1.0).
    pub fn satellites_pos_ptr(&self) -> *const f32 {
        self.satellites_pos.as_ptr()
    }

    /// Get length of satellites position buffer.
    /// satellites_count() * 7 floats.
    pub fn satellites_pos_len(&self) -> usize {
        self.satellites_pos.len()
    }

    /// Check if a satellite is currently illuminated (not in Earth's shadow).
    ///
    /// This is the umbra-boundary boolean: a satellite in the penumbra is only
    /// partially shaded and still counts as illuminated. Use
    /// [`Self::satellite_shadow_depth`] for the continuous shading value.
    pub fn satellite_illuminated(&self, index: usize) -> bool {
        let base_idx = index * SATELLITE_FLOATS;
        self.satellites_pos.get(base_idx + 3).map(|v| *v > 0.5).unwrap_or(false)
    }

    /// Check if a satellite is currently above the observer's horizon.
    pub fn satellite_above_horizon(&self, index: usize) -> bool {
        let base_idx = index * SATELLITE_FLOATS;
        self.satellites_pos.get(base_idx + 4).map(|v| *v > 0.5).unwrap_or(false)
    }

    /// Get the distance to a satellite in kilometers.
    pub fn satellite_distance_km(&self, index: usize) -> f32 {
        let base_idx = index * SATELLITE_FLOATS;
        self.satellites_pos.get(base_idx + 5).copied().unwrap_or(0.0)
    }

    /// How deeply a satellite sits in Earth's shadow, as a continuous value:
    /// `0.0` = fully sunlit, ramping across the penumbra to `1.0` = fully inside
    /// the umbra.
    ///
    /// Intended for presentation (fading the satellite marker as it crosses the
    /// terminator). Visibility and pass prediction keep using the
    /// [`Self::satellite_illuminated`] boolean, which flips at the umbra
    /// boundary — i.e. where this value reaches `1.0`.
    pub fn satellite_shadow_depth(&self, index: usize) -> f32 {
        let base_idx = index * SATELLITE_FLOATS;
        self.satellites_pos.get(base_idx + 6).copied().unwrap_or(0.0)
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
    ///
    /// This is the first 5 floats of the ISS's 7-float entry in `satellites_pos`
    /// (ISS is at index 0); the trailing distance_km and shadow_depth slots are
    /// only reachable through the multi-satellite accessors.
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
        // The coarse scan keeps the whole sample rather than just the composite
        // boolean — it is the same single position evaluation either way, and
        // carrying the previous step's sample forward hands `refine_edge` a
        // fully-evaluated bracket for free. The synthetic pre-window state is
        // `None` (that instant was never sampled), which never classifies as
        // shadow-limited, so a window opening mid-pass refines as it did before.
        let mut was: Option<VisibilitySample> = None;
        let mut pass_start: Option<f64> = None;

        while current < end_jd && out.len() / PASS_RECORD_LEN < max_passes {
            let now = self.visibility_at(ephemeris, current, sun_alt_limit_deg);
            let was_visible = was.is_some_and(VisibilitySample::visible);
            let now_visible = now.is_some_and(VisibilitySample::visible);

            if !was_visible && now_visible {
                // Pass started: refine the rise time between the previous and current step.
                pass_start = Some(self.refine_edge(
                    ephemeris,
                    EdgeBracket {
                        lo_jd: current - step_days,
                        lo: was,
                        hi_jd: current,
                        hi: now,
                    },
                    sun_alt_limit_deg,
                    true,
                    refine_threshold,
                ));
            } else if was_visible && !now_visible {
                if let Some(rise_jd) = pass_start {
                    // Pass ended: refine the set time.
                    let set_jd = self.refine_edge(
                        ephemeris,
                        EdgeBracket {
                            lo_jd: current - step_days,
                            lo: was,
                            hi_jd: current,
                            hi: now,
                        },
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

            was = now;
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
    ///
    /// Production code samples `visibility_at` instead — it needs the individual
    /// conjuncts, and this composite discards them. Retained for the tests, which
    /// bisect it as the reference predicate `find_passes` must agree with.
    #[cfg(test)]
    fn satellite_visible_at(
        &self,
        ephemeris: &SatelliteEphemeris,
        jd: f64,
        sun_alt_limit_deg: f64,
    ) -> bool {
        self.visibility_at(ephemeris, jd, sun_alt_limit_deg)
            .is_some_and(VisibilitySample::visible)
    }

    /// Evaluate the satellite once at `jd` and return everything that bears on
    /// visibility there: the three conjuncts plus the signed umbra distance.
    ///
    /// This is the single sampling primitive for the whole pass-prediction path,
    /// so the coarse scan, the bisection and the shadow root-find all cost
    /// exactly one of these per instant and can hand results to each other.
    /// `None` outside the ephemeris window, where the composite predicate
    /// reports `false` exactly as before.
    fn visibility_at(
        &self,
        ephemeris: &SatelliteEphemeris,
        jd: f64,
        sun_alt_limit_deg: f64,
    ) -> Option<VisibilitySample> {
        let time = SkyTime::from_jd(jd);
        let pos = compute_satellite_position(
            ephemeris,
            &time,
            self.observer_lat_rad,
            self.observer_lon_rad,
            0.0,
        )?;
        Some(VisibilitySample {
            above_horizon: pos.above_horizon,
            illuminated: pos.illuminated,
            sun_below: self.sun_altitude_at(&time) < sun_alt_limit_deg,
            umbra_signed_distance_km: pos.umbra_signed_distance_km,
        })
    }

    /// Refine a visibility transition, switching from bisecting the boolean to
    /// root-finding the continuous shadow geometry as soon as the edge is known
    /// to be a pure umbra crossing.
    ///
    /// Satellite visibility is a three-way conjunction — `above_horizon &&
    /// illuminated && sun_below` — so a bracket flagged by the coarse scan may be
    /// a horizon crossing, an umbra crossing, or (for a pass spanning dusk/dawn)
    /// the Sun crossing `sun_alt_limit_deg`. Continuous root-finding only pays off
    /// for the umbra case; there is nothing to root-find on for the others
    /// (`illuminated` can be flat, or already saturated, right across the
    /// bracket), so applying it blindly would converge to a spurious instant.
    ///
    /// **Classification cannot be done once, on the coarse bracket.** With the
    /// production 10-minute scan step and ~6-minute ISS passes, the horizon and
    /// the shadow conjunct routinely differ *together* between the coarse
    /// endpoints — measured on the pinned fixture, **zero** of the 24 rise/set
    /// edges isolate to a single conjunct at that width (the count asserted by
    /// `refine_edge_routes_shadow_edges_to_the_root_find_and_matches_bisection`
    /// across its three observers). So this bisects the
    /// composite boolean exactly as before while carrying the full sample at each
    /// endpoint, and re-tests after every halving. The moment the bracket holds
    /// only the `illuminated` flip, [`Self::refine_shadow_transition`] takes over.
    ///
    /// The handoff is *free and verified*: free because the endpoint samples the
    /// root-find needs were already evaluated by the bisection that produced the
    /// bracket, verified because those samples carry the other two conjuncts, so
    /// the returned instant is checked to be genuinely visible before it is
    /// accepted. The root-find only tracks the shadow conjunct, so if a horizon or
    /// twilight flip is hiding inside the narrowed bracket the candidate is
    /// discarded and bisection finishes the job — preserving the invariant that
    /// the returned edge time is always an instant where the full conjunction
    /// holds.
    ///
    /// Termination and return value are unchanged: the bracket is narrowed to
    /// `threshold_days` and the visible endpoint is returned (upper for a rise,
    /// lower for a set), so the 30 s refinement contract still holds.
    fn refine_edge(
        &self,
        ephemeris: &SatelliteEphemeris,
        bracket: EdgeBracket,
        sun_alt_limit_deg: f64,
        find_rise: bool,
        threshold_days: f64,
    ) -> f64 {
        let mut bracket = bracket;
        // Cleared once the continuous path has been tried and rejected, so a
        // pathological bracket cannot re-attempt it after every halving.
        let mut shadow_path_available = true;

        while bracket.hi_jd - bracket.lo_jd > threshold_days {
            if shadow_path_available
                && let (Some(lo), Some(hi)) = (bracket.lo, bracket.hi)
                && lo.shadow_limited_edge(hi)
            {
                match self.refine_shadow_transition(
                    ephemeris,
                    bracket,
                    sun_alt_limit_deg,
                    find_rise,
                    threshold_days,
                ) {
                    Some(jd) => {
                        #[cfg(test)]
                        SHADOW_ROOT_FIND_COUNT.with(|c| c.set(c.get() + 1));
                        return jd;
                    }
                    None => shadow_path_available = false,
                }
            }

            let mid_jd = (bracket.lo_jd + bracket.hi_jd) / 2.0;
            let mid = self.visibility_at(ephemeris, mid_jd, sun_alt_limit_deg);
            if find_rise == mid.is_some_and(VisibilitySample::visible) {
                bracket.hi_jd = mid_jd;
                bracket.hi = mid;
            } else {
                bracket.lo_jd = mid_jd;
                bracket.lo = mid;
            }
        }

        if find_rise { bracket.hi_jd } else { bracket.lo_jd }
    }

    /// Locate the umbra crossing inside a shadow-limited `bracket` by root-finding
    /// on the continuous signed distance to the umbra boundary.
    ///
    /// **Root function**: `f(t) = umbra_signed_distance_km(t)` — positive inside
    /// the umbra, negative outside, zero exactly on the boundary. The crossing it
    /// locates is by construction the same instant `is_in_earth_shadow`
    /// (`perp_dist < umbra_r`, strict) flips, so umbra-boundary visibility
    /// semantics are untouched: this changes *conditioning*, not *meaning*. No
    /// epsilon is introduced anywhere — a sample landing exactly on `f == 0.0`
    /// joins the illuminated side of the bracket, matching the strict `<`.
    ///
    /// **Method**: regula falsi with the Anderson-Björck modification (see
    /// [`anderson_bjorck_factor`]). Each step takes the secant root through the
    /// bracket endpoints and then relaxes the retained endpoint's stored value,
    /// which breaks the stagnation that makes plain false position crawl in from
    /// one side on a curved `f` — and `f` is curved here, since the satellite
    /// sweeps ~20° of orbit across a 300 s bracket. The bracket is maintained
    /// throughout (the endpoints always straddle the root), so the method stays as
    /// robust as bisection while converging superlinearly. Plain bisection on `f`
    /// would have been the smaller diff but buys nothing: it halves the interval
    /// per sample whatever the function looks like, so it would need exactly as
    /// many samples as the boolean search it replaces and return exactly as loose
    /// a bracket — no measurable win, and this issue demands a measured one.
    ///
    /// **Tolerance**: the root-find is *not* stopped at `threshold_days`. Because
    /// it is superlinear, the samples that bisection would have spent grinding out
    /// one bit each instead buy several orders of magnitude, so it runs to
    /// `threshold_days * ROOT_TOLERANCE_FRACTION` while consuming no more samples
    /// than the bisection it replaced. The 30 s contract is a *ceiling* on the
    /// returned bracket, and it is still honoured — comfortably.
    ///
    /// Returns the endpoint on the illuminated side of the final bracket (upper
    /// for a rise, lower for a set), matching the boolean bisection it takes over
    /// from, and only after confirming that endpoint's sample is genuinely
    /// visible. Returns `None` — deferring to the boolean bisection — when the
    /// bracket does not straddle the boundary, when a sample falls outside the
    /// ephemeris, when the iteration cap is hit without reaching `threshold_days`,
    /// or when the located instant is not visible after all.
    fn refine_shadow_transition(
        &self,
        ephemeris: &SatelliteEphemeris,
        bracket: EdgeBracket,
        sun_alt_limit_deg: f64,
        find_rise: bool,
        threshold_days: f64,
    ) -> Option<f64> {
        /// Hard cap on samples. Regula falsi needs a handful; hitting it means the
        /// function is not behaving as assumed, so we hand back to bisection.
        const MAX_ITERATIONS: usize = 32;
        /// Fraction of the caller's refinement threshold the root-find actually
        /// targets. Superlinear convergence makes the extra digits nearly free.
        const ROOT_TOLERANCE_FRACTION: f64 = 1e-3;
        /// Minimum interior margin (as a fraction of the current bracket) that a
        /// secant step must respect. Purely a guard against a step that rounds
        /// onto an endpoint and stalls the loop; small enough never to interfere
        /// with genuine superlinear convergence.
        const INTERIOR_MARGIN_FRACTION: f64 = 1e-9;

        let tolerance_days = threshold_days * ROOT_TOLERANCE_FRACTION;

        let mut a_jd = bracket.lo_jd;
        let mut b_jd = bracket.hi_jd;
        let mut a = bracket.lo?;
        let mut b = bracket.hi?;
        let mut fa = a.umbra_signed_distance_km;
        let mut fb = b.umbra_signed_distance_km;

        // Bracket precondition: exactly one endpoint eclipsed.
        if a.eclipsed() == b.eclipsed() {
            return None;
        }

        let mut converged = false;

        for _ in 0..MAX_ITERATIONS {
            if b_jd - a_jd <= tolerance_days {
                converged = true;
                break;
            }

            let denom = fb - fa;
            let mut c_jd = if denom.is_finite() && denom != 0.0 {
                b_jd - fb * (b_jd - a_jd) / denom
            } else {
                0.5 * (a_jd + b_jd)
            };
            let margin = INTERIOR_MARGIN_FRACTION * (b_jd - a_jd);
            if !(c_jd > a_jd + margin && c_jd < b_jd - margin) {
                c_jd = 0.5 * (a_jd + b_jd);
            }

            let c = self.visibility_at(ephemeris, c_jd, sun_alt_limit_deg)?;
            let fc = c.umbra_signed_distance_km;

            // `fc == 0.0` reads as not-eclipsed here, so an exact boundary sample
            // joins the illuminated side — the strict `perp_dist < umbra_r`.
            if c.eclipsed() == a.eclipsed() {
                // The new point replaces the lower endpoint; relax the retained
                // upper one so the secant stops leaning on a stale value.
                fb *= anderson_bjorck_factor(fc, fa);
                a_jd = c_jd;
                a = c;
                fa = fc;
            } else {
                fa *= anderson_bjorck_factor(fc, fb);
                b_jd = c_jd;
                b = c;
                fb = fc;
            }
        }

        // Never return a looser bracket than the caller's contract.
        if !converged && b_jd - a_jd > threshold_days {
            return None;
        }

        // The illuminated endpoint is the visible one: for a rise the satellite
        // leaves the umbra, for a set it enters. Verified against the other two
        // conjuncts, which the root-find did not track.
        let (edge_jd, edge) = if find_rise { (b_jd, b) } else { (a_jd, a) };
        edge.visible().then_some(edge_jd)
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

    // --- Rise / set / transit events for celestial bodies ---

    /// Find rise / set / transit events for a celestial body over `[start_jd, end_jd]`
    /// without mutating engine state, using the observer's current location.
    ///
    /// This is the sun/moon/planet analogue of [`Self::find_passes`]: a coarse
    /// altitude scan with binary-search refinement of each horizon crossing, plus a
    /// meridian-transit crossing. All heavy lifting lives in
    /// [`sky_engine_core::events::find_body_events`]; see that function for the
    /// scan/bisection details and the standard `h0` conventions.
    ///
    /// # Arguments
    /// * `body_index` - [`CelestialBody`] ordering: `0 = Sun`, `1 = Moon`,
    ///   `2..=8 = Mercury..Neptune`.
    /// * `start_jd`, `end_jd` - Scan window (UTC Julian Dates).
    /// * `step_days` - Coarse scan step in days (e.g. 10 minutes = `10.0 / 1440.0`).
    /// * `h0_deg` - Horizon threshold in degrees, or `NaN` to use the body's
    ///   standard convention (sun −0.8333°, planets −0.5667°, and the Moon's
    ///   parallax-dependent `0.7275·π − 0.5667°`). Pass an explicit value for
    ///   twilights (`-6.0` / `-12.0` / `-18.0`).
    ///
    /// Returns a flat `Vec<f64>` (a `Float64Array` in JS) of [`EVENT_RECORD_LEN`]
    /// values per event: `[event_type, jd_utc, azimuth_deg]`
    /// (`event_type`: `0 = rise`, `1 = set`, `2 = transit`). Empty when the body has
    /// no crossings in the window (caller distinguishes always-up vs never-up via
    /// [`Self::body_altitude_at`]), or when `body_index` is out of range / the
    /// window is degenerate.
    pub fn find_body_events(
        &self,
        body_index: usize,
        start_jd: f64,
        end_jd: f64,
        step_days: f64,
        h0_deg: f64,
    ) -> Vec<f64> {
        let body = match CelestialBody::ALL.get(body_index) {
            Some(b) => *b,
            None => return Vec::new(),
        };
        events::find_body_events(
            body,
            start_jd,
            end_jd,
            step_days,
            self.observer_lat_rad,
            self.observer_lon_rad,
            h0_deg,
        )
    }

    /// Topocentric-equivalent altitude (degrees) of a body at `jd` for the
    /// observer's current location. Lets the TS layer classify the "always up" /
    /// "never up" polar-day/night cases when [`Self::find_body_events`] returns no
    /// crossings. Returns `NaN` when `body_index` is out of range.
    pub fn body_altitude_at(&self, body_index: usize, jd: f64) -> f64 {
        match CelestialBody::ALL.get(body_index) {
            Some(b) => {
                events::body_altitude_deg(*b, jd, self.observer_lat_rad, self.observer_lon_rad)
            }
            None => f64::NAN,
        }
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
    use sky_engine_core::planets::compute_all_body_positions_full;

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

    // Dedicated, fixed-window ISS ephemeris fixture for the pass-prediction tests.
    //
    // This is intentionally NOT the live `apps/web/public/data/iss_ephemeris.bin`,
    // which `.github/workflows/refresh-satellite-ephemeris.yml` regenerates weekly
    // starting from the run's own date. The `find_passes_matches_legacy_scan` test
    // depends on the first ~48 h of the window actually containing dark-sky ISS
    // passes for the fixed test observer — an invariant that drifts as the live
    // window slides forward each week, so coupling the test to that file made it
    // fail non-deterministically on clean checkouts (issue #82).
    //
    // The fixture is the first 3 days (2026-01-17 00:00 .. 2026-01-20 00:00 UTC,
    // 1-minute steps) of the original ISS ephemeris this test was authored against
    // (git commit 779be6f, which covered 2026-01-17 .. 2026-02-15). It is committed
    // permanently and lives outside the path glob the refresh workflow touches, so
    // it never changes underneath the test. Mirrors the "pin to a fixed epoch,
    // regenerate consciously" contract of `sky_engine_core/tests/golden_positions.rs`.
    //
    // To regenerate (only if the fixture is ever intentionally moved to a new
    // window): pick a fixed date range confirmed to contain several dark-sky passes
    // for the test observer and run
    //   scripts/generate_satellite_ephemeris.py iss --start YYYY-MM-DD --end YYYY-MM-DD \
    //     --output crates/sky_engine/tests/fixtures/iss_ephemeris_fixture.bin
    // then update the date range in this comment and re-run `cargo test -p sky_engine`.
    const ISS_EPHEMERIS_PATH: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/iss_ephemeris_fixture.bin"
    );

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

    /// Pure boolean bisection of the visibility conjunction — the refinement
    /// `refine_edge` performed before this change, kept here as the reference the
    /// hybrid must still agree with.
    fn reference_bisection(
        engine: &SkyEngine,
        ephemeris: &SatelliteEphemeris,
        lo_jd: f64,
        hi_jd: f64,
        sun_limit: f64,
        find_rise: bool,
        threshold: f64,
    ) -> f64 {
        let mut lo = lo_jd;
        let mut hi = hi_jd;
        while hi - lo > threshold {
            let mid = (lo + hi) / 2.0;
            if find_rise == engine.satellite_visible_at(ephemeris, mid, sun_limit) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        if find_rise { hi } else { lo }
    }

    /// Walk every rise/set edge the coarse scan finds in the pinned fixture and
    /// check the refinement routing end to end:
    ///
    /// * both paths are exercised — some edges reach the continuous shadow
    ///   root-find, others stay on boolean bisection (so neither is dead code);
    /// * **no** edge isolates to a single conjunct at the coarse 10-minute
    ///   bracket width, which is precisely why classification has to happen
    ///   inside the bisection loop rather than once up front;
    /// * every refined edge still lands within the 30 s refinement contract of
    ///   the pure boolean bisection this replaced;
    /// * every refined edge is an instant where the full conjunction holds.
    #[test]
    fn refine_edge_routes_shadow_edges_to_the_root_find_and_matches_bisection() {
        let step = 10.0 / 1440.0; // production coarse scan step
        let sun_limit = -6.0;
        let threshold = 30.0 / 86400.0;

        SHADOW_ROOT_FIND_COUNT.with(|c| c.set(0));
        let mut total_edges = 0usize;
        let mut coarse_isolated = 0usize;

        // Spread of latitudes so the fixture yields both shadow-limited and
        // horizon-limited edges.
        for (lat, lon) in [
            (37.7749, -122.4194), // San Francisco
            (51.5074, -0.1278),   // London
            (-33.87, 151.21),     // Sydney
        ] {
            let mut engine = engine_with_iss();
            engine.set_observer_location(lat, lon);
            let range = engine.satellite_ephemeris_range(0).expect("ephemeris range");
            let (start_jd, end_jd) = (range[0], range[1]);
            let ephemeris = engine.satellite_ephemerides[0]
                .as_ref()
                .expect("ISS ephemeris");

            let mut current = start_jd;
            let mut was: Option<VisibilitySample> = None;
            while current < end_jd {
                let now = engine.visibility_at(ephemeris, current, sun_limit);
                let was_visible = was.is_some_and(VisibilitySample::visible);
                let now_visible = now.is_some_and(VisibilitySample::visible);

                if current > start_jd && was_visible != now_visible {
                    total_edges += 1;
                    let find_rise = now_visible;
                    let bracket = EdgeBracket {
                        lo_jd: current - step,
                        lo: was,
                        hi_jd: current,
                        hi: now,
                    };

                    if let (Some(lo), Some(hi)) = (bracket.lo, bracket.hi)
                        && lo.shadow_limited_edge(hi)
                    {
                        coarse_isolated += 1;
                    }

                    let refined =
                        engine.refine_edge(ephemeris, bracket, sun_limit, find_rise, threshold);
                    let reference = reference_bisection(
                        &engine,
                        ephemeris,
                        bracket.lo_jd,
                        bracket.hi_jd,
                        sun_limit,
                        find_rise,
                        threshold,
                    );

                    assert!(
                        (refined - reference).abs() <= threshold,
                        "refined edge {refined} differs from boolean bisection {reference} by \
                         {:.3} s, beyond the 30 s refinement contract",
                        (refined - reference).abs() * 86400.0
                    );
                    assert!(
                        engine.satellite_visible_at(ephemeris, refined, sun_limit),
                        "refined edge {refined} must be an instant where the satellite is visible"
                    );
                }

                was = now;
                current += step;
            }
        }

        let via_root_find = SHADOW_ROOT_FIND_COUNT.with(|c| c.get()) as usize;
        assert!(total_edges > 0, "fixture must contain rise/set edges");
        assert!(
            via_root_find > 0,
            "no edge reached the continuous shadow root-find — the new path is unreachable"
        );
        assert!(
            via_root_find < total_edges,
            "every edge took the shadow path ({via_root_find}/{total_edges}); the boolean \
             bisection fallback is no longer exercised"
        );
        assert_eq!(
            coarse_isolated, 0,
            "an edge isolated to a single conjunct at the coarse bracket width; the in-loop \
             classification in refine_edge could then be simplified to a single up-front test"
        );
    }

    /// The continuous root-find must locate the *same* physical crossing the
    /// umbra boolean flips at: the refined instant is illuminated, and one 30 s
    /// contract-width earlier (for a set edge) or later (for a rise) the
    /// satellite is eclipsed. This is the umbra-boundary semantics guarantee —
    /// the change is conditioning only.
    #[test]
    fn shadow_refined_edges_straddle_the_umbra_boundary() {
        let step = 10.0 / 1440.0;
        let sun_limit = -6.0;
        let threshold = 30.0 / 86400.0;

        let mut engine = engine_with_iss();
        engine.set_observer_location(51.5074, -0.1278);
        let range = engine.satellite_ephemeris_range(0).expect("ephemeris range");
        let (start_jd, end_jd) = (range[0], range[1]);
        let ephemeris = engine.satellite_ephemerides[0]
            .as_ref()
            .expect("ISS ephemeris");

        let mut checked = 0usize;
        let mut current = start_jd;
        let mut was: Option<VisibilitySample> = None;
        while current < end_jd {
            let now = engine.visibility_at(ephemeris, current, sun_limit);
            let was_visible = was.is_some_and(VisibilitySample::visible);
            let now_visible = now.is_some_and(VisibilitySample::visible);

            if current > start_jd && was_visible != now_visible {
                let find_rise = now_visible;
                let before = SHADOW_ROOT_FIND_COUNT.with(|c| c.get());
                let refined = engine.refine_edge(
                    ephemeris,
                    EdgeBracket {
                        lo_jd: current - step,
                        lo: was,
                        hi_jd: current,
                        hi: now,
                    },
                    sun_limit,
                    find_rise,
                    threshold,
                );
                let used_root_find = SHADOW_ROOT_FIND_COUNT.with(|c| c.get()) != before;

                if used_root_find {
                    checked += 1;
                    let at_edge = engine
                        .visibility_at(ephemeris, refined, sun_limit)
                        .expect("sample at the refined edge");
                    assert!(
                        !at_edge.eclipsed(),
                        "the refined edge must sit on the illuminated side of the umbra boundary"
                    );
                    // A contract-width step across the edge, into the eclipse.
                    let across = if find_rise {
                        refined - threshold
                    } else {
                        refined + threshold
                    };
                    let at_across = engine
                        .visibility_at(ephemeris, across, sun_limit)
                        .expect("sample across the refined edge");
                    assert!(
                        at_across.eclipsed(),
                        "30 s across a shadow-limited edge the satellite must be eclipsed; \
                         the root-find converged to something other than the umbra crossing"
                    );
                }
            }

            was = now;
            current += step;
        }

        assert!(
            checked > 0,
            "expected at least one shadow-limited edge in the pinned fixture"
        );
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

    /// Item 4: `recompute_stars` must skip the full-catalog scan on time-only
    /// recomputes (stars are J2000-fixed) but still rescan when the magnitude limit
    /// changes, and the visible buffers must stay correct either way.
    #[test]
    fn recompute_stars_skips_scan_on_time_only_change() {
        let mut engine = SkyEngine::new(&[]).expect("engine");
        // Constructor performed exactly one star scan.
        STAR_SCAN_COUNT.with(|c| assert_eq!(c.get(), 1, "constructor should scan stars once"));

        let visible_before = engine.visible_stars();
        let buf_before: Vec<f32> =
            engine.stars_pos[..visible_before * 3].to_vec();

        // Time-only change: several recomputes must NOT rescan the catalog.
        STAR_SCAN_COUNT.with(|c| c.set(0));
        for (h, m) in [(1u8, 0u8), (2, 30), (12, 0)] {
            engine.set_time_utc(2026, 7, 6, h, m, 0.0);
            engine.recompute();
        }
        STAR_SCAN_COUNT.with(|c| {
            assert_eq!(c.get(), 0, "time-only recompute must not rescan the star catalog")
        });
        assert_eq!(engine.visible_stars(), visible_before, "visible count unchanged");
        assert_eq!(
            &engine.stars_pos[..visible_before * 3],
            &buf_before[..],
            "star buffer unchanged on time-only recompute"
        );

        // Magnitude-limit change: the catalog must be rescanned and the visible set
        // must shrink for a brighter (smaller) limit.
        STAR_SCAN_COUNT.with(|c| c.set(0));
        engine.set_mag_limit(2.0);
        engine.recompute();
        STAR_SCAN_COUNT.with(|c| {
            assert_eq!(c.get(), 1, "mag-limit change must trigger exactly one rescan")
        });
        assert!(
            engine.visible_stars() <= visible_before,
            "a brighter magnitude limit should not increase the visible star count"
        );

        // Setting the SAME mag limit again must not rescan.
        STAR_SCAN_COUNT.with(|c| c.set(0));
        engine.set_mag_limit(2.0);
        engine.recompute();
        STAR_SCAN_COUNT.with(|c| {
            assert_eq!(c.get(), 0, "re-setting the same mag limit must not rescan")
        });
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

    /// JD (UTC) for a UTC calendar instant, matching the events-module convention.
    fn events_jd_utc(year: i32, month: u8, day: u8, hour: u8, minute: u8) -> f64 {
        SkyTime::from_utc(year, month, day, hour, minute, 0.0).julian_date_utc()
    }

    #[test]
    fn find_body_events_sun_rise_set_transit() {
        // London, 2026-12-21, local day = UTC day (UTC+0 in December).
        let mut engine = SkyEngine::new(&[]).expect("engine");
        engine.set_observer_location(51.5074, -0.1278);
        let start = events_jd_utc(2026, 12, 21, 0, 0);
        let end = start + 1.0;

        let buf = engine.find_body_events(0, start, end, 10.0 / 1440.0, -0.8333);
        assert_eq!(buf.len() % EVENT_RECORD_LEN, 0, "whole event records");

        let mut rises = 0;
        let mut sets = 0;
        let mut transits = 0;
        for rec in buf.chunks_exact(EVENT_RECORD_LEN) {
            match rec[0] as u32 {
                0 => rises += 1,
                1 => sets += 1,
                2 => {
                    transits += 1;
                    // Northern-hemisphere upper culmination is due South.
                    assert!((rec[2] - 180.0).abs() < 3.0, "transit azimuth: {}", rec[2]);
                }
                other => panic!("unexpected event type {other}"),
            }
            assert!(rec[2] >= 0.0 && rec[2] < 360.0, "azimuth in range");
        }
        assert_eq!(rises, 1, "one sunrise");
        assert_eq!(sets, 1, "one sunset");
        assert_eq!(transits, 1, "one solar transit");
    }

    /// The satellite buffer must carry exactly `SATELLITE_FLOATS` floats per
    /// satellite, and the boolean accessors must keep reading their original
    /// slots (3 and 4) — this is the layout `apps/web/src/engine.ts` mirrors.
    #[test]
    fn satellites_buffer_stride_is_seven_floats() {
        let engine = engine_with_iss();
        assert_eq!(SATELLITE_FLOATS, 7);
        assert_eq!(
            engine.satellites_pos_len(),
            engine.satellites_count() * SATELLITE_FLOATS,
            "buffer length must match the documented stride"
        );
        // Out-of-range index reads must not panic and must report "sunlit".
        assert_eq!(engine.satellite_shadow_depth(99), 0.0);
    }

    /// The continuous shadow depth is an *additive* channel: it never changes
    /// what `satellite_illuminated` reports (slot 3 is untouched by this
    /// feature), and it saturates exactly where that boolean flips.
    ///
    /// Sweeps the pinned fixture window so the invariant is checked against real
    /// ISS geometry rather than synthetic vectors.
    #[test]
    fn satellite_shadow_depth_saturates_where_illuminated_flips() {
        let mut engine = engine_with_iss();
        engine.set_observer_location(40.0, -105.0);
        let range = engine.satellite_ephemeris_range(0).expect("ephemeris range");
        let start_jd = range[0];

        let step = 60.0 / 86400.0; // 1-minute coarse sweep
        let mut prev: Option<(f64, bool)> = None;
        let mut transition: Option<(f64, f64)> = None;

        for i in 0..720 {
            let jd = start_jd + i as f64 * step;
            engine.time = SkyTime::from_jd(jd);
            engine.recompute();

            let illuminated = engine.satellite_illuminated(0);
            let depth = engine.satellite_shadow_depth(0);

            assert!(
                (0.0..=1.0).contains(&depth),
                "shadow depth {depth} out of range at jd {jd}"
            );
            if !illuminated {
                assert_eq!(
                    depth, 1.0,
                    "eclipsed but shadow depth was {depth} at jd {jd}"
                );
            }

            if let Some((prev_jd, prev_illuminated)) = prev
                && prev_illuminated != illuminated
                && transition.is_none()
            {
                transition = Some((prev_jd, jd));
            }
            prev = Some((jd, illuminated));
        }

        // The first 12 h of the fixture window must contain at least one
        // eclipse entry/exit, otherwise the ramp check below is vacuous.
        let (lo, hi) = transition.expect("expected an eclipse transition in the fixture window");

        // Resolve the crossing finely: somewhere in that minute the ISS is
        // *inside the penumbra* — partially shaded — which is precisely what the
        // boolean cannot express and the continuous depth can.
        let mut saw_partial = false;
        for i in 0..=2000 {
            let jd = lo + (hi - lo) * (i as f64) / 2000.0;
            engine.time = SkyTime::from_jd(jd);
            engine.recompute();
            let depth = engine.satellite_shadow_depth(0);
            assert!(
                (0.0..=1.0).contains(&depth),
                "shadow depth {depth} out of range at jd {jd}"
            );
            if depth > 0.0 && depth < 1.0 {
                saw_partial = true;
            }
            if !engine.satellite_illuminated(0) {
                assert_eq!(depth, 1.0, "eclipsed but depth was {depth} at jd {jd}");
            }
        }
        assert!(
            saw_partial,
            "expected a partially-shaded (0 < depth < 1) sample across the terminator crossing"
        );
    }

    #[test]
    fn find_body_events_out_of_range_and_altitude_helper() {
        let mut engine = SkyEngine::new(&[]).expect("engine");
        engine.set_observer_location(40.0, 0.0);
        let start = events_jd_utc(2026, 3, 20, 0, 0);
        // Out-of-range body index -> empty buffer / NaN altitude.
        assert!(engine.find_body_events(99, start, start + 1.0, 10.0 / 1440.0, f64::NAN).is_empty());
        assert!(engine.body_altitude_at(99, start).is_nan());
        // In-range altitude is finite and within [-90, 90].
        let alt = engine.body_altitude_at(0, start);
        assert!(alt.is_finite() && (-90.0..=90.0).contains(&alt), "sun altitude: {alt}");
    }
}
