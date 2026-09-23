import {
  canonicalJSON,
  isAlignmentReport,
  REPORT_MAX_BYTES,
  UUID_PATTERN,
} from "../../web/src/alignment-report-schema";

// Small structural binding interfaces keep the wire schema and tests WASM-free.
interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Env {
  REPORTS_ENABLED?: string;
  ALLOWED_ORIGINS?: string;
  REPORTS?: { prepare(sql: string): Statement };
  REPORT_RATE_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
interface ReceiptRow {
  receipt_id: string;
  payload_sha256: string;
  received_at: number;
}
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
class Rejection extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("Content-Length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > REPORT_MAX_BYTES)
  )
    throw new Rejection(413, "Report exceeds 64 KiB.");
  if (!request.body) throw new Rejection(400, "JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REPORT_MAX_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Rejection(413, "Report exceeds 64 KiB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Rejection(400, "Report must be valid UTF-8 JSON.");
  }
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function allowedOrigins(value: string | undefined): string[] | null {
  if (!value) return null;
  const origins = value.split(",");
  try {
    return origins.length > 0 &&
      origins.every((origin) => {
        const url = new URL(origin);
        return (
          url.origin === origin &&
          (url.protocol === "https:" ||
            (url.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(url.hostname)))
        );
      })
      ? origins
      : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    if (new URL(request.url).pathname !== "/reports")
      return reply(404, { error: "Not found." });
    const origins = allowedOrigins(env.ALLOWED_ORIGINS);
    if (
      env.REPORTS_ENABLED !== "true" ||
      !origins ||
      !env.REPORTS ||
      !env.REPORT_RATE_LIMIT
    )
      return reply(503, { error: "Report collection is unavailable." });
    const origin = request.headers.get("Origin");
    if (!origin || !origins.includes(origin))
      return reply(403, { error: "Origin is not allowed." });
    headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      const requested =
        request.headers
          .get("Access-Control-Request-Headers")
          ?.toLowerCase()
          .split(",")
          .map((h) => h.trim()) ?? [];
      if (
        request.headers.get("Access-Control-Request-Method") !== "POST" ||
        requested.some((h) => !["content-type", "idempotency-key"].includes(h))
      )
        return reply(403, { error: "Preflight is not allowed." });
      headers.set("Access-Control-Allow-Methods", "POST");
      headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Idempotency-Key",
      );
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return reply(405, { error: "Only POST is supported." });
    }
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers.get("Content-Type") ?? "",
      ) ||
      request.headers.has("Content-Encoding")
    )
      return reply(415, { error: "Use uncompressed application/json." });
    const key = request.headers.get("Idempotency-Key");
    if (!key || !UUID_PATTERN.test(key))
      return reply(400, { error: "A UUID v4 Idempotency-Key is required." });
    try {
      // Cloudflare supplies this header. It is used only in a short-lived rate key,
      // never in stored reports or logs. CORS is not authentication.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip || ip.length > 45)
        return reply(503, { error: "Report collection is unavailable." });
      const rate = await env.REPORT_RATE_LIMIT.limit({
        key: await sha256(`${Math.floor(Date.now() / 60_000)}:${ip}`),
      });
      if (rate.success !== true) {
        headers.set("Retry-After", "60");
        return reply(429, {
          error: "Too many reports. Wait a minute and try again.",
        });
      }
      const report = await readBody(request);
      if (!isAlignmentReport(report))
        return reply(400, {
          error: "Report does not match the supported schema.",
        });
      const payload = canonicalJSON(report);
      const fingerprint = await sha256(payload);
      const id = crypto.randomUUID();
      const receivedAt = Date.now();
      // A unique constraint resolves concurrent retries without overwriting data.
      await env.REPORTS.prepare(
        `INSERT INTO alignment_reports
        (receipt_id, idempotency_key, payload_sha256, received_at, payload_json)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
      )
        .bind(id, key.toLowerCase(), fingerprint, receivedAt, payload)
        .run();
      const row = await env.REPORTS.prepare(
        `SELECT receipt_id, payload_sha256, received_at
        FROM alignment_reports WHERE idempotency_key = ?`,
      )
        .bind(key.toLowerCase())
        .first<ReceiptRow>();
      if (!row) throw new Error("Missing receipt");
      if (row.payload_sha256 !== fingerprint)
        return reply(409, {
          error: "Submission key was already used for different data.",
        });
      return reply(row.receipt_id === id ? 201 : 200, {
        receiptId: row.receipt_id,
        receivedAt: new Date(row.received_at).toISOString(),
      });
    } catch (error) {
      // Do not log request bodies, IPs, UA headers, or database exception details.
      return error instanceof Rejection
        ? reply(error.status, { error: error.message })
        : reply(503, {
            error: "Report collection is unavailable. Try again later.",
          });
    }
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    // Suspending collection must not suspend deletion of existing reports.
    if (!env.REPORTS) throw new Error("Report retention is not configured.");
    try {
      await env.REPORTS.prepare(
        "DELETE FROM alignment_reports WHERE received_at < ?",
      )
        .bind(Date.now() - RETENTION_MS)
        .run();
    } catch {
      throw new Error("Report retention failed.");
    }
  },
};
