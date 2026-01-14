use crate::coords::CartesianCoord;
use std::collections::HashSet;

/// A star from the catalog with position and photometric data.
#[derive(Debug, Clone, Copy)]
pub struct Star {
    /// Right Ascension in radians (J2000)
    pub ra: f64,
    /// Declination in radians (J2000)
    pub dec: f64,
    /// Visual magnitude
    pub vmag: f32,
    /// B-V color index
    pub bv_color: f32,
    /// Catalog ID (e.g., HR number for BSC)
    pub id: u32,
}

impl Star {
    /// Get the direction to this star as a unit vector.
    pub fn direction(&self) -> CartesianCoord {
        CartesianCoord::from_ra_dec_rad(self.ra, self.dec)
    }
}

/// Star catalog holding all loaded stars.
pub struct StarCatalog {
    stars: Vec<Star>,
}

impl StarCatalog {
    /// Create an empty catalog.
    pub fn new() -> Self {
        Self { stars: Vec::new() }
    }

    /// Load catalog from binary format.
    ///
    /// Binary format:
    /// - Header: u32 star_count (little-endian)
    /// - Per star (20 bytes):
    ///   - f32 ra_rad
    ///   - f32 dec_rad
    ///   - f32 vmag
    ///   - f32 bv_color
    ///   - u32 id
    pub fn from_binary(data: &[u8]) -> Result<Self, &'static str> {
        if data.len() < 4 {
            return Err("Data too short for header");
        }

        let star_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let expected_len = 4 + star_count * 20;

        if data.len() < expected_len {
            return Err("Data too short for star count");
        }

        let mut stars = Vec::with_capacity(star_count);
        let mut offset = 4;

        for _ in 0..star_count {
            let ra = f32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as f64;
            let dec = f32::from_le_bytes([
                data[offset + 4],
                data[offset + 5],
                data[offset + 6],
                data[offset + 7],
            ]) as f64;
            let vmag = f32::from_le_bytes([
                data[offset + 8],
                data[offset + 9],
                data[offset + 10],
                data[offset + 11],
            ]);
            let bv_color = f32::from_le_bytes([
                data[offset + 12],
                data[offset + 13],
                data[offset + 14],
                data[offset + 15],
            ]);
            let id = u32::from_le_bytes([
                data[offset + 16],
                data[offset + 17],
                data[offset + 18],
                data[offset + 19],
            ]);

            stars.push(Star {
                ra,
                dec,
                vmag,
                bv_color,
                id,
            });

            offset += 20;
        }

