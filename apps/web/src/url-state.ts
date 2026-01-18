/**
 * URL state management for shareable links.
 */

/**
 * URL parameter state for shareable links.
 */
export interface UrlState {
  ra?: number;
  dec?: number;
  fov?: number;
  t?: string; // ISO 8601 datetime
  mag?: number;
  lat?: number; // Observer latitude
  lon?: number; // Observer longitude
  object?: string; // Object name for deep linking (searches catalog)
  view?: 'geo' | 'topo' | 'hubble' | 'jwst'; // View mode
  tour?: string; // Tour ID to auto-start (e.g., 'sn-1054')
}

/**
 * Read state from URL parameters.
 */
export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const state: UrlState = {};

  const ra = params.get("ra");
  if (ra !== null) {
    const val = parseFloat(ra);
    if (!isNaN(val) && val >= 0 && val < 360) state.ra = val;
  }

  const dec = params.get("dec");
  if (dec !== null) {
    const val = parseFloat(dec);
    if (!isNaN(val) && val >= -90 && val <= 90) state.dec = val;
  }

  const fov = params.get("fov");
  if (fov !== null) {
    const val = parseFloat(fov);
    if (!isNaN(val) && val >= 0.5 && val <= 100) state.fov = val;
  }

  const t = params.get("t");
  if (t !== null) {
    const date = new Date(t);
    if (!isNaN(date.getTime())) state.t = t;
  }

  const mag = params.get("mag");
  if (mag !== null) {
    const val = parseFloat(mag);
    if (!isNaN(val) && val >= -1 && val <= 12) state.mag = val;
  }

  const lat = params.get("lat");
  if (lat !== null) {
    const val = parseFloat(lat);
    if (!isNaN(val) && val >= -90 && val <= 90) state.lat = val;
  }

  const lon = params.get("lon");
  if (lon !== null) {
    const val = parseFloat(lon);
    if (!isNaN(val) && val >= -180 && val <= 180) state.lon = val;
  }

  const object = params.get("object");
  if (object !== null && object.trim().length > 0) {
    state.object = object.trim();
  }

  const view = params.get("view");
  if (view === 'geo' || view === 'topo' || view === 'hubble' || view === 'jwst') {
    state.view = view;
  }

  const tour = params.get("tour");
  if (tour !== null && tour.trim().length > 0) {
    state.tour = tour.trim();
  }

  return state;
}

/**
 * Create a debounced URL state updater.
 * Updates URL parameters without creating history entries.
 */
export function createUrlStateUpdater(): (state: UrlState) => void {
  let urlUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingUrlState: UrlState | null = null;

  return function updateUrlState(state: UrlState): void {
    // Store the latest state
    pendingUrlState = { ...pendingUrlState, ...state };

    // Debounce: only update URL after 500ms of inactivity
    if (urlUpdateTimeout) {
      clearTimeout(urlUpdateTimeout);
    }

    urlUpdateTimeout = setTimeout(() => {
      if (!pendingUrlState) return;

      const params = new URLSearchParams(window.location.search);

      // Update or remove each parameter
      if (pendingUrlState.ra !== undefined) {
        params.set("ra", pendingUrlState.ra.toFixed(2));
      }
      if (pendingUrlState.dec !== undefined) {
        params.set("dec", pendingUrlState.dec.toFixed(2));
      }
      if (pendingUrlState.fov !== undefined) {
        params.set("fov", pendingUrlState.fov.toFixed(1));
      }
      if (pendingUrlState.t !== undefined) {
        params.set("t", pendingUrlState.t);
      }
      if (pendingUrlState.mag !== undefined) {
        params.set("mag", pendingUrlState.mag.toFixed(1));
      }
      if (pendingUrlState.lat !== undefined) {
        params.set("lat", pendingUrlState.lat.toFixed(4));
      }
      if (pendingUrlState.lon !== undefined) {
        params.set("lon", pendingUrlState.lon.toFixed(4));
      }
      if (pendingUrlState.object !== undefined) {
        if (pendingUrlState.object) {
          params.set("object", pendingUrlState.object);
        } else {
          params.delete("object");
        }
      }
      if (pendingUrlState.view !== undefined) {
        params.set("view", pendingUrlState.view);
      }

      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, "", newUrl);

      pendingUrlState = null;
    }, 500);
  };
}
