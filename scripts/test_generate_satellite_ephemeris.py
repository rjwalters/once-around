#!/usr/bin/env python3
"""Network-free unit tests for the satellite ephemeris generator (issue #147).

`_fetch_json` is stubbed throughout, so these never touch NASA Horizons.

Run:
    python3 scripts/test_generate_satellite_ephemeris.py
"""

import contextlib
import io
import math
import os
import struct
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

import generate_satellite_ephemeris as gen

START = datetime(2026, 11, 1)
START_JD = 2461345.5  # JD of 2026-11-01 00:00 (TDB request scale)


def make_rows(start_jd, count, step_minutes=1):
    """Horizons-style CSV rows; JDs printed with 9 decimals like the real API."""
    rows = []
    for i in range(count):
        jd = start_jd + i * step_minutes / 1440.0
        angle = i * 0.01
        rows.append(f"{jd:.9f}, A.D. 2026-Nov-01 00:00:00.0000, "
                    f"{6800.0 * math.cos(angle):.15E}, "
                    f"{6800.0 * math.sin(angle):.15E}, 1.000000000000000E+02,")
    return rows


def make_result(rows, soe=True, eoe=True):
    lines = ["*******", "Ephemeris / API_USER", "*******"]
    if soe:
        lines.append("$$SOE")
    lines.extend(rows)
    if eoe:
        lines.append("$$EOE")
    lines.append("*******")
    return {"result": "\n".join(lines)}


def run_main(argv):
    """Run gen.main() with argv, returning (exit_code, captured stdout)."""
    out = io.StringIO()
    code = 0
    with mock.patch.object(sys, "argv", ["generate_satellite_ephemeris.py"] + argv), \
            contextlib.redirect_stdout(out):
        try:
            gen.main()
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else 1
    return code, out.getvalue()


class ParseVectorTableTest(unittest.TestCase):
    def test_valid_table_parses(self):
        points = gen.parse_vector_table(make_result(make_rows(START_JD, 3))["result"])
        self.assertEqual(len(points), 3)
        self.assertAlmostEqual(points[0]["jd"], START_JD, delta=1e-9)

    def test_missing_soe_rejected(self):
        with self.assertRaisesRegex(RuntimeError, r"\$\$SOE"):
            gen.parse_vector_table(make_result(make_rows(START_JD, 3), soe=False)["result"])

    def test_missing_eoe_rejected(self):
        with self.assertRaisesRegex(RuntimeError, r"\$\$EOE"):
            gen.parse_vector_table(make_result(make_rows(START_JD, 3), eoe=False)["result"])

    def test_malformed_value_rejected(self):
        rows = make_rows(START_JD, 3)
        parts = rows[1].split(",")
        parts[2] = " invalid"
        rows[1] = ",".join(parts)
        with self.assertRaisesRegex(RuntimeError, "Malformed"):
            gen.parse_vector_table(make_result(rows)["result"])

    def test_short_row_rejected(self):
        rows = make_rows(START_JD, 3)
        rows[1] = "2461345.500694444, A.D. 2026-Nov-01"
        with self.assertRaisesRegex(RuntimeError, "Malformed"):
            gen.parse_vector_table(make_result(rows)["result"])

    def test_non_finite_rejected(self):
        for bad in ("nan", "inf", "-Infinity"):
            rows = make_rows(START_JD, 3)
            parts = rows[1].split(",")
            parts[3] = f" {bad}"
            rows[1] = ",".join(parts)
            with self.subTest(bad=bad), self.assertRaisesRegex(RuntimeError, "Non-finite"):
                gen.parse_vector_table(make_result(rows)["result"])


