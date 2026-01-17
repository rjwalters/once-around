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
"""

import argparse
import json
import struct
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path


# NASA Horizons API endpoint
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Satellite definitions: name -> (horizons_id, display_name, orbital_altitude_km)
SATELLITES = {
    "iss": ("-125544", "ISS (International Space Station)", 420),
    "hubble": ("-48", "Hubble Space Telescope", 540),
}


def parse_date(date_str: str) -> datetime:
    """Parse a date string in YYYY-MM-DD format."""
    return datetime.strptime(date_str, "%Y-%m-%d")


def fetch_satellite_vectors(
    satellite_id: str,
    display_name: str,
    start: datetime,
    end: datetime,
    step_minutes: int
) -> list[dict]:
    """
    Fetch satellite position vectors from NASA Horizons.

    Returns a list of dicts with 'jd', 'x', 'y', 'z' in km (ECI J2000 frame).
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

    # Build URL with query parameters
    query_string = urllib.parse.urlencode(params)
    url = f"{HORIZONS_API_URL}?{query_string}"

    # Make the request
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "once-around-satellite-ephemeris/1.0")

    with urllib.request.urlopen(req, timeout=120) as response:
        data = json.loads(response.read().decode("utf-8"))

    if "error" in data:
        raise RuntimeError(f"Horizons API error: {data['error']}")

    if "result" not in data:
        raise RuntimeError("Unexpected API response format")

    # Parse the result text
    result_text = data["result"]

    # Find the data section between $$SOE and $$EOE markers
    lines = result_text.split("\n")
    in_data = False
    points = []

    for line in lines:
        line = line.strip()

        if line == "$$SOE":
            in_data = True
            continue
        elif line == "$$EOE":
            break
        elif in_data and line:
            # Parse CSV line: JDTDB, Calendar Date, X, Y, Z
            # Format: 2460000.500000000, A.D. 2023-Feb-25 00:00:00.0000,  1.234E+03,  5.678E+03,  9.012E+02,
            parts = line.split(",")
            if len(parts) >= 5:
                try:
                    jd = float(parts[0].strip())
                    x = float(parts[2].strip())
                    y = float(parts[3].strip())
                    z = float(parts[4].strip())
                    points.append({"jd": jd, "x": x, "y": y, "z": z})
                except (ValueError, IndexError) as e:
                    print(f"Warning: Could not parse line: {line[:50]}... ({e})")

    print(f"Parsed {len(points)} ephemeris points")
    return points


def write_binary_ephemeris(points: list[dict], output_path: Path) -> None:
    """
    Write ephemeris data in binary format.

    Format:
        - count: u32 (little-endian)
        - per point: jd (f64), x (f64), y (f64), z (f64) - all little-endian
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "wb") as f:
        # Write header (count as u32)
        f.write(struct.pack("<I", len(points)))

        # Write each point
        for p in points:
            f.write(struct.pack("<dddd", p["jd"], p["x"], p["y"], p["z"]))

    file_size = output_path.stat().st_size
    print(f"Wrote {len(points)} points to {output_path} ({file_size:,} bytes)")


def verify_binary_ephemeris(path: Path, orbital_altitude: int) -> None:
    """Verify the binary ephemeris file by reading it back."""
    with open(path, "rb") as f:
        count = struct.unpack("<I", f.read(4))[0]
        print(f"\nVerification: {count} points in file")

        if count > 0:
            # Read first point
            jd, x, y, z = struct.unpack("<dddd", f.read(32))
            r = (x*x + y*y + z*z) ** 0.5
            print(f"  First point: JD {jd:.6f}, pos=({x:.1f}, {y:.1f}, {z:.1f}) km, r={r:.1f} km")

            # Read last point
            if count > 1:
                f.seek(4 + (count - 1) * 32)
                jd, x, y, z = struct.unpack("<dddd", f.read(32))
                r = (x*x + y*y + z*z) ** 0.5
                print(f"  Last point:  JD {jd:.6f}, pos=({x:.1f}, {y:.1f}, {z:.1f}) km, r={r:.1f} km")

            # Print orbital info
            print(f"\nExpected orbital altitude: ~{orbital_altitude} km above Earth's surface")
            actual_altitude = r - 6378
            print(f"Actual orbital altitude:   ~{actual_altitude:.0f} km")


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
        points = fetch_satellite_vectors(sat_id, display_name, args.start, args.end, args.step)

        if not points:
            print("Error: No ephemeris points received")
            sys.exit(1)

        # Write binary file
        write_binary_ephemeris(points, args.output)

        # Verify the output
        verify_binary_ephemeris(args.output, orbital_alt)

        print("\nDone!")

    except urllib.error.URLError as e:
        print(f"Error fetching from Horizons: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
