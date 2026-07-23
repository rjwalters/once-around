pub mod catalog;
pub mod comets;
pub mod coords;
pub mod events;
pub mod minor_bodies;
pub mod planetary_moons;
pub mod planets;
pub mod satellites;
pub mod time;
pub mod time_context;

// Legacy module alias for backwards compatibility
pub mod iss {
    //! Legacy ISS module - re-exports from satellites for backwards compatibility.
    pub use crate::satellites::{
        compute_iss_position, IssEphemeris, IssEphemerisPoint, IssPosition,
    };
}

pub use catalog::{Star, StarCatalog};
pub use comets::{
    compute_all_comet_positions, compute_all_comet_positions_with_ctx, compute_comet_position,
    compute_comet_position_with_ctx, Comet, CometElements, CometPosition,
};
pub use coords::{ra_dec_to_cartesian, CartesianCoord};
pub use minor_bodies::{
    compute_all_minor_body_positions, compute_all_minor_body_positions_with_ctx,
    compute_minor_body_position, compute_minor_body_position_with_ctx, MinorBody,
    MinorBodyPosition,
};
pub use planetary_moons::{
    compute_all_planetary_moon_positions, compute_all_planetary_moon_positions_with_ctx,
    compute_planetary_moon_position, PlanetaryMoon, PlanetaryMoonPosition,
};
pub use planets::{
    compute_all_body_positions, compute_all_body_positions_with_ctx, compute_moon_position_full,
    compute_planet_position, compute_planet_position_with_ctx, CelestialBody, MoonPosition, Planet,
};
pub use time::SkyTime;
pub use time_context::TimeContext;

// Legacy ISS exports for backwards compatibility
pub use iss::{compute_iss_position, IssEphemeris, IssEphemerisPoint, IssPosition};

// New satellite exports
pub use satellites::{
    compute_satellite_position, SatelliteEphemeris, SatelliteEphemerisPoint,
    SatelliteId, SatellitePosition,
};
