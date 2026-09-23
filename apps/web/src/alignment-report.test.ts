import { expect, it, vi } from "vitest";
import {
  browserDescription,
  createAlignmentReport,
  createReportSender,
  reportEndpoint,
} from "./alignment-report";
import type { DiagnosticCapture } from "./alignment-diagnostic";
import { isAlignmentReport } from "./alignment-report-schema";
import fixture from "../../report-worker/test/report.json";
const receipt = {
  receiptId: "e4e5a6f5-244f-46ab-a125-6152a03f05d6",
  receivedAt: "2026-09-23T00:00:00.000Z",
};
function report(coordinates = false) {
  const capture = structuredClone(fixture.captures[0]) as DiagnosticCapture;
  Object.assign(capture.gps, { latitude: 37, longitude: -122 });
  return createAlignmentReport(
    [capture],
    coordinates,
    fixture.device,
    fixture.build,
  );
}
it("requires a full HTTPS endpoint, permitting loopback HTTP only in development", () => {
  for (const value of [
    undefined,
    "",
    "/reports",
    "https:collector.example/reports",
    "https://x.example/",
    "https://x.example/reports?secret=x",
    "https://a:b@x.example/reports",
    "http://x.example/reports",
    "https://x.example/reports#x",
  ])
    expect(reportEndpoint(value)).toBeNull();
  expect(reportEndpoint("https://collector.example/reports")).toBe(
    "https://collector.example/reports",
  );
  expect(reportEndpoint("http://localhost:8787/reports")).toBeNull();
  expect(reportEndpoint("http://localhost:8787/reports", true)).toBe(
    "http://localhost:8787/reports",
  );
});
it("strips coordinates without changing local captures and accepts explicit opt-in", () => {
  expect(isAlignmentReport(report())).toBe(true);
  expect(
    createAlignmentReport(
      [report(true).captures[0] as DiagnosticCapture],
      false,
      { phone: "", browser: " " },
      fixture.build,
    ).device,
  ).toEqual({ phone: "Unknown", browser: "Unknown" });
  expect(report().captures[0].gps).not.toHaveProperty("latitude");
  expect(report().captures[0].gps).not.toHaveProperty("longitude");
  expect(report(true).captures[0].gps.latitude).toBe(37);
  expect(() =>
    createAlignmentReport([], false, fixture.device, fixture.build),
  ).toThrow();
});
it("reduces user-agent to a coarse editable browser label", () => {
  expect(
    browserDescription("Mozilla/5.0 phone details Chrome/130.0 Safari/537.36"),
  ).toBe("Chrome 130");
  expect(browserDescription("Mozilla/5.0 Safari/537.36 Edg/130.0")).toBe(
    "Edge 130",
  );
  expect(browserDescription("Mozilla/5.0 FxiOS/130.0")).toBe("Firefox 130");
  expect(browserDescription("Mozilla/5.0 Safari/537.36")).toBe("Safari");
});
it("sends only on invocation, retries with same key/body and changes key for changed consent", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValue(new Response(JSON.stringify(receipt)));
  const send = createReportSender(
    "https://collector.example/reports",
    transport,
  );
  expect(transport).not.toHaveBeenCalled();
  await expect(send(report())).rejects.toThrow("could not be confirmed");
  expect(await send(report())).toEqual(receipt);
  const first = transport.mock.calls[0][1]!;
  const retry = transport.mock.calls[1][1]!;
  expect(retry.body).toBe(first.body);
  expect(retry.headers).toEqual(first.headers);
  expect(retry.credentials).toBe("omit");
  expect(retry.redirect).toBe("error");
  transport.mockResolvedValueOnce(new Response(JSON.stringify(receipt)));
  await send(report(true));
  expect(transport.mock.calls[2][1]!.headers).not.toEqual(first.headers);
});
it.each([429, 503, 400, 409])(
  "surfaces recoverable HTTP %s failure",
  async (status) => {
    const send = createReportSender(
      "https://collector.example/reports",
      vi.fn().mockResolvedValue(new Response("{}", { status })),
    );
    await expect(send(report())).rejects.toThrow();
  },
);
it("rejects invalid receipts and prevents simultaneous submissions", async () => {
  let resolve!: (response: Response) => void;
  const transport = vi.fn<typeof fetch>(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const send = createReportSender(
    "https://collector.example/reports",
    transport,
  );
  const pending = send(report());
  await expect(send(report())).rejects.toThrow("already");
  resolve(new Response("{}"));
  await expect(pending).rejects.toThrow("valid receipt");
});
