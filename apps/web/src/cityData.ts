/**
 * Geocoding via Nominatim (OpenStreetMap) for observer location selection.
 * Free, no API key. Honors Nominatim usage policy through caller debouncing.
 */

export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const DEFAULT_LOCATION: City = {
  name: "San Francisco",
  country: "USA",
  lat: 37.7749,
  lon: -122.4194,
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  place_id?: number;
}

/**
 * Search for places worldwide via Nominatim. Matches city names in any language
 * (e.g. "Firenze" and "Florence" both resolve to the same place).
 */
export async function searchCities(
  query: string,
  limit: number = 8,
  signal?: AbortSignal
): Promise<City[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: "json",
    limit: String(limit),
    addressdetails: "1",
    "accept-language": navigator.language || "en",
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];
  return results.map(toCity);
}

function toCity(r: NominatimResult): City {
  const addr = r.address ?? {};
  const name =
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.hamlet ??
    r.name ??
    r.display_name.split(",")[0]?.trim() ??
    "Unknown";
  const country = addr.country ?? "";
  return {
    name,
    country,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  };
}
