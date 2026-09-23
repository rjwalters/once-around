/** Real local workerd + D1 via Wrangler; no account access or remote resources. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { getPlatformProxy, unstable_dev } from "wrangler";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker, { type Env } from "../src/index";
import fixture from "./report.json";

let directory: string;
let platform: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let server: Awaited<ReturnType<typeof unstable_dev>>;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const origin = "http://localhost:5173";
const key = "3485546d-8cc9-4cd5-bcbb-4b4e8dcdb244";
const headers = {
  Origin: origin,
  "Content-Type": "application/json",
  "Idempotency-Key": key,
  "CF-Connecting-IP": "192.0.2.42",
};
const count = async () =>
  (await platform.env
    .REPORTS!.prepare("SELECT COUNT(*) AS count FROM alignment_reports")
    .first<{ count: number }>())!.count;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "once-around-reports-"));
  platform = await getPlatformProxy<Env>({
    configPath: "wrangler.jsonc",
    environment: "local",
    persist: { path: join(directory, "v3") },
  });
  const migration = await readFile("migrations/0001_reports.sql", "utf8");
  for (const sql of migration
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean))
    await platform.env.REPORTS!.prepare(sql).run();
  server = await unstable_dev("src/index.ts", {
    config: "wrangler.jsonc",
    env: "local",
    local: true,
    ip: "127.0.0.1",
    port: 0,
    inspectorPort: 0,
    persistTo: directory,
    logLevel: "none",
    experimental: {
      disableExperimentalWarning: true,
      testScheduled: true,
      watch: false,
      disableDevRegistry: true,
    },
  });
}, 30_000);
afterAll(async () => {
  await server?.stop();
  await platform?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
}, 30_000);

it("serves the actual Worker, stores one private D1 row and reuses a receipt for retries", async () => {
  const submit = (
    body: unknown = fixture,
    extra: Record<string, string> = {},
  ) =>
    server.fetch("/reports", {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  const accepted = await submit();
  expect(accepted.status).toBe(201);
  const receipt = (await accepted.json()) as {
    receiptId: string;
    receivedAt: string;
  };
  expect(receipt.receiptId).toMatch(/^[a-f0-9-]{36}$/);
  expect(Date.now() - Date.parse(receipt.receivedAt)).toBeLessThan(30_000);
  expect(await count()).toBe(1);
  const stored = await platform.env
    .REPORTS!.prepare("SELECT payload_json FROM alignment_reports")
    .first<{ payload_json: string }>();
  expect(JSON.parse(stored!.payload_json)).toEqual(fixture);
  expect(stored!.payload_json).not.toContain("192.0.2.42");
  expect(stored!.payload_json).not.toContain("User-Agent");
  const reordered = Object.fromEntries(Object.entries(fixture).reverse());
  const retried = await submit(reordered);
  expect(retried.status).toBe(200);
  expect(await retried.json()).toEqual(receipt);
  const conflict = await submit({
    ...fixture,
    device: { ...fixture.device, phone: "another phone" },
  });
  expect(conflict.status).toBe(409);
  expect(await count()).toBe(1);
  for (const path of ["/reports", `/reports/${receipt.receiptId}`])
    expect(
      (await server.fetch(path, { headers: { Origin: origin } })).status,
    ).toBe(path === "/reports" ? 405 : 404);

  expect(
    (
      await submit(
        { ...fixture, unwanted: true },
        { "Idempotency-Key": crypto.randomUUID() },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await server.fetch("/reports", {
        method: "POST",
        headers,
        body: "x".repeat(65_537),
      })
    ).status,
  ).toBe(413);
  expect(await count()).toBe(1);
}, 30_000);

it("resolves concurrent idempotency races in actual D1", async () => {
  const raceKey = crypto.randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      worker.fetch(
        new Request("https://example.com/reports", {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": raceKey },
          body: JSON.stringify(fixture),
        }),
        {
          ...platform.env,
          REPORT_RATE_LIMIT: { limit: async () => ({ success: true }) },
        },
      ),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
  const receipts = await Promise.all(responses.map((r) => r.json()));
  expect(new Set(receipts.map((r) => JSON.stringify(r))).size).toBe(1);
  expect(await count()).toBe(2);
});

it("daily scheduled cleanup deletes only receipts older than 90 days", async () => {
  const now = Date.now();
  for (const [id, receivedAt] of [
    ["expired", now - RETENTION_MS - 60_000],
    ["recent", now - RETENTION_MS + 60_000],
  ] as const) {
    await platform.env
      .REPORTS!.prepare("INSERT INTO alignment_reports VALUES (?, ?, ?, ?, ?)")
      .bind(id, id, "test", receivedAt, "{}")
      .run();
  }
  const response = await server.fetch("/__scheduled?cron=17+3+*+*+*");
  expect(response.status).toBe(200);
  await expect
    .poll(async () =>
      platform.env
        .REPORTS!.prepare(
          "SELECT receipt_id FROM alignment_reports WHERE receipt_id = ?",
        )
        .bind("expired")
        .first(),
    )
    .toBeNull();
  expect(
    await platform.env
      .REPORTS!.prepare(
        "SELECT receipt_id FROM alignment_reports WHERE receipt_id = ?",
      )
      .bind("recent")
      .first(),
  ).not.toBeNull();
});

it("retention continues when collection is suspended", async () => {
  await platform.env
    .REPORTS!.prepare("INSERT INTO alignment_reports VALUES (?, ?, ?, ?, ?)")
    .bind(
      "paused-expired",
      "paused-expired",
      "test",
      Date.now() - RETENTION_MS - 60_000,
      "{}",
    )
    .run();
  await worker.scheduled({}, { ...platform.env, REPORTS_ENABLED: "false" });
  expect(
    await platform.env
      .REPORTS!.prepare(
        "SELECT receipt_id FROM alignment_reports WHERE receipt_id = ?",
      )
      .bind("paused-expired")
      .first(),
  ).toBeNull();
});
