#!/usr/bin/env python3
"""
Generate satellite ephemeris data from NASA Horizons.

This script fetches satellite position vectors from NASA's Horizons system
and outputs a binary file for use with the sky_engine WASM module.

Usage:
    python generate_satellite_ephemeris.py [options] SATELLITE

Arguments:
    SATELLITE         Satellite name: 'iss' or 'hubble'

Options:
    --start DATE      Start date (YYYY-MM-DD), default: today
    --end DATE        End date (YYYY-MM-DD), default: 30 days from start
    --step MINUTES    Time step in minutes, default: 1
    --output FILE     Output file path, default: data/<satellite>_ephemeris.bin

Requirements:
    - Python 3.8+ (uses only standard library)

The output binary format is:
    - Header: count (4 bytes, u32 little-endian)
    - Per point: jd (8 bytes, f64), x_km (8 bytes, f64),
                 y_km (8 bytes, f64), z_km (8 bytes, f64)
    - All values are little-endian

Validation (issue #147): the Horizons response is parsed strictly — both the
$$SOE/$$EOE markers must be present, every row between them must parse to
finite values, and the samples must be strictly increasing at the requested
cadence covering the whole effective window (the requested window, or the
window clamped to Horizons' published cutoff). The binary is staged to a
temporary file next to --output, read back and re-validated, and only then
atomically moved into place with os.replace. Any failure exits non-zero and
leaves a pre-existing output file byte-identical.
"""

import argparse
import json
import math
import os
import re
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path


# NASA Horizons API endpoint
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Tolerance for comparing Julian dates, in days (~0.086 s). Horizons prints
# JDTDB with 9 decimals, so 1-minute spacings parsed as float differ from the
# exact value by ~1e-9 day; this is well above that noise and far below any
# real cadence gap.
JD_TOLERANCE_DAYS = 1e-6

# Julian date of the Unix epoch (1970-01-01T00:00), used to convert the naive
# START/STOP datetimes passed to Horizons. Horizons interprets them on its
# vector-table time scale (TDB), which is the scale of the JDTDB column, so
# 00:00 on the start date maps to the JD of the first sample exactly.
_UNIX_EPOCH = datetime(1970, 1, 1)
_UNIX_EPOCH_JD = 2440587.5

# Satellite definitions: name -> (horizons_id, display_name, orbital_altitude_km)
SATELLITES = {
    "iss": ("-125544", "ISS (International Space Station)", 420),
    "hubble": ("-48", "Hubble Space Telescope", 540),
}


def _fetch_json(url: str) -> dict:
    """GET a Horizons API URL and return parsed JSON, retrying on timeouts.

    Horizons can take minutes to generate large vector tables (45 days at
    1-min steps is ~65k rows) and times out sporadically from CI runners,
    so allow a generous timeout and retry with backoff.
    """
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "once-around-satellite-ephemeris/1.0")

    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == attempts:
                raise
            wait_s = 30 * attempt
            print(f"Horizons request failed ({e}); retrying in {wait_s}s "
                  f"(attempt {attempt}/{attempts})...")
            time.sleep(wait_s)