class ValidatePointsTest(unittest.TestCase):
    END = START + timedelta(days=1)

    def points(self, count=1441, step=1, start_jd=START_JD):
        return gen.parse_vector_table(make_result(make_rows(start_jd, count, step))["result"])

    def test_full_window_passes(self):
        gen.validate_points(self.points(), START, self.END, 1)

    def test_non_divisible_step_passes(self):
        # 1440 / 7 = 205.7 -> 206 samples, last within one step of the end.
        gen.validate_points(self.points(count=206, step=7), START, self.END, 7)

    def test_horizons_float_jitter_tolerated(self):
        pts = self.points()
        for i, p in enumerate(pts):
            p["jd"] += (1e-9 if i % 2 else -1e-9)
        gen.validate_points(pts, START, self.END, 1)

    def test_duplicate_timestamp_rejected(self):
        pts = self.points()
        pts[10]["jd"] = pts[9]["jd"]
        with self.assertRaisesRegex(RuntimeError, "strictly increasing"):
            gen.validate_points(pts, START, self.END, 1)

    def test_decreasing_timestamp_rejected(self):
        pts = self.points()
        pts[10], pts[11] = pts[11], pts[10]
        with self.assertRaisesRegex(RuntimeError, "strictly increasing"):
            gen.validate_points(pts, START, self.END, 1)

    def test_cadence_gap_rejected(self):
        pts = self.points()
        del pts[500]
        with self.assertRaisesRegex(RuntimeError, "Cadence gap"):
            gen.validate_points(pts, START, self.END, 1)

    def test_insufficient_coverage_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Incomplete coverage"):
            gen.validate_points(self.points(count=1000), START, self.END, 1)

    def test_extra_samples_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Incomplete coverage"):
            gen.validate_points(self.points(count=1442), START, self.END, 1)

    def test_wrong_start_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "window start"):
            gen.validate_points(self.points(start_jd=START_JD + 1 / 1440.0),
                                START, self.END, 1)

    def test_too_few_points_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Too few"):
            gen.validate_points(self.points(count=1), START, START + timedelta(minutes=1), 1)

    def test_non_finite_rejected(self):
        pts = self.points()
        pts[3]["z"] = float("nan")
        with self.assertRaisesRegex(RuntimeError, "Non-finite"):
            gen.validate_points(pts, START, self.END, 1)


class MainTest(unittest.TestCase):
    """End-to-end through main(): exit codes, clamping and atomic output."""

    PRIOR = b"prior binary contents, must survive a failed run"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.output = self.dir / "iss_ephemeris.bin"
        self.output.write_bytes(self.PRIOR)

    def tearDown(self):
        self._tmp.cleanup()

    def argv(self, end="2026-11-02"):
        return ["iss", "--start", "2026-11-01", "--end", end,
                "--output", str(self.output)]

    def assert_failed_and_untouched(self, responses):
        with mock.patch.object(gen, "_fetch_json", side_effect=responses):
            code, out = run_main(self.argv())
        self.assertEqual(code, 1, out)
        self.assertEqual(self.output.read_bytes(), self.PRIOR)
        self.assertEqual(sorted(os.listdir(self.dir)), [self.output.name],
                         "temporary staging file left behind")
        return out

    def test_issue_reproduction_rejected(self):
        # The #147 reproduction: $$SOE, valid sample, unparseable X, a valid
        # sample two minutes later, and no $$EOE, for a 1-minute window.
        rows = make_rows(START_JD, 3)
        parts = rows[1].split(",")
        parts[2] = " invalid"
        rows[1] = ",".join(parts)
        self.assert_failed_and_untouched([make_result(rows, eoe=False)])

    def test_each_failure_class_leaves_output_intact(self):
        good = make_rows(START_JD, 1441)
        nan_row = good[:]
        p = nan_row[5].split(",")
        p[4] = " NaN"
        nan_row[5] = ",".join(p)
        dup = good[:]
        dup.insert(10, dup[9])
        gap = good[:]
        del gap[700]
        cases = {
            "missing SOE": make_result(good, soe=False),
            "missing EOE": make_result(good, eoe=False),
            "NaN": make_result(nan_row),
            "duplicate": make_result(dup),
            "cadence gap": make_result(gap),
            "short coverage": make_result(good[:720]),
            "empty": make_result([]),
            "api error": {"error": "something went wrong"},
            "no result": {"signature": {}},
        }
        for name, response in cases.items():
            with self.subTest(case=name):
                self.assert_failed_and_untouched([response])

    def test_valid_run_replaces_output(self):
        rows = make_rows(START_JD, 1441)
        with mock.patch.object(gen, "_fetch_json", return_value=make_result(rows)):
            code, out = run_main(self.argv())
        self.assertEqual(code, 0, out)
        data = self.output.read_bytes()
        self.assertEqual(len(data), 4 + 32 * 1441)
        self.assertEqual(struct.unpack_from("<I", data)[0], 1441)
        self.assertEqual(sorted(os.listdir(self.dir)), [self.output.name])
        self.assertIn("Coverage: JD 2461345.500000 -> 2461346.500000", out)

    def test_clamped_window_supported_and_reported(self):
        # Requested through 2026-11-10; Horizons only has data before
        # 2026-Nov-03, so the window clamps to 2026-11-02 (cutoff - 1 day).
        error = {"error": "Cannot output ephemeris: no trajectory data "
                          "after A.D. 2026-NOV-03 00:00:00.0000 TDB"}
        rows = make_rows(START_JD, 1441)
        fetch = mock.Mock(side_effect=[error, make_result(rows)])
        with mock.patch.object(gen, "_fetch_json", fetch):
            code, out = run_main(self.argv(end="2026-11-10"))
        self.assertEqual(code, 0, out)
        self.assertIn("STOP_TIME=2026-11-02", fetch.call_args_list[1].args[0])
        self.assertIn("clamped to Horizons cutoff", out)
        self.assertIn("2461345.500000 -> 2461346.500000", out)
        self.assertEqual(struct.unpack_from("<I", self.output.read_bytes())[0], 1441)

    def test_unclamped_short_response_rejected(self):
        # Same one-day payload, but nothing told us to clamp: a 9-day request
        # answered with 1 day of data is incomplete.
        rows = make_rows(START_JD, 1441)
        with mock.patch.object(gen, "_fetch_json", return_value=make_result(rows)):
            code, out = run_main(self.argv(end="2026-11-10"))
        self.assertEqual(code, 1, out)
        self.assertIn("Incomplete coverage", out)
        self.assertEqual(self.output.read_bytes(), self.PRIOR)

    def test_failed_verification_leaves_output_intact(self):
        rows = make_rows(START_JD, 1441)
        with mock.patch.object(gen, "_fetch_json", return_value=make_result(rows)), \
                mock.patch.object(gen, "read_binary_ephemeris",
                                  side_effect=RuntimeError("corrupt read-back")):
            code, out = run_main(self.argv())
        self.assertEqual(code, 1, out)
        self.assertEqual(self.output.read_bytes(), self.PRIOR)
        self.assertEqual(sorted(os.listdir(self.dir)), [self.output.name])


class ReadBinaryEphemerisTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "e.bin"

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, samples, count=None, trailing=b""):
        data = struct.pack("<I", len(samples) if count is None else count)
        for s in samples:
            data += struct.pack("<dddd", *s)
        self.path.write_bytes(data + trailing)

    def test_valid(self):
        self.write([(1.0, 1, 2, 3), (2.0, 4, 5, 6)])
        self.assertEqual(len(gen.read_binary_ephemeris(self.path)), 2)

    def test_rejections(self):
        cases = {
            "count/size mismatch": dict(samples=[(1.0, 0, 0, 0), (2.0, 0, 0, 0)], count=3),
            "trailing bytes": dict(samples=[(1.0, 0, 0, 0), (2.0, 0, 0, 0)], trailing=b"x"),
            "too few": dict(samples=[(1.0, 0, 0, 0)]),
            "nan jd": dict(samples=[(1.0, 0, 0, 0), (float("nan"), 0, 0, 0)]),
            "non-monotonic": dict(samples=[(2.0, 0, 0, 0), (1.0, 0, 0, 0)]),
        }
        for name, kwargs in cases.items():
            with self.subTest(case=name):
                self.write(**kwargs)
                with self.assertRaises(RuntimeError):
                    gen.read_binary_ephemeris(self.path)

    def test_checked_in_binaries_pass(self):
        """The live and pinned binaries satisfy the same invariants."""
        root = Path(__file__).resolve().parent.parent
        for rel in ("apps/web/public/data/iss_ephemeris.bin",
                    "apps/web/public/data/hubble_ephemeris.bin",
                    "crates/sky_engine/tests/fixtures/iss_ephemeris_fixture.bin",
                    "crates/sky_engine/tests/fixtures/iss_ephemeris_sgp4_check_fixture.bin"):
            path = root / rel
            if path.exists():
                with self.subTest(file=rel):
                    gen.read_binary_ephemeris(path)


if __name__ == "__main__":
    unittest.main()
