use hifitime::{Epoch, TimeScale};

/// Wrapper around hifitime::Epoch for sky engine time handling.
/// Provides conversions between UTC and the time scales needed for ephemeris calculations.
#[derive(Debug, Clone, Copy)]
pub struct SkyTime {
    epoch: Epoch,
}

impl SkyTime {
    /// Create a new SkyTime from UTC components.
    pub fn from_utc(year: i32, month: u8, day: u8, hour: u8, minute: u8, second: f64) -> Self {
        let secs = second.floor() as u8;
        let nanos = ((second - second.floor()) * 1_000_000_000.0) as u32;
        let epoch = Epoch::from_gregorian_utc(year, month, day, hour, minute, secs, nanos);
        Self { epoch }
    }

    /// Create a SkyTime for the current moment.
    pub fn now() -> Self {
        Self {
            epoch: Epoch::now().unwrap(),
        }
    }

    /// Create a SkyTime from a Julian Date (UTC).
    pub fn from_jd(jd: f64) -> Self {
        let epoch = Epoch::from_jde_utc(jd);
        Self { epoch }
    }

    /// Get the underlying hifitime Epoch.
    pub fn epoch(&self) -> Epoch {
        self.epoch
    }

    /// Get Julian Date in UTC scale.
    pub fn julian_date_utc(&self) -> f64 {
        self.epoch.to_jde_utc_days()
    }

    /// Get Julian Date in TDB (Barycentric Dynamical Time) scale.
    /// This is the time scale used by VSOP87 for planetary positions.
    pub fn julian_date_tdb(&self) -> f64 {
        self.epoch.to_jde_tdb_days()
    }

    /// Get Julian Date in TT (Terrestrial Time) scale.
    pub fn julian_date_tt(&self) -> f64 {
        self.epoch.to_jde_tt_days()
    }

    /// Convert to TDB epoch (for VSOP87).
    pub fn to_tdb(&self) -> Epoch {
        self.epoch.to_time_scale(TimeScale::TDB)
    }

    /// Get Julian centuries from J2000.0 in TDB.
    /// This is the parameter T used in VSOP87.
    pub fn julian_centuries_tdb(&self) -> f64 {
        // J2000.0 = JD 2451545.0
        (self.julian_date_tdb() - 2451545.0) / 36525.0
    }
}

impl Default for SkyTime {
    fn default() -> Self {
        Self::now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_j2000_epoch() {
        // J2000.0 is January 1, 2000, 12:00 TT
        // In UTC this is approximately 11:58:55.816
        let time = SkyTime::from_utc(2000, 1, 1, 12, 0, 0.0);
        let jd = time.julian_date_utc();
        // Should be very close to 2451545.0
        assert!((jd - 2451545.0).abs() < 0.01);
    }

    #[test]
    fn test_julian_centuries() {
        // At J2000.0, T should be 0
        let j2000 = SkyTime::from_utc(2000, 1, 1, 12, 0, 0.0);
        let t = j2000.julian_centuries_tdb();
        assert!(t.abs() < 0.001);

        // 100 years later, T should be ~1
        let j2100 = SkyTime::from_utc(2100, 1, 1, 12, 0, 0.0);
        let t = j2100.julian_centuries_tdb();
        assert!((t - 1.0).abs() < 0.01);
    }
}
