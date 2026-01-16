/**
 * Time step controls for navigating through time.
 */

export interface TimeStepUnit {
  label: string;
  ms: number;
  description: string;
}

export const TIME_STEP_UNITS: TimeStepUnit[] = [
  { label: "1h", ms: 60 * 60 * 1000, description: "1 hour - watch Jupiter's moons move" },
  { label: "1d", ms: 24 * 60 * 60 * 1000, description: "1 day - watch planets move against stars" },
  { label: "1w", ms: 7 * 24 * 60 * 60 * 1000, description: "1 week - watch outer planets and retrograde" },
];

const PLAY_INTERVAL_MS = 200; // Step every 200ms when playing

export interface TimeControlsOptions {
  datetimeInput: HTMLInputElement;
  onJumpToNow?: () => void;
}

export interface TimeControls {
  stepTime: (direction: 1 | -1) => void;
  jumpToNow: () => void;
  startPlayback: () => void;
  stopPlayback: () => void;
  togglePlayback: () => void;
  cycleStepUnit: () => void;
  isPlaying: () => boolean;
  getCurrentStepUnit: () => TimeStepUnit;
  setupEventListeners: () => void;
}

/**
 * Format a Date to datetime-local input value format.
 */
function formatDatetimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Create time controls for stepping through time.
 */
export function createTimeControls(options: TimeControlsOptions): TimeControls {
  const { datetimeInput, onJumpToNow } = options;

  let currentStepIndex = 0;
  let playing = false;
  let playInterval: ReturnType<typeof setInterval> | null = null;

  // Get DOM elements
  const timeNowBtn = document.getElementById("time-now");
  const timeBackBtn = document.getElementById("time-back");
  const timeForwardBtn = document.getElementById("time-forward");
  const timePlayBtn = document.getElementById("time-play");
  const timeStepUnitBtn = document.getElementById("time-step-unit");

  function stepTime(direction: 1 | -1): void {
    const currentStep = TIME_STEP_UNITS[currentStepIndex];
    const currentTime = datetimeInput.value ? new Date(datetimeInput.value) : new Date();
    const newTime = new Date(currentTime.getTime() + direction * currentStep.ms);

    datetimeInput.value = formatDatetimeLocal(newTime);
    datetimeInput.dispatchEvent(new Event("change"));
  }

  function stopPlayback(): void {
    if (!playing) return;
    playing = false;
    if (timePlayBtn) {
      timePlayBtn.textContent = "▶";
      timePlayBtn.classList.remove("playing");
    }
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  function jumpToNow(): void {
    stopPlayback();

    // Hide eclipse banner when jumping to now
    const eclipseBanner = document.getElementById("eclipse-banner");
    if (eclipseBanner) {
      eclipseBanner.classList.add("hidden");
    }

    datetimeInput.value = formatDatetimeLocal(new Date());
    datetimeInput.dispatchEvent(new Event("change"));

    onJumpToNow?.();
  }

  function startPlayback(): void {
    if (playing) return;
    playing = true;
    if (timePlayBtn) {
      timePlayBtn.textContent = "⏸";
      timePlayBtn.classList.add("playing");
    }
    playInterval = setInterval(() => stepTime(1), PLAY_INTERVAL_MS);
  }

  function togglePlayback(): void {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function cycleStepUnit(): void {
    currentStepIndex = (currentStepIndex + 1) % TIME_STEP_UNITS.length;
    if (timeStepUnitBtn) {
      timeStepUnitBtn.textContent = TIME_STEP_UNITS[currentStepIndex].label;
      timeStepUnitBtn.title = TIME_STEP_UNITS[currentStepIndex].description;
    }
  }

  function setupEventListeners(): void {
    if (timeNowBtn) {
      timeNowBtn.addEventListener("click", jumpToNow);
    }
    if (timeBackBtn) {
      timeBackBtn.addEventListener("click", () => {
        stopPlayback();
        stepTime(-1);
      });
    }
    if (timeForwardBtn) {
      timeForwardBtn.addEventListener("click", () => {
        stopPlayback();
        stepTime(1);
      });
    }
    if (timePlayBtn) {
      timePlayBtn.addEventListener("click", togglePlayback);
    }
    if (timeStepUnitBtn) {
      timeStepUnitBtn.addEventListener("click", cycleStepUnit);
      timeStepUnitBtn.title = TIME_STEP_UNITS[currentStepIndex].description;
    }

    // Stop playback when user manually changes the datetime input
    datetimeInput.addEventListener("focus", stopPlayback);
  }

  return {
    stepTime,
    jumpToNow,
    startPlayback,
    stopPlayback,
    togglePlayback,
    cycleStepUnit,
    isPlaying: () => playing,
    getCurrentStepUnit: () => TIME_STEP_UNITS[currentStepIndex],
    setupEventListeners,
  };
}
