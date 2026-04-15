/**
 * Device Orientation Geometry
 *
 * Pure math for converting device orientation sensor readings (alpha, beta, gamma)
 * to astronomical altitude/azimuth coordinates. Separated from the event-handling
 * manager so it can be unit tested independently.
 */

/**
 * Extract altitude and azimuth from device orientation angles.
 *
 * Device orientation angles (W3C DeviceOrientation spec):
 * - alpha: 0-360° rotation around Z (compass heading, increases counterclockwise from above)
 * - beta: -180 to 180° rotation around X (pitch; 0 = flat, 90 = screen facing user)
 * - gamma: -90 to 90° rotation around Y (roll; tilt left/right)
 *
 * Uses "camera mode": the viewing direction is where the BACK of the phone points.
 * From the ZXY rotation matrix R = Rz(α)·Rx(β)·Ry(γ), the back-of-phone
 * direction (0,0,-1) in device space maps to world space as:
 *   east  = -sin(α)·sin(β)
 *   north =  cos(α)·sin(β)
 *   up    = -cos(β)
 *
 * This gives altitude = β - 90° and azimuth = 360° - α.
 *
 * Screen orientation adjusts beta/gamma for landscape modes.
 *
 * @param alpha   - Device compass angle (degrees, 0-360)
 * @param beta    - Device pitch angle (degrees, -180 to 180)
 * @param gamma   - Device roll angle (degrees, -90 to 90)
 * @param screenOrientation - Screen rotation in degrees (0, 90, -90/270, 180)
 * @returns { altitude, azimuth } in degrees
 */
export function deviceOrientationToAltAz(
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number
): { altitude: number; azimuth: number } {
  // Adjust beta/gamma for screen orientation
  let adjustedBeta = beta;

  if (screenOrientation === 90) {
    // Landscape left (home button on right)
    adjustedBeta = gamma;
  } else if (screenOrientation === -90 || screenOrientation === 270) {
    // Landscape right (home button on left)
    adjustedBeta = -gamma;
  } else if (screenOrientation === 180) {
    // Upside down portrait
    adjustedBeta = -beta;
  }

  // Camera mode: altitude = beta - 90
  //   Phone flat, screen up (β=0°):     back faces down  → alt = -90° (ground)
  //   Phone vertical (β=90°):           back faces ahead  → alt = 0°  (horizon)
  //   Phone flat, screen down (β=180°): back faces up     → alt = 90° (zenith)
  let altitude = adjustedBeta - 90;
  altitude = Math.max(-90, Math.min(90, altitude));

  // Device alpha increases counterclockwise (W3C spec),
  // astronomical azimuth increases clockwise → negate.
  let azimuth = (360 - alpha) % 360;
  azimuth = ((azimuth % 360) + 360) % 360;

  return { altitude, azimuth };
}
