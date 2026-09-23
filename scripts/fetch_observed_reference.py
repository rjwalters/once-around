#!/usr/bin/env python3
"""Pin independent, unrefracted Horizons horizontal directions for AR tests.

Run from any directory: python3 scripts/fetch_observed_reference.py
NASA/JPL Horizons observer quantity 4 is apparent topocentric azimuth/elevation
(true equator/equinox of date internally). APPARENT=AIRLESS explicitly excludes
refraction. Geographic sites use east-positive longitude, geodetic latitude,
zero elevation. UTC epochs exercise current and future accumulated precession.
Quantity 1 also records topocentric astrometric ICRF RA/Dec for the independent
web projection test. Fixtures are consumed offline by Rust and web tests.
See https://ssd.jpl.nasa.gov/horizons/manual.html (observer quantity 4).
"""

import csv
from datetime import datetime, timezone
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "crates/sky_engine/tests/fixtures/observed_horizons.csv"
SITES = [
    ("Boulder", 40, -105),
    ("Sydney", -33.8688, 151.2093),
    ("London", 51.5074, -0.1278),
]
EPOCHS = ["2026-09-22 04:00", "2035-03-20 12:00"]
BODIES = [
    ("Sun", "10"),
    ("Moon", "301"),
    ("Mercury", "199"),
    ("Venus", "299"),
    ("Mars", "499"),
    ("Jupiter", "599"),
    ("Saturn", "699"),
    ("Uranus", "799"),
    ("Neptune", "899"),
]


def main():
    rows = []
    for site, lat, lon in SITES:
        for body, command in BODIES:
            params = {
                "format": "json",
                "COMMAND": f"'{command}'",
                "OBJ_DATA": "'NO'",
                "MAKE_EPHEM": "'YES'",
                "EPHEM_TYPE": "'OBSERVER'",
                "CENTER": "'coord@399'",
                "COORD_TYPE": "'GEODETIC'",
                "SITE_COORD": f"'{lon},{lat},0'",
                "TLIST": "'"
                + ",".join(
                    str(
                        datetime.fromisoformat(e)
                        .replace(tzinfo=timezone.utc)
                        .timestamp()
                        / 86400
                        + 2440587.5
                    )
                    for e in EPOCHS
                )
                + "'",
                "TIME_TYPE": "'UT'",
                "QUANTITIES": "'1,4'",
                "APPARENT": "'AIRLESS'",
                "ANG_FORMAT": "'DEG'",
                "EXTRA_PREC": "'YES'",
                "CSV_FORMAT": "'YES'",
            }
            url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(
                params
            )
            with urllib.request.urlopen(url, timeout=60) as response:
                result = json.load(response)["result"]
            if "$$SOE" not in result:
                raise RuntimeError(result)
            block = result.split("$$SOE")[1].split("$$EOE")[0].strip()
            records = list(csv.reader(io.StringIO(block)))
            assert len(records) == len(EPOCHS), result
            for epoch, record in zip(EPOCHS, records):
                # Date/presence flags, astrometric RA/Dec, apparent azimuth/elevation.
                ra, dec, azimuth, altitude = map(float, record[-5:-1])
                rows.append(
                    [
                        site,
                        lat,
                        lon,
                        body,
                        command,
                        epoch.replace(" ", "T") + ":00",
                        azimuth,
                        altitude,
                        ra,
                        dec,
                    ]
                )
            print(f"{site}: {body}", flush=True)
    with OUTPUT.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "site",
                "lat_deg",
                "lon_deg",
                "body",
                "command",
                "epoch_utc",
                "azimuth_deg",
                "altitude_deg",
                "ra_icrf_deg",
                "dec_icrf_deg",
            ]
        )
        writer.writerows(rows)


if __name__ == "__main__":
    main()
