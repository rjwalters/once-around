import { describe, expect, it } from "vitest";
import {
  angularSeparation,
  equatorialToHorizontal,
  horizontalToEquatorial,
  positionToRaDec,
} from "../coordinates";
import {
  horizontalDirectionInto,
  julianDate,
  precessInto,
} from "../precession";
import { computeLST } from "../time";
import observed from "../../../../../crates/sky_engine/tests/fixtures/observed_horizons.csv?raw";

describe("J2000 / mean-of-date boundary", () => {
  it("matches the independent ERFA pmat76 matrix", () => {
    // Published t_pmat76 fixture: https://github.com/liberfa/erfa/blob/master/src/t_erfa_c.c
    const expected = [
      [
        0.9999995504328350733, -0.0008696632209485112192,
        -0.0003779153474950335077,
      ],
      [
        0.0008696632209480960785, 0.9999996218428560614,
        -0.0000001643306746147366896,
      ],
      [
        0.0003779153474959888345, -0.0000001643284776111886407,
        0.9999999285899790119,
      ],
    ];
    const result = { x: 0, y: 0, z: 0 };
    for (let axis = 0; axis < 3; axis++) {
      precessInto(
        result,
        Number(axis === 0),
        Number(axis === 1),
        Number(axis === 2),
        2400000.5 + 50123.9999,
      );
      [result.x, result.y, result.z].forEach((value, component) =>
        expect(value).toBeCloseTo(expected[axis][component], 12),
      );
    }
  });

  it("projects independent Horizons ICRF RA/Dec to apparent AIRLESS alt/az at all three sites", () => {
    let catchesMissingPrecession = 0;
    const rows = observed.trim().split(/\r?\n/).slice(1);
    expect(rows).toHaveLength(54);
    for (const row of rows) {
      const [site, lat, lon, body, , epoch, az, alt, ra, dec] = row.split(",");
      const when = new Date(`${epoch}Z`);
      const lst = computeLST(when, Number(lon));
      const result = equatorialToHorizontal(
        Number(ra),
        Number(dec),
        lst,
        Number(lat),
        julianDate(when),
      );
      // These inputs are Horizons topocentric astrometric ICRF, so residuals
      // measure omitted nutation/aberration, not the engine's lunar approximation.
      expect(
        angularSeparation(
          result.altitude,
          result.azimuth,
          Number(alt),
          Number(az),
        ),
        `${site} ${body} ${epoch}`,
      ).toBeLessThan(3 / 60);
      const old = equatorialToHorizontal(
        Number(ra),
        Number(dec),
        lst,
        Number(lat),
      );
      if (
        angularSeparation(old.altitude, old.azimuth, Number(alt), Number(az)) >
        0.25
      )
        catchesMissingPrecession++;
    }
    expect(catchesMissingPrecession).toBeGreaterThan(40);
  });

  it("uses the same J2000 directions for AR, ground, culling, and coordinate readouts", () => {
    const jd = julianDate(new Date("2035-03-20T12:00:00Z"));
    const v = { x: 0, y: 0, z: 0 };
    for (const lat of [-60, 0, 51.5]) {
      for (const [alt, az] of [
        [0, 0],
        [0, 90],
        [30, 180],
        [85, 270],
      ]) {
        horizontalDirectionInto(v, alt, az, 257.8, lat, jd);
        const equatorial = positionToRaDec(v);
        const result = equatorialToHorizontal(
          equatorial.ra,
          equatorial.dec,
          257.8,
          lat,
          jd,
        );
        expect(result.altitude).toBeCloseTo(alt, 9);
        expect(
          Math.min(
            Math.abs(result.azimuth - az),
            360 - Math.abs(result.azimuth - az),
          ),
        ).toBeLessThan(1e-9);
        const inverse = horizontalToEquatorial(az, alt, 257.8, lat, jd);
        expect(inverse.ra).toBeCloseTo(equatorial.ra, 9);
        expect(inverse.dec).toBeCloseTo(equatorial.dec, 9);
      }
    }
  });
});
