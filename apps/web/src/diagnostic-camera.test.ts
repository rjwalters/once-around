import { describe, expect, it, vi } from "vitest";
import { createDiagnosticCamera } from "./diagnostic-camera";

function fixture() {
  const track = Object.assign(new EventTarget(), {
    readyState: "live",
    muted: false,
    getSettings: () => ({ facingMode: "environment" }),
    stop: vi.fn(),
  });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const video = Object.assign(new EventTarget(), {
    paused: true,
    readyState: 2,
    srcObject: null as MediaStream | null,
    muted: false,
    playsInline: false,
    play: vi.fn(async () => {
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
  });
  const getUserMedia = vi.fn(async () => stream);
  const camera = createDiagnosticCamera(
    video as unknown as HTMLVideoElement,
    vi.fn(),
    { getUserMedia },
  );
  return { camera, track, video, stream, getUserMedia };
}

describe("diagnostic camera ownership", () => {
  it("requests rear video only, requires playback, and releases everything on stop", async () => {
    const f = fixture();
    expect(f.getUserMedia).not.toHaveBeenCalled();
    await f.camera.start();
    expect(f.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { exact: "environment" } },
    });
    expect(f.camera.isReady()).toBe(true);
    f.video.dispatchEvent(new Event("waiting"));
    expect(f.camera.isReady()).toBe(false);
    f.video.dispatchEvent(new Event("playing"));
    expect(f.camera.isReady()).toBe(true);
    f.camera.stop();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
    f.video.dispatchEvent(new Event("playing"));
    expect(f.camera.isReady()).toBe(false);
  });
  it("stops a camera that resolves after stop", async () => {
    const f = fixture();
    let resolve!: (stream: MediaStream) => void;
    f.getUserMedia.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.camera.start();
    f.camera.stop();
    resolve(f.stream);
    await pending;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.play).not.toHaveBeenCalled();
    expect(f.camera.getState().status).toBe("idle");
  });
  it("ignores a late playback rejection from a stopped session", async () => {
    const f = fixture();
    let reject!: (error: Error) => void;
    f.video.play.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const pending = f.camera.start();
    await Promise.resolve();
    f.camera.stop();
    reject(new Error("late"));
    await pending;
    expect(f.camera.getState().status).toBe("idle");
    expect(f.video.srcObject).toBeNull();
  });
  it("reports denial, no rear camera, and failed playback", async () => {
    const denied = fixture();
    denied.getUserMedia.mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    await denied.camera.start();
    expect(denied.camera.getState().message).toContain("permission denied");
    const missing = fixture();
    missing.getUserMedia.mockRejectedValue(
      new DOMException("missing", "OverconstrainedError"),
    );
    await missing.camera.start();
    expect(missing.camera.getState().message).toContain("rear camera");
    const playback = fixture();
    playback.video.play.mockRejectedValue(new Error("playback"));
    await playback.camera.start();
    expect(playback.track.stop).toHaveBeenCalledOnce();
    expect(playback.camera.isReady()).toBe(false);
  });
  it("rejects a front camera and handles interruption", async () => {
    const front = fixture();
    front.track.getSettings = () => ({ facingMode: "user" });
    await front.camera.start();
    expect(front.camera.isReady()).toBe(false);
    expect(front.track.stop).toHaveBeenCalledOnce();
    const ended = fixture();
    await ended.camera.start();
    ended.track.dispatchEvent(new Event("ended"));
    expect(ended.camera.getState().status).toBe("error");
    expect(ended.track.stop).toHaveBeenCalledOnce();
    expect(ended.video.srcObject).toBeNull();
  });
});
