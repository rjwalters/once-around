/**
 * Debug Utilities
 *
 * Debug display for camera controls development.
 */

// Debug elements
const dbg = {
  theta: document.getElementById("dbg-theta"),
  phi: document.getElementById("dbg-phi"),
  startX: document.getElementById("dbg-start-x"),
  startY: document.getElementById("dbg-start-y"),
  dx: document.getElementById("dbg-dx"),
  dy: document.getElementById("dbg-dy"),
  dtheta: document.getElementById("dbg-dtheta"),
  dphi: document.getElementById("dbg-dphi"),
  fov: document.getElementById("dbg-fov"),
};

function toDeg(rad: number): string {
  return ((rad * 180) / Math.PI).toFixed(1);
}

export interface DebugData {
  theta?: number;
  phi?: number;
  startX?: number;
  startY?: number;
  dx?: number;
  dy?: number;
  dtheta?: number;
  dphi?: number;
  fov: number;
}

export function updateDebug(data: DebugData): void {
  if (dbg.theta) dbg.theta.textContent = data.theta !== undefined ? toDeg(data.theta) : "-";
  if (dbg.phi) dbg.phi.textContent = data.phi !== undefined ? toDeg(data.phi) : "-";
  if (dbg.startX) dbg.startX.textContent = data.startX?.toFixed(0) ?? "-";
  if (dbg.startY) dbg.startY.textContent = data.startY?.toFixed(0) ?? "-";
  if (dbg.dx) dbg.dx.textContent = data.dx?.toFixed(0) ?? "-";
  if (dbg.dy) dbg.dy.textContent = data.dy?.toFixed(0) ?? "-";
  if (dbg.dtheta) dbg.dtheta.textContent = data.dtheta !== undefined ? toDeg(data.dtheta) : "-";
  if (dbg.dphi) dbg.dphi.textContent = data.dphi !== undefined ? toDeg(data.dphi) : "-";
  if (dbg.fov) dbg.fov.textContent = data.fov.toFixed(0);
}
