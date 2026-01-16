/**
 * Location UI management - search, keyboard navigation, geolocation button.
 */

import type { ObserverLocation } from "./location";

export interface City {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface LocationUIOptions {
  searchCities: (query: string) => City[];
  setLocationFromCity: (city: City) => void;
  setLocation: (location: { latitude: number; longitude: number; name: string }) => void;
  requestGeolocation: () => Promise<boolean>;
  getLocation: () => ObserverLocation;
}

export interface LocationUI {
  updateDisplay: (location: ObserverLocation) => void;
  setupEventListeners: () => void;
  checkUrlParams: () => void;
}

/**
 * Create location UI handlers for search, manual input, and geolocation.
 */
export function createLocationUI(options: LocationUIOptions): LocationUI {
  const { searchCities, setLocationFromCity, setLocation, requestGeolocation, getLocation } = options;

  // Get DOM elements
  const locationSearchInput = document.getElementById("location-search") as HTMLInputElement | null;
  const locationResults = document.getElementById("location-results");
  const locationLatInput = document.getElementById("location-lat") as HTMLInputElement | null;
  const locationLonInput = document.getElementById("location-lon") as HTMLInputElement | null;
  const locationGeolocateBtn = document.getElementById("location-geolocate");
  const locationNameEl = document.getElementById("location-name");

  // Search state
  let searchResultsList: City[] = [];
  let selectedIndex = -1;

  function updateDisplay(location: ObserverLocation): void {
    if (locationNameEl) {
      locationNameEl.textContent = location.name ?? "Custom Location";
    }
    if (locationLatInput) {
      locationLatInput.value = location.latitude.toFixed(4);
    }
    if (locationLonInput) {
      locationLonInput.value = location.longitude.toFixed(4);
    }
  }

  function renderResults(): void {
    if (!locationResults) return;

    if (searchResultsList.length === 0) {
      locationResults.classList.remove("visible");
      return;
    }

    locationResults.innerHTML = searchResultsList
      .map(
        (city, i) => `
      <div class="location-result${i === selectedIndex ? " selected" : ""}" data-index="${i}">
        <span class="location-result-name">${city.name}</span>
        <span class="location-result-country">${city.country}</span>
      </div>
    `
      )
      .join("");

    locationResults.classList.add("visible");
  }

  function hideResults(): void {
    if (locationResults) {
      locationResults.classList.remove("visible");
    }
    selectedIndex = -1;
  }

  function selectResult(index: number): void {
    if (index >= 0 && index < searchResultsList.length) {
      const city = searchResultsList[index];
      setLocationFromCity(city);
      hideResults();
      if (locationSearchInput) {
        locationSearchInput.value = "";
        locationSearchInput.blur();
      }
    }
  }

  function applyManualCoordinates(): void {
    const lat = parseFloat(locationLatInput?.value ?? "");
    const lon = parseFloat(locationLonInput?.value ?? "");
    if (!isNaN(lat) && !isNaN(lon)) {
      setLocation({
        latitude: lat,
        longitude: lon,
        name: "Custom",
      });
    }
  }

  function setupEventListeners(): void {
    // Search input handlers
    if (locationSearchInput) {
      locationSearchInput.addEventListener("input", () => {
        const query = locationSearchInput.value.trim();
        if (query.length === 0) {
          hideResults();
          searchResultsList = [];
          return;
        }

        searchResultsList = searchCities(query);
        selectedIndex = searchResultsList.length > 0 ? 0 : -1;
        renderResults();
      });

      locationSearchInput.addEventListener("keydown", (e) => {
        if (searchResultsList.length === 0) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, searchResultsList.length - 1);
            renderResults();
            break;
          case "ArrowUp":
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderResults();
            break;
          case "Enter":
            e.preventDefault();
            selectResult(selectedIndex);
            break;
          case "Escape":
            hideResults();
            locationSearchInput.blur();
            break;
        }
      });

      locationSearchInput.addEventListener("blur", () => {
        setTimeout(hideResults, 150);
      });
    }

    // Click on location result
    if (locationResults) {
      locationResults.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).closest(".location-result");
        if (target) {
          const index = parseInt(target.getAttribute("data-index") || "-1", 10);
          selectResult(index);
        }
      });
    }

    // Manual lat/lon input
    if (locationLatInput) {
      locationLatInput.addEventListener("change", applyManualCoordinates);
    }
    if (locationLonInput) {
      locationLonInput.addEventListener("change", applyManualCoordinates);
    }

    // Geolocation button
    if (locationGeolocateBtn) {
      locationGeolocateBtn.addEventListener("click", async () => {
        locationGeolocateBtn.setAttribute("disabled", "true");
        const originalText = locationGeolocateBtn.innerHTML;
        locationGeolocateBtn.innerHTML = "<span>⏳</span> Locating...";

        const result = await requestGeolocation();

        locationGeolocateBtn.removeAttribute("disabled");
        locationGeolocateBtn.innerHTML = originalText;

        if (!result) {
          locationGeolocateBtn.innerHTML = "<span>❌</span> Failed";
          setTimeout(() => {
            locationGeolocateBtn.innerHTML = originalText;
          }, 2000);
        }
      });
    }
  }

  function checkUrlParams(): void {
    const urlLat = new URLSearchParams(window.location.search).get("lat");
    const urlLon = new URLSearchParams(window.location.search).get("lon");
    if (urlLat !== null && urlLon !== null) {
      const lat = parseFloat(urlLat);
      const lon = parseFloat(urlLon);
      if (!isNaN(lat) && !isNaN(lon)) {
        setLocation({ latitude: lat, longitude: lon, name: "URL Location" });
      }
    }
  }

  // Initialize display
  updateDisplay(getLocation());

  return {
    updateDisplay,
    setupEventListeners,
    checkUrlParams,
  };
}
