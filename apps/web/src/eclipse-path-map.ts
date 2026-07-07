/**
 * Eclipse path mini-map.
 *
 * Renders the umbral center line of an eclipse as a compact inline SVG, with
 * the observer's position and the nearest point on the center line marked. This
 * gives a self-contained "here is the path / here is where you are" visual
 * without requiring a globe view or external map tiles.
 */

import type { EclipsePath, EclipsePathPoint, NearestPoint } from "./eclipsePaths";

export interface MapSize {
  width: number;
  height: number;
}

const DEFAULT_SIZE: MapSize = { width: 300, height: 170 };
const PADDING_FRAC = 0.12;

export interface Projection {
  toXY(point: { lat: number; lon: number }): { x: number; y: number };
  size: MapSize;
}

/**
 * Build an equirectangular projection sized to fit `points` within `size`,
 * with longitude scaled by cos(midLat) to reduce east–west distortion and a
 * uniform scale on both axes so the track keeps its shape. Includes a padding
 * margin around the content.
 */
export function buildProjection(
  points: Array<{ lat: number; lon: number }>,
  size: MapSize = DEFAULT_SIZE
): Projection {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  if (!Number.isFinite(minLat)) {
    minLat = maxLat = 0;
    minLon = maxLon = 0;
  }

  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));

  // Content extents in a planar (x = lon*lonScale, y = lat) space.
  const cx0 = minLon * lonScale;
  const cx1 = maxLon * lonScale;
  const cy0 = minLat;
  const cy1 = maxLat;
  const contentW = Math.max(1e-6, cx1 - cx0);
  const contentH = Math.max(1e-6, cy1 - cy0);

  const padX = size.width * PADDING_FRAC;
  const padY = size.height * PADDING_FRAC;
  const availW = size.width - 2 * padX;
  const availH = size.height - 2 * padY;

  // Uniform scale to preserve aspect; center the content in the viewport.
  const scale = Math.min(availW / contentW, availH / contentH);
  const drawW = contentW * scale;
  const drawH = contentH * scale;
  const offsetX = padX + (availW - drawW) / 2;
  const offsetY = padY + (availH - drawH) / 2;

  return {
    size,
    toXY(point) {
      const px = point.lon * lonScale;
      const x = offsetX + (px - cx0) * scale;
      // SVG y grows downward, latitude grows upward → flip.
      const y = offsetY + (cy1 - point.lat) * scale;
      return { x, y };
    },
  };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "0";
}

/**
 * Render the eclipse center path, observer marker and nearest-point marker as
 * an inline SVG string.
 */
export function renderEclipsePathMapSvg(
  path: EclipsePath,
  observer: { lat: number; lon: number },
  nearest: NearestPoint,
  size: MapSize = DEFAULT_SIZE
): string {
  const pts: Array<{ lat: number; lon: number }> = [
    ...path.centerLine,
    observer,
    { lat: nearest.lat, lon: nearest.lon },
  ];
  const proj = buildProjection(pts, size);

  const polyPoints = path.centerLine
    .map((p: EclipsePathPoint) => {
      const { x, y } = proj.toXY(p);
      return `${fmt(x)},${fmt(y)}`;
    })
    .join(" ");

  const obs = proj.toXY(observer);
  const near = proj.toXY({ lat: nearest.lat, lon: nearest.lon });

  return [
    `<svg viewBox="0 0 ${size.width} ${size.height}" width="100%" `,
    `preserveAspectRatio="xMidYMid meet" role="img" `,
    `aria-label="Eclipse center path map">`,
    `<rect x="0" y="0" width="${size.width}" height="${size.height}" `,
    `rx="6" fill="rgba(10,6,20,0.6)" />`,
    // Center line of totality.
    `<polyline points="${polyPoints}" fill="none" stroke="#ffcc66" `,
    `stroke-width="2" stroke-linejoin="round" stroke-linecap="round" `,
    `opacity="0.9" />`,
    // Connector from observer to nearest point on the path.
    `<line x1="${fmt(obs.x)}" y1="${fmt(obs.y)}" x2="${fmt(near.x)}" `,
    `y2="${fmt(near.y)}" stroke="#66ccff" stroke-width="1" `,
    `stroke-dasharray="3 3" opacity="0.8" />`,
    // Nearest point on the center line.
    `<circle cx="${fmt(near.x)}" cy="${fmt(near.y)}" r="3.5" `,
    `fill="none" stroke="#ffcc66" stroke-width="1.5" />`,
    // Observer position.
    `<circle cx="${fmt(obs.x)}" cy="${fmt(obs.y)}" r="4" fill="#66ccff" `,
    `stroke="#ffffff" stroke-width="1" />`,
    `</svg>`,
  ].join("");
}
