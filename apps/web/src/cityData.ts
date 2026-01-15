/**
 * City database for observer location selection.
 * Includes major cities, observatories, and eclipse path locations.
 */

export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
}

// Default location: San Francisco
export const DEFAULT_LOCATION: City = {
  name: "San Francisco",
  country: "USA",
  lat: 37.7749,
  lon: -122.4194,
  timezone: "America/Los_Angeles",
};

export const CITIES: City[] = [
  // North America
  { name: "San Francisco", country: "USA", lat: 37.7749, lon: -122.4194, timezone: "America/Los_Angeles" },
  { name: "Los Angeles", country: "USA", lat: 34.0522, lon: -118.2437, timezone: "America/Los_Angeles" },
  { name: "Seattle", country: "USA", lat: 47.6062, lon: -122.3321, timezone: "America/Los_Angeles" },
  { name: "Denver", country: "USA", lat: 39.7392, lon: -104.9903, timezone: "America/Denver" },
  { name: "Chicago", country: "USA", lat: 41.8781, lon: -87.6298, timezone: "America/Chicago" },
  { name: "New York", country: "USA", lat: 40.7128, lon: -74.0060, timezone: "America/New_York" },
  { name: "Boston", country: "USA", lat: 42.3601, lon: -71.0589, timezone: "America/New_York" },
  { name: "Miami", country: "USA", lat: 25.7617, lon: -80.1918, timezone: "America/New_York" },
  { name: "Houston", country: "USA", lat: 29.7604, lon: -95.3698, timezone: "America/Chicago" },
  { name: "Phoenix", country: "USA", lat: 33.4484, lon: -112.0740, timezone: "America/Phoenix" },
  { name: "Austin", country: "USA", lat: 30.2672, lon: -97.7431, timezone: "America/Chicago" },
  { name: "Dallas", country: "USA", lat: 32.7767, lon: -96.7970, timezone: "America/Chicago" },
  { name: "Toronto", country: "Canada", lat: 43.6532, lon: -79.3832, timezone: "America/Toronto" },
  { name: "Vancouver", country: "Canada", lat: 49.2827, lon: -123.1207, timezone: "America/Vancouver" },
  { name: "Montreal", country: "Canada", lat: 45.5017, lon: -73.5673, timezone: "America/Montreal" },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lon: -99.1332, timezone: "America/Mexico_City" },

  // Europe
  { name: "London", country: "UK", lat: 51.5074, lon: -0.1278, timezone: "Europe/London" },
  { name: "Paris", country: "France", lat: 48.8566, lon: 2.3522, timezone: "Europe/Paris" },
  { name: "Berlin", country: "Germany", lat: 52.5200, lon: 13.4050, timezone: "Europe/Berlin" },
  { name: "Munich", country: "Germany", lat: 48.1351, lon: 11.5820, timezone: "Europe/Berlin" },
  { name: "Rome", country: "Italy", lat: 41.9028, lon: 12.4964, timezone: "Europe/Rome" },
  { name: "Madrid", country: "Spain", lat: 40.4168, lon: -3.7038, timezone: "Europe/Madrid" },
  { name: "Barcelona", country: "Spain", lat: 41.3851, lon: 2.1734, timezone: "Europe/Madrid" },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lon: 4.9041, timezone: "Europe/Amsterdam" },
  { name: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738, timezone: "Europe/Vienna" },
  { name: "Prague", country: "Czech Republic", lat: 50.0755, lon: 14.4378, timezone: "Europe/Prague" },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lon: 18.0686, timezone: "Europe/Stockholm" },
  { name: "Copenhagen", country: "Denmark", lat: 55.6761, lon: 12.5683, timezone: "Europe/Copenhagen" },
  { name: "Oslo", country: "Norway", lat: 59.9139, lon: 10.7522, timezone: "Europe/Oslo" },
  { name: "Helsinki", country: "Finland", lat: 60.1699, lon: 24.9384, timezone: "Europe/Helsinki" },
  { name: "Dublin", country: "Ireland", lat: 53.3498, lon: -6.2603, timezone: "Europe/Dublin" },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393, timezone: "Europe/Lisbon" },
  { name: "Athens", country: "Greece", lat: 37.9838, lon: 23.7275, timezone: "Europe/Athens" },
  { name: "Moscow", country: "Russia", lat: 55.7558, lon: 37.6173, timezone: "Europe/Moscow" },

  // Asia
  { name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503, timezone: "Asia/Tokyo" },
  { name: "Osaka", country: "Japan", lat: 34.6937, lon: 135.5023, timezone: "Asia/Tokyo" },
  { name: "Beijing", country: "China", lat: 39.9042, lon: 116.4074, timezone: "Asia/Shanghai" },
  { name: "Shanghai", country: "China", lat: 31.2304, lon: 121.4737, timezone: "Asia/Shanghai" },
  { name: "Hong Kong", country: "China", lat: 22.3193, lon: 114.1694, timezone: "Asia/Hong_Kong" },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lon: 126.9780, timezone: "Asia/Seoul" },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198, timezone: "Asia/Singapore" },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lon: 100.5018, timezone: "Asia/Bangkok" },
  { name: "Mumbai", country: "India", lat: 19.0760, lon: 72.8777, timezone: "Asia/Kolkata" },
  { name: "New Delhi", country: "India", lat: 28.6139, lon: 77.2090, timezone: "Asia/Kolkata" },
  { name: "Bangalore", country: "India", lat: 12.9716, lon: 77.5946, timezone: "Asia/Kolkata" },
  { name: "Dubai", country: "UAE", lat: 25.2048, lon: 55.2708, timezone: "Asia/Dubai" },
  { name: "Tel Aviv", country: "Israel", lat: 32.0853, lon: 34.7818, timezone: "Asia/Jerusalem" },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lon: 28.9784, timezone: "Europe/Istanbul" },

  // Oceania
  { name: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093, timezone: "Australia/Sydney" },
  { name: "Melbourne", country: "Australia", lat: -37.8136, lon: 144.9631, timezone: "Australia/Melbourne" },
  { name: "Brisbane", country: "Australia", lat: -27.4698, lon: 153.0251, timezone: "Australia/Brisbane" },
  { name: "Perth", country: "Australia", lat: -31.9505, lon: 115.8605, timezone: "Australia/Perth" },
  { name: "Auckland", country: "New Zealand", lat: -36.8509, lon: 174.7645, timezone: "Pacific/Auckland" },
  { name: "Wellington", country: "New Zealand", lat: -41.2866, lon: 174.7756, timezone: "Pacific/Auckland" },

  // South America
  { name: "Sao Paulo", country: "Brazil", lat: -23.5505, lon: -46.6333, timezone: "America/Sao_Paulo" },
  { name: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lon: -43.1729, timezone: "America/Sao_Paulo" },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lon: -58.3816, timezone: "America/Argentina/Buenos_Aires" },
  { name: "Santiago", country: "Chile", lat: -33.4489, lon: -70.6693, timezone: "America/Santiago" },
  { name: "Lima", country: "Peru", lat: -12.0464, lon: -77.0428, timezone: "America/Lima" },
  { name: "Bogota", country: "Colombia", lat: 4.7110, lon: -74.0721, timezone: "America/Bogota" },

  // Africa
  { name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357, timezone: "Africa/Cairo" },
  { name: "Cape Town", country: "South Africa", lat: -33.9249, lon: 18.4241, timezone: "Africa/Johannesburg" },
  { name: "Johannesburg", country: "South Africa", lat: -26.2041, lon: 28.0473, timezone: "Africa/Johannesburg" },
  { name: "Nairobi", country: "Kenya", lat: -1.2921, lon: 36.8219, timezone: "Africa/Nairobi" },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lon: 3.3792, timezone: "Africa/Lagos" },
  { name: "Casablanca", country: "Morocco", lat: 33.5731, lon: -7.5898, timezone: "Africa/Casablanca" },

  // Major Observatories
  { name: "Mauna Kea Observatory", country: "USA", lat: 19.8207, lon: -155.4680, timezone: "Pacific/Honolulu" },
  { name: "Paranal Observatory", country: "Chile", lat: -24.6275, lon: -70.4044, timezone: "America/Santiago" },
  { name: "La Silla Observatory", country: "Chile", lat: -29.2563, lon: -70.7300, timezone: "America/Santiago" },
  { name: "Kitt Peak Observatory", country: "USA", lat: 31.9583, lon: -111.5967, timezone: "America/Phoenix" },
  { name: "Palomar Observatory", country: "USA", lat: 33.3564, lon: -116.8650, timezone: "America/Los_Angeles" },
  { name: "McDonald Observatory", country: "USA", lat: 30.6717, lon: -104.0217, timezone: "America/Chicago" },
  { name: "Lowell Observatory", country: "USA", lat: 35.2028, lon: -111.6647, timezone: "America/Phoenix" },
  { name: "Arecibo Observatory", country: "Puerto Rico", lat: 18.3464, lon: -66.7528, timezone: "America/Puerto_Rico" },
  { name: "Greenwich Observatory", country: "UK", lat: 51.4769, lon: -0.0005, timezone: "Europe/London" },
  { name: "European Southern Observatory HQ", country: "Germany", lat: 48.2600, lon: 11.6711, timezone: "Europe/Berlin" },
  { name: "Siding Spring Observatory", country: "Australia", lat: -31.2733, lon: 149.0617, timezone: "Australia/Sydney" },

  // 2024 Eclipse Path Cities (Texas to Maine)
  { name: "Mazatlan", country: "Mexico", lat: 23.2494, lon: -106.4111, timezone: "America/Mazatlan" },
  { name: "Durango", country: "Mexico", lat: 24.0277, lon: -104.6532, timezone: "America/Monterrey" },
  { name: "Eagle Pass", country: "USA", lat: 28.7091, lon: -100.4995, timezone: "America/Chicago" },
  { name: "San Antonio", country: "USA", lat: 29.4241, lon: -98.4936, timezone: "America/Chicago" },
  { name: "Waco", country: "USA", lat: 31.5493, lon: -97.1467, timezone: "America/Chicago" },
  { name: "Little Rock", country: "USA", lat: 34.7465, lon: -92.2896, timezone: "America/Chicago" },
  { name: "Carbondale", country: "USA", lat: 37.7273, lon: -89.2168, timezone: "America/Chicago" },
  { name: "Indianapolis", country: "USA", lat: 39.7684, lon: -86.1581, timezone: "America/Indiana/Indianapolis" },
  { name: "Cleveland", country: "USA", lat: 41.4993, lon: -81.6944, timezone: "America/New_York" },
  { name: "Buffalo", country: "USA", lat: 42.8864, lon: -78.8784, timezone: "America/New_York" },
  { name: "Burlington", country: "USA", lat: 44.4759, lon: -73.2121, timezone: "America/New_York" },

  // 2026 Eclipse Path (Spain, Iceland, Greenland)
  { name: "Reykjavik", country: "Iceland", lat: 64.1466, lon: -21.9426, timezone: "Atlantic/Reykjavik" },
  { name: "A Coruna", country: "Spain", lat: 43.3623, lon: -8.4115, timezone: "Europe/Madrid" },
  { name: "Oviedo", country: "Spain", lat: 43.3619, lon: -5.8494, timezone: "Europe/Madrid" },
  { name: "Bilbao", country: "Spain", lat: 43.2630, lon: -2.9350, timezone: "Europe/Madrid" },
  { name: "Nuuk", country: "Greenland", lat: 64.1814, lon: -51.6941, timezone: "America/Nuuk" },

  // Polar regions (interesting for aurora, midnight sun)
  { name: "Tromso", country: "Norway", lat: 69.6492, lon: 18.9553, timezone: "Europe/Oslo" },
  { name: "Fairbanks", country: "USA", lat: 64.8378, lon: -147.7164, timezone: "America/Anchorage" },
  { name: "Yellowknife", country: "Canada", lat: 62.4540, lon: -114.3718, timezone: "America/Yellowknife" },
  { name: "Ushuaia", country: "Argentina", lat: -54.8019, lon: -68.3030, timezone: "America/Argentina/Ushuaia" },
];

/**
 * Search cities by name with fuzzy matching.
 */
export function searchCities(query: string, limit: number = 10): City[] {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase().trim();

  // Score each city based on match quality
  const scored = CITIES.map((city) => {
    const name = city.name.toLowerCase();
    const country = city.country.toLowerCase();
    const fullName = `${name}, ${country}`;

    let score = 0;

    // Exact match gets highest score
    if (name === normalizedQuery) {
      score = 1000;
    }
    // Starts with query
    else if (name.startsWith(normalizedQuery)) {
      score = 500 + (100 - name.length); // Shorter names rank higher
    }
    // Contains query
    else if (name.includes(normalizedQuery)) {
      score = 200;
    }
    // Country match
    else if (country.startsWith(normalizedQuery)) {
      score = 100;
    }
    // Full name contains
    else if (fullName.includes(normalizedQuery)) {
      score = 50;
    }

    return { city, score };
  });

  // Filter to matches and sort by score
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.city);
}
