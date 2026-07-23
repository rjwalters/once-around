#!/usr/bin/env python3
"""Refresh minor-body osculating elements in ``minor_bodies.rs`` from JPL Horizons.

Minor-body positions in this repo are driven by heliocentric ecliptic (J2000)
osculating elements baked into ``crates/sky_engine_core/src/minor_bodies.rs`` as
Rust ``const`` blocks. Static two-body elements drift over time (main-belt
asteroids ~3'/year; NEO elements are meaningless across an Earth encounter), so
they need periodic refreshing against Horizons.

This script fetches current osculating elements for the 14 non-Pluto minor
bodies at a single common epoch and rewrites the element constants in place,
reproducing the exact back-propagation contract documented in the
``minor_bodies.rs`` module header.

WHY THIS OPENS A PR INSTEAD OF COMMITTING DIRECTLY (see the companion workflow
``.github/workflows/refresh-minor-body-elements.yml``): the rewritten constants
are pinned by two checked-in test fixtures that a Linux CI runner cannot
regenerate:

  * ``tests/golden_positions.rs`` -- bit-exact per platform (macOS/Apple Silicon
    differs 1-2 ULP from Linux libm), excluded from CI, regenerated only on the
    maintainer's machine via its documented ``generate_golden_constants``
    procedure.
  * ``tests/horizons_accuracy.rs`` / ``tests/data/horizons_reference.csv`` --
    whose ``2026-today`` fixture epoch is *coupled* to the element epoch;
    advancing the elements requires advancing the fixture epoch and
    regenerating the CSV.

So an automated refresh must produce a PR that a human finishes (regenerate
golden constants locally, refresh the Horizons CSV, run the full Rust suite),
never a direct push to ``main``.

Usage:
    python3 scripts/generate_minor_body_elements.py            # rewrite in place
    python3 scripts/generate_minor_body_elements.py --check    # report drift, no write
    python3 scripts/generate_minor_body_elements.py --epoch 2026-07-06

Options:
    --check           Fetch, compute, diff against the current constants, print
                      the max per-element delta, and exit non-zero if a rewrite
                      would occur (used by CI and by the workflow to skip no-op
                      PRs). Does not modify any file.
    --epoch DATE      Common element epoch as YYYY-MM-DD (interpreted at 00:00,
                      JDTDB). Default: today (UTC).
    --file PATH       Path to minor_bodies.rs (default: resolved from repo root).

Requirements:
    Python 3.8+ (standard library only).

The Horizons COMMAND codes are reused from ``scripts/fetch_horizons_reference.py``
(the ``MINOR_BODIES`` table) so the two stay in lockstep. Pluto is intentionally
excluded -- it keeps fixed J2000 elements (see the ``minor_bodies.rs`` header).
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Reuse the canonical body list + Horizons COMMAND codes so this script and the
# accuracy-fixture generator can never disagree about which small-body record to
# fetch (the ';' suffix forces a unique match).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_horizons_reference import MINOR_BODIES  # noqa: E402

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Julian Day Number of the J2000.0 epoch (2000-01-01 12:00 TT), the anchor the
# engine propagates from.
J2000_JD = 2451545.0

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

# Per-field decimal precision, matching the checked-in literal style in
# minor_bodies.rs. a/e carry 7 decimals; the angles and mean anomaly carry 5;
# the period carries 6. The engine's mean motion is derived from the period, so
# the period is what pins n to Horizons.
FIELD_DECIMALS = {
    "semi_major_axis_au": 7,
    "eccentricity": 7,
    "inclination_deg": 5,
    "ascending_node_deg": 5,
    "arg_perihelion_deg": 5,
    "mean_anomaly_j2000_deg": 5,
    "orbital_period_years": 6,
}

# Positional layout of the OrbitalElements::from_degrees(...) argument lines.
# Index 0 (name) and index 8 (radius_km) are NEVER rewritten -- radius_km is a
# physical property, not an orbital element.
ARG_FIELDS = [
    None,                        # 0: "Name"
    "semi_major_axis_au",        # 1
    "eccentricity",              # 2
    "inclination_deg",           # 3
    "ascending_node_deg",        # 4
    "arg_perihelion_deg",        # 5
    "mean_anomaly_j2000_deg",    # 6
    "orbital_period_years",      # 7
    None,                        # 8: radius_km
]


def _fetch_text(url: str) -> str:
    """GET a Horizons API URL and return the raw text, retrying on timeouts.

    Mirrors the retry/backoff shape of ``generate_satellite_ephemeris.py``.
    """
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "once-around-minor-body-elements/1.0")

    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == attempts:
                raise
            wait_s = 30 * attempt
            print(f"Horizons request failed ({e}); retrying in {wait_s}s "
                  f"(attempt {attempt}/{attempts})...", file=sys.stderr)
            time.sleep(wait_s)


def gregorian_to_jd(year: int, month: int, day: int) -> float:
    """Julian Day at 00:00 for a Gregorian calendar date."""
    a = (14 - month) // 12
    yy = year + 4800 - a
    mm = month + 12 * a - 3
    jdn = (day + (153 * mm + 2) // 5 + 365 * yy + yy // 4
           - yy // 100 + yy // 400 - 32045)
    return jdn - 0.5


def back_propagate(ma_epoch_deg: float, n_deg_per_day: float,
                   jd_epoch: float) -> tuple[float, float]:
    """Convert Horizons (MA, N) at ``jd_epoch`` to the engine's J2000 anchor.

    Reproduces the contract in the ``minor_bodies.rs`` module header exactly:

      * ``period_years = 360 / (N * 365.25)`` so the engine's forward mean motion
        ``n = 2*pi / (period_years * 365.25)`` equals Horizons' reported mean
        motion N (in rad/day) to f64 precision.
      * ``MA_J2000 = MA_epoch - N * (JD_epoch - J2000)`` normalized to [0, 360).

    Two-body mean-anomaly propagation is exact, so forward-propagating the
    returned ``MA_J2000`` with the same ``n`` reproduces ``MA_epoch``.

    Returns (mean_anomaly_j2000_deg, orbital_period_years).
    """
    period_years = 360.0 / (n_deg_per_day * 365.25)
    ma_j2000 = (ma_epoch_deg - n_deg_per_day * (jd_epoch - J2000_JD)) % 360.0
    return ma_j2000, period_years


def _extract(pattern: str, text: str, key: str) -> float:
    m = re.search(pattern, text)
    if not m:
        raise RuntimeError(f"could not parse Horizons element '{key}'")
    return float(m.group(1))


def fetch_elements(command: str, epoch_jd: float) -> dict:
    """Fetch heliocentric ecliptic J2000 osculating elements for one body.

    Returns a dict with the raw Horizons values (EC, IN, OM, W, N, MA, A) plus
    the parsed epoch date string. Raises loudly if Horizons returns no element
    record (e.g. an ambiguous COMMAND that matched multiple small-body records).
    """
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'ELEMENTS'",
        "CENTER": "'500@10'",        # heliocentric
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'J2000'",
        "OUT_UNITS": "'AU-D'",
        "TLIST": f"'{epoch_jd:.9f}'",
        "CSV_FORMAT": "'NO'",
    }
    url = HORIZONS_API_URL + "?" + urllib.parse.urlencode(params)
    text = _fetch_text(url)

    # If the ';' suffix was dropped and the COMMAND is ambiguous, Horizons
    # returns a "Matching small-bodies" selection list instead of an ephemeris.
    if "$$SOE" not in text or "$$EOE" not in text:
        if "Matching small-bodies" in text or "Multiple major-bodies" in text:
            raise RuntimeError(
                f"Horizons returned multiple matches for COMMAND {command!r} "
                f"(missing ';' record suffix?):\n{text[:1500]}")
        raise RuntimeError(
            f"Horizons returned no element block for COMMAND {command!r}:\n"
            f"{text[:1500]}")

    block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]

    # Enforce a single element record for this single-instant TLIST.
    date_matches = re.findall(r"A\.D\.\s+(\d{4})-([A-Za-z]{3})-(\d{2})", block)
    if len(date_matches) != 1:
        raise RuntimeError(
            f"expected exactly one element record for COMMAND {command!r}, "
            f"got {len(date_matches)}")
    yr, mon, day = date_matches[0]
    epoch_date = f"{yr}-{_MONTHS[mon]:02d}-{int(day):02d}"

    num = r"([-+0-9.Ee]+)"
    values = {
        "EC": _extract(r"\bEC=\s*" + num, block, "EC"),
        "IN": _extract(r"\bIN=\s*" + num, block, "IN"),
        "OM": _extract(r"\bOM=\s*" + num, block, "OM"),
        "W": _extract(r"\bW\s*=\s*" + num, block, "W"),
        "N": _extract(r"\bN\s*=\s*" + num, block, "N"),
        "MA": _extract(r"\bMA=\s*" + num, block, "MA"),
        "A": _extract(r"\bA\s*=\s*" + num, block, "A"),
    }
    values["epoch_date"] = epoch_date
    return values


def compute_body_values(raw: dict, epoch_jd: float) -> dict:
    """Map raw Horizons values to the engine's element fields (degrees / years)."""
    ma_j2000, period_years = back_propagate(raw["MA"], raw["N"], epoch_jd)
    return {
        "semi_major_axis_au": raw["A"],
        "eccentricity": raw["EC"],
        "inclination_deg": raw["IN"],
        "ascending_node_deg": raw["OM"],
        "arg_perihelion_deg": raw["W"],
        "mean_anomaly_j2000_deg": ma_j2000,
        "orbital_period_years": period_years,
    }


