/** Own the rear-camera stream, including streams resolving after Stop/pagehide. */
export interface DiagnosticCameraState {
  status: "idle" | "starting" | "ready" | "error";
  message: string;
}

export function createDiagnosticCamera(
  video: HTMLVideoElement,
  onChange: (state: DiagnosticCameraState) => void,
  mediaDevices:
    | Pick<MediaDevices, "getUserMedia">
    | undefined = navigator.mediaDevices,
) {
  let generation = 0;
  let stream: MediaStream | null = null;
  let state: DiagnosticCameraState = {
    status: "idle",
    message: "Camera is off.",
  };
  const cleanups: (() => void)[] = [];

  function update(
    status: DiagnosticCameraState["status"],
    message: string,
  ): void {
    state = { status, message };
    onChange({ ...state });
  }
  function release(): void {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.pause();
    video.srcObject = null;
  }
  function stop(): void {
    generation++;
    release();
    update("idle", "Camera is off.");
  }
  function fail(message: string): void {
    generation++;
    release();
    update("error", message);
  }
  function listen(
    target: EventTarget,
    event: string,
    callback: EventListener,
  ): void {
    target.addEventListener(event, callback);
    cleanups.push(() => target.removeEventListener(event, callback));
  }
  function isReady(): boolean {
    return (
      state.status === "ready" &&
      !!stream &&
      !video.paused &&
      video.readyState >= 2 &&
      stream
        .getVideoTracks()
        .some((track) => track.readyState === "live" && !track.muted)
    );
  }
  async function start(): Promise<void> {
    stop();
    const id = generation;
    update("starting", "Waiting for rear-camera permission and playback…");
    if (!mediaDevices?.getUserMedia) {
      fail(
        "Camera is unavailable. Open this page over HTTPS in a camera-enabled browser.",
      );
      return;
    }
    try {
      // Never silently fall back to a front camera: its pointing axis is reversed.
      const acquired = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: "environment" } },
      });
      if (id !== generation) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const track = stream.getVideoTracks()[0];
      if (
        !track ||
        (track.getSettings().facingMode &&
          track.getSettings().facingMode !== "environment")
      ) {
        fail("A rear camera is required for this measurement.");
        return;
      }
      const refresh = () => {
        if (id !== generation) return;
        if (
          !video.paused &&
          video.readyState >= 2 &&
          track.readyState === "live" &&
          !track.muted
        )
          update("ready", "Rear-camera preview is live.");
        else
          update("starting", "Camera preview is paused or waiting for frames.");
      };
      listen(track, "ended", () =>
        fail("Camera stream ended. Stop and start again."),
      );
      listen(track, "mute", refresh);
      listen(track, "unmute", refresh);
      listen(video, "playing", refresh);
      listen(video, "pause", refresh);
      listen(video, "waiting", () =>
        update("starting", "Camera preview is waiting for frames."),
      );
      listen(video, "error", () =>
        fail("Camera playback failed. Stop and start again."),
      );
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (id === generation) refresh();
    } catch (error) {
      if (id !== generation) return;
      const name = error instanceof Error ? error.name : "";
      fail(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access, then start again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No usable rear camera was found."
            : "Camera could not start or play. Check camera access, then start again.",
      );
    }
  }
  return { start, stop, isReady, getState: () => ({ ...state }) };
}
