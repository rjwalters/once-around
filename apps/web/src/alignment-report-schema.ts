/** Shared wire contract. No engine, browser, or WASM imports. */
import type { DiagnosticCapture } from "./alignment-diagnostic";

export const REPORT_SCHEMA = "once-around-alignment-report-v1";
export const REPORT_MAX_BYTES = 64 * 1024;
export const REPORT_MAX_CAPTURES = 10;
export const DESCRIPTION_MAX_LENGTH = 80;
export const ERROR_CONVENTION =
  "measured minus expected; signed shortest differences";
export type ReportCapture = Omit<DiagnosticCapture, "gps"> & {
  gps: Omit<DiagnosticCapture["gps"], "latitude" | "longitude"> & {
    latitude?: number;
    longitude?: number;
  };
};
export interface AlignmentReport {
  schema: typeof REPORT_SCHEMA;
  angleUnit: "degrees";
  errorConvention: typeof ERROR_CONVENTION;
  coordinatesIncluded: boolean;
  device: { phone: string; browser: string };
  build: { commit: string; time: string };
  captures: ReportCapture[];
}
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Check = (value: unknown) => boolean;
const number =
  (min: number, max: number, exclusiveMax = false): Check =>
  (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    (exclusiveMax ? value < max : value <= max);
const oneOf =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value);
const object =
  (fields: Record<string, Check>): Check =>
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    return (
      Object.keys(record).length === Object.keys(fields).length &&
      Object.entries(fields).every(
        ([key, check]) => Object.hasOwn(record, key) && check(record[key]),
      )
    );
  };
export const isDescription: Check = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= DESCRIPTION_MAX_LENGTH &&
  !/[\u0000-\u001f\u007f]/.test(value);
const utc: Check = (value) =>
  typeof value === "string" &&
  /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const position = object({
  altitude: number(-90, 90),
  azimuth: number(0, 360, true),
});
const signedError = number(-180, 180, true);
const capture = (coordinates: boolean) =>
  object({
    target: oneOf("Moon", "Sun"),
    utc,
    expected: object({
      altitude: (v) => number(0, 90)(v) && v !== 0,
      azimuth: number(0, 360, true),
    }),
    measured: position,
    rawMeasured: position,
    errors: object({
      altitude: signedError,
      azimuth: signedError,
      greatCircle: number(0, 180),
    }),
    gps: object({
      accuracy: number(0, 100),
      timestamp: number(Date.UTC(2000, 0), Date.UTC(2100, 0), true),
      ageMs: number(0, 30_000, true),
      ...(coordinates
        ? { latitude: number(-90, 90), longitude: number(-180, 180) }
        : {}),
    }),
    orientation: object({
      alpha: number(0, 360, true),
      beta: number(-180, 180),
      gamma: number(-90, 90),
      receivedAt: number(0, Number.MAX_SAFE_INTEGER),
      headingReference: oneOf("absolute", "webkit-compass"),
      compassAccuracy: (v) => v === null || number(0, 180)(v),
      ageMs: number(0, 3000, true),
    }),
    screenRotation: number(0, 360, true),
    magneticDeclination: number(-180, 180),
  });

/** Exact keys at every level also prevent images and unsolicited metadata. */
export function isAlignmentReport(value: unknown): value is AlignmentReport {
  const coordinates = (value as Partial<AlignmentReport> | null)
    ?.coordinatesIncluded;
  return object({
    schema: oneOf(REPORT_SCHEMA),
    angleUnit: oneOf("degrees"),
    errorConvention: oneOf(ERROR_CONVENTION),
    coordinatesIncluded: oneOf(true, false),
    device: object({ phone: isDescription, browser: isDescription }),
    build: object({
      commit: (v) =>
        typeof v === "string" && /^(?:[a-f0-9]{7,40}|unknown)$/.test(v),
      time: utc,
    }),
    captures: (v) =>
      Array.isArray(v) &&
      v.length >= 1 &&
      v.length <= REPORT_MAX_CAPTURES &&
      v.every(capture(coordinates === true)),
  })(value);
}

/** Object key order does not affect the server's idempotency fingerprint. */
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
