#!/usr/bin/env python3
"""Network-free unit tests for the minor-body element back-propagation math.

Run:
    python3 scripts/test_generate_minor_body_elements.py
"""

import math
import unittest

import generate_minor_body_elements as gen

J2000_JD = gen.J2000_JD


class BackPropagationTest(unittest.TestCase):
    def test_round_trip_reproduces_epoch_mean_anomaly(self):
        """Forward-propagating MA_J2000 with the engine's n reproduces MA_epoch.

        This is the exact contract in the minor_bodies.rs module header:
        two-body mean-anomaly propagation is exact, so the J2000 anchor plus
        n*(t) must return the Horizons epoch mean anomaly to f64 precision.
        """
        # A representative Horizons element set (live Ceres shape).
        ma_epoch = 280.2189608051017      # deg
        n_deg_per_day = 0.2142984954014576  # deg/day
        jd_epoch = 2461227.5

        ma_j2000, period_years = gen.back_propagate(ma_epoch, n_deg_per_day, jd_epoch)

        # Engine's forward mean motion (rad/day) derived from the period.
        n_engine_rad = 2.0 * math.pi / (period_years * 365.25)
        n_engine_deg = math.degrees(n_engine_rad)

        # (1) The period is chosen so the engine's n matches Horizons N exactly.
        self.assertAlmostEqual(n_engine_deg, n_deg_per_day, delta=1e-12)

        # (2) Forward propagation of the J2000 anchor reproduces MA_epoch.
        ma_forward = (ma_j2000 + n_engine_deg * (jd_epoch - J2000_JD)) % 360.0
        # Compare modulo 360 (both near 280.219).
        diff = abs((ma_forward - (ma_epoch % 360.0) + 180.0) % 360.0 - 180.0)
        self.assertLess(diff, 1e-9)

    def test_ceres_matches_checked_in_constants(self):
        """Live-Ceres inputs reproduce the checked-in J2000 anchor and period.

        Ties the pure math to the real minor_bodies.rs literals (MA_J2000
        5.27378 deg, period 4.599315 yr). Horizons re-fits elements between
        epochs, so the tolerance covers that drift rather than being exact.
        """
        ma_epoch = 280.2189608051017
        n_deg_per_day = 0.2142984954014576
        jd_epoch = 2461227.5

        ma_j2000, period_years = gen.back_propagate(ma_epoch, n_deg_per_day, jd_epoch)

        self.assertAlmostEqual(ma_j2000, 5.27378, delta=1e-3)
        self.assertAlmostEqual(period_years, 4.599315, delta=1e-3)

    def test_mean_anomaly_normalized_to_unit_circle(self):
        """MA_J2000 is always normalized into [0, 360)."""
        # Large negative pre-normalization value (many revolutions back).
        ma_j2000, _ = gen.back_propagate(357.83832, 0.00007793, 2461227.5)
        self.assertGreaterEqual(ma_j2000, 0.0)
        self.assertLess(ma_j2000, 360.0)

    def test_format_wraps_360_to_zero(self):
        """A mean anomaly that rounds up to 360.00000 wraps back to 0."""
        self.assertEqual(gen._fmt("mean_anomaly_j2000_deg", 359.999999), "0.00000")

    def test_gregorian_to_jd_matches_element_epoch(self):
        """2026-07-06 00:00 -> JD 2461227.5 (the current element epoch)."""
        self.assertEqual(gen.gregorian_to_jd(2026, 7, 6), 2461227.5)
        self.assertEqual(gen.gregorian_to_jd(2000, 1, 1), 2451544.5)  # 00:00, not noon


if __name__ == "__main__":
    unittest.main()
