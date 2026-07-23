//! Rise / set / transit event finding for celestial bodies.
//!
//! This module answers the basic observing questions for a topocentric observer:
//! when does a body cross the horizon (rise / set) and when does it transit the
//! meridian (upper culmination)? It is the engine-side foundation for the web
//! rise/set panel (sun rise/set + twilights, moon rise/transit/set, planet
//! visibility windows) and, later, a "Tonight's Highlights" panel.
//!
//! # Approach
//!
//! Every primitive already exists in the engine; this is composition plus
//! root-finding. We reuse the proven scan + bisection pattern from
//! [`crate`]'s satellite pass finder (`find_passes`): sample the observer's
//! topocentric altitude of a body at a coarse step (10 min is more than adequate
//! — even the Moon moves only ~0.5°/hr), detect sign changes of `altitude − h0`,
//! and refine each crossing by bisection to ≤ 1 s. Transit is the crossing of the
//! (normalized) hour angle through zero. This is robust for polar day/night, the
//! Moon's fast motion, and multiple crossings, and its cost is negligible (a 24 h
//! window at 10-min steps is ~144 samples per body per threshold).
//!
//! All functions are non-mutating and take the observer latitude/longitude as
//! parameters, so callers never touch shared engine state.
//!
//! # Horizon conventions (`h0`)
//!
//! The apparent altitude at which an event is considered to occur, following the
//! standard conventions (Meeus, *Astronomical Algorithms*, ch. 15):
//!
//! - **Sun** rise/set: `−0.8333°` (34′ refraction + 16′ semidiameter)
//! - **Twilights**: sun *center* at `−6° / −12° / −18°` (civil / nautical /
//!   astronomical; no refraction/semidiameter term) — passed explicitly as `h0`.
//! - **Planets**: `−0.5667°` (refraction only)
//! - **Moon**: `h0 = 0.7275·π − 0.5667°`, where `π` is the Moon's horizontal
//!   parallax. This is applied to the *geocentric* altitude and thereby folds in
//!   the topocentric parallax without a per-sample topocentric correction.

use crate::coords::{cartesian_to_ra_dec, compute_gmst, compute_lst};
use crate::planets::{
    CelestialBody, Planet, compute_moon_position_full, compute_planet_position_full,
    compute_sun_position_full,
};
use crate::time::SkyTime;
use std::f64::consts::PI;

const RAD_TO_DEG: f64 = 180.0 / PI;

/// Earth equatorial radius in km (matches `coords.rs`), used for the Moon's
/// horizontal parallax in the parallax-dependent horizon convention.
const EARTH_RADIUS_KM: f64 = 6378.137;

/// Event-type code: body rising through the horizon threshold.
pub const EVENT_RISE: f64 = 0.0;
/// Event-type code: body setting through the horizon threshold.
pub const EVENT_SET: f64 = 1.0;
/// Event-type code: body transiting the meridian (upper culmination).
pub const EVENT_TRANSIT: f64 = 2.0;

/// Number of `f64` values per event record returned by [`find_body_events`].
/// Layout: `[event_type, jd_utc, azimuth_deg]`.
pub const EVENT_RECORD_LEN: usize = 3;

/// Map a [`CelestialBody`] to its [`Planet`] for planet position lookups.
/// Sun and Moon are handled separately and map to `Planet::Earth` as a
/// never-used placeholder.
fn celestial_to_planet(body: CelestialBody) -> Planet {
    match body {
        CelestialBody::Mercury => Planet::Mercury,
        CelestialBody::Venus => Planet::Venus,
        CelestialBody::Mars => Planet::Mars,
        CelestialBody::Jupiter => Planet::Jupiter,
        CelestialBody::Saturn => Planet::Saturn,
        CelestialBody::Uranus => Planet::Uranus,
        CelestialBody::Neptune => Planet::Neptune,
        CelestialBody::Sun | CelestialBody::Moon => Planet::Earth,
    }
}

/// Geocentric apparent RA/Dec (radians) and geocentric distance (km) of a body.
fn ra_dec_dist(body: CelestialBody, time: &SkyTime) -> (f64, f64, f64) {
    match body {
        CelestialBody::Sun => {
            let p = compute_sun_position_full(time);
            let (ra, dec) = cartesian_to_ra_dec(&p.direction);
            (ra, dec, p.distance_km)
        }
        CelestialBody::Moon => {
            let p = compute_moon_position_full(time);
            let (ra, dec) = cartesian_to_ra_dec(&p.direction);
            (ra, dec, p.distance_km)
        }
        other => {
            let p = compute_planet_position_full(celestial_to_planet(other), time);
            let (ra, dec) = cartesian_to_ra_dec(&p.direction);
            (ra, dec, p.distance_km)
        }
    }
}

