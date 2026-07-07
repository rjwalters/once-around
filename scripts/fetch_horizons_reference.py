#!/usr/bin/env python3
"""Fetch JPL Horizons reference positions for the sky-engine regression test.

This script queries the public JPL Horizons API
(https://ssd.jpl.nasa.gov/api/horizons.api) for geocentric (and one topocentric)
apparent + astrometric right ascension / declination of the Sun, Moon, the eight
planets, Pluto, and two comets at a spread of epochs. The results are written to

    crates/sky_engine_core/tests/data/horizons_reference.csv

which is checked into the repository so that the Rust regression test
(`crates/sky_engine_core/tests/horizons_accuracy.rs`) runs fully offline.

Usage:
    python3 scripts/fetch_horizons_reference.py            # writes the CSV
    python3 scripts/fetch_horizons_reference.py --stdout   # print, do not write

Regenerate the fixture whenever you add a body/epoch or want fresher EOP data.
Horizons values are stable to well under the test tolerances, so refreshing the
fixture should not, on its own, change whether the test passes.

Reference frames (why two RA/Dec pairs per row):
  * "astrometric" = ICRF/J2000 RA/Dec (Horizons QUANTITIES 1). The engine's
    VSOP87 planets and J2000 orbital-element bodies (Pluto, comets) are J2000
    positions, so they are validated against this column.
  * "apparent" = RA/Dec of date (Horizons QUANTITIES 2), including precession,
    nutation and aberration. The engine's Meeus Moon is an equinox-of-date
    apparent position, so the Moon is validated against this column.
"""

import argparse
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Epochs are expressed as UTC wall-clock time. The Rust test builds the same
# instant via SkyTime::from_utc(...); both sides convert UTC -> TDB internally,
# so they evaluate the identical physical instant.
#   (label, year, month, day, hour, minute)
EPOCHS = {
    "J2000": (2000, 1, 1, 12, 0),      # JD 2451545.0 - precession-free anchor
    "2020-NEOWISE": (2020, 7, 15, 0, 0),  # JD 2459045.5 - NEOWISE apparition
    "2026-today": (2026, 7, 6, 0, 0),  # JD 2461227.5 - matches golden_positions
    "2030-future": (2030, 3, 20, 0, 0),
}

# Horizons COMMAND codes for the geocentric major bodies + Pluto.
# kind is used by the Rust test to pick the engine function + reference frame.
GEOCENTRIC_BODIES = [
    # (name, command, kind)
    ("Sun", "10", "sun"),
    ("Mercury", "199", "planet"),
    ("Venus", "299", "planet"),
    ("Mars", "499", "planet"),
    ("Jupiter", "599", "planet"),
    ("Saturn", "699", "planet"),
    ("Uranus", "799", "planet"),
    ("Neptune", "899", "planet"),
    ("Moon", "301", "moon"),
    ("Pluto", "999", "minorbody"),
]

# Comets: validated near their osculating-element epoch, where two-body
# propagation from fixed elements is most valid. COMMAND uses the small-body
# designation with the "CAP" flag to select the closest apparition's elements.
#   (name, command, kind, epoch_label)
COMETS = [
    ("Halley", "DES=1P;CAP", "comet", "Halley-1986"),
    ("NEOWISE", "DES=C/2020 F3;CAP", "comet", "2020-NEOWISE"),
]
# Extra comet epoch not shared with the geocentric-body epochs.
COMET_EPOCHS = {
    "Halley-1986": (1986, 2, 9, 0, 0),  # JD 2446470.5 - 1P/Halley perihelion
}

# One topocentric observer, to exercise the engine's lunar-parallax path.
# Horizons uses East-positive longitude; the site altitude is set to 0 km to
# match the engine's sea-level spherical-Earth parallax model.
TOPO_SITE = {
    "name": "topo-40N-105W",
    "lon_east_deg": -105.0,
    "lat_deg": 40.0,
    "alt_km": 0.0,
}


def _epoch_tlist(y, mo, d, h, mi):
    return f"{y:04d}-{mo:02d}-{d:02d} {h:02d}:{mi:02d}"


def _query(command, tlist, center, site_coord=None):
    """Return the raw Horizons text ephemeris for one target/instant."""
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": f"'{center}'",
        "TLIST": f"'{tlist}'",
        "QUANTITIES": "'1,2,20'",  # astrometric RA/Dec, apparent RA/Dec, delta
        "ANG_FORMAT": "'HMS'",
        "EXTRA_PREC": "'YES'",
        "CAL_FORMAT": "'CAL'",
        "CSV_FORMAT": "'NO'",
    }
    if site_coord is not None:
        params["SITE_COORD"] = f"'{site_coord}'"
    url = HORIZONS_API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _hms_to_deg(h, m, s):
    return (abs(h) + m / 60.0 + s / 3600.0) * 15.0