def _fmt(field: str, value: float) -> str:
    s = f"{value:.{FIELD_DECIMALS[field]}f}"
    # Guard the 0/360 wrap for mean anomaly: rounding could land on 360.00000.
    if field == "mean_anomaly_j2000_deg" and float(s) >= 360.0:
        s = f"{float(s) - 360.0:.{FIELD_DECIMALS[field]}f}"
    return s


def _rewrite_const_block(text: str, const_name: str, values: dict) -> str:
    """Rewrite the numeric literals in one OrbitalElements const block.

    Preserves the leading name argument, the trailing radius_km argument, every
    trailing ``// comment`` and its column alignment.
    """
    pattern = re.compile(
        r"(pub const " + re.escape(const_name)
        + r": OrbitalElements = OrbitalElements::from_degrees\(\n)(.*?)(\n\);)",
        re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        raise RuntimeError(f"could not locate const block for {const_name}")

    arg_lines = m.group(2).split("\n")
    if len(arg_lines) != len(ARG_FIELDS):
        raise RuntimeError(
            f"{const_name}: expected {len(ARG_FIELDS)} argument lines, "
            f"got {len(arg_lines)}")

    new_lines = []
    for idx, line in enumerate(arg_lines):
        field = ARG_FIELDS[idx]
        if field is None:
            new_lines.append(line)
            continue
        comment_col = line.find("//")
        if comment_col < 0:
            raise RuntimeError(f"{const_name}: no trailing comment on '{line}'")
        comment = line[comment_col:]
        literal = f"    {_fmt(field, values[field])},"
        # Preserve the comment's column when the value width is unchanged;
        # otherwise fall back to a single separating space.
        if len(literal) < comment_col:
            new_lines.append(literal.ljust(comment_col) + comment)
        else:
            new_lines.append(literal + " " + comment)

    return text[:m.start(2)] + "\n".join(new_lines) + text[m.end(2):]


def _current_literals(text: str, const_name: str) -> dict:
    """Parse the current numeric literals from a const block (for --check deltas)."""
    pattern = re.compile(
        r"pub const " + re.escape(const_name)
        + r": OrbitalElements = OrbitalElements::from_degrees\(\n(.*?)\n\);",
        re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        raise RuntimeError(f"could not locate const block for {const_name}")
    arg_lines = m.group(1).split("\n")
    out = {}
    for idx, line in enumerate(arg_lines):
        field = ARG_FIELDS[idx]
        if field is None:
            continue
        val = line.strip().split(",", 1)[0].strip()
        out[field] = float(val)
    return out


def build_new_content(text: str, results: list, epoch_jd: float,
                      epoch_date: str) -> str:
    """Produce the fully rewritten file content (const blocks + epoch stamps)."""
    new_text = text
    for const_name, values in results:
        new_text = _rewrite_const_block(new_text, const_name, values)

    jd_str = f"{epoch_jd:.1f}"

    # Per-body doc comment (identical across all refreshed bodies). Pluto's line
    # reads "Orbital elements ... epoch J2000.0" and is deliberately untouched.
    new_text = re.sub(
        r"/// Osculating elements: JPL Horizons, epoch JDTDB [\d.]+ \([\d-]+\)",
        f"/// Osculating elements: JPL Horizons, epoch JDTDB {jd_str} ({epoch_date})",
        new_text,
    )
    # Module-header epoch stamp.
    new_text = re.sub(
        r"\*\*JDTDB [\d.]+ \([\d-]+ TDB\)\*\*",
        f"**JDTDB {jd_str} ({epoch_date} TDB)**",
        new_text,
    )
    return new_text


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Refresh minor-body osculating elements in minor_bodies.rs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--check", action="store_true",
        help="Report drift without writing; exit non-zero if a rewrite would occur")
    parser.add_argument(
        "--epoch", default=None,
        help="Common element epoch as YYYY-MM-DD (00:00, JDTDB). Default: today")
    parser.add_argument(
        "--file", type=Path, default=None,
        help="Path to minor_bodies.rs")
    args = parser.parse_args()

    if args.file is None:
        args.file = (Path(__file__).resolve().parent.parent
                     / "crates" / "sky_engine_core" / "src" / "minor_bodies.rs")

    if args.epoch is not None:
        d = datetime.strptime(args.epoch, "%Y-%m-%d")
    else:
        d = datetime.now(timezone.utc)
    epoch_jd = gregorian_to_jd(d.year, d.month, d.day)

    text = args.file.read_text()

    # Bodies to refresh: every entry in the shared MINOR_BODIES table (Pluto is
    # not in it -- it lives with the geocentric bodies and keeps J2000 elements).
    bodies = [(name, name.upper(), command) for name, command, _ in MINOR_BODIES]

    print(f"Refreshing {len(bodies)} bodies at epoch JDTDB {epoch_jd:.1f} "
          f"(command epoch)...", file=sys.stderr)

    results = []
    max_delta = 0.0
    max_delta_where = ""
    epoch_date = None
    for name, const_name, command in bodies:
        raw = fetch_elements(command, epoch_jd)
        epoch_date = raw["epoch_date"]
        values = compute_body_values(raw, epoch_jd)
        results.append((const_name, values))

        current = _current_literals(text, const_name)
        for field, new_val in values.items():
            delta = abs(new_val - current[field])
            if delta > max_delta:
                max_delta = delta
                max_delta_where = f"{name}.{field}"
        print(f"  ok  {name:10s} MA_J2000={values['mean_anomaly_j2000_deg']:.5f} "
              f"period={values['orbital_period_years']:.6f}", file=sys.stderr)
        time.sleep(0.4)  # be polite to the API

    new_text = build_new_content(text, results, epoch_jd, epoch_date)
    changed = new_text != text

    print(f"\nMax per-element delta: {max_delta:.3e} ({max_delta_where})",
          file=sys.stderr)

    if args.check:
        if changed:
            print("Elements changed -- a rewrite would occur.", file=sys.stderr)
            return 1
        print("No change -- constants are up to date.", file=sys.stderr)
        return 0

    if not changed:
        print("No change -- constants already up to date; file untouched.",
              file=sys.stderr)
        return 0

    args.file.write_text(new_text)
    print(f"Rewrote {args.file}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