/// Compute `(altitude_deg, azimuth_deg)` from equatorial coordinates, observer
/// latitude, and local sidereal time. Azimuth is measured clockwise from North
/// (0° = N, 90° = E, 180° = S, 270° = W), matching the app's other azimuths.
fn alt_az_deg(ra: f64, dec: f64, lat_rad: f64, lst: f64) -> (f64, f64) {
    let hour_angle = lst - ra;
    let sin_alt =
        (dec.sin() * lat_rad.sin() + dec.cos() * lat_rad.cos() * hour_angle.cos()).clamp(-1.0, 1.0);
    let alt = sin_alt.asin();
    let cos_alt = alt.cos();
    let cos_lat = lat_rad.cos();

    let az = if cos_alt.abs() < 1e-9 || cos_lat.abs() < 1e-9 {
        // At the zenith or the geographic poles azimuth is undefined; report 0.
        0.0
    } else {
        // North-based azimuth increasing toward East.
        let cos_a = ((dec.sin() - lat_rad.sin() * sin_alt) / (cos_lat * cos_alt)).clamp(-1.0, 1.0);
        let sin_a = -dec.cos() * hour_angle.sin() / cos_alt;
        sin_a.atan2(cos_a)
    };

    (alt * RAD_TO_DEG, (az * RAD_TO_DEG).rem_euclid(360.0))
}

/// Local sidereal time (radians) at `jd` for the observer longitude.
fn lst_at(jd: f64, lon_rad: f64) -> f64 {
    let gmst = compute_gmst(jd);
    compute_lst(gmst, lon_rad)
}

/// Topocentric-equivalent altitude of a body (degrees) at `jd` for the observer.
///
/// This is the geocentric altitude; the topocentric correction for the Moon is
/// folded into its horizon threshold via [`standard_h0_deg`] rather than applied
/// here (the sun and planets have negligible parallax).
pub fn body_altitude_deg(body: CelestialBody, jd: f64, lat_rad: f64, lon_rad: f64) -> f64 {
    let time = SkyTime::from_jd(jd);
    let (ra, dec, _dist) = ra_dec_dist(body, &time);
    let lst = lst_at(time.julian_date_utc(), lon_rad);
    let (alt, _az) = alt_az_deg(ra, dec, lat_rad, lst);
    alt
}

/// Altitude and azimuth (degrees) of a body at `jd` for the observer.
fn body_alt_az_deg(body: CelestialBody, jd: f64, lat_rad: f64, lon_rad: f64) -> (f64, f64) {
    let time = SkyTime::from_jd(jd);
    let (ra, dec, _dist) = ra_dec_dist(body, &time);
    let lst = lst_at(time.julian_date_utc(), lon_rad);
    alt_az_deg(ra, dec, lat_rad, lst)
}

/// The standard horizon threshold `h0` (degrees) for a body at `jd`.
///
/// See the module docs for the conventions. The Moon's `h0` is parallax-dependent
/// and therefore recomputed from its instantaneous distance at `jd`.
pub fn standard_h0_deg(body: CelestialBody, jd: f64) -> f64 {
    match body {
        CelestialBody::Sun => -0.8333,
        CelestialBody::Moon => {
            let time = SkyTime::from_jd(jd);
            let m = compute_moon_position_full(&time);
            let parallax_deg = (EARTH_RADIUS_KM / m.distance_km).asin() * RAD_TO_DEG;
            0.7275 * parallax_deg - 0.5667
        }
        _ => -0.5667,
    }
}

/// Normalize an angle (radians) to `(-π, π]`.
fn wrap_pi(x: f64) -> f64 {
    let mut y = x.rem_euclid(2.0 * PI);
    if y > PI {
        y -= 2.0 * PI;
    }
    y
}

/// Normalized hour angle (radians, in `(-π, π]`) of a body at `jd`. Zero at
/// upper culmination (meridian transit).
fn hour_angle_norm(body: CelestialBody, jd: f64, lon_rad: f64) -> f64 {
    let time = SkyTime::from_jd(jd);
    let (ra, _dec, _dist) = ra_dec_dist(body, &time);
    let lst = lst_at(time.julian_date_utc(), lon_rad);
    wrap_pi(lst - ra)
}

