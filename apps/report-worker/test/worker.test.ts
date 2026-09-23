import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { REPORT_MAX_BYTES } from "../../web/src/alignment-report-schema";
import report from "./report.json";
const origin = "https://oncearound.org";
const key = "3c671660-580a-439c-a6b3-d0b4e7c7f0cf";
function request(options: RequestInit = {}) {
  return new Request("https://receiver.example/reports", {
    method: "POST",
    body: JSON.stringify(report),
    ...options,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "CF-Connecting-IP": "192.0.2.1",
      ...options.headers,
    },
  });
}
function environment(): Env {
  return {
    REPORTS_ENABLED: "true",
    ALLOWED_ORIGINS: origin,
    REPORT_RATE_LIMIT: { limit: vi.fn().mockResolvedValue({ success: true }) },
    REPORTS: {
      prepare: vi.fn(() => {
        throw new Error("test database unavailable");
      }),
    },
  };
}

describe("request boundary and storage failure", () => {
  it.each(["GET", "PUT", "DELETE", "PATCH", "HEAD"])(
    "rejects %s without touching storage",
    async (method) => {
      const env = environment();
      expect(
        (await worker.fetch(request({ method, body: undefined }), env)).status,
      ).toBe(405);
      expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
    },
  );
  it.each([
    "https://oncearound.org.evil.example",
    "null",
    "https://preview.pages.dev",
    "",
  ])("rejects origin %s", async (Origin) => {
    const env = environment();
    const response = await worker.fetch(request({ headers: { Origin } }), env);
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(env.REPORT_RATE_LIMIT!.limit).not.toHaveBeenCalled();
  });
  it("handles only an exact allowed preflight", async () => {
    const env = environment();
    const response = await worker.fetch(
      request({
        method: "OPTIONS",
        body: undefined,
        headers: {
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type, idempotency-key",
        },
      }),
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(
      false,
    );
    expect(
      (
        await worker.fetch(
          request({
            method: "OPTIONS",
            body: undefined,
            headers: { "Access-Control-Request-Method": "GET" },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          request({
            method: "OPTIONS",
            body: undefined,
            headers: {
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "x-extra",
            },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
  });
  it.each([
    { "Content-Type": "text/plain" },
    { "Content-Type": "multipart/form-data" },
    { "Content-Encoding": "gzip" },
    { "Idempotency-Key": "bad" },
    { "Idempotency-Key": "x".repeat(500) },
  ])("rejects unsupported headers %j", async (headers) => {
    const env = environment();
    const response = await worker.fetch(request({ headers }), env);
    expect([400, 415]).toContain(response.status);
    expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
  });
  it("fails closed for missing, disabled or malformed configuration and missing trusted IP", async () => {
    for (const field of [
      "REPORTS_ENABLED",
      "ALLOWED_ORIGINS",
      "REPORTS",
      "REPORT_RATE_LIMIT",
    ] as const) {
      const env = environment();
      delete env[field];
      expect((await worker.fetch(request(), env)).status).toBe(503);
    }
    for (const value of [
      "*",
      "null",
      "https://oncearound.org/",
      "https://oncearound.org, *",
    ]) {
      const env = environment();
      env.ALLOWED_ORIGINS = value;
      expect((await worker.fetch(request(), env)).status).toBe(503);
    }
    const env = environment();
    expect(
      (
        await worker.fetch(
          request({ headers: { "CF-Connecting-IP": "" } }),
          env,
        )
      ).status,
    ).toBe(503);
    env.REPORTS_ENABLED = "false";
    expect((await worker.fetch(request(), env)).status).toBe(503);
    expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
  });
  it("checks rate limiting before storage and fails closed on limiter failure", async () => {
    const env = environment();
    vi.mocked(env.REPORT_RATE_LIMIT!.limit).mockResolvedValue({
      success: false,
    });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
    const rateKey = vi.mocked(env.REPORT_RATE_LIMIT!.limit).mock.calls[0][0]
      .key;
    expect(rateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(rateKey).not.toContain("192.0.2.1");
    vi.mocked(env.REPORT_RATE_LIMIT!.limit).mockRejectedValue(
      new Error("private"),
    );
    const failure = await worker.fetch(request(), env);
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private");
    expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
  });
  it("keeps database errors private and returns recoverable failures", async () => {
    const env = environment();
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database");
    expect(env.REPORTS!.prepare).toHaveBeenCalled();
  });
  it.each(["{", JSON.stringify({ ...report, image: "data:..." }), '"hello"'])(
    "rejects malformed bodies",
    async (body) => {
      const env = environment();
      expect((await worker.fetch(request({ body }), env)).status).toBe(400);
      expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
    },
  );
  it("caps bytes including chunked bodies with absent or falsely low Content-Length", async () => {
    for (const length of [undefined, "1", String(REPORT_MAX_BYTES + 1)]) {
      const cancel = vi.fn();
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(REPORT_MAX_BYTES / 2));
        },
        cancel,
      });
      const req = request({
        body: stream,
        duplex: "half",
        headers: length ? { "Content-Length": length } : {},
      } as RequestInit);
      const env = environment();
      expect((await worker.fetch(req, env)).status).toBe(413);
      expect(env.REPORTS!.prepare).not.toHaveBeenCalled();
      if (length !== String(REPORT_MAX_BYTES + 1))
        expect(cancel).toHaveBeenCalled();
    }
    const exact = JSON.stringify(report).padEnd(REPORT_MAX_BYTES, " ");
    const valid = environment();
    expect((await worker.fetch(request({ body: exact }), valid)).status).toBe(
      503,
    );
    expect(valid.REPORTS!.prepare).toHaveBeenCalled();
    expect(
      (await worker.fetch(request({ body: exact + " " }), environment()))
        .status,
    ).toBe(413);
    const invalidUTF8 = new Uint8Array([0xff]);
    expect(
      (await worker.fetch(request({ body: invalidUTF8 }), environment()))
        .status,
    ).toBe(400);
    const multibyte = '"' + "é".repeat(REPORT_MAX_BYTES / 2) + '"';
    expect(
      (await worker.fetch(request({ body: multibyte }), environment())).status,
    ).toBe(413);
  });
  it("offers no read route or health data", async () => {
    for (const path of ["/", "/reports/receipt", "/reports.json"]) {
      expect(
        (
          await worker.fetch(
            new Request(`https://receiver.example${path}`),
            environment(),
          )
        ).status,
      ).toBe(404);
    }
  });
});