def parse_date(date_str: str) -> datetime:
    """Parse a date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str, "%Y-%m-%d")


def datetime_to_jd(dt: datetime) -> float:
    """Julian date of a naive datetime on the Horizons request time scale."""
    return _UNIX_EPOCH_JD + (dt - _UNIX_EPOCH).total_seconds() / 86400.0


def parse_vector_table(result_text: str) -> list[dict]:
    """Strictly parse the CSV vector table between $$SOE and $$EOE.

    Raises RuntimeError if either marker is missing or out of order, or if any
    non-empty row in the data section fails to parse to finite JD/X/Y/Z values.
    Nothing is skipped: a partially parseable response is an invalid response.
    """
    lines = [line.strip() for line in result_text.split("\n")]
    try:
        soe = lines.index("$$SOE")
    except ValueError:
        raise RuntimeError("Horizons response has no $$SOE data-start marker")
    try:
        eoe = lines.index("$$EOE", soe + 1)
    except ValueError:
        raise RuntimeError("Horizons response has no $$EOE data-end marker "
                           "(data section is incomplete)")

    points = []
    for lineno, line in enumerate(lines[soe + 1:eoe], start=soe + 2):
        if not line:
            continue
        # Parse CSV line: JDTDB, Calendar Date, X, Y, Z
        # Format: 2460000.500000000, A.D. 2023-Feb-25 00:00:00.0000,  1.234E+03,  5.678E+03,  9.012E+02,
        parts = line.split(",")
        if len(parts) < 5:
            raise RuntimeError(f"Malformed ephemeris row at line {lineno} "
                               f"(expected >=5 CSV fields): {line[:80]!r}")
        try:
            jd = float(parts[0].strip())
            x = float(parts[2].strip())
            y = float(parts[3].strip())
            z = float(parts[4].strip())
        except ValueError as e:
            raise RuntimeError(f"Malformed ephemeris row at line {lineno}: "
                               f"{line[:80]!r} ({e})") from None
        if not all(math.isfinite(v) for v in (jd, x, y, z)):
            raise RuntimeError(f"Non-finite value in ephemeris row at line "
                               f"{lineno}: {line[:80]!r}")
        points.append({"jd": jd, "x": x, "y": y, "z": z})

    return points


def validate_points(
    points: list[dict],
    start: datetime,
    effective_end: datetime,
    step_minutes: int,
) -> None:
    """Validate parsed samples against the effective requested window.

    Requirements:
      - every value finite;
      - first sample at the window start (00:00 on the start date);
      - strictly increasing JD, each spacing equal to the step (within
        JD_TOLERANCE_DAYS);
      - exactly floor(window / step) + 1 samples, so the last sample lies
        within one step of (and, for windows that are a whole number of steps,
        exactly at) the effective end.

    Raises RuntimeError describing the first violation.
    """
    if step_minutes <= 0:
        raise RuntimeError(f"Step must be positive, got {step_minutes} min")
    if effective_end <= start:
        raise RuntimeError("Effective end must be after start")

    step_days = step_minutes / 1440.0
    start_jd = datetime_to_jd(start)
    end_jd = datetime_to_jd(effective_end)
    window_minutes = (effective_end - start).total_seconds() / 60.0
    expected_count = int(math.floor(window_minutes / step_minutes + 1e-9)) + 1

    if len(points) < 2:
        raise RuntimeError(f"Too few ephemeris points ({len(points)}); "
                           f"need at least 2 for interpolation")

    for i, p in enumerate(points):
        if not all(math.isfinite(p[k]) for k in ("jd", "x", "y", "z")):
            raise RuntimeError(f"Non-finite value in sample {i}: {p}")

    if abs(points[0]["jd"] - start_jd) > JD_TOLERANCE_DAYS:
        raise RuntimeError(f"First sample JD {points[0]['jd']:.9f} does not "
                           f"match window start JD {start_jd:.9f}")

    # Ordering first, so duplicates/reversals are reported as such rather
    # than as the cadence gap they also cause.
    for i in range(1, len(points)):
        if points[i]["jd"] <= points[i - 1]["jd"]:
            raise RuntimeError(
                f"Timestamps not strictly increasing at sample {i}: "
                f"JD {points[i - 1]['jd']:.9f} -> {points[i]['jd']:.9f}")

    for i in range(1, len(points)):
        delta = points[i]["jd"] - points[i - 1]["jd"]
        if abs(delta - step_days) > JD_TOLERANCE_DAYS:
            raise RuntimeError(
                f"Cadence gap at sample {i}: spacing {delta * 1440.0:.6f} min, "
                f"expected {step_minutes} min "
                f"(JD {points[i - 1]['jd']:.9f} -> {points[i]['jd']:.9f})")

    if len(points) != expected_count:
        raise RuntimeError(
            f"Incomplete coverage: got {len(points)} samples, expected "
            f"{expected_count} for {start.date()} -> {effective_end.date()} "
            f"at {step_minutes} min (last sample JD {points[-1]['jd']:.9f}, "
            f"window end JD {end_jd:.9f})")

    if points[-1]["jd"] < end_jd - step_days - JD_TOLERANCE_DAYS:
        # Implied by start + cadence + count, kept as an explicit guard.
        raise RuntimeError(f"Last sample JD {points[-1]['jd']:.9f} falls short "
                           f"of window end JD {end_jd:.9f}")


def fetch_satellite_vectors(
    satellite_id: str,
    display_name: str,
    start: datetime,
    end: datetime,
    step_minutes: int
) -> tuple[list[dict], datetime]:
    """
    Fetch satellite position vectors from NASA Horizons.

    Returns (points, effective_end): points is a list of dicts with 'jd', 'x',
    'y', 'z' in km (ECI J2000 frame); effective_end is `end`, or the earlier
    date the window was clamped to when Horizons' predicted trajectory stops
    before `end`. The response is parsed strictly (see parse_vector_table) but
    coverage is validated by the caller via validate_points.
    """
    # Build the Horizons API request
    # We want vectors in the J2000 equatorial frame (ICRF), geocentric
    params = {
        "format": "json",
        "COMMAND": satellite_id,
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "VECTORS",
        "CENTER": "500@399",         # Geocentric (Earth center)
        "REF_PLANE": "FRAME",        # Use the reference frame's equator (ICRF/J2000)
        "VEC_TABLE": "2",            # Position components only (no velocity)
        "VEC_CORR": "NONE",          # No light-time correction (we want geometric)
        "OUT_UNITS": "KM-S",         # Kilometers and seconds
        "CSV_FORMAT": "YES",
        "START_TIME": start.strftime("%Y-%m-%d"),
        "STOP_TIME": end.strftime("%Y-%m-%d"),
        "STEP_SIZE": f"{step_minutes}m",
    }

    print(f"Fetching {display_name} ephemeris from {start} to {end} (step: {step_minutes} min)...")

    data = _fetch_json(f"{HORIZONS_API_URL}?{urllib.parse.urlencode(params)}")
    effective_end = end

    if "error" in data:
        # Predicted spacecraft trajectories only extend so far into the
        # future (~30 days for the ISS). When the requested window runs past
        # Horizons' cutoff, it reports the cutoff date in the error — clamp
        # the window to it and refetch instead of failing.
        m = re.search(r'after A\.D\. (\d{4}-[A-Za-z]{3}-\d{2})', data["error"])
        if m:
            cutoff = datetime.strptime(m.group(1).title(), "%Y-%b-%d")
            clamped_end = cutoff - timedelta(days=1)
            if clamped_end > start:
                print(f"Horizons only has {display_name} ephemeris through "
                      f"{cutoff.date()}; clamping window to {clamped_end.date()}.")
                params["STOP_TIME"] = clamped_end.strftime("%Y-%m-%d")
                effective_end = clamped_end
                data = _fetch_json(f"{HORIZONS_API_URL}?{urllib.parse.urlencode(params)}")

    if "error" in data:
        raise RuntimeError(f"Horizons API error: {data['error']}")

    if "result" not in data:
        raise RuntimeError("Unexpected API response format")

    points = parse_vector_table(data["result"])
    print(f"Parsed {len(points)} ephemeris points")
    return points, effective_end


def write_binary_ephemeris(points: list[dict], output_path: Path) -> None:
    """
    Write ephemeris data in binary format.

    Format:
        - count: u32 (little-endian)
        - per point: jd (f64), x (f64), y (f64), z (f64) - all little-endian
    """
    with open(output_path, "wb") as f:
        # Write header (count as u32)
        f.write(struct.pack("<I", len(points)))

        # Write each point
        for p in points:
            f.write(struct.pack("<dddd", p["jd"], p["x"], p["y"], p["z"]))
        f.flush()
        os.fsync(f.fileno())


def read_binary_ephemeris(path: Path) -> list[dict]:
    """Read a binary ephemeris back, enforcing the format invariants.

    Mirrors the Rust reader (SatelliteEphemeris::from_binary): the file size
    must be exactly 4 + 32 * count, there must be at least 2 samples, every
    value must be finite and JDs must be strictly increasing.
    """
    data = path.read_bytes()
    if len(data) < 4:
        raise RuntimeError(f"{path}: binary too short for header")
    count = struct.unpack_from("<I", data, 0)[0]
    expected_size = 4 + 32 * count
    if len(data) != expected_size:
        raise RuntimeError(f"{path}: size {len(data)} bytes does not match "
                           f"header count {count} ({expected_size} bytes)")
    if count < 2:
        raise RuntimeError(f"{path}: only {count} samples")
    points = []
    prev_jd = None
    for i in range(count):
        jd, x, y, z = struct.unpack_from("<dddd", data, 4 + 32 * i)
        if not all(math.isfinite(v) for v in (jd, x, y, z)):
            raise RuntimeError(f"{path}: non-finite value in sample {i}")
        if prev_jd is not None and jd <= prev_jd:
            raise RuntimeError(f"{path}: JD not strictly increasing at sample {i}")
        prev_jd = jd
        points.append({"jd": jd, "x": x, "y": y, "z": z})
    return points


def verify_binary_ephemeris(path: Path, points: list[dict], orbital_altitude: int) -> None:
    """Read the binary back, require it to round-trip exactly, and report it."""
    read_back = read_binary_ephemeris(path)
    if read_back != points:
        raise RuntimeError(f"{path}: read-back does not match generated samples")

    print(f"\nVerification: {len(read_back)} points in file")
    for label, p in (("First point:", read_back[0]), ("Last point: ", read_back[-1])):
        r = (p["x"] ** 2 + p["y"] ** 2 + p["z"] ** 2) ** 0.5
        print(f"  {label} JD {p['jd']:.6f}, pos=({p['x']:.1f}, {p['y']:.1f}, "
              f"{p['z']:.1f}) km, r={r:.1f} km")

    # Print orbital info (informational only)
    print(f"\nExpected orbital altitude: ~{orbital_altitude} km above Earth's surface")
    print(f"Actual orbital altitude:   ~{r - 6378:.0f} km")


def stage_and_replace(points: list[dict], output_path: Path, orbital_altitude: int) -> None:
    """Write to a temp file beside output_path, verify it, then os.replace.

    On any failure the temp file is removed and output_path is untouched.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=output_path.parent, prefix=f".{output_path.name}.", suffix=".tmp")
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        write_binary_ephemeris(points, tmp_path)
        verify_binary_ephemeris(tmp_path, points, orbital_altitude)
        os.replace(tmp_path, output_path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
    file_size = output_path.stat().st_size
    print(f"Wrote {len(points)} points to {output_path} ({file_size:,} bytes)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate satellite ephemeris from NASA Horizons",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    default_end = today + timedelta(days=30)

    parser.add_argument(
        "satellite",
        choices=list(SATELLITES.keys()),
        help="Satellite to fetch: " + ", ".join(SATELLITES.keys())
    )
    parser.add_argument(
        "--start",
        type=parse_date,
        default=today,
        help=f"Start date (YYYY-MM-DD), default: {today.strftime('%Y-%m-%d')}"
    )
    parser.add_argument(
        "--end",
        type=parse_date,
        default=default_end,
        help=f"End date (YYYY-MM-DD), default: {default_end.strftime('%Y-%m-%d')}"
    )
    parser.add_argument(
        "--step",
        type=int,
        default=1,
        help="Time step in minutes, default: 1"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file path, default: data/<satellite>_ephemeris.bin"
    )

    args = parser.parse_args()

    # Get satellite info
    sat_id, display_name, orbital_alt = SATELLITES[args.satellite]

    # Set default output path if not specified
    if args.output is None:
        args.output = Path(f"data/{args.satellite}_ephemeris.bin")

    # Validate dates
    if args.end <= args.start:
        print("Error: End date must be after start date")
        sys.exit(1)

    # Calculate expected number of points
    duration_minutes = (args.end - args.start).total_seconds() / 60
    expected_points = int(duration_minutes / args.step) + 1
    print(f"Expected ~{expected_points:,} points for {duration_minutes/60/24:.1f} days at {args.step} min intervals")

    # Horizons has limits on query size - for large ranges we may need to chunk
    if expected_points > 90000:
        print(f"Warning: Large query ({expected_points} points). Horizons may limit results.")
        print("Consider using a larger step size or shorter date range.")

    try:
        # Fetch ephemeris from Horizons
        points, effective_end = fetch_satellite_vectors(
            sat_id, display_name, args.start, args.end, args.step)

        # Validate against the effective (possibly Horizons-clamped) window
        validate_points(points, args.start, effective_end, args.step)
        first_jd, last_jd = points[0]["jd"], points[-1]["jd"]
        clamp_note = " (clamped to Horizons cutoff)" if effective_end != args.end else ""
        print(f"Coverage: JD {first_jd:.6f} -> {last_jd:.6f} "
              f"({last_jd - first_jd:.3f} days, {args.start.date()} -> "
              f"{effective_end.date()}{clamp_note})")

        # Stage, verify and atomically replace the output
        stage_and_replace(points, args.output, orbital_alt)

        print("\nDone!")

    except urllib.error.URLError as e:
        print(f"Error fetching from Horizons: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        print(f"Output left unchanged: {args.output}")
        sys.exit(1)


if __name__ == "__main__":
    main()