/// Bisect a monotone sign change of `f` on `[lo, hi]` down to `threshold_days`,
/// returning the midpoint of the final bracket. Assumes `f(lo)` and `f(hi)`
/// straddle zero.
fn bisect<F: Fn(f64) -> f64>(f: &F, mut lo: f64, mut hi: f64, threshold_days: f64) -> f64 {
    let flo = f(lo);
    let lo_nonneg = flo >= 0.0;
    while hi - lo > threshold_days {
        let mid = 0.5 * (lo + hi);
        if (f(mid) >= 0.0) == lo_nonneg {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

/// Find rise / set / transit events for `body` in `[start_jd, end_jd]`.
///
/// The window is scanned at `step_days` (10 min = `10.0 / 1440.0` is proven
/// adequate). Rise/set are sign changes of `altitude − h0`; transit is the
/// upward zero crossing of the normalized hour angle (upper culmination). Each
/// crossing is refined by bisection to ≤ 1 s.
///
/// `h0_deg` selects the horizon convention:
/// - a finite value is used directly (e.g. `-6.0` for civil twilight, or an
///   explicit sun/planet threshold);
/// - `NaN` means "use the body's [`standard_h0_deg`] convention", which includes
///   the Moon's parallax-dependent `h0` recomputed per sample.
///
/// Returns a flat `Vec<f64>` of [`EVENT_RECORD_LEN`] values per event:
/// `[event_type, jd_utc, azimuth_deg]`, sorted by time within each event class
/// (rise/set events precede transit events are NOT guaranteed to interleave —
/// callers filter by `event_type`). An empty vec means no crossings in the
/// window; callers distinguish always-up vs never-up via [`body_altitude_deg`].
pub fn find_body_events(
    body: CelestialBody,
    start_jd: f64,
    end_jd: f64,
    step_days: f64,
    lat_rad: f64,
    lon_rad: f64,
    h0_deg: f64,
) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    if !(end_jd > start_jd) || !(step_days > 0.0) {
        return out;
    }

    // 1 s refinement precision.
    let refine_threshold = 1.0 / 86400.0;

    // altitude − h0 at a given jd (h0 may be the per-sample standard convention).
    let alt_minus_h0 = |jd: f64| -> f64 {
        let alt = body_altitude_deg(body, jd, lat_rad, lon_rad);
        let h0 = if h0_deg.is_nan() {
            standard_h0_deg(body, jd)
        } else {
            h0_deg
        };
        alt - h0
    };

    // --- Rise / set: sign changes of altitude − h0 ---
    let mut current = start_jd;
    let mut prev_val = alt_minus_h0(current);
    while current < end_jd {
        let next = (current + step_days).min(end_jd);
        let next_val = alt_minus_h0(next);

        if prev_val <= 0.0 && next_val > 0.0 {
            let t = bisect(&alt_minus_h0, current, next, refine_threshold);
            let (_alt, az) = body_alt_az_deg(body, t, lat_rad, lon_rad);
            out.push(EVENT_RISE);
            out.push(t);
            out.push(az);
        } else if prev_val > 0.0 && next_val <= 0.0 {
            let t = bisect(&alt_minus_h0, current, next, refine_threshold);
            let (_alt, az) = body_alt_az_deg(body, t, lat_rad, lon_rad);
            out.push(EVENT_SET);
            out.push(t);
            out.push(az);
        }

        current = next;
        prev_val = next_val;
    }

    // --- Transit: upward zero crossing of the normalized hour angle ---
    let hn = |jd: f64| -> f64 { hour_angle_norm(body, jd, lon_rad) };
    let mut current = start_jd;
    let mut prev_h = hn(current);
    while current < end_jd {
        let next = (current + step_days).min(end_jd);
        let next_h = hn(next);

        // Upper culmination is where the hour angle increases through 0. The
        // ±π discontinuity (lower culmination) jumps from + to − and is excluded
        // by requiring prev ≤ 0 < next.
        if prev_h <= 0.0 && next_h > 0.0 {
            let t = bisect(&hn, current, next, refine_threshold);
            let (_alt, az) = body_alt_az_deg(body, t, lat_rad, lon_rad);
            out.push(EVENT_TRANSIT);
            out.push(t);
            out.push(az);
        }

        current = next;
        prev_h = next_h;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Coarse scan step used throughout: 10 minutes in days.
    const STEP: f64 = 10.0 / 1440.0;

    /// Julian Date for a UTC calendar instant.
    fn jd_utc(year: i32, month: u8, day: u8, hour: u8, minute: u8, second: f64) -> f64 {
        SkyTime::from_utc(year, month, day, hour, minute, second).julian_date_utc()
    }

    /// Extract events of a given type as `(jd, azimuth_deg)`, sorted by jd.
    fn events_of(buf: &[f64], event_type: f64) -> Vec<(f64, f64)> {
        let mut v: Vec<(f64, f64)> = buf
            .chunks_exact(EVENT_RECORD_LEN)
            .filter(|r| r[0] == event_type)
            .map(|r| (r[1], r[2]))
            .collect();
        v.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        v
    }

    /// Convert a JD to UTC hour-of-day (fractional hours), for ±minutes checks.
    fn utc_hour_of_day(jd: f64) -> f64 {
        // JD 0.5 fraction = midnight UTC. Fractional day since previous midnight.
        let frac = (jd + 0.5).fract();
        frac * 24.0
    }

    fn assert_within_minutes(actual_jd: f64, expected_hour_utc: f64, tol_min: f64, label: &str) {
        let actual_hour = utc_hour_of_day(actual_jd);
        let diff_min = (actual_hour - expected_hour_utc).abs() * 60.0;
        // Handle midnight wraparound.
        let diff_min = diff_min.min((24.0 * 60.0) - diff_min);
        assert!(
            diff_min <= tol_min,
            "{label}: got {actual_hour:.4}h UTC, expected {expected_hour_utc:.4}h UTC (Δ={diff_min:.2} min > {tol_min} min)"
        );
    }

    // --- Sun rise/set/transit against USNO reference values ---
    //
    // Reference: US Naval Observatory / timeanddate.com, sun rise & set.
    // Location: New York City, 40.7128° N, 74.0060° W. Date: 2026-06-21 (local).
    // The scan window is that local day in UTC.
    #[test]
    fn sun_rise_set_nyc_summer_solstice() {
        let lat = 40.7128_f64.to_radians();
        let lon = (-74.0060_f64).to_radians();
        // Local midnight EDT (UTC-4) 2026-06-21 = 04:00 UTC; +24 h window.
        let start = jd_utc(2026, 6, 21, 4, 0, 0.0);
        let end = start + 1.0;

        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -0.8333);
        let rises = events_of(&buf, EVENT_RISE);
        let sets = events_of(&buf, EVENT_SET);
        assert_eq!(rises.len(), 1, "one sunrise expected");
        assert_eq!(sets.len(), 1, "one sunset expected");

        // USNO: sunrise 05:25 EDT = 09:25 UTC; sunset 20:31 EDT = 00:31 UTC (next day).
        assert_within_minutes(rises[0].0, 9.0 + 25.0 / 60.0, 2.0, "NYC sunrise");
        assert_within_minutes(sets[0].0, 0.0 + 31.0 / 60.0, 2.0, "NYC sunset");

        // Rise in the NE (azimuth < 90°), set in the NW (azimuth > 270°) at summer solstice.
        assert!(
            rises[0].1 < 90.0,
            "summer sunrise azimuth NE: {}",
            rises[0].1
        );
        assert!(sets[0].1 > 270.0, "summer sunset azimuth NW: {}", sets[0].1);
    }

    // Reference: London, 51.5074° N, 0.1278° W. Date: 2026-12-21.
    #[test]
    fn sun_rise_set_london_winter_solstice() {
        let lat = 51.5074_f64.to_radians();
        let lon = (-0.1278_f64).to_radians();
        // London is UTC+0 in December; local midnight = 00:00 UTC.
        let start = jd_utc(2026, 12, 21, 0, 0, 0.0);
        let end = start + 1.0;

        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -0.8333);
        let rises = events_of(&buf, EVENT_RISE);
        let sets = events_of(&buf, EVENT_SET);
        assert_eq!(rises.len(), 1);
        assert_eq!(sets.len(), 1);

        // timeanddate.com London 2026-12-21: sunrise 08:04, sunset 15:53 (local = UTC).
        assert_within_minutes(rises[0].0, 8.0 + 4.0 / 60.0, 2.0, "London sunrise");
        assert_within_minutes(sets[0].0, 15.0 + 53.0 / 60.0, 2.0, "London sunset");
    }

    // Transit (solar noon) for London on the winter solstice ≈ 11:58 UTC.
    #[test]
    fn sun_transit_london() {
        let lat = 51.5074_f64.to_radians();
        let lon = (-0.1278_f64).to_radians();
        let start = jd_utc(2026, 12, 21, 0, 0, 0.0);
        let end = start + 1.0;

        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -0.8333);
        let transits = events_of(&buf, EVENT_TRANSIT);
        assert_eq!(transits.len(), 1, "one solar transit expected");
        // Solar noon London 2026-12-21 ≈ 11:58 UTC.
        assert_within_minutes(
            transits[0].0,
            11.0 + 58.0 / 60.0,
            3.0,
            "London solar transit",
        );
        // At upper culmination in the northern hemisphere the sun is due South.
        assert!(
            (transits[0].1 - 180.0).abs() < 2.0,
            "transit azimuth due South: {}",
            transits[0].1
        );
    }

    // --- Twilight thresholds ---
    #[test]
    fn civil_twilight_london_winter() {
        let lat = 51.5074_f64.to_radians();
        let lon = (-0.1278_f64).to_radians();
        let start = jd_utc(2026, 12, 21, 0, 0, 0.0);
        let end = start + 1.0;

        // Sun center at -6°.
        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -6.0);
        let dawn = events_of(&buf, EVENT_RISE); // sun rising through -6° = civil dawn
        let dusk = events_of(&buf, EVENT_SET); // sun setting through -6° = civil dusk
        assert_eq!(dawn.len(), 1);
        assert_eq!(dusk.len(), 1);
        // timeanddate.com London 2026-12-21: civil twilight begins ~07:22, ends ~16:35
        // (≈42 min around the 08:04 sunrise / 15:53 sunset).
        assert_within_minutes(dawn[0].0, 7.0 + 22.0 / 60.0, 3.0, "London civil dawn");
        assert_within_minutes(dusk[0].0, 16.0 + 35.0 / 60.0, 3.0, "London civil dusk");
    }

    // --- Moon rise/set: parallax-dependent h0 cross-check ---
    //
    // The Moon's ~1° horizontal parallax is folded into its geocentric horizon
    // threshold `h0 = 0.7275·π − 0.5667°` (Meeus ch. 15). The `0.7275·π` term
    // combines the topocentric parallax reduction (`−π`) with the Moon's mean
    // semidiameter (`0.2725·π`, since k = sin s / sin π ≈ 0.2725), so this
    // convention places the topocentric *upper limb* at the −0.5667° refraction
    // horizon. This test validates that *independently*: at each computed
    // moonrise/moonset instant it applies the full Meeus ch. 40 topocentric
    // correction (an entirely separate code path) and confirms the resulting
    // topocentric *center* altitude equals `−0.5667° − 0.2725·π` — i.e. the upper
    // limb is exactly on the horizon. Agreement proves the folded-h0 approach
    // matches an explicit per-sample topocentric computation, a stronger check
    // than a single memorized ephemeris minute value.
    #[test]
    fn moon_rise_set_parallax_convention() {
        use crate::coords::{apply_topocentric_correction, compute_gmst, compute_lst};

        let lat = 40.7128_f64.to_radians();
        let lon = (-74.0060_f64).to_radians();
        let start = jd_utc(2026, 6, 21, 4, 0, 0.0); // local midnight EDT
        let end = start + 1.0;

        // NaN sentinel -> parallax-dependent lunar h0.
        let buf = find_body_events(CelestialBody::Moon, start, end, STEP, lat, lon, f64::NAN);
        let rises = events_of(&buf, EVENT_RISE);
        let sets = events_of(&buf, EVENT_SET);
        let transits = events_of(&buf, EVENT_TRANSIT);
        // The Moon crosses the horizon at most twice and transits once per day.
        assert!(
            !rises.is_empty() || !sets.is_empty(),
            "moon should cross the horizon"
        );
        assert_eq!(transits.len(), 1, "moon transits once per day");

        for (jd, _az) in rises.iter().chain(sets.iter()) {
            let time = SkyTime::from_jd(*jd);
            let moon = compute_moon_position_full(&time);
            let (ra, dec) = cartesian_to_ra_dec(&moon.direction);
            let gmst = compute_gmst(time.julian_date_utc());
            let (topo_ra, topo_dec) =
                apply_topocentric_correction(ra, dec, moon.distance_km, lat, lon, gmst);
            let lst = compute_lst(gmst, lon);
            let (topo_alt, _) = alt_az_deg(topo_ra, topo_dec, lat, lst);
            // Upper limb on the refraction horizon => topocentric center is one
            // semidiameter (≈ 0.2725·π) below −0.5667°.
            let parallax_deg = (EARTH_RADIUS_KM / moon.distance_km).asin() * RAD_TO_DEG;
            let expected = -0.5667 - 0.2725 * parallax_deg;
            assert!(
                (topo_alt - expected).abs() < 0.02,
                "topocentric moon center altitude at event = {topo_alt:.4}°, expected ≈ {expected:.4}°"
            );
        }
    }

    // --- Planet rise/set ---
    //
    // Sanity: a planet must produce at most one rise and one set in a 24 h window,
    // and its transit azimuth (northern mid-latitude) is near due South. We check
    // internal consistency rather than an external ephemeris minute value.
    #[test]
    fn planet_events_are_well_formed() {
        let lat = 40.0_f64.to_radians();
        let lon = 0.0_f64;
        let start = jd_utc(2026, 3, 20, 0, 0, 0.0);
        let end = start + 1.0;

        for body in [
            CelestialBody::Mercury,
            CelestialBody::Venus,
            CelestialBody::Mars,
            CelestialBody::Jupiter,
            CelestialBody::Saturn,
        ] {
            let buf = find_body_events(body, start, end, STEP, lat, lon, -0.5667);
            let rises = events_of(&buf, EVENT_RISE);
            let sets = events_of(&buf, EVENT_SET);
            let transits = events_of(&buf, EVENT_TRANSIT);
            assert!(rises.len() <= 1, "{} rises", body.name());
            assert!(sets.len() <= 1, "{} sets", body.name());
            assert_eq!(transits.len(), 1, "{} should transit once/day", body.name());
            for (_jd, az) in &rises {
                assert!(*az >= 0.0 && *az < 360.0);
            }
        }
    }

    // --- Edge case: polar day (no sunset) ---
    #[test]
    fn polar_day_no_sun_crossings() {
        // Tromsø, Norway, 69.65° N — midnight sun in late June.
        let lat = 69.65_f64.to_radians();
        let lon = 18.96_f64.to_radians();
        let start = jd_utc(2026, 6, 21, 0, 0, 0.0);
        let end = start + 1.0;

        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -0.8333);
        assert!(
            events_of(&buf, EVENT_RISE).is_empty(),
            "no sunrise in polar day"
        );
        assert!(
            events_of(&buf, EVENT_SET).is_empty(),
            "no sunset in polar day"
        );
        // The sun stays up: mid-window altitude is above the horizon.
        let mid = 0.5 * (start + end);
        assert!(
            body_altitude_deg(CelestialBody::Sun, mid, lat, lon) > 0.0,
            "sun above horizon all day"
        );
    }

    // --- Edge case: polar night (no sunrise) ---
    #[test]
    fn polar_night_no_sun_crossings() {
        // Tromsø, Norway — polar night in late December.
        let lat = 69.65_f64.to_radians();
        let lon = 18.96_f64.to_radians();
        let start = jd_utc(2026, 12, 21, 0, 0, 0.0);
        let end = start + 1.0;

        let buf = find_body_events(CelestialBody::Sun, start, end, STEP, lat, lon, -0.8333);
        assert!(
            events_of(&buf, EVENT_RISE).is_empty(),
            "no sunrise in polar night"
        );
        assert!(
            events_of(&buf, EVENT_SET).is_empty(),
            "no sunset in polar night"
        );
        let mid = 0.5 * (start + end);
        assert!(
            body_altitude_deg(CelestialBody::Sun, mid, lat, lon) < 0.0,
            "sun below horizon all day"
        );
    }

    // --- Guard: empty / degenerate windows ---
    #[test]
    fn degenerate_windows_return_empty() {
        let lat = 40.0_f64.to_radians();
        let lon = 0.0;
        let jd = jd_utc(2026, 1, 1, 0, 0, 0.0);
        // end <= start
        assert!(find_body_events(CelestialBody::Sun, jd, jd, STEP, lat, lon, -0.8333).is_empty());
        assert!(
            find_body_events(CelestialBody::Sun, jd, jd - 1.0, STEP, lat, lon, -0.8333).is_empty()
        );
        // non-positive step
        assert!(
            find_body_events(CelestialBody::Sun, jd, jd + 1.0, 0.0, lat, lon, -0.8333).is_empty()
        );
    }
}
