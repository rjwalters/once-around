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
        IssEphemeris, IssEphemerisPoint, IssPosition, compute_iss_position,
    };
}

pub use catalog::{Star, StarCatalog};
pub use comets::{
    Comet, CometElements, CometPosition, compute_all_comet_positions,
    compute_all_comet_positions_with_ctx, compute_comet_position, compute_comet_position_with_ctx,
};
pub use coords::{CartesianCoord, ra_dec_to_cartesian};
pub use minor_bodies::{
    MinorBody, MinorBodyPosition, compute_all_minor_body_positions,
    compute_all_minor_body_positions_with_ctx, compute_minor_body_position,
    compute_minor_body_position_with_ctx,
};
pub use planetary_moons::{
    PlanetaryMoon, PlanetaryMoonPosition, compute_all_planetary_moon_positions,
    compute_all_planetary_moon_positions_with_ctx, compute_planetary_moon_position,
};
pub use planets::{
    CelestialBody, MoonPosition, Planet, compute_all_body_positions,
    compute_all_body_positions_with_ctx, compute_moon_position_full, compute_planet_position,
    compute_planet_position_with_ctx,
};
pub use time::SkyTime;
pub use time_context::TimeContext;

// Legacy ISS exports for backwards compatibility
pub use iss::{IssEphemeris, IssEphemerisPoint, IssPosition, compute_iss_position};

// New satellite exports
pub use satellites::{
    SUNLIT_SIDE_UMBRA_DISTANCE_KM, SatelliteEphemeris, SatelliteEphemerisPoint, SatelliteId,
    SatellitePosition, compute_satellite_position, umbra_signed_distance_km,
};