def _dms_to_deg(sign_token, d, m, s):
    val = abs(d) + m / 60.0 + s / 3600.0
    return -val if sign_token.lstrip().startswith("-") else val


def _parse_soe(text):
    """Parse the single data line between $$SOE and $$EOE.

    Columns (right-to-left, robust against a leading solar-presence marker):
      ... astrometric(RA h m s, Dec d m s)  apparent(RA h m s, Dec d m s)  delta  deldot
    Returns (ra_astro_deg, dec_astro_deg, ra_app_deg, dec_app_deg, delta_au).
    """
    in_data = False
    for line in text.splitlines():
        if line.strip() == "$$SOE":
            in_data = True
            continue
        if line.strip() == "$$EOE":
            break
        if not in_data:
            continue
        toks = line.split()
        if len(toks) < 14:
            raise ValueError(f"unexpected Horizons data line: {line!r}")
        # From the right: [-1]=deldot, [-2]=delta,
        # [-8:-2]=apparent RA/Dec (6), [-14:-8]=astrometric RA/Dec (6)
        delta_au = float(toks[-2])
        app = toks[-8:-2]
        astro = toks[-14:-8]
        ra_astro = _hms_to_deg(float(astro[0]), float(astro[1]), float(astro[2]))
        dec_astro = _dms_to_deg(astro[3], float(astro[3]), float(astro[4]), float(astro[5]))
        ra_app = _hms_to_deg(float(app[0]), float(app[1]), float(app[2]))
        dec_app = _dms_to_deg(app[3], float(app[3]), float(app[4]), float(app[5]))
        return ra_astro, dec_astro, ra_app, dec_app, delta_au
    raise ValueError("no $$SOE/$$EOE data block found in Horizons response")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--stdout", action="store_true", help="print CSV, do not write file")
    args = ap.parse_args()

    rows = []
    header = (
        "kind,name,command,center,epoch_label,epoch_utc,"
        "ra_astrometric_deg,dec_astrometric_deg,ra_apparent_deg,dec_apparent_deg,delta_au"
    )

    def add(kind, name, command, center, label, y, mo, d, h, mi, site_coord=None):
        tlist = _epoch_tlist(y, mo, d, h, mi)
        text = _query(command, tlist, center, site_coord)
        try:
            ra_a, dec_a, ra_p, dec_p, delta = _parse_soe(text)
        except ValueError as exc:
            sys.stderr.write(f"FAILED {name} @ {label}: {exc}\n")
            sys.stderr.write(text[:2000] + "\n")
            raise
        epoch_iso = f"{y:04d}-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00"
        rows.append(
            f"{kind},{name},{command},{center},{label},{epoch_iso},"
            f"{ra_a:.6f},{dec_a:.6f},{ra_p:.6f},{dec_p:.6f},{delta:.9f}"
        )
        sys.stderr.write(f"  ok  {name:10s} @ {label:14s} "
                         f"astro=({ra_a:.4f},{dec_a:.4f}) app=({ra_p:.4f},{dec_p:.4f})\n")
        time.sleep(0.4)  # be polite to the API

    # Geocentric bodies at every shared epoch.
    for label, (y, mo, d, h, mi) in EPOCHS.items():
        for name, command, kind in GEOCENTRIC_BODIES:
            add(kind, name, command, "500@399", label, y, mo, d, h, mi)

    # Comets near their element epoch.
    for name, command, kind, epoch_label in COMETS:
        if epoch_label in COMET_EPOCHS:
            y, mo, d, h, mi = COMET_EPOCHS[epoch_label]
        else:
            y, mo, d, h, mi = EPOCHS[epoch_label]
        add(kind, name, command, "500@399", epoch_label, y, mo, d, h, mi)

    # Topocentric Moon at one site/epoch (lunar-parallax path).
    site_coord = f"{TOPO_SITE['lon_east_deg']},{TOPO_SITE['lat_deg']},{TOPO_SITE['alt_km']}"
    y, mo, d, h, mi = EPOCHS["2026-today"]
    add("moon_topo", TOPO_SITE["name"], "301", "coord@399", "2026-today", y, mo, d, h, mi,
        site_coord=site_coord)

    csv = header + "\n" + "\n".join(rows) + "\n"
    if args.stdout:
        sys.stdout.write(csv)
    else:
        out = (Path(__file__).resolve().parent.parent
               / "crates" / "sky_engine_core" / "tests" / "data" / "horizons_reference.csv")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(csv)
        sys.stderr.write(f"\nWrote {len(rows)} rows to {out}\n")


if __name__ == "__main__":
    main()
