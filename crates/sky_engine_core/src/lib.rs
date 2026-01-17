pub mod catalog;
pub mod comets;
pub mod coords;
pub mod minor_bodies;
pub mod planetary_moons;
pub mod planets;
pub mod satellites;
pub mod time;

// Legacy module alias for backwards compatibility
pub mod iss {
    //! Legacy ISS module - re-exports from satellites for backwards compatibility.
    pub use crate::satellites::{
        compute_iss_position, IssEphemeris, IssEphemerisPoint, IssPosition,
    };
}

pub use catalog::{Star, StarCatalog};
pub use comets::{
    compute_all_comet_positions, compute_comet_position,
    Comet, CometElements, CometPosition,
};
pub use coords::{ra_dec_to_cartesian, CartesianCoord};
pub use minor_bodies::{
    compute_all_minor_body_positions, compute_minor_body_position,
    MinorBody, MinorBodyPosition,
};
pub use planetary_moons::{
    compute_all_planetary_moon_positions, compute_planetary_moon_position,
    PlanetaryMoon, PlanetaryMoonPosition,
};
pub use planets::{
    compute_all_body_positions, compute_moon_position_full, compute_planet_position,
    CelestialBody, MoonPosition, Planet,
};
pub use time::SkyTime;

// Legacy ISS exports for backwards compatibility
pub use iss::{compute_iss_position, IssEphemeris, IssEphemerisPoint, IssPosition};

// New satellite exports
pub use satellites::{
    compute_satellite_position, SatelliteEphemeris, SatelliteEphemerisPoint,
    SatelliteId, SatellitePosition,
};
