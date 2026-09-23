import type { DiagnosticCapture } from "./alignment-diagnostic";
import {
  ERROR_CONVENTION,
  isAlignmentReport,
  REPORT_MAX_BYTES,
  REPORT_SCHEMA,
  UUID_PATTERN,
  type AlignmentReport,
} from "./alignment-report-schema";

export function reportEndpoint(
  value: string | undefined,
  development = false,
): string | null {
  if (!value || !/^https?:\/\//.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/reports"
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        development &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Only a coarse editable label leaves the browser, never the full UA. */
export function browserDescription(userAgent: string): string {
  for (const [name, pattern] of [
    ["Edge", /Edg(?:A|iOS)?\/(\d{1,4})/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d{1,4})/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d{1,4})/],
    ["Safari", /Version\/(\d{1,4}).*Safari\//],
  ] as const) {
    const match = userAgent.match(pattern);
    if (match) return `${name} ${match[1]}`;
  }
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other browser";
}

export function createAlignmentReport(
  captures: DiagnosticCapture[],
  coordinatesIncluded: boolean,
  device: AlignmentReport["device"],
  build: AlignmentReport["build"],
): AlignmentReport {
  const report: AlignmentReport = {
    schema: REPORT_SCHEMA,
    angleUnit: "degrees",
    errorConvention: ERROR_CONVENTION,
    coordinatesIncluded,
    device: {
      phone: device.phone.trim() || "Unknown",
      browser: device.browser.trim() || "Unknown",
    },
    build,
    captures: captures.map((capture) => {
      const { latitude, longitude, ...gps } = capture.gps;
      return {
        ...capture,
        gps: coordinatesIncluded ? { ...gps, latitude, longitude } : gps,
      };
    }),
  };
  if (!isAlignmentReport(report))
    throw new Error(
      "Check the descriptions (80 characters maximum) and capture at least one measurement.",
    );
  return report;
}

export interface ReportReceipt {
  receiptId: string;
  receivedAt: string;
}
/** A key belongs to one immutable payload for the lifetime of this tab. */
export function createReportSender(
  endpoint: string,
  transport: typeof fetch = fetch,
) {
  let previous: { body: string; key: string } | null = null;
  let pending = false;
  return async (report: AlignmentReport): Promise<ReportReceipt> => {
    if (pending) throw new Error("A report is already being sent.");
    if (!isAlignmentReport(report))
      throw new Error("The report is invalid. Check your measurements.");
    const body = JSON.stringify(report);
    if (new TextEncoder().encode(body).byteLength > REPORT_MAX_BYTES)
      throw new Error(
        "This report is too large. Copy or download the measurements instead.",
      );
    if (previous?.body !== body) previous = { body, key: crypto.randomUUID() };
    const submission = previous;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    pending = true;
    try {
      const response = await transport(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submission.key,
        },
        body: submission.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429)
          throw new Error("Too many reports. Wait a minute, then send again.");
        if (response.status === 409)
          throw new Error(
            "Submission key conflict. Download your measurements and reload before making a new report.",
          );
        if (response.status >= 500)
          throw new Error(
            "The report service is unavailable. Try Send report again later.",
          );
        throw new Error(
          "The report was rejected. Check your descriptions or download the measurements.",
        );
      }
      const receipt = (await response.json()) as Partial<ReportReceipt>;
      if (
        typeof receipt.receiptId !== "string" ||
        !UUID_PATTERN.test(receipt.receiptId) ||
        typeof receipt.receivedAt !== "string" ||
        !Number.isFinite(Date.parse(receipt.receivedAt))
      )
        throw new Error(
          "No valid receipt received. Try Send report again to confirm delivery.",
        );
      return receipt as ReportReceipt;
    } catch (error) {
      if (controller.signal.aborted || error instanceof TypeError)
        throw new Error(
          "Delivery could not be confirmed. Check your connection and try Send report again; unchanged reports will not be duplicated.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  };
}