        Ok(Self { stars })
    }

    /// Create a catalog with embedded bright stars for testing.
    /// These are the 50 brightest stars visible from Earth.
    pub fn with_bright_stars() -> Self {
        // Format: (name, RA hours, Dec degrees, Vmag, B-V, HR number)
        #[rustfmt::skip]
        let bright_stars: &[(&str, f64, f64, f32, f32, u32)] = &[
            ("Sirius",      6.752,  -16.716, -1.46, 0.00, 2491),
            ("Canopus",     6.399,  -52.696, -0.72, 0.15, 2326),
            ("Arcturus",   14.261,   19.182, -0.05, 1.23, 5340),
            ("Vega",       18.616,   38.784,  0.03, 0.00, 7001),
            ("Capella",     5.278,   45.998,  0.08, 0.80, 1708),
            ("Rigel",       5.242,   -8.202,  0.13, -0.03, 1713),
            ("Procyon",     7.655,    5.225,  0.34, 0.42, 2943),
            ("Betelgeuse",  5.919,    7.407,  0.42, 1.85, 2061),
            ("Achernar",    1.629,  -57.237,  0.46, -0.16, 472),
            ("Hadar",      14.064,  -60.373,  0.61, -0.23, 5267),
            ("Altair",     19.846,    8.868,  0.77, 0.22, 7557),
            ("Acrux",      12.443,  -63.099,  0.77, -0.24, 4730),
            ("Aldebaran",   4.599,   16.509,  0.85, 1.54, 1457),
            ("Antares",    16.490,  -26.432,  0.96, 1.83, 6134),
            ("Spica",      13.420,  -11.161,  0.97, -0.23, 5056),
            ("Pollux",      7.755,   28.026,  1.14, 1.00, 2990),
            ("Fomalhaut",  22.961,  -29.622,  1.16, 0.09, 8728),
            ("Deneb",      20.690,   45.280,  1.25, 0.09, 7924),
            ("Mimosa",     12.795,  -59.689,  1.25, -0.23, 4853),
            ("Regulus",    10.140,   11.967,  1.35, -0.11, 3982),
            ("Adhara",      6.977,  -28.972,  1.50, -0.21, 2618),
            ("Castor",      7.577,   31.888,  1.58, 0.03, 2891),
            ("Gacrux",     12.519,  -57.113,  1.63, 1.59, 4763),
            ("Shaula",     17.560,  -37.104,  1.62, -0.22, 6527),
            ("Bellatrix",   5.419,    6.350,  1.64, -0.22, 1790),
            ("Elnath",      5.438,   28.608,  1.65, -0.13, 1791),
            ("Miaplacidus", 9.220,  -69.717,  1.68, 0.00, 3685),
            ("Alnilam",     5.603,   -1.202,  1.69, -0.18, 1903),
            ("Alnair",     22.137,  -46.961,  1.74, -0.13, 8425),
            ("Alnitak",     5.679,   -1.943,  1.77, -0.21, 1948),
            ("Alioth",     12.900,   55.960,  1.77, -0.02, 4905),
            ("Dubhe",      11.062,   61.751,  1.79, 1.07, 4301),
            ("Mirfak",      3.405,   49.861,  1.80, 0.48, 1017),
            ("Wezen",       7.140,  -26.393,  1.84, 0.67, 2693),
            ("Sargas",     17.622,  -42.998,  1.87, 0.40, 6553),
            ("Kaus Australis", 18.403, -34.385, 1.85, -0.03, 6879),
            ("Avior",       8.375,  -59.510,  1.86, 1.28, 3307),
            ("Alkaid",     13.792,   49.313,  1.86, -0.10, 5191),
            ("Menkalinan",  5.992,   44.948,  1.90, 0.08, 2088),
            ("Atria",      16.811,  -69.028,  1.92, 1.44, 6217),
            ("Alhena",      6.629,   16.399,  1.93, 0.00, 2421),
            ("Peacock",    20.427,  -56.735,  1.94, -0.20, 7790),
            ("Alsephina",   8.745,  -54.709,  1.96, -0.11, 3485),
            ("Mirzam",      6.378,  -17.956,  1.98, -0.24, 2294),
            ("Polaris",     2.530,   89.264,  2.02, 0.60, 424),
            ("Alphard",     9.460,   -8.659,  2.00, 1.44, 3748),
            ("Hamal",       2.120,   23.463,  2.00, 1.15, 617),
            ("Diphda",      0.727,  -17.987,  2.02, 1.02, 188),
            ("Nunki",      18.921,  -26.297,  2.02, -0.13, 7121),
            ("Menkent",    14.111,  -36.370,  2.06, 1.01, 5288),
        ];

        let stars = bright_stars
            .iter()
            .map(|(_, ra_h, dec_deg, vmag, bv, id)| {
                let ra = ra_h * std::f64::consts::PI / 12.0;
                let dec = dec_deg * std::f64::consts::PI / 180.0;
                Star {
                    ra,
                    dec,
                    vmag: *vmag,
                    bv_color: *bv,
                    id: *id,
                }
            })
            .collect();

        Self { stars }
    }

    /// Get all stars.
    pub fn stars(&self) -> &[Star] {
        &self.stars
    }

    /// Get stars filtered by magnitude limit.
    pub fn stars_brighter_than(&self, mag_limit: f32) -> impl Iterator<Item = &Star> {
        self.stars.iter().filter(move |s| s.vmag <= mag_limit)
    }

    /// Get star count.
    pub fn len(&self) -> usize {
        self.stars.len()
    }

    /// Check if catalog is empty.
    pub fn is_empty(&self) -> bool {
        self.stars.is_empty()
    }

    /// Extend catalog with additional stars from binary data.
    /// Skips stars that already exist (by ID) to avoid duplicates.
    /// Returns the number of new stars added.
    pub fn extend(&mut self, data: &[u8]) -> Result<usize, &'static str> {
        let additional = Self::from_binary(data)?;

        // Build set of existing IDs for deduplication
        let existing_ids: HashSet<u32> = self.stars.iter().map(|s| s.id).collect();

        let mut added = 0;
        for star in additional.stars {
            if !existing_ids.contains(&star.id) {
                self.stars.push(star);
                added += 1;
            }
        }

        Ok(added)
    }
}

impl Default for StarCatalog {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bright_stars() {
        let catalog = StarCatalog::with_bright_stars();
        assert_eq!(catalog.len(), 50);

        // Sirius should be the first and brightest
        let sirius = &catalog.stars()[0];
        assert!(sirius.vmag < -1.0);
        assert_eq!(sirius.id, 2491);
    }

    #[test]
    fn test_magnitude_filter() {
        let catalog = StarCatalog::with_bright_stars();
        let bright: Vec<_> = catalog.stars_brighter_than(1.0).collect();
        // Should have fewer stars than total
        assert!(bright.len() < catalog.len());
        // All should be brighter than 1.0
        assert!(bright.iter().all(|s| s.vmag <= 1.0));
    }

    #[test]
    fn test_binary_roundtrip() {
        let catalog = StarCatalog::with_bright_stars();

        // Serialize to binary
        let mut data = Vec::new();
        data.extend_from_slice(&(catalog.len() as u32).to_le_bytes());
        for star in catalog.stars() {
            data.extend_from_slice(&(star.ra as f32).to_le_bytes());
            data.extend_from_slice(&(star.dec as f32).to_le_bytes());
            data.extend_from_slice(&star.vmag.to_le_bytes());
            data.extend_from_slice(&star.bv_color.to_le_bytes());
            data.extend_from_slice(&star.id.to_le_bytes());
        }

        // Deserialize
        let loaded = StarCatalog::from_binary(&data).unwrap();
        assert_eq!(loaded.len(), catalog.len());
    }
}
